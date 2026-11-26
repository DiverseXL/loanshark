// Human-readable amount to base units, with no floating point anywhere (ADR-0019).
//
// "12.34" with 6 decimals becomes 12340000n. More fractional digits than the
// token has are refused, never rounded or truncated.

import { error, fail, ok, type Result } from "./errors.js";

const AMOUNT_PATTERN = /^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/;

export function parseAmount(text: string, decimals: number): Result<bigint> {
  if (typeof text !== "string") {
    return fail([error("amount", "wrong-type", "the amount must be a string")]);
  }
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    return fail([error("decimals", "out-of-range", "decimals must be an integer from 0 to 36")]);
  }
  const match = AMOUNT_PATTERN.exec(text);
  if (match === null) {
    return fail([
      error("amount", "not-decimal", "the amount must be digits with an optional decimal point"),
    ]);
  }
  const fraction = match[2] ?? "";
  if (fraction.length > decimals) {
    return fail([
      error(
        "amount",
        "out-of-range",
        `the amount has ${fraction.length} decimal places but the token has ${decimals}`,
      ),
    ]);
  }
  const scale = 10n ** BigInt(decimals);
  const whole = BigInt(match[1] ?? "0") * scale;
  const part = fraction.length === 0 ? 0n : BigInt(fraction.padEnd(decimals, "0"));
  return ok(whole + part);
}

/** Base units to a human string, trailing fractional zeros removed. */
export function formatAmount(value: bigint, decimals: number): string {
  if (value < 0n) throw new RangeError("a token amount cannot be negative");
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const fraction = (value % scale).toString(10).padStart(decimals, "0").replace(/0+$/, "");
  return fraction.length === 0 ? whole.toString(10) : `${whole.toString(10)}.${fraction}`;
}
