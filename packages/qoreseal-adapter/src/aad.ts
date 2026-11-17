// Canonical AAD for a LOANSHARK request or offer envelope (ADR-0007).
//
// The encoding is an ASSUMPTION made by this project, not a QoreSeal rule.
// It is a fixed list of eight fields, each encoded as a 4-byte unsigned
// big-endian length followed by its UTF-8 bytes:
//
//   protocol label | chain id | kind | request id | offer id | borrower | lender | version
//
// Fields that do not apply to a kind are encoded as a zero length, so every
// context has the same field count and the same layout. No two different
// contexts can produce the same bytes: the length prefix makes field
// boundaries unambiguous, and changing any field changes its length prefix.
//
// The bytes here are the QoreSeal `aad` input. QoreSeal does not store them in
// the envelope; the opener must supply the same bytes, so a context that does
// not match fails decryption.
//
// Version 1 is the only defined version. A new layout must use a new version
// value, and the frozen vectors in fixtures/aad-vectors.json must break.

/** The protocol label that opens every AAD byte string. */
export const PROTOCOL_LABEL = "loanshark/v1";
/** The AAD encoding version this module produces. */
export const AAD_VERSION = "1";

/** The two envelope kinds. */
export type EnvelopeKind = "request" | "offer";

export interface RequestContext {
  kind: "request";
  /** Chain id, e.g. `qorechain-diana`. */
  chainId: string;
  /** The application's identifier for the request. */
  requestId: string;
  /** The borrower's `qor1` address or EVM address, as the app records it. */
  borrower: string;
  /** AAD encoding version. */
  version: string;
}

export interface OfferContext {
  kind: "offer";
  chainId: string;
  requestId: string;
  /** The application's identifier for the offer. */
  offerId: string;
  borrower: string;
  /** The lender who made the offer. */
  lender: string;
  version: string;
}

export type EnvelopeContext = RequestContext | OfferContext;

const FIELD_COUNT = 8;

/** 4-byte unsigned big-endian length, followed by the UTF-8 field bytes. */
const encodeField = (value: string): Uint8Array => {
  const bytes = new TextEncoder().encode(value);
  const out = new Uint8Array(4 + bytes.length);
  new DataView(out.buffer).setUint32(0, bytes.length, false);
  out.set(bytes, 4);
  return out;
};

const requireField = (name: string, value: unknown): string => {
  if (typeof value !== "string") throw new TypeError(`${name} must be a string`);
  if (value.length === 0) throw new TypeError(`${name} must not be empty`);
  return value;
};

/**
 * The canonical field list for a context. Request contexts put an empty offer
 * id and lender in their fixed slots; offer contexts fill all eight.
 */
export const aadFields = (context: EnvelopeContext): readonly string[] => {
  const chainId = requireField("chainId", context.chainId);
  const version = requireField("version", context.version);
  const requestId = requireField("requestId", context.requestId);
  const borrower = requireField("borrower", context.borrower);

  if (context.kind === "request") {
    return [PROTOCOL_LABEL, chainId, "request", requestId, "", borrower, "", version];
  }
  if (context.kind === "offer") {
    const offerId = requireField("offerId", context.offerId);
    const lender = requireField("lender", context.lender);
    return [PROTOCOL_LABEL, chainId, "offer", requestId, offerId, borrower, lender, version];
  }
  throw new TypeError(
    `unknown envelope kind ${JSON.stringify((context as { kind?: unknown }).kind)}`,
  );
};

/**
 * The canonical AAD bytes for a context. Throws `TypeError` for a context that
 * is missing a field its kind requires; it never fills a value in.
 */
export function encodeAad(context: EnvelopeContext): Uint8Array {
  const fields = aadFields(context);
  if (fields.length !== FIELD_COUNT) {
    throw new TypeError(`expected ${FIELD_COUNT} AAD fields, got ${fields.length}`);
  }
  const encoded = fields.map(encodeField);
  const total = encoded.reduce((sum, field) => sum + field.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const field of encoded) {
    out.set(field, offset);
    offset += field.length;
  }
  return out;
}

/** Lowercase hex of `encodeAad`, used by the frozen fixtures. */
export const aadHex = (context: EnvelopeContext): string =>
  Array.from(encodeAad(context), (byte) => byte.toString(16).padStart(2, "0")).join("");

/** The account that must have signed an envelope of this context. */
export const expectedSigner = (context: EnvelopeContext): string =>
  context.kind === "request" ? context.borrower : context.lender;
