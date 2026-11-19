// Signed envelopes for LOANSHARK (ADR-0003).
//
// QoreSeal envelopes are not signed. This module defines the project's own
// signed envelope: the envelope bytes, the context that produced its AAD, and
// a QoreSign hybrid message signature over a domain-tagged digest.
//
// The signed message is UTF-8 of:
//
//   loanshark/v1/envelope|<sha256-hex(aad bytes)>|<sha256-hex(envelope bytes)>
//
// Two fixed 64-character hex fields make the string unambiguous; the domain
// tag prevents a signature from being replayed into another protocol. The
// hash choice (SHA-256) and this string are ASSUMPTIONS, recorded in ADR-0003.
//
// The signature itself is a QoreX/QoreSign hybrid signature. Verification is
// delegated to `verifyHybridMessage`, which requires the ML-DSA-87 part and
// reads the key from an injected account client, never from the signature
// object. The real QoreX signer is deferred to the browser step; tests use a
// TEST-ONLY signer built on the official QoreSign signing API.

import { sha256 } from "@noble/hashes/sha2.js";
import type {
  PqcAccountReader,
  VerifyHybridMessageFailure,
  VerifyHybridMessageResult,
} from "@loanshark/chain-client";
import { verifyHybridMessage } from "@loanshark/chain-client";
import type { EnvelopeContext } from "./aad.js";
import { encodeAad, expectedSigner } from "./aad.js";

/** Domain tag that opens the signed-envelope message. */
const ENVELOPE_DOMAIN = "loanshark/v1/envelope";

/** The QoreSign `MessageSignature` shape, as stored on a signed envelope. */
export interface HybridSignature {
  /** `ml-dsa-87-hybrid` when the post-quantum part is present. */
  signatureType: string;
  classical: {
    keyType: string;
    /** Base64 compressed secp256k1 public key. */
    publicKey: string;
    /** Base64 ADR-36 signature. */
    signature: string;
  };
  pq?: {
    algorithmId: number;
    /** Base64 ML-DSA-87 signature. */
    signature: string;
  };
}

/** A signer that produces a QoreX-compatible hybrid signature over bytes. */
export interface MessageSigner {
  /** Returns the raw signature object, validated by the verifier. */
  sign(message: Uint8Array): Promise<unknown>;
}

export interface SignedEnvelope {
  /** The QoreSeal envelope bytes, unmodified. */
  envelope: Uint8Array;
  /** The context that produced the envelope's AAD. */
  context: EnvelopeContext;
  /** The hybrid signature over `signedEnvelopeMessage`. */
  signature: HybridSignature;
}

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

/** The AAD digest recorded in the signed message. */
export const aadDigest = (context: EnvelopeContext): string => toHex(sha256(encodeAad(context)));

/** The envelope digest recorded in the signed message. */
export const envelopeDigest = (envelope: Uint8Array): string => toHex(sha256(envelope));

/**
 * The exact UTF-8 message a sender signs for an envelope and its context.
 * This is the value passed to QoreX `signArbitrary`.
 */
export function signedEnvelopeMessage(envelope: Uint8Array, context: EnvelopeContext): Uint8Array {
  const text = `${ENVELOPE_DOMAIN}|${aadDigest(context)}|${envelopeDigest(envelope)}`;
  return new TextEncoder().encode(text);
}

/** The same message as text, for evidence and debugging. */
export const signedEnvelopeMessageText = (envelope: Uint8Array, context: EnvelopeContext): string =>
  new TextDecoder().decode(signedEnvelopeMessage(envelope, context));

export type SignEnvelopeFailureCode = "invalid-context" | "signer-failed";

export type SignEnvelopeResult =
  | { ok: true; value: SignedEnvelope }
  | { ok: false; code: SignEnvelopeFailureCode; message: string };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Reads only the fields of a signature object that the verifier will use. */
