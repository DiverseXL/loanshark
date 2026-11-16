// Hybrid message verification for sender authentication (ADR-0003).
//
// A QoreX `native.signArbitrary` response carries two signatures: a secp256k1
// ADR-36 signature and an ML-DSA-87 signature. Both are checked, and the
// ML-DSA-87 part is always required: this module has no option to skip it.
//
// The ML-DSA-87 public key is read from the account record on chain through an
// injected client. Keys carried in the signed response itself are never used:
// the response's top-level `pub_key` and `signature` fields, and any key inside
// `pq`, are structurally dropped by `normalizeResponse` before the verifier
// sees the object. A signature that verified against a key taken from the
// response would prove nothing.
//
// The cryptography and the signing bytes come from `@qorechain/qoresign` 0.2.0,
// pinned exactly. See docs/research/source-lock.md claims 17 to 19 and
// docs/evidence/phase-01-result.md for the spike this module is built from.
// Nothing here contacts a chain: the caller supplies the client.

import type { MessageSignature } from "@qorechain/qoresign";
import {
  ALGORITHM_ML_DSA_87,
  isQoreSignError,
  ML_DSA_87_PUBLIC_KEY_LENGTH,
  verifyMessage,
} from "@qorechain/qoresign";

/**
 * The account record as read from QoreChain: the ML-DSA-87 key registered on
 * chain for `address`, already decoded by the client.
 */
export interface OnChainPqcAccount {
  /** The `qor1...` account the key is registered for. */
  address: string;
  /** The registered ML-DSA-87 public key, 2592 bytes. */
  publicKey: Uint8Array;
  /** Algorithm id registered on chain; 1 is ML-DSA-87 (`dilithium5`). */
  algorithmId: number;
}

/**
 * The injected REST client. It is a port, not an implementation: the caller
 * decides how the account record is fetched. Returning `null` means the chain
 * has no registered key for the address.
 */
export interface PqcAccountReader {
  readAccount(address: string): Promise<OnChainPqcAccount | null>;
}

/** Why a hybrid message was refused. Every value is a distinct outcome. */
export type VerifyHybridMessageFailure =
  /** The client threw, or returned no account record. */
  | "account-unavailable"
  /** The client returned a record for a different address than the signer. */
  | "account-address-mismatch"
  /** The on-chain key is not a 2592-byte ML-DSA-87 key at algorithm id 1. */
  | "on-chain-key-invalid"
  /** The response is not shaped like a QoreSign `MessageSignature`. */
  | "malformed-response"
  /** The response carries no ML-DSA-87 part. Always a failure. */
  | "pq-part-missing"
  /** The `pq` part names an algorithm other than ML-DSA-87. */
  | "pq-algorithm-unsupported"
  /** The verifier was called without a public key. Should not be reachable. */
  | "pq-key-not-registered"
  /** The classical key does not control the stated signer. */
  | "signer-mismatch"
  /** The secp256k1 ADR-36 signature does not verify. */
  | "classical-signature-invalid"
  /** The ML-DSA-87 signature does not verify under the on-chain key. */
  | "pq-signature-invalid"
  /** A verifier error this module does not map to a more specific reason. */
  | "verification-error";

export interface VerifyHybridMessageSuccess {
  verified: true;
  chainId: string;
  signer: string;
  /** Algorithm id from the `pq` part, which is 1 (ML-DSA-87) on success. */
  pqAlgorithmId: number;
  /** Length in bytes of the on-chain ML-DSA-87 key that verified the signature. */
  pqPublicKeyLength: number;
}

export interface VerifyHybridMessageFailureResult {
  verified: false;
  reason: VerifyHybridMessageFailure;
  /** Human-readable detail. Not part of the contract; do not match on it. */
  message: string;
  /** The stable `QoreSignError.code`, when the verifier was what refused. */
  verifierCode?: string;
}

export type VerifyHybridMessageResult =
  | VerifyHybridMessageSuccess
  | VerifyHybridMessageFailureResult;

export interface VerifyHybridMessageInput {
  /** Chain id the message was signed for, e.g. `qorechain-diana`. */
  chainId: string;
  /** The `qor1...` account claimed to have signed. */
  signer: string;
  /** The message, exactly as signed. A string is signed as UTF-8. */
  message: string | Uint8Array;
  /** The raw response from `native.signArbitrary`. Treated as untrusted input. */
  response: unknown;
  /** Client that reads the signer's registered ML-DSA-87 key from chain. */
  accountClient: PqcAccountReader;
}

/**
 * The fields this module reads from a response. Everything else, including the
 * top-level `pub_key` and `signature` fields and any key inside `pq`, is
 * dropped rather than passed on.
 */
interface NormalizedMessageSignature {
  /** Copied from the response; `verifyMessage` does not read it. */
  signatureType: string;
  classical: { keyType: string; publicKey: string; signature: string };
  pq?: { algorithmId: number; signature: string };
}

