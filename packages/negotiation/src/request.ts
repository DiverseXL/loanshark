// The borrower request payload, `loanshark.request.v1` (ADR-0019).

import { encodeCanonical, MAX_PAYLOAD_BYTES } from "./canonical.js";
import { error, fail, ok, type Result, type ValidationError } from "./errors.js";
import {
  collect,
  HEX32_PATTERN,
  isRecord,
  MAX_NOTE_LENGTH,
  rejectUnknown,
  requireCanonicalQor1,
  requireDecimal,
  requireEvmAddress,
  requireHex,
  requireText,
  requireTimestamp,
} from "./fields.js";
import { randomId } from "./ids.js";

export const REQUEST_SCHEMA_ID = "loanshark.request.v1";
export { MAX_NOTE_LENGTH };

const MAX_UINT64 = 2n ** 64n - 1n;

export interface RequestPayload {
  readonly schema: typeof REQUEST_SCHEMA_ID;
  readonly requestId: string;
  readonly borrowerW: string;
  readonly lenderW: string;
  readonly token: string;
  readonly principal: string;
  readonly maxTotalCost: string;
  readonly latestDueDate: string;
  readonly note: string;
  readonly createdAt: string;
}

const REQUEST_FIELDS = [
  "schema",
  "requestId",
  "borrowerW",
  "lenderW",
  "token",
  "principal",
  "maxTotalCost",
  "latestDueDate",
  "note",
  "createdAt",
] as const;

export function validateRequest(value: unknown): Result<RequestPayload> {
  if (!isRecord(value)) {
    return fail([error("$", "wrong-type", "the request payload must be an object")]);
  }
  const errors: ValidationError[] = rejectUnknown(value, REQUEST_FIELDS, "");
  const fields: Partial<Record<(typeof REQUEST_FIELDS)[number], string>> = {
    schema: REQUEST_SCHEMA_ID,
  };
  const assign = (key: (typeof REQUEST_FIELDS)[number]) => (field: string) => {
    fields[key] = field;
  };

  if (value["schema"] !== REQUEST_SCHEMA_ID) {
    errors.push(error("schema", "schema-mismatch", `schema must be exactly ${REQUEST_SCHEMA_ID}`));
  }

  collect(
    requireHex(value["requestId"], "requestId", HEX32_PATTERN, "32 lowercase hex characters"),
    [],
    errors,
    assign("requestId"),
  );
  collect(requireCanonicalQor1(value["borrowerW"], "borrowerW"), [], errors, assign("borrowerW"));
  collect(requireCanonicalQor1(value["lenderW"], "lenderW"), [], errors, assign("lenderW"));
  collect(requireEvmAddress(value["token"], "token"), [], errors, assign("token"));
  const principal = requireDecimal(value["principal"], "principal");
  collect(principal, [], errors, assign("principal"));
  const maxTotal = requireDecimal(value["maxTotalCost"], "maxTotalCost");
  collect(maxTotal, [], errors, assign("maxTotalCost"));
  collect(
    requireDecimal(value["latestDueDate"], "latestDueDate", MAX_UINT64),
    [],
    errors,
    assign("latestDueDate"),
  );
  collect(requireText(value["note"], "note", MAX_NOTE_LENGTH), [], errors, assign("note"));
  collect(requireTimestamp(value["createdAt"], "createdAt"), [], errors, assign("createdAt"));

  if ("value" in principal && "value" in maxTotal) {
    if (BigInt(maxTotal.value) < BigInt(principal.value)) {
      errors.push(
        error(
          "maxTotalCost",
          "mismatch",
          "maxTotalCost must be at least the principal, because it includes repayment",
        ),
      );
    }
  }
  if (
    fields.borrowerW !== undefined &&
    fields.lenderW !== undefined &&
    fields.borrowerW === fields.lenderW
  ) {
    errors.push(error("lenderW", "mismatch", "the borrower and the lender must differ"));
  }

  if (errors.length > 0) return fail(errors);
  return ok(fields as unknown as RequestPayload);
}

export interface BuildRequestInput {
  readonly borrowerW: string;
  readonly lenderW: string;
  readonly token: string;
  readonly principal: string;
  readonly maxTotalCost: string;
  readonly latestDueDate: string;
  readonly note?: string;
  readonly createdAt?: string;
  /** Injectable for deterministic tests; defaults to 16 CSPRNG bytes. */
  readonly requestId?: string;
}

export function buildRequest(input: BuildRequestInput): Result<RequestPayload> {
  let requestId: string;
  try {
    requestId = input.requestId ?? randomId();
  } catch (err) {
    return fail([
      error("requestId", "bad-format", err instanceof Error ? err.message : String(err)),
    ]);
  }
  return validateRequest({
    schema: REQUEST_SCHEMA_ID,
    requestId,
    borrowerW: input.borrowerW,
    lenderW: input.lenderW,
    token: input.token,
    principal: input.principal,
    maxTotalCost: input.maxTotalCost,
    latestDueDate: input.latestDueDate,
    note: input.note ?? "",
    createdAt: input.createdAt ?? new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  });
}

/** Canonical bytes for sealing, bounded at 8 KiB. */
export function encodeRequest(payload: RequestPayload): Result<Uint8Array> {
  const valid = validateRequest(payload);
  if (!valid.ok) return valid;
  const bytes = encodeCanonical(valid.value);
  if (bytes.length > MAX_PAYLOAD_BYTES) {
    return fail([
      error(
        "$",
        "too-large",
        `the request is ${bytes.length} bytes; the limit is ${MAX_PAYLOAD_BYTES}`,
      ),
    ]);
  }
  return ok(bytes);
}

/** Parses JSON text or bytes, then validates. Never trusts the JSON alone. */
export function decodeRequest(input: Uint8Array | string): Result<RequestPayload> {
  let text: string;
  try {
    text =
      typeof input === "string" ? input : new TextDecoder("utf-8", { fatal: true }).decode(input);
  } catch {
    return fail([error("$", "bad-format", "the payload is not valid UTF-8")]);
  }
  if (new TextEncoder().encode(text).length > MAX_PAYLOAD_BYTES) {
    return fail([error("$", "too-large", `the payload exceeds ${MAX_PAYLOAD_BYTES} bytes`)]);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail([error("$", "bad-format", "the payload is not valid JSON")]);
  }
  return validateRequest(parsed);
}
