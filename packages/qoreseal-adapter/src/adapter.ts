// Typed, offline-only wrapper around @qorechain/qoreseal (pinned 0.1.0).
//
// No cryptography is implemented here. These functions validate inputs, call
// the official package, and turn its stable error codes into a discriminated
// result. They never log, persist or transmit plaintext, keys or a seed.
//
// Only mlkem mode is exposed: the on-chain KEM registry path that hybrid mode
// depends on is BLOCKED (docs/adr/0004-key-binding-and-mode.md), so hybrid
// recipient cards cannot be obtained for a real account yet.

import { envelopeToText, isQoreSealError, open, seal } from "@qorechain/qoreseal";
import type { QoreSealErrorCode, SealKeyPair, SealRecipient } from "@qorechain/qoreseal";

/** Why the adapter refused or failed an operation. */
export type AdapterFailureCode =
  /** The input is not usable: wrong length or shape for a field. */
  | "invalid-input"
  /** QoreSeal refused to seal. `sealCode` carries its stable code. */
  | "seal-failed"
  /** The envelope is not a valid QoreSeal envelope for this version. */
  | "malformed-envelope"
  /** The supplied key is not the recipient of this envelope. */
  | "not-a-recipient"
  /** The envelope, its AAD, or the chain/purpose do not authenticate. */
  | "decryption-failed"
  /** QoreSeal reported an error this wrapper does not map more specifically. */
  | "qoreseal-error";

export interface AdapterFailure {
  ok: false;
  code: AdapterFailureCode;
  /** Human-readable detail. Not part of the contract; do not match on it. */
  message: string;
  /** The stable `QoreSealError.code`, when QoreSeal was what refused. */
  qoresealCode?: QoreSealErrorCode;
}

export type AdapterResult<T> = { ok: true; value: T } | AdapterFailure;

const failure = (
  code: AdapterFailureCode,
  message: string,
  qoresealCode?: QoreSealErrorCode,
): AdapterFailure =>
  qoresealCode === undefined
    ? { ok: false, code, message }
    : { ok: false, code, message, qoresealCode };

/** Maps a stable QoreSeal error code onto the adapter's closed set. */
const CODE_MAP: Record<QoreSealErrorCode, AdapterFailureCode> = {
  INVALID_ARGUMENT: "invalid-input",
  INVALID_KEY: "invalid-input",
  UNSUPPORTED_ALGORITHM: "invalid-input",
  MALFORMED_ENVELOPE: "malformed-envelope",
  UNSUPPORTED_VERSION: "malformed-envelope",
  MALFORMED_BATCH: "malformed-envelope",
  NOT_A_RECIPIENT: "not-a-recipient",
  DECRYPTION_FAILED: "decryption-failed",
  RECIPIENT_NEEDS_X25519: "invalid-input",
  CARD_INVALID: "invalid-input",
  UNKNOWN_EPOCH: "qoreseal-error",
  KEM_KEY_NOT_REGISTERED: "qoreseal-error",
  KEM_REGISTRY_UNAVAILABLE: "qoreseal-error",
  NETWORK_UNAVAILABLE: "qoreseal-error",
};

/** Turns a thrown QoreSeal error into a typed failure; rethrows anything else. */
const fromQoreSealError = (err: unknown, fallback: AdapterFailureCode): AdapterFailure => {
  if (isQoreSealError(err)) {
    const code = CODE_MAP[err.code] ?? fallback;
    return failure(code, err.message, err.code);
  }
  throw err;
};

const isBytes = (v: unknown): v is Uint8Array => v instanceof Uint8Array;

/** The fields of a recipient this adapter accepts in mlkem mode. */
export interface MlkemRecipient {
  /** The recipient's registered ML-KEM-1024 public key, 1568 bytes. */
  mlkemPublicKey: Uint8Array;
}

export interface SealMlkemInput {
  /** Chain id the envelope is bound to, e.g. `qorechain-diana`. */
  chainId: string;
  /** Application purpose, e.g. `loanshark/request`. */
  purpose: string;
  /** The single recipient. */
  recipient: MlkemRecipient;
  /** The bytes to encrypt. The caller owns them; they are not copied out. */
  plaintext: Uint8Array;
  /** Context bytes from `encodeAad`; authenticated, not stored. */
  aad: Uint8Array;
}

export interface SealedEnvelope {
  /** Binary envelope for storage or transport. */
  envelope: Uint8Array;
  /** `qoreseal:` + base64url, for places that need text. */
  envelopeText: string;
}

/**
 * Seals to exactly one recipient in explicit mlkem mode.
 *
 * mlkem mode is used because a web-app user cannot register an ML-KEM key
 * through QoreX today (ADR-0004, BLOCKED), so a recipient card for hybrid mode
 * cannot be obtained. Hybrid mode is not exposed by this wrapper.
 */
export function sealMlkemToRecipient(input: SealMlkemInput): AdapterResult<SealedEnvelope> {
  if (typeof input.chainId !== "string" || input.chainId.length === 0) {
    return failure("invalid-input", "chainId is required");
  }
  if (typeof input.purpose !== "string" || input.purpose.length === 0) {
    return failure("invalid-input", "purpose is required");
  }
  if (!isBytes(input.plaintext)) {
    return failure("invalid-input", "plaintext must be a Uint8Array");
  }
  if (!isBytes(input.aad)) {
    return failure("invalid-input", "aad must be a Uint8Array");
  }
  if (!input.recipient || !isBytes(input.recipient.mlkemPublicKey)) {
    return failure("invalid-input", "recipient.mlkemPublicKey must be a Uint8Array");
  }

  const recipient: SealRecipient = { mlkemPublicKey: input.recipient.mlkemPublicKey };
  try {
    const envelope = seal({
      chainId: input.chainId,
      purpose: input.purpose,
      recipients: [recipient],
      plaintext: input.plaintext,
      aad: input.aad,
      mode: "mlkem",
    });
    // Read back the text form from the same bytes rather than re-sealing.
    return {
      ok: true,
      value: { envelope, envelopeText: envelopeToText(envelope) },
    };
  } catch (err) {
    return fromQoreSealError(err, "seal-failed");
  }
}

export interface OpenEnvelopeInput {
  chainId: string;
  purpose: string;
  envelope: Uint8Array;
  /** The recipient's key pair, held in memory by the caller only. */
  keys: SealKeyPair;
  /** The exact AAD bytes the sender used. A mismatch fails decryption. */
  aad: Uint8Array;
}

/**
 * Opens an envelope with the recipient's key pair. The plaintext is returned
 * to the caller and is not retained, cached or logged by this module.
 */
export function openEnvelope(input: OpenEnvelopeInput): AdapterResult<{ plaintext: Uint8Array }> {
  if (typeof input.chainId !== "string" || input.chainId.length === 0) {
    return failure("invalid-input", "chainId is required");
  }
  if (typeof input.purpose !== "string" || input.purpose.length === 0) {
    return failure("invalid-input", "purpose is required");
  }
  if (!isBytes(input.envelope)) {
    return failure("invalid-input", "envelope must be a Uint8Array");
  }
  if (!isBytes(input.aad)) {
    return failure("invalid-input", "aad must be a Uint8Array");
  }
  try {
    const plaintext = open({
      chainId: input.chainId,
      purpose: input.purpose,
      envelope: input.envelope,
      keys: input.keys,
      aad: input.aad,
    });
    return { ok: true, value: { plaintext } };
  } catch (err) {
    return fromQoreSealError(err, "qoreseal-error");
  }
}
