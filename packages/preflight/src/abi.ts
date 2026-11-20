// The ABI fragments the preflight reads and simulates.
//
// These mirror packages/contracts/contracts/LoanSettlement.sol and the
// OpenZeppelin ERC-20 the settlement uses. The Hardhat preflight test compares
// every error selector here with the compiled artifact, so a rename in the
// contract fails there rather than silently producing an undecoded revert.

import { parseAbi } from "viem";

export const SETTLEMENT_ABI = parseAbi([
  "struct Terms { address borrower; address lender; address token; uint256 principal; uint256 interest; uint64 dueDate; uint64 graceSeconds; uint64 fundingDeadline; uint64 claimDeadline; bytes32 salt; }",
  "function commitmentOf(Terms terms) view returns (bytes32)",
  "function termsOf(bytes32 loanId) view returns (Terms)",
  "function stateOf(bytes32 loanId) view returns (uint8)",
  "function repaidOf(bytes32 loanId) view returns (uint256)",
  "function withdrawableOf(bytes32 loanId) view returns (uint256)",
  "function outstandingOf(bytes32 loanId) view returns (uint256)",
  "function isAllowedToken(address token) view returns (bool)",
  "function allowedTokens() view returns (address[])",
  "function proposeLoan(Terms terms) returns (bytes32 loanId)",
  "function fund(bytes32 loanId)",
  "function cancel(bytes32 loanId)",
  "function expire(bytes32 loanId)",
  "function claim(bytes32 loanId)",
  "function refund(bytes32 loanId)",
  "function repay(bytes32 loanId, uint256 amount)",
  "function markDefault(bytes32 loanId)",
  "function withdraw(bytes32 loanId)",
]);

export const ERC20_ABI = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)",
]);

/**
 * Custom errors that a settlement call can revert with. The contract errors come
 * from LoanSettlement; the ERC-20 ones come from OpenZeppelin 5 and from
 * SafeERC20 failures inside the settlement.
 */
export const REVERT_ERRORS_ABI = parseAbi([
  "error NotBorrower(address caller)",
  "error NotLender(address caller)",
  "error InvalidAddress()",
  "error InvalidTerms()",
  "error TokenNotAllowed(address token)",
  "error LoanExists(bytes32 loanId)",
  "error UnknownLoan(bytes32 loanId)",
  "error InvalidState(bytes32 loanId, uint8 actual)",
  "error FundingDeadlinePassed()",
  "error FundingDeadlineNotReached()",
  "error ClaimDeadlinePassed()",
  "error ClaimDeadlineNotReached()",
  "error ClaimWindowTooShort(uint256 minimum)",
  "error DefaultNotYetAvailable()",
  "error NothingToWithdraw()",
  "error ZeroAmount()",
  "error Overpayment(uint256 outstanding, uint256 amount)",
  "error InexactTransfer()",
  "error ReentrancyGuardReentrantCall()",
  "error SafeERC20FailedOperation(address token)",
  "error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)",
  "error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed)",
  "error ERC20InvalidSender(address sender)",
  "error ERC20InvalidReceiver(address receiver)",
  "error ERC20FailedDecreaseAllowance(address spender, uint256 currentAllowance, uint256 requestedDecrease)",
]);

/** Solidity `LoanSettlement.State` values, in declaration order. */
export const LOAN_STATES = [
  "None",
  "Proposed",
  "Funded",
  "Active",
  "Defaulted",
  "Repaid",
  "Cancelled",
  "Expired",
  "Refunded",
] as const;

export const MAX_UINT256 = 2n ** 256n - 1n;
