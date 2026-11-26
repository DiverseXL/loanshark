// The lender offer payload, `loanshark.offer.v1` (ADR-0019).

import type { Terms } from "@loanshark/agreement";
import { MAX_UINT64 } from "@loanshark/agreement";
import { encodeCanonical, MAX_PAYLOAD_BYTES } from "./canonical.js";
import { error, fail, ok, type Result, type ValidationError } from "./errors.js";
import {
  BYTES32_PATTERN,
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
} from "./fields.js";
import { randomId } from "./ids.js";
import type { RequestPayload } from "./request.js";

export const OFFER_SCHEMA_ID = "loanshark.offer.v1";

const MAX_UINT256 = 2n ** 256n - 1n;

const TERM_FIELDS = [
  "borrower",
  "lender",
  "token",
  "principal",
  "interest",
  "dueDate",
  "graceSeconds",
  "fundingDeadline",
  "claimDeadline",
  "salt",
] as const;

const OFFER_FIELDS = [
  "schema",
  "offerId",
  "requestId",
  "borrowerW",
  "lenderW",
  "terms",
  "offerExpiresAt",
  "note",
] as const;

/** Terms with every integer as a decimal string, as they travel in the offer. */
export interface OfferTermsPayload {
  readonly borrower: string;
  readonly lender: string;
  readonly token: string;
  readonly principal: string;
  readonly interest: string;
  readonly dueDate: string;
  readonly graceSeconds: string;
  readonly fundingDeadline: string;
  readonly claimDeadline: string;
  readonly salt: string;
}

export interface OfferPayload {
  readonly schema: typeof OFFER_SCHEMA_ID;
  readonly offerId: string;
  readonly requestId: string;
  readonly borrowerW: string;
  readonly lenderW: string;
  readonly terms: OfferTermsPayload;
  readonly offerExpiresAt: string;
  readonly note: string;
}

export function validateOfferTerms(value: unknown, prefix = "terms"): Result<OfferTermsPayload> {
  if (!isRecord(value)) {
    return fail([error(prefix, "wrong-type", `${prefix} must be an object`)]);
  }
  const errors: ValidationError[] = rejectUnknown(value, TERM_FIELDS, `${prefix}.`);
  const fields: Partial<Record<(typeof TERM_FIELDS)[number], string>> = {};

  for (const key of ["borrower", "lender", "token"] as const) {
    collect(requireEvmAddress(value[key], `${prefix}.${key}`), [], errors, (field) => {
      fields[key] = field;
    });
  }
  for (const key of [
    "principal",
    "interest",
    "dueDate",
    "graceSeconds",
    "fundingDeadline",
    "claimDeadline",
  ] as const) {
    const max = key === "principal" || key === "interest" ? MAX_UINT256 : MAX_UINT64;
    collect(requireDecimal(value[key], `${prefix}.${key}`, max), [], errors, (field) => {
      fields[key] = field;
    });
  }
  collect(
    requireHex(
      value["salt"],
      `${prefix}.salt`,
      BYTES32_PATTERN,
      "0x plus 64 lowercase hex characters",
    ),
    [],
    errors,
    (field) => {
      fields["salt"] = field;
    },
  );

  if (fields.principal !== undefined && BigInt(fields.principal) === 0n) {
    errors.push(
      error(`${prefix}.principal`, "out-of-range", "the principal must be greater than zero"),
    );
  }
  if (
    fields.principal !== undefined &&
    fields.interest !== undefined &&
    BigInt(fields.principal) + BigInt(fields.interest) > MAX_UINT256
  ) {
    errors.push(
      error(`${prefix}.interest`, "out-of-range", "principal plus interest overflows uint256"),
    );
  }
  if (
    fields.borrower !== undefined &&
    fields.lender !== undefined &&
    fields.borrower === fields.lender
  ) {
    errors.push(error(`${prefix}.lender`, "mismatch", "the borrower and the lender must differ"));
  }

  if (errors.length > 0) return fail(errors);
  return ok(fields as unknown as OfferTermsPayload);
}

