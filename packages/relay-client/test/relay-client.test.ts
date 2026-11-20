// Unit tests for @loanshark/relay-client (ADR-0017).
//
// MOCK: Uses an in-process RelayServer (MOCK relay) and in-memory mock account clients.
// Tests positive flow and hostile relay scenarios: swapped envelope, card with
// wrong KEM key, and binding statement for another account.
// Verifies that failed verifications return typed refusals and NEVER data.

import { RelayServer } from "@loanshark/api";
import { encodeAad, sealMlkemToRecipient, signEnvelope } from "@loanshark/qoreseal-adapter";
import { mockAccountClient } from "@loanshark/qoreseal-adapter/testing";
import {
  bindingStatementBytes,
  createBindingStatementFields,
  generateSealAccount,
  type SealAccountIdentity,
  signBindingStatement,
} from "@loanshark/seal-account";
import { addressFromPublicKey } from "@qorechain/qoresign";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RelayClient } from "../src/client.js";
import type { EnvelopeRecordInput } from "../src/types.js";

const CHAIN_ID = "qorechain-diana";

const evmAddressOf = (account: SealAccountIdentity): string =>
  addressFromPublicKey(account.publicData().classicalPublicKey, "eth_secp256k1").hex;

describe("packages/relay-client (MOCK relay and MOCK account client)", () => {
  let server: RelayServer;
  let port: number;
  let client: RelayClient;

  beforeEach(async () => {
    server = new RelayServer({
      allowedHosts: ["localhost", "127.0.0.1"],
      allowedOrigins: ["http://localhost:5173", "http://127.0.0.1:5173"],
    });
    port = await server.listen(0, "127.0.0.1");
    client = new RelayClient({
      baseUrl: `http://127.0.0.1:${port}`,
    });
  });

  afterEach(async () => {
    await server.close();
  });

  it("happy path: posts and gets verified envelope, card, and binding", async () => {
    // 1. Setup mock identities: Borrower W and E, Lender W and E
    const borrowerW = generateSealAccount({ chainId: CHAIN_ID }).identity;
    const borrowerE = generateSealAccount({ chainId: CHAIN_ID }).identity;
    const lenderW = generateSealAccount({ chainId: CHAIN_ID }).identity;
    const lenderE = generateSealAccount({ chainId: CHAIN_ID }).identity;

    // 2. Recipient card for borrowerE
    const card = borrowerE.recipientCard();
    const postCardRes = await client.postCard({
      sealAddress: borrowerE.address,
      card: card as unknown as Record<string, unknown>,
    });
    expect(postCardRes.ok).toBe(true);

    const getCardRes = await client.getCard(borrowerE.address, {
      registry: {
        chainId: CHAIN_ID,
        pqPublicKey: borrowerE.publicData().mlDsaPublicKey,
        mlkemPublicKey: borrowerE.publicData().mlkemPublicKey,
      },
    });
    expect(getCardRes.ok).toBe(true);
    if (!getCardRes.ok) return;
    expect(getCardRes.value.sealAddress).toBe(borrowerE.address);

    // 3. Binding statement for borrowerW and borrowerE
    const bindingFields = createBindingStatementFields({
      chainId: CHAIN_ID,
      walletAddress: borrowerW.address,
      sealAddress: borrowerE.address,
      walletEvmAddress: evmAddressOf(borrowerW),
      issuedAt: new Date("2026-11-19T00:00:00Z"),
      expiry: new Date("2026-12-19T00:00:00Z"),
    });
    const walletSig = borrowerW.signMessage(bindingStatementBytes(bindingFields));
    const bindingStatement = signBindingStatement({
      fields: bindingFields,
      walletSignature: walletSig,
      sealIdentity: borrowerE,
    });

    const postBindingRes = await client.postBinding({
      walletAddress: borrowerW.address,
      statement: bindingStatement as unknown as Record<string, unknown>,
    });
    expect(postBindingRes.ok).toBe(true);

    const getBindingRes = await client.getBinding(borrowerW.address, {
      walletAccountClient: mockAccountClient({
        address: borrowerW.address,
        pqKey: {
          algorithmId: 1,
          publicKey: borrowerW.publicData().mlDsaPublicKey,
        },
      }),
      sealAccountClient: mockAccountClient({
        address: borrowerE.address,
        pqKey: {
          algorithmId: 1,
          publicKey: borrowerE.publicData().mlDsaPublicKey,
        },
      }),
      now: new Date("2026-11-20T00:00:00Z"),
    });
    expect(getBindingRes.ok).toBe(true);
    if (!getBindingRes.ok) return;
    expect(getBindingRes.value.walletAddress).toBe(borrowerW.address);

    // 4. Envelope sealed to lenderE, signed by borrowerE (ADR-0015)
    const context = {
      kind: "request" as const,
      chainId: CHAIN_ID,
      requestId: "req-relay-test-1",
      borrower: borrowerW.address,
      version: "1",
    };
    const plaintext = new TextEncoder().encode("Loan request for 10000 fUSD");
    const sealed = sealMlkemToRecipient({
      chainId: CHAIN_ID,
      purpose: "loanshark/request",
      recipient: { mlkemPublicKey: lenderE.publicData().mlkemPublicKey },
      plaintext,
      aad: encodeAad(context),
    });
    expect(sealed.ok).toBe(true);
    if (!sealed.ok) return;

    // Signed by borrowerE
    const signed = await signEnvelope({
      envelope: sealed.value.envelope,
      context,
      signer: {
        sign: async (msg) => borrowerE.signMessage(msg),
      },
    });
    expect(signed.ok).toBe(true);
    if (!signed.ok) return;

    const envelopeInput: EnvelopeRecordInput = {
      kind: "request",
      loanRef: "loan-relay-1",
      senderW: borrowerW.address,
      recipientW: lenderW.address,
      ciphertext: Buffer.from(signed.value.envelope).toString("base64"),
      signature: signed.value.signature as unknown as Record<string, unknown>,
      aad: context as unknown as Record<string, unknown>,
      createdAt: new Date().toISOString(),
    };

    const postEnvRes = await client.postEnvelope(envelopeInput);
    expect(postEnvRes.ok).toBe(true);
    if (!postEnvRes.ok) return;
    const envelopeId = postEnvRes.value.id;

    // Get inbox for lenderW
    const inboxRes = await client.getInbox(lenderW.address);
    expect(inboxRes.ok).toBe(true);
    if (!inboxRes.ok) return;
    expect(inboxRes.value).toHaveLength(1);
    expect(inboxRes.value[0]?.id).toBe(envelopeId);

    // Get envelope and verify against borrowerE's key
    const getEnvRes = await client.getEnvelope(envelopeId, {
      accountClient: mockAccountClient({
        address: borrowerE.address,
        pqKey: {
          algorithmId: 1,
          publicKey: borrowerE.publicData().mlDsaPublicKey,
        },
      }),
      expectedBorrowerW: borrowerW.address,
      signerE: borrowerE.address,
    });
    expect(getEnvRes.ok).toBe(true);
    if (!getEnvRes.ok) return;
    expect(getEnvRes.value.id).toBe(envelopeId);
  });

  it("hostile relay: swapped envelope ciphertext is refused with typed error, never data", async () => {
    const borrowerW = generateSealAccount({ chainId: CHAIN_ID }).identity;
    const borrowerE = generateSealAccount({ chainId: CHAIN_ID }).identity;
    const lenderW = generateSealAccount({ chainId: CHAIN_ID }).identity;

    const context = {
      kind: "request" as const,
      chainId: CHAIN_ID,
      requestId: "req-swapped-test",
      borrower: borrowerW.address,
      version: "1",
    };
    const sealed = sealMlkemToRecipient({
      chainId: CHAIN_ID,
      purpose: "loanshark/request",
      recipient: { mlkemPublicKey: borrowerE.publicData().mlkemPublicKey },
      plaintext: new TextEncoder().encode("authentic data"),
      aad: encodeAad(context),
    });
    if (!sealed.ok) throw new Error("seal failed");

    const signed = await signEnvelope({
      envelope: sealed.value.envelope,
      context,
      signer: { sign: async (msg) => borrowerE.signMessage(msg) },
    });
    if (!signed.ok) throw new Error("sign failed");

    // The genuine input
    const envInput: EnvelopeRecordInput = {
      kind: "request",
      loanRef: "loan-swap-1",
      senderW: borrowerW.address,
      recipientW: lenderW.address,
      ciphertext: Buffer.from(signed.value.envelope).toString("base64"),
      signature: signed.value.signature as unknown as Record<string, unknown>,
      aad: context as unknown as Record<string, unknown>,
      createdAt: new Date().toISOString(),
    };
    const posted = await client.postEnvelope(envInput);
    if (!posted.ok) throw new Error("post failed");
    const id = posted.value.id;

    // Simulate hostile relay: mutate stored envelope ciphertext in storage
    const stored = server.storage.getEnvelope(id);
    if (!stored) throw new Error("stored envelope missing");
    const tamperedBytes = Uint8Array.from(Buffer.from(stored.ciphertext, "base64"));
    tamperedBytes[0] = (tamperedBytes[0] ?? 0) ^ 0xff; // flip byte
    stored.ciphertext = Buffer.from(tamperedBytes).toString("base64");

    // When client fetches the envelope:
    const getRes = await client.getEnvelope(id, {
      accountClient: mockAccountClient({
        address: borrowerE.address,
        pqKey: { algorithmId: 1, publicKey: borrowerE.publicData().mlDsaPublicKey },
      }),
      signerE: borrowerE.address,
    });

    // Must be refused!
    expect(getRes.ok).toBe(false);
    if (getRes.ok) return;
    expect(getRes.refusal).toBe("content-address-mismatch");
    expect((getRes as { value?: unknown }).value).toBeUndefined();
  });

  it("hostile relay: recipient card with another KEM key is refused, never data", async () => {
    const borrowerE = generateSealAccount({ chainId: CHAIN_ID }).identity;
    const otherE = generateSealAccount({ chainId: CHAIN_ID }).identity;

    // Valid card generated by borrowerE
    const card = borrowerE.recipientCard();

    // Hostile relay serves card under borrowerE, but client verifies against registered keys
    // where borrower's registered KEM key is otherE's key (mismatch!)
    await client.postCard({
      sealAddress: borrowerE.address,
      card: card as unknown as Record<string, unknown>,
    });

    const getRes = await client.getCard(borrowerE.address, {
      registry: {
        chainId: CHAIN_ID,
        pqPublicKey: borrowerE.publicData().mlDsaPublicKey,
        mlkemPublicKey: otherE.publicData().mlkemPublicKey, // Swapped KEM key in registry!
      },
    });

    expect(getRes.ok).toBe(false);
    if (getRes.ok) return;
    expect(getRes.refusal).toBe("card-invalid");
    expect((getRes as { value?: unknown }).value).toBeUndefined();
  });

  it("hostile relay: binding statement for another account is refused, never data", async () => {
    const borrowerW = generateSealAccount({ chainId: CHAIN_ID }).identity;
    const otherW = generateSealAccount({ chainId: CHAIN_ID }).identity;
    const borrowerE = generateSealAccount({ chainId: CHAIN_ID }).identity;

    const fields = createBindingStatementFields({
      chainId: CHAIN_ID,
      walletAddress: otherW.address, // statement names otherW, but posted for borrowerW
      sealAddress: borrowerE.address,
      walletEvmAddress: evmAddressOf(otherW),
      issuedAt: new Date("2026-11-19T00:00:00Z"),
      expiry: new Date("2026-12-19T00:00:00Z"),
    });
    const walletSig = otherW.signMessage(bindingStatementBytes(fields));
    const statement = signBindingStatement({
      fields,
      walletSignature: walletSig,
      sealIdentity: borrowerE,
    });

    // Stored under borrowerW
    await client.postBinding({
      walletAddress: borrowerW.address,
      statement: statement as unknown as Record<string, unknown>,
    });

    const getRes = await client.getBinding(borrowerW.address, {
      walletAccountClient: mockAccountClient({
        address: borrowerW.address,
        pqKey: { algorithmId: 1, publicKey: borrowerW.publicData().mlDsaPublicKey },
      }),
      sealAccountClient: mockAccountClient({
        address: borrowerE.address,
        pqKey: { algorithmId: 1, publicKey: borrowerE.publicData().mlDsaPublicKey },
      }),
      now: new Date("2026-11-20T00:00:00Z"),
    });

    expect(getRes.ok).toBe(false);
    if (getRes.ok) return;
    expect(getRes.refusal).toBe("address-mismatch");
    expect((getRes as { value?: unknown }).value).toBeUndefined();
  });

  it("hostile relay: envelope with mismatched AAD party is refused, never data", async () => {
    const borrowerW = generateSealAccount({ chainId: CHAIN_ID }).identity;
    const attackerW = generateSealAccount({ chainId: CHAIN_ID }).identity;
    const borrowerE = generateSealAccount({ chainId: CHAIN_ID }).identity;
    const lenderW = generateSealAccount({ chainId: CHAIN_ID }).identity;

    // Envelope AAD names attackerW instead of expected borrowerW
    const context = {
      kind: "request" as const,
      chainId: CHAIN_ID,
      requestId: "req-attacker-aad",
      borrower: attackerW.address,
      version: "1",
    };
    const sealed = sealMlkemToRecipient({
      chainId: CHAIN_ID,
      purpose: "loanshark/request",
      recipient: { mlkemPublicKey: borrowerE.publicData().mlkemPublicKey },
      plaintext: new TextEncoder().encode("sample loan"),
      aad: encodeAad(context),
    });
    if (!sealed.ok) throw new Error("seal failed");

    const signed = await signEnvelope({
      envelope: sealed.value.envelope,
      context,
      signer: { sign: async (msg) => borrowerE.signMessage(msg) },
    });
    if (!signed.ok) throw new Error("sign failed");

    const envInput: EnvelopeRecordInput = {
      kind: "request",
      loanRef: "loan-aad-mismatch",
      senderW: attackerW.address,
      recipientW: lenderW.address,
      ciphertext: Buffer.from(signed.value.envelope).toString("base64"),
      signature: signed.value.signature as unknown as Record<string, unknown>,
      aad: context as unknown as Record<string, unknown>,
      createdAt: new Date().toISOString(),
    };

    const posted = await client.postEnvelope(envInput);
    if (!posted.ok) throw new Error("post failed");
    const id = posted.value.id;

    // Verifier expects borrowerW
    const getRes = await client.getEnvelope(id, {
      accountClient: mockAccountClient({
        address: borrowerE.address,
        pqKey: { algorithmId: 1, publicKey: borrowerE.publicData().mlDsaPublicKey },
      }),
      expectedBorrowerW: borrowerW.address, // Mismatch!
      signerE: borrowerE.address,
    });

    expect(getRes.ok).toBe(false);
    if (getRes.ok) return;
    expect(getRes.refusal).toBe("aad-mismatch");
    expect((getRes as { value?: unknown }).value).toBeUndefined();
  });
});
