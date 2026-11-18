// ABI helpers used only to build transaction data for the deploy panel.
//
// Address and uint256 encoding is the standard ABI word encoding: a 20-byte
// address is left-padded with twelve zero bytes; a uint256 is 32 bytes, big
// endian. tests/deploy-encoding.test.ts checks both against known words.
//
// Function selectors are not computed here. They are the four bytes recorded in
// docs/evidence/phase-05-token-scan.md, which were computed with viem 2.57.11
// for that scan. A test pins them.

import { manifest } from "./manifest.js";

/** `owner()` selector, phase-05-token-scan.md. */
export const OWNER_SELECTOR = "0x8da5cb5b" as const;

/** `mint(address,uint256)` selector, phase-05-token-scan.md. */
export const MINT_SELECTOR = "0x40c10f19" as const;

/** TestUSD decimals, packages/contracts/contracts/TestUSD.sol. */
export const TESTUSD_DECIMALS = 6;

const HEX_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** One ABI word for an address. Throws on anything that is not 20 hex bytes. */
export function encodeAddress(address: string): string {
  if (!HEX_ADDRESS.test(address)) {
    throw new Error(`Not a 20-byte hex address: ${JSON.stringify(address)}`);
  }
  return address.slice(2).toLowerCase().padStart(64, "0");
}

/** One ABI word for an unsigned integer. Throws for a negative value. */
export function encodeUint256(value: bigint): string {
  if (value < 0n) throw new Error("uint256 cannot be negative");
  const hex = value.toString(16);
  if (hex.length > 64) throw new Error("uint256 does not fit in 32 bytes");
  return hex.padStart(64, "0");
}

const stripHexPrefix = (value: string): string => {
  if (!/^0x[0-9a-fA-F]*$/.test(value)) throw new Error("Expected a 0x-prefixed hex string");
  return value.slice(2);
};

/** TestUSD creation data: creation bytecode plus abi.encode(address owner). */
export function testUsdDeployData(owner: string): string {
  return `0x${stripHexPrefix(manifest.contracts.TestUSD.creationBytecode)}${encodeAddress(owner)}`;
}

/**
 * LoanSettlement creation data with the two constructor words, in the order the
 * manifest declares: abi.encode(address testUsd_, address fusd_).
 */
export function settlementDeployData(testUsd: string, fusd: string): string {
  return `0x${stripHexPrefix(manifest.contracts.LoanSettlement.creationBytecode)}${encodeAddress(
    testUsd,
  )}${encodeAddress(fusd)}`;
}

/** TestUSD mint data: mint(address to, uint256 amount) in 6-decimal base units. */
export function mintData(to: string, amountBaseUnits: bigint): string {
  return `0x${stripHexPrefix(MINT_SELECTOR)}${encodeAddress(to)}${encodeUint256(amountBaseUnits)}`;
}

/** 1000 tUSD in base units. */
export const MINT_AMOUNT_BASE_UNITS = 1000n * 10n ** BigInt(TESTUSD_DECIMALS);

/** Reads the first 20 bytes of an eth_call result as an address. */
export function addressFromWord(result: unknown): string | null {
  if (typeof result !== "string" || !/^0x[0-9a-fA-F]{64,}$/.test(result)) return null;
  return `0x${result.slice(-40).toLowerCase()}`;
}
