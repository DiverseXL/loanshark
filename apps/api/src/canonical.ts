// Canonical JSON serialization and content-addressing (SHA-256).
//
// Keys in objects are sorted alphabetically at every level.
// Arrays retain their order.
// Digested with SHA-256 to produce an immutable 64-char lowercase hex content address.

import { createHash } from "node:crypto";

/** Recursively sorts all keys in an object to produce deterministic JSON. */
export function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  const obj = value as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const result: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    result[key] = canonicalize(obj[key]);
  }
  return result;
}

/** Returns the canonical UTF-8 bytes for any JSON-compatible value. */
export function canonicalJsonBytes(value: unknown): Uint8Array {
  const canonical = canonicalize(value);
  const text = JSON.stringify(canonical);
  return new TextEncoder().encode(text);
}

/** Computes the lowercase hex SHA-256 content address of any JSON-compatible value. */
export function contentAddressOf(value: unknown): string {
  const bytes = canonicalJsonBytes(value);
  return createHash("sha256").update(bytes).digest("hex");
}
