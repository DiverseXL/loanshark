// Confirmation round trip against the REAL in-process relay, with REAL hybrid
// signatures from a TEST ONLY throwaway key and a MOCK account client (labelled).
// The hostile-relay cases return a body the server would never produce, to prove
// the client refuses it instead of trusting the transport.

import { confirmationMessage } from "@loanshark/agreement";
import {
  createThrowawaySigner,
  generateThrowawayIdentity,
  mockAccountClient,
} from "@loanshark/qoreseal-adapter/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryRelayStorage, RelayServer } from "@loanshark/api";
import { RelayClient } from "../src/client.js";

const LOAN_ID = `0x${"11".repeat(32)}`;
const AGREEMENT_HASH = `0x${"22".repeat(32)}`;
const CONTRACT = "0x000000000000000000000000000000000000c0de";
const CHAIN_ID = 9800n;

const message = confirmationMessage({
  chainId: CHAIN_ID,
  verifyingContract: CONTRACT,
  loanId: LOAN_ID,
  agreementHash: AGREEMENT_HASH,
});

describe("public confirmations", () => {
  const identity = generateThrowawayIdentity();
  const signer = createThrowawaySigner(identity, "qorechain-diana");
  const accountClient = mockAccountClient(identity);
  let server: RelayServer;
  let client: RelayClient;
  let baseUrl: string;

  beforeEach(async () => {
    server = new RelayServer({
      storage: new MemoryRelayStorage(),
      allowedHosts: ["127.0.0.1"],
      allowedOrigins: ["http://127.0.0.1:5173"],
      rateLimitMax: 200,
    });
    const port = await server.listen(0, "127.0.0.1");
    baseUrl = `http://127.0.0.1:${port}`;
    client = new RelayClient({ baseUrl });
    const signature = await signer.sign(message);
    const posted = await client.postConfirmation({
      loanId: LOAN_ID,
      chainId: "9800",
      verifyingContract: CONTRACT,
      agreementHash: AGREEMENT_HASH,
      signerW: identity.address,
      role: "borrower",
      signature: signature as Record<string, unknown>,
      createdAt: "2026-11-26T10:00:00Z",
    });
    expect(posted.ok).toBe(true);
  });

  afterEach(async () => {
    await server.close();
  });

  it("verifies a confirmation signature and domain", async () => {
    const result = await client.getConfirmations(LOAN_ID, {
      accountClient,
      expectedDomain: { chainId: CHAIN_ID, verifyingContract: CONTRACT },
      expectedSignerW: identity.address,
      expectedRole: "borrower",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.role).toBe("borrower");
    }
  });

  it("refuses a confirmation for another contract", async () => {
    const result = await client.getConfirmations(LOAN_ID, {
      accountClient,
      expectedDomain: {
        chainId: CHAIN_ID,
        verifyingContract: "0x000000000000000000000000000000000000c0df",
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal).toBe("confirmation-invalid");
  });

  it("refuses a confirmation the hostile relay moved to another loan", async () => {
    const hostile = new RelayClient({
      baseUrl,
      fetchFn: (async (input: string | URL | Request, init?: RequestInit) => {
        const response = await fetch(input, init);
        const url = String(input);
        if (!url.includes("/v1/confirmations/")) return response;
        const body = (await response.json()) as { confirmations: Array<Record<string, unknown>> };
        body.confirmations = body.confirmations.map((item) => ({
          ...item,
          loanId: `0x${"33".repeat(32)}`,
        }));
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch,
    });
    const result = await hostile.getConfirmations(LOAN_ID, { accountClient });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal).toBe("confirmation-invalid");
  });

  it("refuses a tampered signature", async () => {
    const hostile = new RelayClient({
      baseUrl,
      fetchFn: (async (input: string | URL | Request, init?: RequestInit) => {
        const response = await fetch(input, init);
        const url = String(input);
        if (!url.includes("/v1/confirmations/")) return response;
        const body = (await response.json()) as { confirmations: Array<Record<string, unknown>> };
        body.confirmations = body.confirmations.map((item) => {
          const signature = item["signature"] as Record<string, unknown>;
          const pq = { ...(signature["pq"] as Record<string, unknown>) };
          pq["signature"] = "AAAA";
          return { ...item, signature: { ...signature, pq } };
        });
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch,
    });
    const result = await hostile.getConfirmations(LOAN_ID, { accountClient });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal).toBe("confirmation-invalid");
  });

  it("refuses a confirmation whose signer or role is not the expected one", async () => {
    expect(
      (
        await client.getConfirmations(LOAN_ID, {
          accountClient,
          expectedRole: "lender",
        })
      ).ok,
    ).toBe(false);
  });
});
