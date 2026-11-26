// The loan id is keccak256(abi.encode(block.chainid, address(this), terms)),
// exactly as the Solidity view function computes it. `abi.encode` is used, not
// `abi.encodePacked`, so every value occupies a 32-byte word and adjacent fields
// cannot collide.
//
// The chain id and the verifying contract address are part of the preimage
// (ADR-0008 decision 8, amended in Step 9b). A commitment made for one contract
// on one chain therefore cannot be replayed at a different address or on a
// different chain.
//
// viem 2.57.11 is pinned exactly. No hash is hand-rolled: the ABI encoding and
// keccak come from viem, and the same parameter list is defined in the contract
// test that compares the two implementations.

import type { Hex } from "viem";
import { encodeAbiParameters, keccak256 } from "viem";
import type { Address, Terms } from "./terms.js";
import { assertTermsShape } from "./terms.js";

/** The ABI parameter list for the terms, in the order fixed by ADR-0008. */
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

/**
 * The two values that scope a commitment. `chainId` is the EVM chain id of the
 * settlement chain (Diana is 9800); `verifyingContract` is the deployed
 * `LoanSettlement` address.
 */
export interface CommitmentDomain {
  chainId: bigint;
  verifyingContract: Address;
}

/**
 * The full preimage parameter list: chain id, contract address, then the terms
 * tuple. It mirrors `abi.encode(block.chainid, address(this), terms)`.
 */
export const COMMITMENT_ABI_PARAMETERS = [
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
  { name: "terms", type: "tuple", components: TERMS_ABI_PARAMETERS },
] as const;

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const MAX_UINT256 = 2n ** 256n - 1n;

function assertDomainShape(domain: CommitmentDomain): void {
  if (!ADDRESS_PATTERN.test(domain.verifyingContract)) {
    throw new TypeError("verifyingContract is not a 20-byte address");
  }
  if (domain.chainId < 0n) throw new TypeError("chainId is negative");
  if (domain.chainId > MAX_UINT256) throw new TypeError("chainId does not fit in uint256");
}

/** The ABI-encoded terms alone. Useful for the cross-check test. */
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

/** The ABI-encoded commitment preimage, before hashing. */
export function encodeCommitment(terms: Terms, domain: CommitmentDomain): Hex {
  assertTermsShape(terms);
  assertDomainShape(domain);
  // viem enforces the EIP-55 checksum on mixed-case input; the encoded bytes are
  // the same for any case, so the address is lowercased before encoding.
  return encodeAbiParameters(COMMITMENT_ABI_PARAMETERS, [
    domain.chainId,
    domain.verifyingContract.toLowerCase() as Address,
    terms,
  ]);
}

/**
 * `keccak256(abi.encode(chainId, verifyingContract, terms))`. This is the loan
 * id. Deterministic and offline; no chain call is made.
 */
export function commitmentOf(terms: Terms, domain: CommitmentDomain): Hex {
  return keccak256(encodeCommitment(terms, domain));
}

/** The loan id is the commitment. Named separately for readability. */
export const loanIdOf = commitmentOf;