const asHybridSignature = (value: unknown): HybridSignature | undefined => {
  if (!isRecord(value)) return undefined;
  const classical = value["classical"];
  if (!isRecord(classical)) return undefined;
  const keyType = classical["keyType"];
  const publicKey = classical["publicKey"];
  const signature = classical["signature"];
  if (typeof keyType !== "string" || keyType.length === 0) return undefined;
  if (typeof publicKey !== "string" || publicKey.length === 0) return undefined;
  if (typeof signature !== "string" || signature.length === 0) return undefined;
  const pq = value["pq"];
  const out: HybridSignature = {
    signatureType: typeof value["signatureType"] === "string" ? value["signatureType"] : "",
    classical: { keyType, publicKey, signature },
  };
  if (pq !== undefined && pq !== null) {
    if (!isRecord(pq)) return undefined;
    const algorithmId = pq["algorithmId"];
    const pqSignature = pq["signature"];
    if (typeof algorithmId !== "number") return undefined;
    if (typeof pqSignature !== "string" || pqSignature.length === 0) return undefined;
    out.pq = { algorithmId, signature: pqSignature };
  }
  return out;
};

/**
 * Signs an envelope and its context. The signer is supplied by the caller; no
 * key material passes through this module and nothing is logged.
 */
export async function signEnvelope(input: {
  envelope: Uint8Array;
  context: EnvelopeContext;
  signer: MessageSigner;
}): Promise<SignEnvelopeResult> {
  let message: Uint8Array;
  try {
    message = signedEnvelopeMessage(input.envelope, input.context);
  } catch (err) {
    return { ok: false, code: "invalid-context", message: (err as Error).message };
  }

  let raw: unknown;
  try {
    raw = await input.signer.sign(message);
  } catch (err) {
    return {
      ok: false,
      code: "signer-failed",
      message: err instanceof Error ? err.message : String(err),
    };
  }

  const signature = asHybridSignature(raw);
  if (!signature) {
    return { ok: false, code: "signer-failed", message: "the signer returned no hybrid signature" };
  }
  return {
    ok: true,
    value: { envelope: input.envelope, context: input.context, signature },
  };
}

export type VerifySignedEnvelopeFailureCode =
  | "invalid-context"
  | "invalid-signature-shape"
  | VerifyHybridMessageFailure;

export type VerifySignedEnvelopeResult =
  | { ok: true; value: { context: EnvelopeContext; signer: string } }
  | {
      ok: false;
      code: VerifySignedEnvelopeFailureCode;
      message: string;
      verifierCode?: string;
    };

/**
 * Verifies a signed envelope. The signature is checked against the sender's
 * ML-DSA-87 key registered on chain, with the post-quantum part required. The
 * sender is fixed by the context: the borrower for a request, the lender for
 * an offer. This does not decrypt the envelope.
 */
export async function verifySignedEnvelope(input: {
  signed: SignedEnvelope;
  accountClient: PqcAccountReader;
  /**
   * Optional expected signer override. When omitted, defaults to `expectedSigner(context)`,
   * which is `context.borrower` for requests and `context.lender` for offers.
   * In the two-account model (ADR-0015), the envelope is signed by seal account E,
   * while AAD borrower/lender holds wallet account W.
   */
  signer?: string;
}): Promise<VerifySignedEnvelopeResult> {
  let message: Uint8Array;
  let signer: string;
  try {
    message = signedEnvelopeMessage(input.signed.envelope, input.signed.context);
    signer = input.signer ?? expectedSigner(input.signed.context);
  } catch (err) {
    return { ok: false, code: "invalid-context", message: (err as Error).message };
  }

  if (!asHybridSignature(input.signed.signature)) {
    return { ok: false, code: "invalid-signature-shape", message: "the signature is malformed" };
  }

  const verified: VerifyHybridMessageResult = await verifyHybridMessage({
    chainId: input.signed.context.chainId,
    signer,
    message,
    response: input.signed.signature,
    accountClient: input.accountClient,
  });

  if (!verified.verified) {
    return verified.verifierCode === undefined
      ? { ok: false, code: verified.reason, message: verified.message }
      : {
          ok: false,
          code: verified.reason,
          message: verified.message,
          verifierCode: verified.verifierCode,
        };
  }
  return { ok: true, value: { context: input.signed.context, signer } };
}
