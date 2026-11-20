// Types for the read-only preflight (Step 9b Task 4).

import type { FootprintActionId } from "@loanshark/privacy-footprint";

/** A 20-byte EVM address. */
export type Address = `0x${string}`;
/** A 32-byte value. */
export type Bytes32 = `0x${string}`;

/** The contract's `Terms` struct, in the order ADR-0008 fixes. */
export interface Terms {
  borrower: Address;
  lender: Address;
  token: Address;
  principal: bigint;
  interest: bigint;
  dueDate: bigint;
  graceSeconds: bigint;
  fundingDeadline: bigint;
  claimDeadline: bigint;
  salt: Bytes32;
}

export type PreflightAction =
  | "propose"
  | "approve"
  | "fund"
  | "claim"
  | "repay"
  | "withdraw"
  | "cancel"
  | "refund";

/** What the caller intends to do. Nothing here is hard-coded to a deployment. */
export interface PreflightPlan {
  action: PreflightAction;
  /** EVM chain id the caller believes it is on. */
  chainId: number;
  /** Address that will send the transaction. */
  from: Address;
  /** `LoanSettlement` address. */
  settlement: Address;
  /** ERC-20 token involved. */
  token: Address;
  /** Amount in base units: the principal, the repayment or the approval. */
  amount: bigint;
  /** Required for every action except `approve`. */
  loanId?: Bytes32;
  /** Required for `propose`. */
  terms?: Terms;
}

/** Deployment facts the caller configures; no address is baked into this package. */
export interface PreflightConfig {
  expectedChainId: number;
  settlementAddress: Address;
  /** Optional keccak256 of the expected runtime code. */
  expectedRuntimeCodeHash?: Bytes32;
  /** Tokens the caller believes the contract allows. */
  allowedTokens: Address[];
}

export type CheckStatus = "pass" | "fail" | "unknown";

export interface PreflightCheck {
  id: string;
  status: CheckStatus;
  explanation: string;
}

export type PreflightStatus = "ready" | "blocked" | "unknown";

export interface PreflightResult {
  status: PreflightStatus;
  checks: PreflightCheck[];
  /** The public fields this action exposes, from the privacy footprint. */
  publicFields: string[];
  /** Footprint entry this action maps to. */
  footprint: FootprintActionId;
  /** Token decimals when they could be read. */
  tokenDecimals?: number;
  /** `eth_estimateGas` result when it could be read. */
  estimatedGas?: bigint;
}

/** The injected JSON-RPC function. It is the only way this module reaches a node. */
export type JsonRpcRequest = (method: string, params: unknown[]) => Promise<unknown>;

export interface PreflightDeps {
  request: JsonRpcRequest;
  /** Per-call timeout. Defaults to 10 seconds. */
  timeoutMs?: number;
}
