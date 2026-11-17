// The loan id is keccak256(abi.encode(terms)), exactly as the Solidity view
// function computes it. `abi.encode` is used, not `abi.encodePacked`, so every
// value occupies a 32-byte word and adjacent fields cannot collide.
//
// viem 2.58.0 is pinned exactly. No hash is hand-rolled: the ABI encoding and
// keccak come from viem, and the exact same parameter list is defined in the
// contract test that compares the two implementations.

import type { Hex } from "viem";
import { encodeAbiParameters, keccak256 } from "viem";
import type { Terms } from "./terms.js";
import { assertTermsShape } from "./terms.js";

/** The ABI parameter list, in the order fixed by ADR-0008. */
export const TERMS_ABI_PARAMETERS = [
  { name: "borrower", type: "address" },
  { name: "lender", type: "address" },
  { name: "token", type: "address" },
  { name: "principal", type: "uint256" },
  { name: "interest", type: "uint256" },
  { name: "dueDate", type: "uint64" },
  { name: "graceSeconds", type: "uint64" },
  { name: "fundingDeadline", type: "uint64" },
  { name: "claimDeadline", type: "uint64" },
  { name: "salt", type: "bytes32" },
] as const;

/** The ABI-encoded terms, before hashing. Useful for the cross-check test. */
export function encodeTerms(terms: Terms): Hex {
  assertTermsShape(terms);
  return encodeAbiParameters(TERMS_ABI_PARAMETERS, [
    terms.borrower,
    terms.lender,
    terms.token,
    terms.principal,
    terms.interest,
    terms.dueDate,
    terms.graceSeconds,
    terms.fundingDeadline,
    terms.claimDeadline,
    terms.salt,
  ]);
}

/**
 * `keccak256(abi.encode(terms))`. This is the loan id.
 * Deterministic and offline; no chain call is made.
 */
export function commitmentOf(terms: Terms): Hex {
  return keccak256(encodeTerms(terms));
}

/** The loan id is the commitment. Named separately for readability. */
export const loanIdOf = commitmentOf;
