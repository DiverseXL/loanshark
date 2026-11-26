// Canonical JSON for negotiation payloads (ADR-0019).
//
// Sorted keys, no whitespace, and NO numbers anywhere: every integer is a
// decimal string. A number in a payload is the bug this encoder exists to make
// impossible, so it throws instead of converting.

export class CanonicalJsonError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = "CanonicalJsonError";
  }
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

function encode(value: unknown, path: string): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "bigint") {
    throw new CanonicalJsonError(`${path}: numbers are not allowed; use a decimal string`);
  }
  if (typeof value === "boolean") {
    throw new CanonicalJsonError(`${path}: booleans are not allowed in a negotiation payload`);
  }
  if (value === null) {
    throw new CanonicalJsonError(`${path}: null is not allowed in a negotiation payload`);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item, index) => encode(item, `${path}[${index}]`)).join(",")}]`;
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    const parts = keys.map(
      (key) => `${JSON.stringify(key)}:${encode(value[key], `${path}.${key}`)}`,
    );
    return `{${parts.join(",")}}`;
  }
  throw new CanonicalJsonError(`${path}: unsupported value type ${typeof value}`);
}

/** The canonical UTF-8-bytes preimage of a payload. */
export function canonicalJson(value: unknown): string {
  return encode(value, "$");
}

export const encodeCanonical = (value: unknown): Uint8Array =>
  new TextEncoder().encode(canonicalJson(value));

export const MAX_PAYLOAD_BYTES = 8 * 1024;

/** Bytes of the canonical form, used for the size bound. */
export const canonicalByteLength = (value: unknown): number => encodeCanonical(value).length;
