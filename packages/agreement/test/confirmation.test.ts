import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createThrowawaySigner,
  generateThrowawayIdentity,
  mockAccountClient,
} from "@loanshark/qoreseal-adapter/testing";
import { describe, expect, it } from "vitest";
import { commitmentOf } from "../src/commitment.js";
import {
  CONFIRMATION_DOMAIN,
  confirmationMessage,
  confirmationMessageText,
  signAgreementConfirmation,
  verifyAgreementConfirmation,
} from "../src/confirmation.js";
import type { Terms } from "../src/terms.js";
import { agreementHashOf } from "../src/text.js";

// MOCK-BACKED: the signer is QoreSign with a throwaway in-memory key, and the
// account client answers from the same process. Nothing contacts QoreX or a
// chain. These tests prove the message wiring and the refusals.

const CHAIN_ID = "qorechain-diana";
const FIXTURES = fileURLToPath(new URL("../../../fixtures/", import.meta.url));

const TERMS: Terms = {
  borrower: "0x1111111111111111111111111111111111111111",
  lender: "0x2222222222222222222222222222222222222222",
  token: "0x3333333333333333333333333333333333333333",
  principal: 1_000_000n,
  interest: 50_000n,
  dueDate: 1_800_000_000n,
  graceSeconds: 259_200n,
  fundingDeadline: 1_790_000_000n,
  claimDeadline: 1_795_000_000n,
  salt: `0x${"aa".repeat(32)}`,
};

const DOMAIN = {
  chainId: 9800n,
  verifyingContract: "0x000000000000000000000000000000000000c0de" as const,
};

const OTHER_CONTRACT = {
  ...DOMAIN,
  verifyingContract: "0x000000000000000000000000000000000000bEEF" as const,
};

describe("confirmation message", () => {
  it("is exactly the v2 tag, chain id, verifying contract, loan id and hash", () => {
    const loanId = commitmentOf(TERMS, DOMAIN);
    const agreementHash = agreementHashOf(TERMS);
    const confirmation = { ...DOMAIN, loanId, agreementHash };
    expect(confirmationMessageText(confirmation)).toBe(
      `${CONFIRMATION_DOMAIN}|9800|${DOMAIN.verifyingContract}|${loanId}|${agreementHash}`,
    );
    expect(new TextDecoder().decode(confirmationMessage(confirmation))).toBe(
      confirmationMessageText(confirmation),
    );
  });

  it("uses the v2 domain tag", () => {
    expect(CONFIRMATION_DOMAIN).toBe("loanshark/v2/agreement");
  });

  it("rejects a malformed loan id, agreement hash, contract or chain id", () => {
    const base = {
      ...DOMAIN,
      loanId: `0x${"11".repeat(32)}` as `0x${string}`,
      agreementHash: `0x${"00".repeat(32)}` as `0x${string}`,
    };
    expect(() => confirmationMessage({ ...base, loanId: "0x12" as `0x${string}` })).toThrow(
      TypeError,
    );
    expect(() =>
      confirmationMessage({ ...base, verifyingContract: "0x1234" as `0x${string}` }),
    ).toThrow(TypeError);
    expect(() => confirmationMessage({ ...base, chainId: -1n })).toThrow(TypeError);
  });

  it("contains the frozen loan id for the frozen terms and domain", () => {
    const vectors = JSON.parse(readFileSync(join(FIXTURES, "agreement-vectors.json"), "utf8")) as {
      domain: { chainId: number; verifyingContract: `0x${string}` };
      vectors: Array<{ name: string; loanId: string }>;
    };
    const base = vectors.vectors.find((vector) => vector.name === "base-6-decimals");
    const domain = {
      chainId: BigInt(vectors.domain.chainId),
      verifyingContract: vectors.domain.verifyingContract,
    };
    expect(base?.loanId).toBe(commitmentOf(TERMS, domain));
  });
});

