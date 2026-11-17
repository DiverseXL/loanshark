// Task 6: recipient-card verification with an injected MOCKED registry.
//
// The QoreSeal network helpers take `fetch` in `RestOptions` (source-lock
// claim 28), so the registry is replaced by a function in this file. No test
// opens a socket, reads the real KEM endpoint or registers a key.
//
// MOCK: the registry answers below are built from throwaway keys generated in
// this process, not from QoreChain.

import { describe, expect, it } from "vitest";
import { signRecipientCard, verifyRecipientCard } from "@qorechain/qoreseal";
import type { FetchLike } from "@qorechain/qoreseal/network";
import { resolveRecipient } from "@qorechain/qoreseal/network";
import { generateThrowawayIdentity } from "../src/testing.js";

const CHAIN_ID = "qorechain-diana";
const REST = "http://mock.invalid";
const b64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64");

/** A card for the identity, signed with the official QoreSeal/QoreSign API. */
const cardFor = (identity: ReturnType<typeof generateThrowawayIdentity>) =>
  signRecipientCard({
    chainId: CHAIN_ID,
    address: identity.address,
    keys: identity.sealKeys,
    classicalKey: identity.classicalKey,
    pqKey: identity.pqKey,
    issuedAt: "2026-11-17T00:00:00Z",
  });

/**
 * MOCK registry. `kemKey` is what the KEM route reports for the address, so a
 * test can report a key that does not match the card's commitment.
 */
function mockRegistry(args: { address: string; pqPublicKey: Uint8Array; kemKey: Uint8Array }): {
  fetch: FetchLike;
  calls: string[];
} {
  const calls: string[] = [];
  const fetch: FetchLike = async (url) => {
    calls.push(url);
    if (url.includes("/qorechain/pqc/v1/account/")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          found: true,
          account: {
            address: args.address,
            public_key: b64(args.pqPublicKey),
            algorithm_id: 1,
            algorithm_name: "dilithium5",
            key_type: "hybrid",
            possession_proven: true,
          },
        }),
      };
    }
    if (url.includes("/qorechain/pqc/v1/kem/")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          found: true,
          key: {
            address: args.address,
            algorithm_id: 2,
            algorithm_name: "ml-kem-1024",
            public_key: b64(args.kemKey),
            registered_height: "10194644",
          },
        }),
      };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return { fetch, calls };
}

const codeOf = async (fn: () => Promise<unknown>): Promise<string> => {
  try {
    await fn();
  } catch (err) {
    return (err as { code?: string }).code ?? "no code";
  }
  return "none";
};

describe("recipient cards against a mocked registry (MOCK)", () => {
  it("resolves the card when both registered keys match", async () => {
    const borrower = generateThrowawayIdentity();
    const card = cardFor(borrower);
    const registry = mockRegistry({
      address: borrower.address,
      pqPublicKey: borrower.pqKey.publicKey,
      kemKey: borrower.sealKeys.mlkemPublicKey,
    });

    const recipient = await resolveRecipient({
      rest: REST,
      fetch: registry.fetch,
      chainId: CHAIN_ID,
      address: borrower.address,
      card,
    });

    expect(recipient.x25519PublicKey).toBeDefined();
    expect(Buffer.from(recipient.x25519PublicKey ?? new Uint8Array()).toString("hex")).toBe(
      Buffer.from(borrower.sealKeys.x25519PublicKey).toString("hex"),
    );
    // Two read-only lookups: the KEM key and the ML-DSA-87 account record.
    expect(registry.calls).toHaveLength(2);
    expect(registry.calls.some((u) => u.includes("/qorechain/pqc/v1/kem/"))).toBe(true);
    expect(registry.calls.some((u) => u.includes("/qorechain/pqc/v1/account/"))).toBe(true);
  });

  it("refuses a card whose KEM hash does not match the registered key", async () => {
    const borrower = generateThrowawayIdentity();
    const other = generateThrowawayIdentity();
    const card = cardFor(borrower);
    // MOCK: the registry reports a different ML-KEM key for the same account.
    const registry = mockRegistry({
      address: borrower.address,
      pqPublicKey: borrower.pqKey.publicKey,
      kemKey: other.sealKeys.mlkemPublicKey,
    });

    const code = await codeOf(() =>
      resolveRecipient({
        rest: REST,
        fetch: registry.fetch,
        chainId: CHAIN_ID,
        address: borrower.address,
        card,
      }),
    );
    expect(code).toBe("CARD_INVALID");
  });

  it("refuses a card whose signature does not match the registered PQ key", async () => {
    const borrower = generateThrowawayIdentity();
    const other = generateThrowawayIdentity();
    const card = cardFor(borrower);
    const registry = mockRegistry({
      address: borrower.address,
      pqPublicKey: other.pqKey.publicKey,
      kemKey: borrower.sealKeys.mlkemPublicKey,
    });

    const code = await codeOf(() =>
      resolveRecipient({
        rest: REST,
        fetch: registry.fetch,
        chainId: CHAIN_ID,
        address: borrower.address,
        card,
      }),
    );
    expect(code).toBe("CARD_INVALID");
  });

  it("verifies offline against supplied keys and refuses a swapped KEM key", () => {
    const borrower = generateThrowawayIdentity();
    const other = generateThrowawayIdentity();
    const card = cardFor(borrower);

    expect(() =>
      verifyRecipientCard({
        card,
        chainId: CHAIN_ID,
        address: borrower.address,
        pqPublicKey: borrower.pqKey.publicKey,
        mlkemPublicKey: borrower.sealKeys.mlkemPublicKey,
      }),
    ).not.toThrow();

    expect(() =>
      verifyRecipientCard({
        card,
        chainId: CHAIN_ID,
        address: borrower.address,
        pqPublicKey: borrower.pqKey.publicKey,
        mlkemPublicKey: other.sealKeys.mlkemPublicKey,
      }),
    ).toThrowError(expect.objectContaining({ code: "CARD_INVALID" }));
  });

  it("mlkem mode reads only the KEM route and needs no card", async () => {
    const borrower = generateThrowawayIdentity();
    const registry = mockRegistry({
      address: borrower.address,
      pqPublicKey: borrower.pqKey.publicKey,
      kemKey: borrower.sealKeys.mlkemPublicKey,
    });

    const recipient = await resolveRecipient({
      rest: REST,
      fetch: registry.fetch,
      chainId: CHAIN_ID,
      address: borrower.address,
      mode: "mlkem",
    });

    expect(recipient.x25519PublicKey).toBeUndefined();
    expect(registry.calls).toHaveLength(1);
    expect(registry.calls[0]?.includes("/qorechain/pqc/v1/kem/")).toBe(true);
  });
});
