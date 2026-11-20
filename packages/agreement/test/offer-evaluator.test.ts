import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Offer, OfferRequest } from "../src/offer-evaluator.js";
import {
  evaluateOffer,
  LocalOfferEvaluator,
  MAX_UINT256,
  MINIMUM_CLAIM_WINDOW,
} from "../src/offer-evaluator.js";

// REAL: pure local function, no network, no clock, no mock.
// The contract is the authority for the deadline rules; the constant check at
// the bottom reads its source.

const REQUEST: OfferRequest = {
  borrower: "0x1111111111111111111111111111111111111111",
  token: "0x3333333333333333333333333333333333333333",
  principal: 1_000_000n,
  maxTotalCost: 1_100_000n,
  latestDueDate: 1_800_000_000n,
};

const OFFER: Offer = {
  lender: "0x2222222222222222222222222222222222222222",
  token: "0x3333333333333333333333333333333333333333",
  principal: 1_000_000n,
  interest: 50_000n,
  dueDate: 1_800_000_000n,
  graceSeconds: 259_200n,
  fundingDeadline: 1_790_000_000n,
  claimDeadline: 1_795_000_000n,
};

const NOW = 1_789_000_000n;

const idsOf = (result: { checks: Array<{ id: string; pass: boolean }> }, pass: boolean) =>
  result.checks.filter((item) => item.pass === pass).map((item) => item.id);

const evaluate = (offer: Partial<Offer> = {}, request: Partial<OfferRequest> = {}, now = NOW) =>
  evaluateOffer({ ...REQUEST, ...request }, { ...OFFER, ...offer }, now);

