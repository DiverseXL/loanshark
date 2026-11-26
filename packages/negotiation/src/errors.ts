// Shared validation result and error shape (ADR-0019).
//
// Validation never throws and never coerces. A caller that gets `ok: false`
// has a complete list of problems, and no partial value.

export type ErrorCode =
  | "unknown-field"
  | "missing-field"
  | "wrong-type"
  | "bad-format"
  | "out-of-range"
  | "not-decimal"
  | "too-long"
  | "too-large"
  | "schema-mismatch"
  | "mismatch"
  | "forbidden-transition";

export interface ValidationError {
  readonly field: string;
  readonly code: ErrorCode;
  readonly message: string;
}

export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: readonly ValidationError[] };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });

export const fail = <T>(errors: readonly ValidationError[]): Result<T> => ({ ok: false, errors });

export const error = (field: string, code: ErrorCode, message: string): ValidationError => ({
  field,
  code,
  message,
});
