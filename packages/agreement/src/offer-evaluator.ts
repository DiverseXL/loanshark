// Local, deterministic offer evaluation.
//
// Given what the borrower asked for and what the lender offered, decide whether
// the offer could be proposed as a loan and explain every check. This module is
// a pure function: no network, no randomness, no clock read. The caller passes
// `now`. It does not score or rank offers; it returns a list of checks.
//
// The checks mirror the validation the contract performs in `_validateTerms`
// (packages/contracts/contracts/LoanSettlement.sol, read for this module rather
// than recalled), plus the borrower's own limits, which the contract does not
// know about.
//
// A missing or malformed field makes the offer ineligible with a reason. Nothing
// here throws for bad input.

import type { Terms } from "./terms.js";
import { MAX_UINT64 } from "./terms.js";

/** The contract's minimum gap between the funding and claim deadlines. */
export const MINIMUM_CLAIM_WINDOW = 3_600n;

/** 2^256 - 1, the largest Solidity `uint256`. */
export const MAX_UINT256 = 2n ** 256n - 1n;

/** What the borrower asked for. */
export interface OfferRequest {
  /** Wallet (W) address of the borrower. */
  borrower: string;
  /** ERC-20 token the borrower wants. */
  token: string;
  /** Requested principal, in base units. */
  principal: bigint;
  /** The most the borrower will repay in total (principal plus interest). */
  maxTotalCost: bigint;
  /** The latest acceptable due date, unix seconds. */
  latestDueDate: bigint;
}

/** What the lender offered. Shape-compatible with the contract's `Terms`. */
export interface Offer {
  lender: string;
  token: string;
  principal: bigint;
  interest: bigint;
  dueDate: bigint;
  graceSeconds: bigint;
  fundingDeadline: bigint;
  claimDeadline: bigint;
}

/** One named check with both values and a plain-language reason. */
export interface EvaluationCheck {
  id: string;
  pass: boolean;
  expected: string;
  actual: string;
  explanation: string;
}

export interface OfferEvaluation {
  /** True only when every check passed. */
  eligible: boolean;
  checks: EvaluationCheck[];
}

/** A backend contract. The local implementation is the only one that exists. */
export interface OfferEvaluator {
  evaluate(request: OfferRequest, offer: Offer, now: bigint): OfferEvaluation;
}

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

type FieldKind = "address" | "uint256" | "uint64";

const isPresent = (value: unknown): boolean => value !== undefined && value !== null;

function fieldProblem(value: unknown, kind: FieldKind): string | null {
  if (!isPresent(value)) return "missing";
  if (kind === "address") {
    return typeof value === "string" && ADDRESS_PATTERN.test(value)
      ? null
      : "not a 20-byte 0x address";
  }
  if (typeof value !== "bigint") return "not an integer";
  if (value < 0n) return "negative";
  if (kind === "uint64" && value > MAX_UINT64) return "does not fit in uint64";
  if (kind === "uint256" && value > MAX_UINT256) return "does not fit in uint256";
  return null;
}

const check = (
  id: string,
  pass: boolean,
  expected: string,
  actual: string,
  explanation: string,
): EvaluationCheck => ({ id, pass, expected, actual, explanation });

function shapeChecks(request: OfferRequest, offer: Offer, now: unknown): EvaluationCheck[] {
  const checks: EvaluationCheck[] = [];

  if (typeof now !== "bigint" || now < 0n) {
    checks.push(
      check(
        "now-valid",
        false,
        "now is a non-negative integer",
        typeof now === "bigint" ? now.toString(10) : `not an integer (${typeof now})`,
        "The evaluation time must be supplied as whole unix seconds.",
      ),
    );
  }

  const requestFields: Array<[string, unknown, FieldKind]> = [
    ["borrower", request?.borrower, "address"],
    ["token", request?.token, "address"],
    ["principal", request?.principal, "uint256"],
    ["maxTotalCost", request?.maxTotalCost, "uint256"],
    ["latestDueDate", request?.latestDueDate, "uint64"],
  ];
  for (const [name, value, kind] of requestFields) {
    const problem = fieldProblem(value, kind);
    if (problem !== null) {
      checks.push(
        check(
          `request-${name}`,
          false,
          `${name} is a valid ${kind}`,
          problem,
          `The request's ${name} is ${problem}, so no offer can be evaluated against it.`,
        ),
      );
    }
  }

  const offerFields: Array<[string, unknown, FieldKind]> = [
    ["lender", offer?.lender, "address"],
    ["token", offer?.token, "address"],
    ["principal", offer?.principal, "uint256"],
    ["interest", offer?.interest, "uint256"],
    ["dueDate", offer?.dueDate, "uint64"],
    ["graceSeconds", offer?.graceSeconds, "uint64"],
    ["fundingDeadline", offer?.fundingDeadline, "uint64"],
    ["claimDeadline", offer?.claimDeadline, "uint64"],
  ];
  for (const [name, value, kind] of offerFields) {
    const problem = fieldProblem(value, kind);
    if (problem !== null) {
      checks.push(
        check(
          `offer-${name}`,
          false,
          `${name} is a valid ${kind}`,
          problem,
          `The offer's ${name} is ${problem}, so the offer is not usable as a loan.`,
        ),
      );
    }
  }

  return checks;
}

const sameAddress = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/**
 * Evaluates one offer against one request at a given time.
 * Deterministic: the same inputs always produce the same checks in the same order.
 */
