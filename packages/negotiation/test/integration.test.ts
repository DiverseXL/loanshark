import { commitmentOf, evaluateOffer, type OfferRequest, type Terms } from "@loanshark/agreement";
import { describe, expect, it } from "vitest";
import { type OfferPayload, toContractTerms, validateOffer } from "../src/index.js";

const REQUEST: OfferRequest = {
  borrower: "0x1111111111111111111111111111111111111111",
  token: "0x97143b771d34ddb9130b807b135ae675a5a963ca",
  principal: 1_000_000n,
  maxTotalCost: 1_100_000n,
  latestDueDate: 1_700_300_000n,
};

const OFFER: OfferPayload = {
  schema: "loanshark.offer.v1",
  offerId: "ffeeddccbbaa99887766554433221100",
  requestId: "00112233445566778899aabbccddeeff",
  borrowerW: "qor1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5tfman7",
  lenderW: "qor19rl4cm2hmr8afy4kldpxz3fka4jguq0agt672h",
  terms: {
    borrower: "0x1111111111111111111111111111111111111111",
    lender: "0x2222222222222222222222222222222222222222",
    token: "0x97143b771d34ddb9130b807b135ae675a5a963ca",
    principal: "1000000",
    interest: "50000",
    dueDate: "1700300000",
    graceSeconds: "3600",
    fundingDeadline: "1700100000",
    claimDeadline: "1700200000",
    salt: `0x${"ab".repeat(32)}`,
  },
  offerExpiresAt: "1700050000",
  note: "",
};

const DOMAIN = {
  chainId: 9800n,
  verifyingContract: "0x000000000000000000000000000000000000c0de" as const,
};

describe("offer terms feed the existing modules unchanged", () => {
  const parsed = validateOffer(OFFER);
  if (!parsed.ok) throw new Error("fixture must be valid");
  const terms: Terms = toContractTerms(parsed.value.terms);

  it("evaluates as eligible with the existing local evaluator", () => {
    const evaluation = evaluateOffer(REQUEST, { ...terms, lender: terms.lender }, 1_700_000_000n);
    expect(evaluation.eligible).toBe(true);
    expect(evaluation.checks.every((check) => check.pass)).toBe(true);
  });

  it("produces the same loan id as the agreement package", () => {
    const expected = commitmentOf(terms, DOMAIN);
    expect(commitmentOf(toContractTerms(parsed.value.terms), DOMAIN)).toBe(expected);
    // The offer id is not part of the terms, so it cannot change the loan id.
    const moved = { ...parsed.value, offerId: "00000000000000000000000000000000" };
    const movedTerms = toContractTerms(validateOfferOrThrow(moved));
    expect(commitmentOf(movedTerms, DOMAIN)).toBe(expected);
  });

  it("changes the loan id when the domain changes", () => {
    expect(commitmentOf(terms, { ...DOMAIN, chainId: 9801n })).not.toBe(
      commitmentOf(terms, DOMAIN),
    );
  });
});

function validateOfferOrThrow(offer: OfferPayload) {
  const result = validateOffer(offer);
  if (!result.ok) throw new Error("fixture must be valid");
  return result.value.terms;
}
