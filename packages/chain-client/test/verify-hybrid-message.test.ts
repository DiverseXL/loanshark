import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { OnChainPqcAccount, PqcAccountReader } from "../src/verify-hybrid-message.js";
import { verifyHybridMessage } from "../src/verify-hybrid-message.js";

// Fixtures: the real QoreX response and the real on-chain account record. The
// account record supplies the ML-DSA-87 public key, as it would in production.
const FIXTURES = fileURLToPath(new URL("../../../fixtures/", import.meta.url));
const RESPONSE = JSON.parse(
  readFileSync(join(FIXTURES, "qorex-signarbitrary.json"), "utf8"),
) as Record<string, unknown>;
const ACCOUNT_JSON = JSON.parse(
  readFileSync(join(FIXTURES, "onchain-account-qor1385.json"), "utf8"),
) as { account: { address: string; public_key: string; algorithm_id: number } };

const CHAIN_ID = "qorechain-diana";
const SIGNER = ACCOUNT_JSON.account.address;
const MESSAGE = "LOANSHARK test message, no funds";

const ACCOUNT: OnChainPqcAccount = {
  address: ACCOUNT_JSON.account.address,
  publicKey: new Uint8Array(Buffer.from(ACCOUNT_JSON.account.public_key, "base64")),
  algorithmId: ACCOUNT_JSON.account.algorithm_id,
};

// MOCK, not a real client: no HTTP request is made by any test in this file.
// It returns the saved account record, which is what the live test fetches
// from the REST endpoint when LIVE_CHAIN=1.
const mockAccountClient = (): PqcAccountReader => ({
  readAccount: async (address) => (address === ACCOUNT.address ? ACCOUNT : null),
});

const verify = (overrides: Partial<Parameters<typeof verifyHybridMessage>[0]> = {}) =>
  verifyHybridMessage({
    chainId: CHAIN_ID,
    signer: SIGNER,
    message: MESSAGE,
    response: RESPONSE,
    accountClient: mockAccountClient(),
    ...overrides,
  });

/** A copy of the response with one top-level field replaced. */
const withResponseField = (field: string, value: unknown): Record<string, unknown> => ({
  ...RESPONSE,
  [field]: value,
});

describe("verifyHybridMessage", () => {
  it("verifies the real QoreX signature against the on-chain key", async () => {
    const result = await verify();
    expect(result).toEqual({
      verified: true,
      chainId: CHAIN_ID,
      signer: SIGNER,
      pqAlgorithmId: 1,
      pqPublicKeyLength: 2592,
    });
  });

  it("accepts a Uint8Array message with the same bytes", async () => {
    const result = await verify({ message: new TextEncoder().encode(MESSAGE) });
    expect(result.verified).toBe(true);
  });

  it("refuses a response whose ML-DSA-87 part is removed", async () => {
    const withoutPq = { ...RESPONSE };
    delete withoutPq["pq"];
    const result = await verify({ response: withoutPq });
    expect(result).toMatchObject({
      verified: false,
      reason: "pq-part-missing",
      verifierCode: "PQ_LAYER_MISSING",
    });
  });

  it("refuses a message changed by one character", async () => {
    const result = await verify({ message: "LOANSHARK test message, no fundz" });
    expect(result).toMatchObject({
      verified: false,
      reason: "classical-signature-invalid",
      verifierCode: "CLASSICAL_SIGNATURE_INVALID",
    });
  });

  it("refuses a different chain id", async () => {
    const result = await verify({ chainId: "qorechain-vladi" });
    expect(result).toMatchObject({
      verified: false,
      reason: "pq-signature-invalid",
      verifierCode: "PQ_SIGNATURE_INVALID",
    });
  });

  it("refuses a different signer address", async () => {
    const other = "qor1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5tfman7";
    // MOCK: to reach the signature check, the client claims this other address
    // has a PQC key registered. The classical key in the response does not
    // control that address, which is what the verifier refuses.
    const result = await verify({
      signer: other,
      accountClient: { readAccount: async (address) => ({ ...ACCOUNT, address }) },
    });
    expect(result).toMatchObject({ verified: false, reason: "signer-mismatch" });
  });

  it("refuses a different signer address with no key registered on chain", async () => {
    const result = await verify({ signer: "qor1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5tfman7" });
    expect(result).toMatchObject({ verified: false, reason: "account-unavailable" });
  });

  it("ignores the top-level pub_key and signature fields and keys carried in the response", async () => {
    const tampered = withResponseField("pub_key", {
      type: "tendermint/PubKeySecp256k1",
      // 33 zero bytes: not the signer's key.
      value: Buffer.alloc(33).toString("base64"),
    });
    tampered["signature"] = Buffer.alloc(64).toString("base64");
    tampered["pq"] = {
      ...(RESPONSE["pq"] as Record<string, unknown>),
      // A key inside the response must never be used.
      publicKey: Buffer.alloc(2592).toString("base64"),
    };
    const result = await verify({ response: tampered });
    expect(result.verified).toBe(true);
  });

  it("refuses to verify when the chain has no registered key", async () => {
    const result = await verify({
      accountClient: { readAccount: async () => null },
    });
    expect(result).toMatchObject({ verified: false, reason: "account-unavailable" });
  });

  it("refuses an on-chain key of the wrong length", async () => {
    const result = await verify({
      accountClient: {
        readAccount: async () => ({ ...ACCOUNT, publicKey: new Uint8Array(32) }),
      },
    });
    expect(result).toMatchObject({ verified: false, reason: "on-chain-key-invalid" });
  });

  it("reports a client failure instead of throwing", async () => {
    const result = await verify({
      accountClient: {
        readAccount: async () => {
          throw new Error("network down");
        },
      },
    });
    expect(result).toMatchObject({ verified: false, reason: "account-unavailable" });
  });

  it("refuses a response that is not shaped like a signature", async () => {
    const result = await verify({ response: { hello: "world" } });
    expect(result).toMatchObject({ verified: false, reason: "malformed-response" });
  });
});
