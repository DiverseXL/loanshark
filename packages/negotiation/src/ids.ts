// Random identifiers for requests and offers (ADR-0019).
//
// 16 bytes from the platform CSPRNG, lowercase hex. Never a counter and never
// Math.random: the id appears in AAD and in relay metadata.

const HEX = Array.from({ length: 256 }, (_, index) => index.toString(16).padStart(2, "0"));

export const ID_BYTES = 16;

export function randomId(): string {
  const crypto = globalThis.crypto;
  if (crypto === undefined || typeof crypto.getRandomValues !== "function") {
    throw new Error("no CSPRNG is available for an id");
  }
  const bytes = new Uint8Array(ID_BYTES);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) out += HEX[byte];
  return out;
}
