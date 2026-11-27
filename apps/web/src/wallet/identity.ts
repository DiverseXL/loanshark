// The account guard (ADR-0009, rewritten in Step 11a).
//
// QoreX reports one EVM account over `eth_accounts` regardless of which native
// account is active. The wallet account W is therefore the account whose native
// key's bech32 address decodes to the same 20 bytes as the reported EVM
// account. A coin-118 account has no EVM identity under QoreX: its address
// decodes to different bytes, and QoreX refuses an EVM send from it
// (owner-supplied observation (1), docs/evidence/phase-11a-result.md).
//
// Every signing and sending action calls this guard. Unless the state is
// `match`, nothing is signed and nothing is sent.

import { evmAddressOfBech32 } from "@loanshark/chain-client";
import type { Eip1193Provider } from "./types.js";

/** The plain label the page shows for a mismatched account. */
export const ACCOUNT_MISMATCH_LABEL = "ACCOUNT_MISMATCH";

export type AccountIdentity =
  | {
      readonly status: "match";
      /** The active native account. */
      readonly nativeAddress: string;
      /** The 20 bytes that native address carries. */
      readonly nativeEvmAddress: `0x${string}`;
      /** The EVM account QoreX reports, as it reported it. */
      readonly evmAddress: string;
    }
  | {
      readonly status: "account-mismatch";
      readonly nativeAddress: string;
      readonly nativeEvmAddress: `0x${string}`;
      readonly evmAddress: string;
      readonly message: string;
    }
  | {
      /** The comparison could not be made: no EVM account, no native account,
       * or an address that does not decode. Signing and sending stay blocked. */
      readonly status: "unreadable";
      readonly message: string;
    };

export interface AccountIdentityInput {
  /** The active native `qor1` account, or null when none was read. */
  readonly nativeAddress: string | null;
  /** The `eth_accounts` answer, or null when it could not be read. */
  readonly evmAccounts: readonly string[] | null;
}

/**
 * Compares the native account's decoded address with `eth_accounts[0]`. Pure:
 * the caller supplies both readings. Case is ignored, because a provider may
 * return the EIP-55 checksummed form.
 */
export function evaluateAccountIdentity(input: AccountIdentityInput): AccountIdentity {
  if (input.evmAccounts === null || input.evmAccounts.length === 0) {
    return {
      status: "unreadable",
      message:
        "QoreX reported no EVM account, so the active native account cannot be compared with the EVM lane. Signing and sending are blocked.",
    };
  }
  const evmAddress = input.evmAccounts[0] as string;
  if (input.nativeAddress === null) {
    return {
      status: "unreadable",
      message:
        "No native account was read, so it cannot be compared with the EVM account QoreX reports. Signing and sending are blocked.",
    };
  }
  const decoded = evmAddressOfBech32(input.nativeAddress);
  if (!decoded.ok) {
    return {
      status: "unreadable",
      message: `The native account ${input.nativeAddress} could not be decoded: ${decoded.message} Signing and sending are blocked.`,
    };
  }
  if (decoded.address.toLowerCase() !== evmAddress.toLowerCase()) {
    return {
      status: "account-mismatch",
      nativeAddress: input.nativeAddress,
      nativeEvmAddress: decoded.address,
      evmAddress,
      message:
        `QoreX reports one EVM account (${evmAddress}) regardless of which account is active. ` +
        `The active native account ${input.nativeAddress} carries the address ${decoded.address}, so it is not the account behind that EVM account. ` +
        "Switch QoreX to the Ethereum (coin 60) account before signing or sending.",
    };
  }
  return {
    status: "match",
    nativeAddress: input.nativeAddress,
    nativeEvmAddress: decoded.address,
    evmAddress,
  };
}

export interface EvmAccountsReading {
  readonly accounts: readonly string[] | null;
  readonly error: string | null;
}

/** Reads `eth_accounts` only (no account-request prompt). Never throws. */
export async function readEvmAccounts(
  provider: Eip1193Provider | null,
): Promise<EvmAccountsReading> {
  if (provider === null) {
    return { accounts: null, error: "No QoreX EVM provider was found over EIP-6963." };
  }
  try {
    const answer = await provider.request({ method: "eth_accounts" });
    if (Array.isArray(answer) && answer.every((item) => typeof item === "string")) {
      return { accounts: answer, error: null };
    }
    return {
      accounts: null,
      error: `eth_accounts returned ${JSON.stringify(answer)}, which is not an array of addresses.`,
    };
  } catch (err) {
    return { accounts: null, error: err instanceof Error ? err.message : String(err) };
  }
}
