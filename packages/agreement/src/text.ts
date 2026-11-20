// Canonical agreement text for the encrypted off-chain document.
//
// The text is versioned, one field per line, `label: value`, joined with LF and
// ending without a trailing newline. Addresses and the salt are lowercase hex,
// and amounts are decimal base units. No field can contain a newline: every
// value is an address, a 32-byte hex value or an unsigned integer.
//
// ASSUMPTION (recorded in ADR-0010): this layout is this project's format, not
// a QoreChain standard. Changing it changes every agreement hash.

import type { Hex } from "viem";
import { sha256 } from "viem";
import type { Terms } from "./terms.js";
import { assertTermsShape } from "./terms.js";

/** First line of every version-1 document. */
export const AGREEMENT_TEXT_VERSION = "LOANSHARK AGREEMENT v1";

const lower = (value: string): string => value.toLowerCase();

/**
 * The exact UTF-8 text hashed into the agreement hash. Deterministic.
 */
export function canonicalAgreementText(terms: Terms): string {
  assertTermsShape(terms);
  return [
    AGREEMENT_TEXT_VERSION,
    `borrower: ${lower(terms.borrower)}`,
    `lender: ${lower(terms.lender)}`,
    `token: ${lower(terms.token)}`,
    `principal: ${terms.principal.toString(10)}`,
    `interest: ${terms.interest.toString(10)}`,
    `dueDate: ${terms.dueDate.toString(10)}`,
    `graceSeconds: ${terms.graceSeconds.toString(10)}`,
    `fundingDeadline: ${terms.fundingDeadline.toString(10)}`,
    `claimDeadline: ${terms.claimDeadline.toString(10)}`,
    `salt: ${lower(terms.salt)}`,
  ].join("\n");
}

/** UTF-8 bytes of the canonical text. */
export const canonicalAgreementBytes = (terms: Terms): Uint8Array =>
  new TextEncoder().encode(canonicalAgreementText(terms));

/**
 * SHA-256 of the canonical text, recorded alongside the terms. This is the
 * hash both parties confirm; it is not the on-chain loan id.
 */
export function agreementHashOf(terms: Terms): Hex {
  return sha256(canonicalAgreementBytes(terms));
}
