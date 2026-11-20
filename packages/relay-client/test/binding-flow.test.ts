// Unit tests for the binding flow (producer and verifier) (ADR-0014, ADR-0017).
//
// MOCK: In-process RelayServer and mock account clients with throwaway keys.

import { RelayServer } from "@loanshark/api";
import { mockAccountClient } from "@loanshark/qoreseal-adapter/testing";
import { generateSealAccount } from "@loanshark/seal-account";
import { addressFromPublicKey } from "@qorechain/qoresign";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fetchAndVerifyBinding, produceAndPublishBinding } from "../src/binding-flow.js";
import { RelayClient } from "../src/client.js";

const CHAIN_ID = "qorechain-diana";

describe("binding flow (MOCK producer, verifier and relay)", () => {
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

  it("produces, publishes, fetches and verifies a binding statement end to end", async () => {
    const wallet = generateSealAccount({ chainId: CHAIN_ID }).identity;
    const seal = generateSealAccount({ chainId: CHAIN_ID }).identity;
    const walletEvmAddress = addressFromPublicKey(
      wallet.publicData().classicalPublicKey,
      "eth_secp256k1",
    ).hex;

    const issuedAt = new Date("2026-11-19T10:00:00Z");
    const expiry = new Date("2026-12-19T10:00:00Z");

    // 1. Producer: W signs via signer, E countersigns, published to relay
    const produceRes = await produceAndPublishBinding({
      chainId: CHAIN_ID,
      walletAddress: wallet.address,
      walletEvmAddress,
      walletSigner: {
        sign: async (msg) => wallet.signMessage(msg),
      },
      sealIdentity: seal,
      relayClient: client,
      issuedAt,
      expiry,
    });

    expect(produceRes.ok).toBe(true);
    if (!produceRes.ok) return;
    expect(produceRes.value.statement.fields.walletAddress).toBe(wallet.address);
    expect(produceRes.value.statement.fields.sealAddress).toBe(seal.address);
    expect(produceRes.value.stored.walletAddress).toBe(wallet.address);

    // 2. Verifier: fetches and verifies against on-chain records
    const verifyRes = await fetchAndVerifyBinding({
      walletAddress: wallet.address,
      relayClient: client,
      walletAccountClient: mockAccountClient({
        address: wallet.address,
        pqKey: { algorithmId: 1, publicKey: wallet.publicData().mlDsaPublicKey },
      }),
      sealAccountClient: mockAccountClient({
        address: seal.address,
        pqKey: { algorithmId: 1, publicKey: seal.publicData().mlDsaPublicKey },
      }),
      now: new Date("2026-11-20T00:00:00Z"),
    });

    expect(verifyRes.ok).toBe(true);
    if (!verifyRes.ok) return;
    expect(verifyRes.value.walletAddress).toBe(wallet.address);
  });

  it("refuses an expired binding statement during verification", async () => {
    const wallet = generateSealAccount({ chainId: CHAIN_ID }).identity;
    const seal = generateSealAccount({ chainId: CHAIN_ID }).identity;
    const walletEvmAddress = addressFromPublicKey(
      wallet.publicData().classicalPublicKey,
      "eth_secp256k1",
    ).hex;

    const issuedAt = new Date("2026-11-01T00:00:00Z");
    const expiry = new Date("2026-11-10T00:00:00Z");

    const produceRes = await produceAndPublishBinding({
      chainId: CHAIN_ID,
      walletAddress: wallet.address,
      walletEvmAddress,
      walletSigner: { sign: async (msg) => wallet.signMessage(msg) },
      sealIdentity: seal,
      relayClient: client,
      issuedAt,
      expiry,
    });
    expect(produceRes.ok).toBe(true);

    // Verifier checks at current time (after expiry)
    const verifyRes = await fetchAndVerifyBinding({
      walletAddress: wallet.address,
      relayClient: client,
      walletAccountClient: mockAccountClient({
        address: wallet.address,
        pqKey: { algorithmId: 1, publicKey: wallet.publicData().mlDsaPublicKey },
      }),
      sealAccountClient: mockAccountClient({
        address: seal.address,
        pqKey: { algorithmId: 1, publicKey: seal.publicData().mlDsaPublicKey },
      }),
      now: new Date("2026-11-19T00:00:00Z"),
    });

    expect(verifyRes.ok).toBe(false);
    if (verifyRes.ok) return;
    expect(verifyRes.refusal).toBe("binding-invalid");
    expect((verifyRes as { value?: unknown }).value).toBeUndefined();
  });

  it("fails production if wallet signer rejects", async () => {
    const seal = generateSealAccount({ chainId: CHAIN_ID }).identity;
    const produceRes = await produceAndPublishBinding({
      chainId: CHAIN_ID,
      walletAddress: "qor19rl4cm2hmr8afy4kldpxz3fka4jguq0agt672h",
      walletEvmAddress: "0x1111111111111111111111111111111111111111",
      walletSigner: {
        sign: async () => {
          throw new Error("user rejected signing in wallet");
        },
      },
      sealIdentity: seal,
      relayClient: client,
    });

    expect(produceRes.ok).toBe(false);
    if (produceRes.ok) return;
    expect(produceRes.refusal).toBe("binding-invalid");
    expect(produceRes.message).toContain("user rejected signing");
  });
});
