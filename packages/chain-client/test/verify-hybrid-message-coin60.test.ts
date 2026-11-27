// The coin-60 signature (Step 11a, ADR-0003).
//
// The signature is the owner-supplied fixture signed by
// qor1hklqwsqwncrmfc9m772mclkdfesz3zpv4eykrn with classical.keyType
// `eth_secp256k1`. The account is the real read-only record fetched in Task 1.
// The account client here is a MOCK that returns the saved record; no HTTP
// request is made by any test in this file.
//
// QoreSign 0.2.0's `classicalKeyTypeFor` derives BOTH the secp256k1 and the
// eth_secp256k1 form of the response's public key and requires one to equal the
// signer's 20 bytes, so `eth_secp256k1` is not skipped: the classical check runs
// with a KECCAK-256 digest and the post-quantum part is still required.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { OnChainPqcAccount } from "../src/verify-hybrid-message.js";
import { verifyHybridMessage } from "../src/verify-hybrid-message.js";

const FIXTURES = fileURLToPath(new URL("../../../fixtures/", import.meta.url));
const RESPONSE = JSON.parse(
  readFileSync(join(FIXTURES, "qorex-signarbitrary-coin60.json"), "utf8"),
) as Record<string, unknown>;
const ACCOUNT_JSON = JSON.parse(
  readFileSync(join(FIXTURES, "onchain-account-qor1hklq.json"), "utf8"),
) as { account: { address: string; public_key: string; algorithm_id: number } };

const CHAIN_ID = "qorechain-diana";
const SIGNER = ACCOUNT_JSON.account.address;
const MESSAGE = "LOANSHARK test message, no funds";

const ACCOUNT: OnChainPqcAccount = {
  address: ACCOUNT_JSON.account.address,
  publicKey: new Uint8Array(Buffer.from(ACCOUNT_JSON.account.public_key, "base64")),
  algorithmId: ACCOUNT_JSON.account.algorithm_id,
};

const mockAccountClient = () => ({
  readAccount: async (address: string) => (address === ACCOUNT.address ? ACCOUNT : null),
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

describe("the coin-60 signArbitrary response (MOCK account client)", () => {
  it("verifies against the account's on-chain key with the post-quantum part required", async () => {
    const result = await verify();
    expect(result).toEqual({
      verified: true,
      chainId: CHAIN_ID,
      signer: SIGNER,
      pqAlgorithmId: 1,
      pqPublicKeyLength: 2592,
    });
  });

  it("accepts the eth_secp256k1 classical part, which QoreSign derives and checks", () => {
    const classical = RESPONSE["classical"] as Record<string, unknown>;
    expect(classical["keyType"]).toBe("eth_secp256k1");
  });

  it("refuses the response with the pq part removed", async () => {
    const withoutPq = { ...RESPONSE };
    delete withoutPq["pq"];
    await expect(verify({ response: withoutPq })).resolves.toMatchObject({
      verified: false,
      reason: "pq-part-missing",
      verifierCode: "PQ_LAYER_MISSING",
    });
  });

  it("refuses a message changed by one character", async () => {
    await expect(verify({ message: "LOANSHARK test message, no fundz" })).resolves.toMatchObject({
      verified: false,
      reason: "classical-signature-invalid",
      verifierCode: "CLASSICAL_SIGNATURE_INVALID",
    });
  });

  it("refuses a wrong chain ID", async () => {
    await expect(verify({ chainId: "qorechain-vladi" })).resolves.toMatchObject({
      verified: false,
      reason: "pq-signature-invalid",
      verifierCode: "PQ_SIGNATURE_INVALID",
    });
  });

  it("refuses a changed signer address", async () => {
    const other = "qor1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5tfman7";
    // MOCK: the client claims the other address holds the same key, which is
    // what makes the classical address check the thing that refuses it.
    const result = await verify({
      signer: other,
      accountClient: { readAccount: async (address) => ({ ...ACCOUNT, address }) },
    });
    expect(result).toMatchObject({
      verified: false,
      reason: "signer-mismatch",
      verifierCode: "ADDRESS_MISMATCH",
    });
  });
});