describe("signAgreementConfirmation and verifyAgreementConfirmation", () => {
  it("signs and verifies the confirmation with a throwaway identity (MOCK)", async () => {
    const identity = generateThrowawayIdentity();
    const signed = await signAgreementConfirmation({
      terms: TERMS,
      domain: DOMAIN,
      signer: createThrowawaySigner(identity, CHAIN_ID),
    });
    expect(signed.ok).toBe(true);
    if (!signed.ok) return;

    expect(signed.value.loanId).toBe(commitmentOf(TERMS, DOMAIN));
    expect(signed.value.agreementHash).toBe(agreementHashOf(TERMS));
    expect(signed.value.chainId).toBe(9800n);
    expect(signed.value.verifyingContract).toBe(DOMAIN.verifyingContract);

    const verified = await verifyAgreementConfirmation({
      terms: TERMS,
      domain: DOMAIN,
      chainId: CHAIN_ID,
      signer: identity.address,
      signature: signed.value.signature,
      accountClient: mockAccountClient(identity),
    });
    expect(verified).toMatchObject({ verified: true, signer: identity.address, pqAlgorithmId: 1 });
  });

  it("refuses a confirmation when the terms changed after signing (MOCK)", async () => {
    const identity = generateThrowawayIdentity();
    const signed = await signAgreementConfirmation({
      terms: TERMS,
      domain: DOMAIN,
      signer: createThrowawaySigner(identity, CHAIN_ID),
    });
    expect(signed.ok).toBe(true);
    if (!signed.ok) return;

    const verified = await verifyAgreementConfirmation({
      terms: { ...TERMS, interest: TERMS.interest + 1n },
      domain: DOMAIN,
      chainId: CHAIN_ID,
      signer: identity.address,
      signature: signed.value.signature,
      accountClient: mockAccountClient(identity),
    });
    expect(verified).toMatchObject({ verified: false, reason: "classical-signature-invalid" });
  });

  it("refuses a confirmation signed for another contract (MOCK)", async () => {
    const identity = generateThrowawayIdentity();
    const signed = await signAgreementConfirmation({
      terms: TERMS,
      domain: OTHER_CONTRACT,
      signer: createThrowawaySigner(identity, CHAIN_ID),
    });
    expect(signed.ok).toBe(true);
    if (!signed.ok) return;

    const verified = await verifyAgreementConfirmation({
      terms: TERMS,
      domain: DOMAIN,
      chainId: CHAIN_ID,
      signer: identity.address,
      signature: signed.value.signature,
      accountClient: mockAccountClient(identity),
    });
    expect(verified.verified).toBe(false);
    expect(verified).toMatchObject({ reason: "classical-signature-invalid" });
  });

  it("refuses a confirmation signed for another chain id (MOCK)", async () => {
    const identity = generateThrowawayIdentity();
    const signed = await signAgreementConfirmation({
      terms: TERMS,
      domain: { ...DOMAIN, chainId: 1n },
      signer: createThrowawaySigner(identity, CHAIN_ID),
    });
    expect(signed.ok).toBe(true);
    if (!signed.ok) return;

    const verified = await verifyAgreementConfirmation({
      terms: TERMS,
      domain: DOMAIN,
      chainId: CHAIN_ID,
      signer: identity.address,
      signature: signed.value.signature,
      accountClient: mockAccountClient(identity),
    });
    expect(verified.verified).toBe(false);
  });

  it("refuses a confirmation signed by a different account (MOCK)", async () => {
    const signerIdentity = generateThrowawayIdentity();
    const expectedIdentity = generateThrowawayIdentity();
    const signed = await signAgreementConfirmation({
      terms: TERMS,
      domain: DOMAIN,
      signer: createThrowawaySigner(signerIdentity, CHAIN_ID),
    });
    expect(signed.ok).toBe(true);
    if (!signed.ok) return;

    const verified = await verifyAgreementConfirmation({
      terms: TERMS,
      domain: DOMAIN,
      chainId: CHAIN_ID,
      signer: expectedIdentity.address,
      signature: signed.value.signature,
      accountClient: mockAccountClient(expectedIdentity),
    });
    expect(verified.verified).toBe(false);
  });

  it("returns a typed failure when the signer throws", async () => {
    const signed = await signAgreementConfirmation({
      terms: TERMS,
      domain: DOMAIN,
      signer: {
        sign: async () => {
          throw new Error("user rejected");
        },
      },
    });
    expect(signed).toMatchObject({ ok: false, code: "signer-failed" });
  });
});
