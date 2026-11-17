// Loan terms. The field order here is the order used by the ABI encoding and
// by the Solidity struct in ADR-0008; changing it changes every commitment.
//
// `uint256` and `uint64` are bigint in TypeScript. Addresses and the salt are
// hex strings and are normalized to lowercase for hashing and text output.

/** A 20-byte EVM address, `0x` followed by 40 hex characters. */
export type Address = `0x${string}`;

/** A 32-byte value, `0x` followed by 64 hex characters. */
export type Bytes32 = `0x${string}`;

/** The ten fields of a loan agreement, in commitment order. */
export interface Terms {
  /** Proposes the loan and repays it. */
  borrower: Address;
  /** Funds the loan and withdraws repayments. */
  lender: Address;
  /** ERC-20 token; must be on the immutable allowlist. */
  token: Address;
  /** Principal in token base units. */
  principal: bigint;
  /** Fixed interest in token base units; may be zero. */
  interest: bigint;
  /** Unix seconds. */
  dueDate: bigint;
  /** Seconds added to `dueDate` for the default boundary. */
  graceSeconds: bigint;
  /** Last second at which `fund` is accepted. */
  fundingDeadline: bigint;
  /** Last second at which `claim` is accepted. */
  claimDeadline: bigint;
  /** Makes otherwise identical terms distinct. */
  salt: Bytes32;
}

/** Maximum value of a Solidity `uint64`. */
export const MAX_UINT64 = 2n ** 64n - 1n;

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const BYTES32_PATTERN = /^0x[0-9a-fA-F]{64}$/;

/**
 * Validates the shape of the terms that the commitment and the canonical text
 * depend on. It does not enforce the loan policy (deadlines, principal > 0);
 * that belongs to the contract, which is the authority.
 */
export function assertTermsShape(terms: Terms): void {
  if (!ADDRESS_PATTERN.test(terms.borrower))
    throw new TypeError("borrower is not a 20-byte address");
  if (!ADDRESS_PATTERN.test(terms.lender)) throw new TypeError("lender is not a 20-byte address");
  if (!ADDRESS_PATTERN.test(terms.token)) throw new TypeError("token is not a 20-byte address");
  if (!BYTES32_PATTERN.test(terms.salt)) throw new TypeError("salt is not a 32-byte value");

  for (const [name, value] of [
    ["principal", terms.principal],
    ["interest", terms.interest],
    ["dueDate", terms.dueDate],
    ["graceSeconds", terms.graceSeconds],
    ["fundingDeadline", terms.fundingDeadline],
    ["claimDeadline", terms.claimDeadline],
  ] as const) {
    if (value < 0n) throw new TypeError(`${name} is negative`);
  }

  for (const [name, value] of [
    ["dueDate", terms.dueDate],
    ["graceSeconds", terms.graceSeconds],
    ["fundingDeadline", terms.fundingDeadline],
    ["claimDeadline", terms.claimDeadline],
  ] as const) {
    if (value > MAX_UINT64) throw new TypeError(`${name} does not fit in uint64`);
  }
}
