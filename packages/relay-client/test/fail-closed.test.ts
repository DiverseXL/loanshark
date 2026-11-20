// Fail-closed tests for the verifying relay client (Step 9b Task 6).
//
// MOCK: the relay is the in-process server and the account/registry clients are
// stand-ins. What is real: the client's own verification path. Each case asserts
// that a failure becomes a typed refusal, never data, and never a thrown error.

import { RelayServer } from "@loanshark/api";
import type { RequestContext } from "@loanshark/qoreseal-adapter";
import { encodeAad, sealMlkemToRecipient, signEnvelope } from "@loanshark/qoreseal-adapter";
import {
  createThrowawaySigner,
  generateThrowawayIdentity,
  mockAccountClient,
} from "@loanshark/qoreseal-adapter/testing";
import {
  bindingStatementBytes,
  createBindingStatementFields,
  generateSealAccount,
  signBindingStatement,
} from "@loanshark/seal-account";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RelayClient } from "../src/client.js";

const CHAIN_ID = "qorechain-diana";

const throwingClient = {
  getPqPublicKey: async () => {
    throw new Error("registry timeout");
  },
  getMlkemPublicKey: async () => {
    throw new Error("registry timeout");
  },
  chainId: CHAIN_ID,
};

const throwingAccountClient = {
  getPqPublicKey: async () => {
    throw new Error("account read failed");
  },
  chainId: CHAIN_ID,
};