export function evaluateOffer(request: OfferRequest, offer: Offer, now: bigint): OfferEvaluation {
  const checks: EvaluationCheck[] = [...shapeChecks(request, offer, now)];

  // Order below follows the contract's `_validateTerms`, so a reader can map a
  // check to the revert it predicts.
  if (checks.length === 0) {
    checks.push(
      check(
        "parties-differ",
        !sameAddress(request.borrower, offer.lender),
        "offer.lender differs from request.borrower",
        `${request.borrower} vs ${offer.lender}`,
        sameAddress(request.borrower, offer.lender)
          ? "The contract rejects a loan whose borrower and lender are the same address."
          : "The borrower and the lender are different addresses.",
      ),
    );

    checks.push(
      check(
        "principal-nonzero",
        offer.principal > 0n,
        "principal > 0",
        offer.principal.toString(10),
        offer.principal > 0n
          ? "The contract requires a non-zero principal."
          : "The contract rejects a zero principal.",
      ),
    );

    checks.push(
      check(
        "token-matches-request",
        sameAddress(offer.token, request.token),
        request.token,
        offer.token,
        sameAddress(offer.token, request.token)
          ? "The offer is in the token the borrower asked for."
          : "The offer is in a different token from the one requested.",
      ),
    );

    checks.push(
      check(
        "principal-matches-request",
        offer.principal === request.principal,
        request.principal.toString(10),
        offer.principal.toString(10),
        offer.principal === request.principal
          ? "The offered principal equals the requested principal."
          : "The offered principal differs from the requested principal.",
      ),
    );

    const total = offer.principal + offer.interest;
    checks.push(
      check(
        "no-arithmetic-overflow",
        total <= MAX_UINT256,
        "principal + interest <= 2^256 - 1",
        total.toString(10),
        "Solidity `uint256` addition would revert on overflow; the sum must fit.",
      ),
    );

    checks.push(
      check(
        "total-cost-within-maximum",
        total <= request.maxTotalCost,
        `principal + interest <= ${request.maxTotalCost.toString(10)}`,
        total.toString(10),
        total <= request.maxTotalCost
          ? "The total repayment is within the borrower's maximum total cost."
          : "The total repayment exceeds the borrower's maximum total cost.",
      ),
    );

    checks.push(
      check(
        "funding-deadline-in-future",
        offer.fundingDeadline > now,
        `fundingDeadline > ${now.toString(10)}`,
        offer.fundingDeadline.toString(10),
        offer.fundingDeadline > now
          ? "The funding deadline has not passed, so fund could still succeed."
          : "The contract rejects a proposal whose funding deadline is not in the future.",
      ),
    );

    checks.push(
      check(
        "deadline-order",
        offer.claimDeadline >= offer.fundingDeadline,
        "claimDeadline >= fundingDeadline",
        `${offer.claimDeadline.toString(10)} vs ${offer.fundingDeadline.toString(10)}`,
        offer.claimDeadline >= offer.fundingDeadline
          ? "The claim deadline is not before the funding deadline."
          : "The contract rejects a claim deadline earlier than the funding deadline.",
      ),
    );

    checks.push(
      check(
        "claim-window-minimum",
        offer.claimDeadline >= offer.fundingDeadline + MINIMUM_CLAIM_WINDOW,
        `claimDeadline >= fundingDeadline + ${MINIMUM_CLAIM_WINDOW.toString(10)}`,
        (offer.claimDeadline - offer.fundingDeadline).toString(10),
        offer.claimDeadline >= offer.fundingDeadline + MINIMUM_CLAIM_WINDOW
          ? "The claim window meets the contract's 3600-second minimum."
          : "The contract reverts with ClaimWindowTooShort below 3600 seconds.",
      ),
    );

    checks.push(
      check(
        "due-date-after-claim",
        offer.dueDate > offer.claimDeadline,
        "dueDate > claimDeadline",
        `${offer.dueDate.toString(10)} vs ${offer.claimDeadline.toString(10)}`,
        offer.dueDate > offer.claimDeadline
          ? "The due date is after the claim deadline, as the contract requires."
          : "The contract rejects a due date at or before the claim deadline.",
      ),
    );

    checks.push(
      check(
        "due-date-not-later-than-requested",
        offer.dueDate <= request.latestDueDate,
        `dueDate <= ${request.latestDueDate.toString(10)}`,
        offer.dueDate.toString(10),
        offer.dueDate <= request.latestDueDate
          ? "The due date is no later than the borrower's latest acceptable date."
          : "The due date is later than the borrower's latest acceptable date.",
      ),
    );

    checks.push(
      check(
        "offer-not-expired",
        now < offer.dueDate,
        `now < dueDate (${offer.dueDate.toString(10)})`,
        now.toString(10),
        now < offer.dueDate
          ? "The offer's due date is still in the future at the evaluation time."
          : "The offer is already past due at the evaluation time.",
      ),
    );
  }

  return { eligible: checks.every((item) => item.pass), checks };
}

/** The local evaluator. The only implementation in this repository. */
export const LocalOfferEvaluator: OfferEvaluator = {
  evaluate: evaluateOffer,
};

/** Converts an accepted offer into contract `Terms`. Does not evaluate. */
export function offerToTerms(request: OfferRequest, offer: Offer, salt: string): Terms {
  return {
    borrower: request.borrower as `0x${string}`,
    lender: offer.lender as `0x${string}`,
    token: offer.token as `0x${string}`,
    principal: offer.principal,
    interest: offer.interest,
    dueDate: offer.dueDate,
    graceSeconds: offer.graceSeconds,
    fundingDeadline: offer.fundingDeadline,
    claimDeadline: offer.claimDeadline,
    salt: salt as `0x${string}`,
  };
}
