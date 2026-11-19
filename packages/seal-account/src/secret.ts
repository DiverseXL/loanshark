// Redacting wrappers for values that must never be printed.
//
// The wrapper exists so a secret can be passed around and used deliberately
// through `use`, while every implicit string conversion is useless: String(),
// template literals, JSON.stringify and Node's util.inspect all produce the
// same redaction marker.

const REDACTED = "[redacted]";
const INSPECT = Symbol.for("nodejs.util.inspect.custom");

/**
 * A string that never prints its value through `toString`, `toJSON` or
 * `util.inspect`. Call `use` at the one place that needs the bytes, and do not
 * copy the result into long-lived state.
 */
export class SecretString {
  readonly #value: string;

  constructor(value: string) {
    this.#value = value;
    Object.defineProperty(this, INSPECT, {
      value: () => REDACTED,
      enumerable: false,
      configurable: false,
      writable: false,
    });
  }

  /** Deliberate access. The callback receives the real string. */
  use<T>(callback: (value: string) => T): T {
    return callback(this.#value);
  }

  /** Word count only; safe to show in a UI. */
  get wordCount(): number {
    return this.#value.split(/\s+/).filter((word) => word.length > 0).length;
  }

  toString(): string {
    return REDACTED;
  }

  toJSON(): string {
    return REDACTED;
  }
}

/**
 * The same idea for bytes. It holds a copy, so mutating the caller's array
 * afterwards does not change the secret.
 */
export class SecretBytes {
  readonly #value: Uint8Array;

  constructor(value: Uint8Array) {
    this.#value = Uint8Array.from(value);
    Object.defineProperty(this, INSPECT, {
      value: () => REDACTED,
      enumerable: false,
      configurable: false,
      writable: false,
    });
  }

  /** Deliberate access. The callback receives the internal bytes; do not keep them. */
  use<T>(callback: (value: Uint8Array) => T): T {
    return callback(this.#value);
  }

  get length(): number {
    return this.#value.length;
  }

  toString(): string {
    return REDACTED;
  }

  toJSON(): string {
    return REDACTED;
  }
}

export const REDACTION_MARKER = REDACTED;