const fail = (
  reason: VerifyHybridMessageFailure,
  message: string,
  verifierCode?: string,
): VerifyHybridMessageFailureResult =>
  verifierCode === undefined
    ? { verified: false, reason, message }
    : { verified: false, reason, message, verifierCode };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isNonEmptyString = (v: unknown): v is string => typeof v === "string" && v.length > 0;

/**
 * Reads only the fields the verifier needs, so nothing else on the response can
 * influence the result. Untrusted input: every field is checked.
 */
const normalizeResponse = (
  response: unknown,
): { ok: true; signature: NormalizedMessageSignature } | { ok: false; message: string } => {
  if (!isRecord(response)) return { ok: false, message: "response is not an object" };
  const classical = response["classical"];
  if (!isRecord(classical)) return { ok: false, message: "response has no classical object" };
  const keyType = classical["keyType"];
  const publicKey = classical["publicKey"];
  const signature = classical["signature"];
  if (!isNonEmptyString(keyType)) return { ok: false, message: "classical.keyType is missing" };
  if (!isNonEmptyString(publicKey)) return { ok: false, message: "classical.publicKey is missing" };
  if (!isNonEmptyString(signature)) {
    return { ok: false, message: "classical.signature is missing" };
  }
  const signatureType = response["signatureType"];
  const normalized: NormalizedMessageSignature = {
    signatureType: typeof signatureType === "string" ? signatureType : "",
    classical: { keyType, publicKey, signature },
  };
  const pq = response["pq"];
  // A missing pq part is not a malformed response: it is a normal input that
  // must be refused, so it is passed on and the verifier reports it missing.
  if (pq !== undefined && pq !== null) {
    if (!isRecord(pq)) return { ok: false, message: "response pq field is not an object" };
    const algorithmId = pq["algorithmId"];
    const pqSignature = pq["signature"];
    if (typeof algorithmId !== "number") return { ok: false, message: "pq.algorithmId is missing" };
    if (!isNonEmptyString(pqSignature)) {
      return { ok: false, message: "pq.signature is missing" };
    }
    normalized.pq = { algorithmId, signature: pqSignature };
  }
  return { ok: true, signature: normalized };
};

/** Maps a stable `QoreSignError.code` to this module's reason. */
const REASON_BY_CODE: Record<string, VerifyHybridMessageFailure | undefined> = {
  INVALID_ADDRESS: "signer-mismatch",
  ADDRESS_MISMATCH: "signer-mismatch",
  INVALID_ARGUMENT: "malformed-response",
  CLASSICAL_SIGNATURE_INVALID: "classical-signature-invalid",
  PQ_LAYER_MISSING: "pq-part-missing",
  UNSUPPORTED_ALGORITHM: "pq-algorithm-unsupported",
  KEY_NOT_REGISTERED: "pq-key-not-registered",
  PQ_SIGNATURE_INVALID: "pq-signature-invalid",
};

/**
 * Verifies a QoreX hybrid message signature against the signer's ML-DSA-87 key
 * registered on chain. The post-quantum part is always required.
 *
 * Returns a discriminated result; it never throws for a bad signature, a bad
 * response or an unreachable client.
 */
export async function verifyHybridMessage(
  input: VerifyHybridMessageInput,
): Promise<VerifyHybridMessageResult> {
  const { chainId, signer, message, response, accountClient } = input;

  const normalized = normalizeResponse(response);
  if (!normalized.ok) return fail("malformed-response", normalized.message);

  let account: OnChainPqcAccount | null;
  try {
    account = await accountClient.readAccount(signer);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return fail("account-unavailable", `could not read the on-chain account record: ${detail}`);
  }
  if (account === null) {
    return fail("account-unavailable", `no registered PQC key on chain for ${signer}`);
  }
  if (account.address !== signer) {
    return fail(
      "account-address-mismatch",
      `the client returned the record for ${account.address}, not ${signer}`,
    );
  }
  if (
    account.algorithmId !== ALGORITHM_ML_DSA_87 ||
    account.publicKey.length !== ML_DSA_87_PUBLIC_KEY_LENGTH
  ) {
    return fail(
      "on-chain-key-invalid",
      `on-chain key is algorithm ${account.algorithmId} with ${account.publicKey.length} bytes, ` +
        `expected algorithm ${ALGORITHM_ML_DSA_87} with ${ML_DSA_87_PUBLIC_KEY_LENGTH}`,
    );
  }

  try {
    verifyMessage({
      chainId,
      signer,
      data: message,
      signature: normalized.signature as unknown as MessageSignature,
      pqPublicKey: account.publicKey,
      requirePq: true,
    });
  } catch (err) {
    if (isQoreSignError(err)) {
      const reason = REASON_BY_CODE[err.code] ?? "verification-error";
      return fail(reason, err.message, err.code);
    }
    return fail("verification-error", err instanceof Error ? err.message : String(err));
  }

  return {
    verified: true,
    chainId,
    signer,
    pqAlgorithmId: ALGORITHM_ML_DSA_87,
    pqPublicKeyLength: account.publicKey.length,
  };
}
