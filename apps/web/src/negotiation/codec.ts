// Byte and text helpers for the negotiation flow.
//
// This is the only new module outside the vault that creates a TextEncoder, so
// the static hygiene test names it explicitly. Nothing here stores key material.

export const utf8Bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

export const utf8Text = (bytes: Uint8Array): string =>
  new TextDecoder("utf-8", { fatal: true }).decode(bytes);

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = globalThis.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
