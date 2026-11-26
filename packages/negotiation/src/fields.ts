// Field rules shared by both payload schemas (ADR-0019).

import { parseAddress } from "@qorechain/qoresign";
import { error, type ValidationError } from "./errors.js";

export const QOR1_PATTERN = /^qor1[0-9a-z]{38,58}$/;
export const EVM_ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
export const HEX32_PATTERN = /^[0-9a-f]{32}$/;
export const HEX64_PATTERN = /^[0-9a-f]{64}$/;
export const BYTES32_PATTERN = /^0x[0-9a-f]{64}$/;
export const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
export const MAX_NOTE_LENGTH = 400;
/** No sign, no exponent, no leading zero unless the value is zero. */
export const DECIMAL_PATTERN = /^(0|[1-9][0-9]*)$/;

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Rejects any key that is not in `allowed`. */
export function rejectUnknown(
  value: Record<string, unknown>,
  allowed: readonly string[],
  prefix: string,
): ValidationError[] {
  const set = new Set(allowed);
  return Object.keys(value)
    .filter((key) => !set.has(key))
    .map((key) =>
      error(`${prefix}${key}`, "unknown-field", `${prefix}${key} is not a known field`),
    );
}

export function requireCanonicalQor1(
  value: unknown,
  field: string,
): { value: string } | { error: ValidationError } {
  if (typeof value !== "string") {
    return { error: error(field, "wrong-type", `${field} must be a string`) };
  }
  if (!QOR1_PATTERN.test(value)) {
    return { error: error(field, "bad-format", `${field} is not a qor1 address`) };
  }
  let canonical: string;
  try {
    canonical = parseAddress(value).bech32;
  } catch {
    return { error: error(field, "bad-format", `${field} does not parse as an account address`) };
  }
  if (canonical !== value) {
    return { error: error(field, "bad-format", `${field} is not the canonical qor1 form`) };
  }
  return { value };
}

export function requireEvmAddress(
  value: unknown,
  field: string,
): { value: string } | { error: ValidationError } {
  if (typeof value !== "string") {
    return { error: error(field, "wrong-type", `${field} must be a string`) };
  }
  if (!EVM_ADDRESS_PATTERN.test(value)) {
    return { error: error(field, "bad-format", `${field} must be 0x plus 40 hex characters`) };
  }
  return { value: value.toLowerCase() };
}

export function requireDecimal(
  value: unknown,
  field: string,
  max = 2n ** 256n - 1n,
): { value: string } | { error: ValidationError } {
  if (typeof value !== "string") {
    return { error: error(field, "wrong-type", `${field} must be a decimal string`) };
  }
  if (!DECIMAL_PATTERN.test(value)) {
    return {
      error: error(field, "not-decimal", `${field} must be digits only, with no sign or exponent`),
    };
  }
  const parsed = BigInt(value);
  if (parsed > max) {
    return { error: error(field, "out-of-range", `${field} does not fit in the contract field`) };
  }
  return { value };
}

export function requireText(
  value: unknown,
  field: string,
  maxLength: number,
): { value: string } | { error: ValidationError } {
  if (typeof value !== "string") {
    return { error: error(field, "wrong-type", `${field} must be a string`) };
  }
  if (value.length > maxLength) {
    return { error: error(field, "too-long", `${field} is longer than ${maxLength} characters`) };
  }
  // Control characters other than LF would shift a rendered layout.
  if (/[\u0000-\u0009\u000b-\u001f\u007f]/.test(value)) {
    return { error: error(field, "bad-format", `${field} contains a control character`) };
  }
  return { value };
}

export function requireTimestamp(
  value: unknown,
  field: string,
): { value: string } | { error: ValidationError } {
  if (typeof value !== "string" || !TIMESTAMP_PATTERN.test(value)) {
    return { error: error(field, "bad-format", `${field} must be YYYY-MM-DDTHH:MM:SSZ`) };
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString().replace(/\.\d{3}Z$/, "Z") !== value) {
    return { error: error(field, "bad-format", `${field} is not a valid UTC timestamp`) };
  }
  return { value };
}

export function requireHex(
  value: unknown,
  field: string,
  pattern: RegExp,
  label: string,
): { value: string } | { error: ValidationError } {
  if (typeof value !== "string") {
    return { error: error(field, "wrong-type", `${field} must be a string`) };
  }
  if (!pattern.test(value)) {
    return { error: error(field, "bad-format", `${field} must be ${label}`) };
  }
  return { value };
}

export const collect = <T>(
  outcome: { value: T } | { error: ValidationError },
  target: T[],
  errors: ValidationError[],
  assign: (value: T) => void,
): void => {
  if ("error" in outcome) errors.push(outcome.error);
  else {
    target.push(outcome.value);
    assign(outcome.value);
  }
};