describe("LocalOfferEvaluator", () => {
  it("accepts a fully eligible offer and reports every check", () => {
    const result = evaluate();
    expect(result.eligible).toBe(true);
    expect(idsOf(result, false)).toEqual([]);
    expect(result.checks.map((item) => item.id)).toEqual([
      "parties-differ",
      "principal-nonzero",
      "token-matches-request",
      "principal-matches-request",
      "no-arithmetic-overflow",
      "total-cost-within-maximum",
      "funding-deadline-in-future",
      "deadline-order",
      "claim-window-minimum",
      "due-date-after-claim",
      "due-date-not-later-than-requested",
      "offer-not-expired",
    ]);
    for (const item of result.checks) {
      expect(item.expected.length).toBeGreaterThan(0);
      expect(item.actual.length).toBeGreaterThan(0);
      expect(item.explanation.length).toBeGreaterThan(0);
    }
  });

  it("is the exported evaluator instance, and it is pure", () => {
    expect(LocalOfferEvaluator.evaluate(REQUEST, OFFER, NOW)).toEqual(
      evaluateOffer(REQUEST, OFFER, NOW),
    );
    expect(evaluateOffer(REQUEST, OFFER, NOW)).toEqual(evaluateOffer(REQUEST, OFFER, NOW));
    // The inputs are not mutated.
    expect(OFFER.interest).toBe(50_000n);
    expect(REQUEST.principal).toBe(1_000_000n);
  });

  it("fails only the token check when the offer is in another token", () => {
    const result = evaluate({ token: "0x4444444444444444444444444444444444444444" });
    expect(result.eligible).toBe(false);
    expect(idsOf(result, false)).toEqual(["token-matches-request"]);
    const failed = result.checks.find((item) => item.id === "token-matches-request");
    expect(failed?.expected).toBe(REQUEST.token);
    expect(failed?.actual).toBe("0x4444444444444444444444444444444444444444");
  });

  it("fails only the principal check when the principal differs", () => {
    const result = evaluate({}, { principal: 999_999n });
    expect(result.eligible).toBe(false);
    expect(idsOf(result, false)).toEqual(["principal-matches-request"]);
  });

  it("fails only the total-cost check when interest pushes past the maximum", () => {
    const result = evaluate({ interest: 100_001n });
    expect(result.eligible).toBe(false);
    expect(idsOf(result, false)).toEqual(["total-cost-within-maximum"]);
    const failed = result.checks.find((item) => item.id === "total-cost-within-maximum");
    expect(failed?.expected).toContain("1100000");
    expect(failed?.actual).toBe("1100001");
  });

  it("fails only the due-date check when the offer is later than requested", () => {
    const result = evaluate({}, { latestDueDate: 1_799_999_999n });
    expect(result.eligible).toBe(false);
    expect(idsOf(result, false)).toEqual(["due-date-not-later-than-requested"]);
  });

  it("reports an expired offer, together with the funding deadline it also breaks", () => {
    const result = evaluateOffer(REQUEST, OFFER, OFFER.dueDate);
    expect(result.eligible).toBe(false);
    expect(idsOf(result, false)).toEqual(["funding-deadline-in-future", "offer-not-expired"]);
  });

  it("fails only the funding-deadline check at the deadline instant", () => {
    const result = evaluateOffer(REQUEST, OFFER, OFFER.fundingDeadline);
    expect(result.eligible).toBe(false);
    expect(idsOf(result, false)).toEqual(["funding-deadline-in-future"]);
  });

  it("fails only the claim-window check at 3599 seconds", () => {
    const result = evaluate({ claimDeadline: OFFER.fundingDeadline + 3_599n });
    expect(result.eligible).toBe(false);
    expect(idsOf(result, false)).toEqual(["claim-window-minimum"]);
  });

  it("accepts exactly the 3600-second minimum", () => {
    const result = evaluate({ claimDeadline: OFFER.fundingDeadline + 3_600n });
    expect(idsOf(result, false)).toEqual([]);
  });

  it("fails the deadline order, and the window it implies, when claim precedes funding", () => {
    const result = evaluate({ claimDeadline: OFFER.fundingDeadline - 1n, dueDate: 1_800_000_000n });
    expect(result.eligible).toBe(false);
    expect(idsOf(result, false)).toContain("deadline-order");
    expect(idsOf(result, false)).toContain("claim-window-minimum");
  });

  it("fails only the due-date-after-claim check when the due date is not later", () => {
    const result = evaluate({ dueDate: OFFER.claimDeadline });
    expect(result.eligible).toBe(false);
    expect(idsOf(result, false)).toEqual(["due-date-after-claim"]);
  });

  it("fails only the parties check when the lender is the borrower", () => {
    const result = evaluate({ lender: REQUEST.borrower.toUpperCase().replace("0X", "0x") });
    expect(result.eligible).toBe(false);
    expect(idsOf(result, false)).toEqual(["parties-differ"]);
  });

  it("fails only the non-zero principal check when the principal is zero", () => {
    const result = evaluate({ principal: 0n }, { principal: 0n });
    expect(result.eligible).toBe(false);
    expect(idsOf(result, false)).toEqual(["principal-nonzero"]);
  });

  it("fails the overflow check at the uint256 boundary", () => {
    const result = evaluate(
      { principal: MAX_UINT256, interest: 1n },
      { principal: MAX_UINT256, maxTotalCost: MAX_UINT256 },
    );
    expect(result.eligible).toBe(false);
    expect(idsOf(result, false)).toContain("no-arithmetic-overflow");
  });

  it("reports several failures together", () => {
    const result = evaluate(
      {
        token: "0x4444444444444444444444444444444444444444",
        interest: 200_000n,
        claimDeadline: OFFER.fundingDeadline + 100n,
      },
      { latestDueDate: 1_700_000_000n },
    );
    expect(result.eligible).toBe(false);
    expect(idsOf(result, false)).toEqual([
      "token-matches-request",
      "total-cost-within-maximum",
      "claim-window-minimum",
      "due-date-not-later-than-requested",
    ]);
  });

  it("fails closed on malformed or missing input and never throws", () => {
    const cases: Array<Partial<Offer>> = [
      { interest: undefined as unknown as bigint },
      { dueDate: -1n },
      { fundingDeadline: 2n ** 70n },
      { lender: "qor1notanaddress" },
      { principal: 1 as unknown as bigint },
    ];
    for (const offer of cases) {
      const result = evaluate(offer);
      expect(result.eligible, String(Object.keys(offer)[0])).toBe(false);
      expect(result.checks.some((item) => item.pass === false)).toBe(true);
      expect(result.checks.every((item) => item.explanation.length > 0)).toBe(true);
    }

    expect(() => evaluateOffer(REQUEST, OFFER, undefined as unknown as bigint)).not.toThrow();
    expect(evaluateOffer(REQUEST, OFFER, -1n).eligible).toBe(false);
    expect(evaluateOffer({} as OfferRequest, OFFER, NOW).eligible).toBe(false);
  });
});

describe("contract agreement", () => {
  it("uses the contract's own 3600-second minimum", () => {
    const source = readFileSync(
      join(
        fileURLToPath(new URL("../../contracts/contracts/", import.meta.url)),
        "LoanSettlement.sol",
      ),
      "utf8",
    );
    const match = /MINIMUM_CLAIM_WINDOW\s*=\s*([0-9_]+)\s*;/.exec(source);
    expect(match, "MINIMUM_CLAIM_WINDOW not found in LoanSettlement.sol").not.toBeNull();
    expect(BigInt(match![1]!.replace(/_/g, ""))).toBe(MINIMUM_CLAIM_WINDOW);
    expect(source).toContain("claimDeadline < terms.fundingDeadline");
    expect(source).toContain("terms.dueDate <= terms.claimDeadline");
    expect(source).toContain("terms.fundingDeadline <= block.timestamp");
  });
});
