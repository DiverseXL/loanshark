// Browser-safe content addressing for relay records.
//
// The server computes the same address with node:crypto; this module repeats the
// rule (sorted keys, JSON, UTF-8, SHA-256 lowercase hex) with @noble/hashes so
// the client can verify an id without importing the Node server into a bundle.
// The two implementations must agree; the relay-client tests compare them.

import { sha256 } from "@noble/hashes/sha2.js";

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const obj = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) result[key] = canonicalize(obj[key]);
  return result;
}

export function contentAddressOf(value: unknown): string {
  const text = JSON.stringify(canonicalize(value));
  return toHex(sha256(new TextEncoder().encode(text)));
}