export function validateOffer(value: unknown): Result<OfferPayload> {
  if (!isRecord(value)) {
    return fail([error("$", "wrong-type", "the offer payload must be an object")]);
  }
  const errors: ValidationError[] = rejectUnknown(value, OFFER_FIELDS, "");
  const fields: Partial<Record<(typeof OFFER_FIELDS)[number], string>> = {
    schema: OFFER_SCHEMA_ID,
  };

  if (value["schema"] !== OFFER_SCHEMA_ID) {
    errors.push(error("schema", "schema-mismatch", `schema must be exactly ${OFFER_SCHEMA_ID}`));
  }
  collect(
    requireHex(value["offerId"], "offerId", HEX32_PATTERN, "32 lowercase hex characters"),
    [],
    errors,
    (field) => {
      fields.offerId = field;
    },
  );
  collect(
    requireHex(value["requestId"], "requestId", HEX32_PATTERN, "32 lowercase hex characters"),
    [],
    errors,
    (field) => {
      fields.requestId = field;
    },
  );
  collect(requireCanonicalQor1(value["borrowerW"], "borrowerW"), [], errors, (field) => {
    fields.borrowerW = field;
  });
  collect(requireCanonicalQor1(value["lenderW"], "lenderW"), [], errors, (field) => {
    fields.lenderW = field;
  });
  collect(
    requireDecimal(value["offerExpiresAt"], "offerExpiresAt", MAX_UINT64),
    [],
    errors,
    (field) => {
      fields.offerExpiresAt = field;
    },
  );
  collect(requireText(value["note"], "note", MAX_NOTE_LENGTH), [], errors, (field) => {
    fields.note = field;
  });

  const terms = validateOfferTerms(value["terms"]);
  if (!terms.ok) errors.push(...terms.errors);

  if (errors.length > 0) return fail(errors);
  const offer: OfferPayload = {
    schema: OFFER_SCHEMA_ID,
    offerId: fields.offerId as string,
    requestId: fields.requestId as string,
    borrowerW: fields.borrowerW as string,
    lenderW: fields.lenderW as string,
    terms: (terms as { ok: true; value: OfferTermsPayload }).value,
    offerExpiresAt: fields.offerExpiresAt as string,
    note: fields.note as string,
  };
  return ok(offer);
}

/** Cross-checks an offer against the request it claims to answer. */
export function checkOfferMatchesRequest(
  offer: OfferPayload,
  request: RequestPayload,
): Result<true> {
  const errors: ValidationError[] = [];
  if (offer.requestId !== request.requestId) {
    errors.push(error("requestId", "mismatch", "the offer names a different request"));
  }
  if (offer.borrowerW !== request.borrowerW) {
    errors.push(error("borrowerW", "mismatch", "the offer names a different borrower"));
  }
  if (offer.lenderW !== request.lenderW) {
    errors.push(error("lenderW", "mismatch", "the offer names a different lender"));
  }
  if (offer.terms.token !== request.token) {
    errors.push(error("terms.token", "mismatch", "the offer is in a different token"));
  }
  if (BigInt(offer.terms.principal) !== BigInt(request.principal)) {
    errors.push(
      error("terms.principal", "mismatch", "the offer principal differs from the request"),
    );
  }
  return errors.length > 0 ? fail(errors) : ok(true);
}

export interface BuildOfferInput {
  readonly requestId: string;
  readonly borrowerW: string;
  readonly lenderW: string;
  readonly terms: OfferTermsPayload;
  readonly offerExpiresAt: string;
  readonly note?: string;
  readonly offerId?: string;
}

export function buildOffer(input: BuildOfferInput): Result<OfferPayload> {
  let offerId: string;
  try {
    offerId = input.offerId ?? randomId();
  } catch (err) {
    return fail([error("offerId", "bad-format", err instanceof Error ? err.message : String(err))]);
  }
  return validateOffer({
    schema: OFFER_SCHEMA_ID,
    offerId,
    requestId: input.requestId,
    borrowerW: input.borrowerW,
    lenderW: input.lenderW,
    terms: input.terms,
    offerExpiresAt: input.offerExpiresAt,
    note: input.note ?? "",
  });
}

/** Converts validated payload terms into the contract's `Terms` (bigint fields). */
export function toContractTerms(terms: OfferTermsPayload): Terms {
  return {
    borrower: terms.borrower as `0x${string}`,
    lender: terms.lender as `0x${string}`,
    token: terms.token as `0x${string}`,
    principal: BigInt(terms.principal),
    interest: BigInt(terms.interest),
    dueDate: BigInt(terms.dueDate),
    graceSeconds: BigInt(terms.graceSeconds),
    fundingDeadline: BigInt(terms.fundingDeadline),
    claimDeadline: BigInt(terms.claimDeadline),
    salt: terms.salt as `0x${string}`,
  };
}

export function encodeOffer(payload: OfferPayload): Result<Uint8Array> {
  const valid = validateOffer(payload);
  if (!valid.ok) return valid;
  const bytes = encodeCanonical(valid.value);
  if (bytes.length > MAX_PAYLOAD_BYTES) {
    return fail([
      error(
        "$",
        "too-large",
        `the offer is ${bytes.length} bytes; the limit is ${MAX_PAYLOAD_BYTES}`,
      ),
    ]);
  }
  return ok(bytes);
}

export function decodeOffer(input: Uint8Array | string): Result<OfferPayload> {
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
  return validateOffer(parsed);
}
