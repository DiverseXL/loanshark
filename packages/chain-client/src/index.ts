// Package entry point. Nothing here contacts a chain on import: the verifier
// takes an injected account client, and the spike is not exported.
export const CHAIN_CLIENT_PACKAGE = "@loanshark/chain-client";

export type { Bech32AddressFailure, EvmAddressResult } from "./bech32.js";
export { evmAddressOfBech32, QOR_ADDRESS_PREFIX } from "./bech32.js";
export type {
  OnChainPqcAccount,
  PqcAccountReader,
  VerifyHybridMessageFailure,
  VerifyHybridMessageFailureResult,
  VerifyHybridMessageInput,
  VerifyHybridMessageResult,
  VerifyHybridMessageSuccess,
} from "./verify-hybrid-message.js";
export { verifyHybridMessage } from "./verify-hybrid-message.js";
