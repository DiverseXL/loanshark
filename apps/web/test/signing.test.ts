// Signature reporting tests.
//
// The positive case uses the real QoreX response saved in
// fixtures/qorex-signarbitrary.json and the real on-chain key saved in
// fixtures/onchain-account-qor1385.json. No network call is made: the account
// reader is a fixed object built from the saved record and is labelled MOCK
// below because it is not a live REST client. The crypto is real.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type {
  OnChainPqcAccount,
  PqcAccountReader,
  VerifyHybridMessageFailureResult,
  VerifyHybridMessageResult,
  VerifyHybridMessageSuccess,
} from "@loanshark/chain-client";
import { describe, expect, it } from "vitest";
import { TEST_MESSAGE } from "../src/constants.js";
import type { NegativeControl } from "../src/wallet/signing.js";
import {
  changeLastCharacter,
  reportStatus,
  runSignatureChecks,
  withoutPqPart,
} from "../src/wallet/signing.js";

const fixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(fileURLToPath(new URL(`../../../fixtures/${name}`, import.meta.url)), "utf8"),
  );

const savedResponse = fixture("qorex-signarbitrary.json");
const savedAccount = fixture("onchain-account-qor1385.json") as {
  account: { address: string; public_key: string; algorithm_id: number };
};

const onChainAccount: OnChainPqcAccount = {
  address: savedAccount.account.address,
  publicKey: new Uint8Array(Buffer.from(savedAccount.account.public_key, "base64")),
  algorithmId: savedAccount.account.algorithm_id,
};

// MOCK: a fixed in-memory reader over the saved record, not a live REST call.
const mockSavedAccountReader: PqcAccountReader = {
  async readAccount(address: string): Promise<OnChainPqcAccount | null> {
    return address === onChainAccount.address ? onChainAccount : null;
  },
};

const signer = onChainAccount.address;

const reasonOf = (result: VerifyHybridMessageResult | undefined): string => {
  if (result === undefined) return "missing";
  return result.verified ? "verified" : result.reason;
};

describe("runSignatureChecks with the saved real QoreX response (fixed MOCK account reader)", () => {
  it("verifies the positive case and refuses all four negative controls", async () => {
    const report = await runSignatureChecks({
      response: savedResponse,
      signer,
      message: TEST_MESSAGE,
      accountClient: mockSavedAccountReader,
    });

    expect(report.verification.verified).toBe(true);
    expect(report.status).toBe("verified");
    expect(report.controls).toHaveLength(4);
    expect(report.accountKeyBytes).toBe(2592);

    const byId = new Map(report.controls.map((control) => [control.id, control]));
    expect(byId.get("pq-removed")?.result.verified).toBe(false);
    expect(reasonOf(byId.get("pq-removed")?.result)).toBe("pq-part-missing");
    expect(byId.get("message-changed")?.result.verified).toBe(false);
    expect(reasonOf(byId.get("message-changed")?.result)).toBe("classical-signature-invalid");
    expect(byId.get("wrong-chain")?.result.verified).toBe(false);
    expect(reasonOf(byId.get("wrong-chain")?.result)).toBe("pq-signature-invalid");
    expect(byId.get("signer-changed")?.result.verified).toBe(false);
    expect(reasonOf(byId.get("signer-changed")?.result)).toBe("signer-mismatch");
  });

  it("never reports success when the message was changed", async () => {
    const report = await runSignatureChecks({
      response: savedResponse,
      signer,
      message: `${TEST_MESSAGE} `,
      accountClient: mockSavedAccountReader,
    });
    expect(report.verification.verified).toBe(false);
    expect(report.status).toBe("not-verified");
  });

  it("never reports success when the on-chain account cannot be read", async () => {
    // MOCK: a reader that always fails, standing in for a CORS-blocked fetch.
    const failingReader: PqcAccountReader = {
      async readAccount(): Promise<OnChainPqcAccount | null> {
        throw new Error("network error: no response");
      },
    };
    const report = await runSignatureChecks({
      response: savedResponse,
      signer,
      message: TEST_MESSAGE,
      accountClient: failingReader,
    });
    expect(report.verification.verified).toBe(false);
    expect(reasonOf(report.verification)).toBe("account-unavailable");
    expect(report.status).toBe("not-verified");
    expect(report.accountKeyBytes).toBeNull();
  });

  it("removes only the pq part, keeping the classical object", () => {
    const stripped = withoutPqPart(savedResponse) as {
      classical: unknown;
      pq?: unknown;
    };
    expect(stripped.classical).toBeDefined();
    expect(stripped.pq).toBeUndefined();
  });

  it("changes exactly one character of the fixed message", () => {
    const changed = changeLastCharacter(TEST_MESSAGE);
    expect(changed).toHaveLength(TEST_MESSAGE.length);
    expect(changed).not.toBe(TEST_MESSAGE);
    expect(changed.slice(0, -1)).toBe(TEST_MESSAGE.slice(0, -1));
  });
});

describe("reportStatus is fail-closed (MOCK results)", () => {
  const failure: VerifyHybridMessageFailureResult = {
    verified: false,
    reason: "pq-part-missing",
    message: "the signature carries no ML-DSA-87 part",
    verifierCode: "PQ_LAYER_MISSING",
  };
  const success: VerifyHybridMessageSuccess = {
    verified: true,
    chainId: "qorechain-diana",
    signer: "qor1mock",
    pqAlgorithmId: 1,
    pqPublicKeyLength: 2592,
  };
  const rejectedControl = (id: NegativeControl["id"]): NegativeControl => ({
    id,
    label: id,
    expectedReason: "rejected",
    result: failure,
  });
  const acceptedControl: NegativeControl = {
    id: "pq-removed",
    label: "bad control",
    expectedReason: "rejected",
    result: success,
  };

  it("never shows success for an unverified signature", () => {
    expect(reportStatus(failure, [])).toBe("not-verified");
    expect(reportStatus(failure, [rejectedControl("pq-removed")])).toBe("not-verified");
  });

  it("does not show success when any negative control verifies", () => {
    expect(reportStatus(success, [rejectedControl("pq-removed"), acceptedControl])).toBe(
      "control-failed",
    );
  });

  it("shows success only when the positive check and all controls agree", () => {
    expect(
      reportStatus(success, [
        rejectedControl("pq-removed"),
        rejectedControl("message-changed"),
        rejectedControl("wrong-chain"),
        rejectedControl("signer-changed"),
      ]),
    ).toBe("verified");
  });
});