describe("relay client fails closed (MOCK relay and MOCK clients)", () => {
  let server: RelayServer;
  let client: RelayClient;

  beforeEach(async () => {
    server = new RelayServer({
      allowedHosts: ["localhost", "127.0.0.1"],
      allowedOrigins: ["http://localhost:5173"],
    });
    const port = await server.listen(0, "127.0.0.1");
    client = new RelayClient({ baseUrl: `http://127.0.0.1:${port}` });
  });

  afterEach(async () => {
    await server.close();
  });

  it("refuses a card when the registry throws, and returns no data", async () => {
    const seal = generateSealAccount({ chainId: CHAIN_ID }).identity;
    const posted = await client.postCard({
      sealAddress: seal.address,
      card: seal.recipientCard() as unknown as Record<string, unknown>,
      createdAt: "2026-11-20T00:00:00.000Z",
    });
    expect(posted.ok).toBe(true);

    const fetched = await client.getCard(seal.address, { registry: throwingClient });
    expect(fetched.ok).toBe(false);
    if (fetched.ok) return;
    expect(fetched.refusal).toBe("card-invalid");
    expect((fetched as { value?: unknown }).value).toBeUndefined();
  });

  it("refuses a card for an address with no registered KEM key", async () => {
    const seal = generateSealAccount({ chainId: CHAIN_ID }).identity;
    await client.postCard({
      sealAddress: seal.address,
      card: seal.recipientCard() as unknown as Record<string, unknown>,
      createdAt: "2026-11-20T00:00:00.000Z",
    });

    const fetched = await client.getCard(seal.address, {
      registry: {
        getPqPublicKey: async () => seal.publicData().mlDsaPublicKey,
        getMlkemPublicKey: async () => null,
        chainId: CHAIN_ID,
      },
    });
    expect(fetched.ok).toBe(false);
    if (fetched.ok) return;
    expect(fetched.refusal).toBe("card-invalid");
  });

  it("refuses a card issued for another chain", async () => {
    const seal = generateSealAccount({ chainId: CHAIN_ID }).identity;
    await client.postCard({
      sealAddress: seal.address,
      card: seal.recipientCard() as unknown as Record<string, unknown>,
      createdAt: "2026-11-20T00:00:00.000Z",
    });

    const fetched = await client.getCard(seal.address, {
      registry: {
        chainId: "qorechain-vladi",
        pqPublicKey: seal.publicData().mlDsaPublicKey,
        mlkemPublicKey: seal.publicData().mlkemPublicKey,
      },
    });
    expect(fetched.ok).toBe(false);
    if (fetched.ok) return;
    expect(fetched.refusal).toBe("card-invalid");
  });

  it("refuses an envelope when the account client throws", async () => {
    // A genuinely signed request envelope, so the only failure is the key read.
    const borrower = generateThrowawayIdentity();
    const recipient = generateThrowawayIdentity();
    const context: RequestContext = {
      kind: "request",
      chainId: CHAIN_ID,
      requestId: "req-fail-closed",
      borrower: borrower.address,
      version: "1",
    };
    const sealed = sealMlkemToRecipient({
      chainId: CHAIN_ID,
      purpose: "loanshark/request",
      recipient: { mlkemPublicKey: recipient.sealKeys.mlkemPublicKey },
      plaintext: new TextEncoder().encode("need 1000 fUSD"),
      aad: encodeAad(context),
    });
    expect(sealed.ok).toBe(true);
    if (!sealed.ok) return;
    const signed = await signEnvelope({
      envelope: sealed.value.envelope,
      context,
      signer: createThrowawaySigner(borrower, CHAIN_ID),
    });
    expect(signed.ok).toBe(true);
    if (!signed.ok) return;

    const posted = await client.postEnvelope({
      kind: "request",
      loanRef: "loan-fail-closed",
      senderW: borrower.address,
      recipientW: recipient.address,
      ciphertext: Buffer.from(sealed.value.envelope).toString("base64"),
      signature: signed.value.signature as unknown as Record<string, unknown>,
      aad: context as unknown as Record<string, unknown>,
      createdAt: "2026-11-20T00:00:00.000Z",
    });
    expect(posted.ok, JSON.stringify(posted)).toBe(true);
    if (!posted.ok) return;

    const fetched = await client.getEnvelope(posted.value.id, {
      accountClient: throwingAccountClient,
    });
    expect(fetched.ok).toBe(false);
    if (fetched.ok) return;
    expect(fetched.refusal).toBe("envelope-signature-invalid");
  });

  it("refuses a binding statement when the account client throws", async () => {
    const wallet = generateSealAccount({ chainId: CHAIN_ID }).identity;
    const seal = generateSealAccount({ chainId: CHAIN_ID }).identity;
    const fields = createBindingStatementFields({
      chainId: CHAIN_ID,
      walletAddress: wallet.address,
      sealAddress: seal.address,
      walletEvmAddress: "0x1111111111111111111111111111111111111111",
      issuedAt: new Date("2026-11-20T00:00:00Z"),
      expiry: new Date("2026-12-20T00:00:00Z"),
    });
    const statement = signBindingStatement({
      fields,
      walletSignature: await wallet.signMessage(bindingStatementBytes(fields)),
      sealIdentity: seal,
    });
    const posted = await client.postBinding({
      walletAddress: wallet.address,
      statement: statement as unknown as Record<string, unknown>,
    });
    expect(posted.ok).toBe(true);

    const fetched = await client.getBinding(wallet.address, {
      walletAccountClient: throwingAccountClient,
      sealAccountClient: mockAccountClient(seal),
    });
    expect(fetched.ok).toBe(false);
    if (fetched.ok) return;
    expect(fetched.refusal).toBe("binding-invalid");
  });

  it("refuses a replayed binding statement for another wallet", async () => {
    const wallet = generateSealAccount({ chainId: CHAIN_ID }).identity;
    const other = generateSealAccount({ chainId: CHAIN_ID }).identity;
    const seal = generateSealAccount({ chainId: CHAIN_ID }).identity;
    const fields = createBindingStatementFields({
      chainId: CHAIN_ID,
      walletAddress: wallet.address,
      sealAddress: seal.address,
      walletEvmAddress: "0x1111111111111111111111111111111111111111",
      issuedAt: new Date("2026-11-20T00:00:00Z"),
      expiry: new Date("2026-12-20T00:00:00Z"),
    });
    const statement = signBindingStatement({
      fields,
      walletSignature: await wallet.signMessage(bindingStatementBytes(fields)),
      sealIdentity: seal,
    });
    const posted = await client.postBinding({
      walletAddress: wallet.address,
      statement: statement as unknown as Record<string, unknown>,
    });
    expect(posted.ok).toBe(true);

    const fetched = await client.getBinding(other.address, {
      walletAccountClient: mockAccountClient(wallet),
      sealAccountClient: mockAccountClient(seal),
    });
    expect(fetched.ok).toBe(false);
    if (fetched.ok) return;
    expect(["address-mismatch", "http-error"]).toContain(fetched.refusal);
  });
});
