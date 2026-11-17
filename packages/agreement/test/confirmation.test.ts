import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createThrowawaySigner,
  generateThrowawayIdentity,
  mockAccountClient,
} from "@loanshark/qoreseal-adapter/testing";
import type { Terms } from "../src/terms.js";
import {
  CONFIRMATION_DOMAIN,
  confirmationMessage,
  confirmationMessageText,
  signAgreementConfirmation,
  verifyAgreementConfirmation,
} from "../src/confirmation.js";
import { agreementHashOf } from "../src/text.js";
import { commitmentOf } from "../src/commitment.js";

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

describe("confirmation message", () => {
  it("is exactly the domain tag, loan id and agreement hash", () => {
    const loanId = commitmentOf(TERMS);
    const agreementHash = agreementHashOf(TERMS);
    expect(confirmationMessageText({ loanId, agreementHash })).toBe(
      `${CONFIRMATION_DOMAIN}|${loanId}|${agreementHash}`,
    );
    expect(new TextDecoder().decode(confirmationMessage({ loanId, agreementHash }))).toBe(
      confirmationMessageText({ loanId, agreementHash }),
    );
  });

  it("rejects a malformed loan id or agreement hash", () => {
    expect(() =>
      confirmationMessage({
        loanId: "0x12" as `0x${string}`,
        agreementHash: `0x${"00".repeat(32)}`,
      }),
    ).toThrow(TypeError);
  });

  it("contains the frozen loan id for the frozen terms", () => {
    const vectors = JSON.parse(readFileSync(join(FIXTURES, "agreement-vectors.json"), "utf8")) as {
      vectors: Array<{ name: string; loanId: string }>;
    };
    const base = vectors.vectors.find((vector) => vector.name === "base-6-decimals");
    expect(base?.loanId).toBe(commitmentOf(TERMS));
  });
});

describe("signAgreementConfirmation and verifyAgreementConfirmation", () => {
  it("signs and verifies the confirmation with a throwaway identity (MOCK)", async () => {
    const identity = generateThrowawayIdentity();
    const signed = await signAgreementConfirmation({
      terms: TERMS,
      signer: createThrowawaySigner(identity, CHAIN_ID),
    });
    expect(signed.ok).toBe(true);
    if (!signed.ok) return;

    expect(signed.value.loanId).toBe(commitmentOf(TERMS));
    expect(signed.value.agreementHash).toBe(agreementHashOf(TERMS));

    const verified = await verifyAgreementConfirmation({
      terms: TERMS,
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
      signer: createThrowawaySigner(identity, CHAIN_ID),
    });
    expect(signed.ok).toBe(true);
    if (!signed.ok) return;

    const verified = await verifyAgreementConfirmation({
      terms: { ...TERMS, interest: TERMS.interest + 1n },
      chainId: CHAIN_ID,
      signer: identity.address,
      signature: signed.value.signature,
      accountClient: mockAccountClient(identity),
    });
    expect(verified).toMatchObject({ verified: false, reason: "classical-signature-invalid" });
  });

  it("refuses a confirmation signed by a different account (MOCK)", async () => {
    const signerIdentity = generateThrowawayIdentity();
    const expectedIdentity = generateThrowawayIdentity();
    const signed = await signAgreementConfirmation({
      terms: TERMS,
      signer: createThrowawaySigner(signerIdentity, CHAIN_ID),
    });
    expect(signed.ok).toBe(true);
    if (!signed.ok) return;

    const verified = await verifyAgreementConfirmation({
      terms: TERMS,
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
      signer: {
        sign: async () => {
          throw new Error("user rejected");
        },
      },
    });
    expect(signed).toMatchObject({ ok: false, code: "signer-failed" });
  });
});
