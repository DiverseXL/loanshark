import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { OnChainPqcAccount, PqcAccountReader } from "../src/verify-hybrid-message.js";
import { verifyHybridMessage } from "../src/verify-hybrid-message.js";

// Live test: reads the signer's account record from the QoreChain REST endpoint
// recorded in docs/research/source-lock.md claim 2, then verifies the saved
// QoreX response against it. Skipped unless LIVE_CHAIN=1, so the default test
// run needs no network.
const LIVE = process.env["LIVE_CHAIN"] === "1";

const REST_BASE = "https://api-testnet.qore.host";

const FIXTURES = fileURLToPath(new URL("../../../fixtures/", import.meta.url));
const RESPONSE = JSON.parse(
  readFileSync(join(FIXTURES, "qorex-signarbitrary.json"), "utf8"),
) as Record<string, unknown>;

const CHAIN_ID = "qorechain-diana";
const SIGNER = "qor1385wkhky3qkjwq47t8904xrd6s82lmkfjnxxsr";
const MESSAGE = "LOANSHARK test message, no funds";

interface AccountResponse {
  found: boolean;
  account?: { address: string; public_key: string; algorithm_id: number };
}

// Real client: one GET to the REST endpoint. No key material leaves this
// process; the request carries only the public address.
const restAccountClient = (): PqcAccountReader => ({
  readAccount: async (address): Promise<OnChainPqcAccount | null> => {
    const response = await fetch(`${REST_BASE}/qorechain/pqc/v1/account/${address}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = (await response.json()) as AccountResponse;
    if (!body.found || body.account === undefined) return null;
    return {
      address: body.account.address,
      publicKey: new Uint8Array(Buffer.from(body.account.public_key, "base64")),
      algorithmId: body.account.algorithm_id,
    };
  },
});

describe.skipIf(!LIVE)("verifyHybridMessage against the live Diana testnet", () => {
  it("verifies the saved QoreX response against the key registered on chain now", async () => {
    const result = await verifyHybridMessage({
      chainId: CHAIN_ID,
      signer: SIGNER,
      message: MESSAGE,
      response: RESPONSE,
      accountClient: restAccountClient(),
    });
    expect(result.verified).toBe(true);
  });
});
