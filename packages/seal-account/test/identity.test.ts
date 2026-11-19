import { deriveSealKeys } from "@qorechain/qoreseal";
import {
  addressFromPublicKey,
  deriveCanonicalPqKey,
  deriveClassicalKey,
  toHex,
} from "@qorechain/qoresign";
import { describe, expect, it } from "vitest";
import { generateSealAccount, normalizeMnemonic, SealAccountIdentity } from "../src/identity.js";
import {
  EXPECTED,
  TEST_CHAIN_ID,
  TEST_MNEMONIC,
  TEST_MNEMONIC_B,
  verifyOwnCard,
  walletEvmAddressOf,
} from "./fixtures.js";

describe("derivation from the TEST ONLY mnemonic", () => {
  it("matches the frozen values produced by the official packages", () => {
    const identity = SealAccountIdentity.fromMnemonic({
      mnemonic: TEST_MNEMONIC,
      chainId: TEST_CHAIN_ID,
    });
    const data = identity.publicData();

    expect(data.address).toBe(EXPECTED.address);
    expect(data.addressHex).toBe(EXPECTED.addressHex);
    expect(toHex(data.classicalPublicKey)).toBe(EXPECTED.classicalPublicKey);
    expect(data.hashes.mlDsaSha3).toBe(EXPECTED.mlDsaSha3);
    expect(data.hashes.mlkemSha3).toBe(EXPECTED.mlkemSha3);
    expect(data.hashes.x25519).toBe(EXPECTED.x25519);
    expect(walletEvmAddressOf(identity)).toBe(EXPECTED.walletEvmAddress);

    expect(data.algorithmIds).toEqual({ mlDsa: 1, mlkem: 2 });
    expect(data.mlDsaPublicKey).toHaveLength(2592);
    expect(data.mlkemPublicKey).toHaveLength(1568);
    expect(data.x25519PublicKey).toHaveLength(32);
    expect(data.classicalPublicKey).toHaveLength(33);
  });

  it("uses the same sequence as the official register-and-encrypt example", () => {
    const mnemonic = normalizeMnemonic(TEST_MNEMONIC);
    const classical = deriveClassicalKey({ mnemonic });
    const account = addressFromPublicKey(classical.publicKey, "secp256k1");
    const pq = deriveCanonicalPqKey({ mnemonic, address: account.bech32 });
    const sealKeys = deriveSealKeys({ mnemonic });

    const identity = SealAccountIdentity.fromMnemonic({ mnemonic, chainId: TEST_CHAIN_ID });
    const data = identity.publicData();

    expect(data.address).toBe(account.bech32);
    expect(toHex(data.classicalPublicKey)).toBe(toHex(classical.publicKey));
    expect(toHex(data.mlDsaPublicKey)).toBe(toHex(pq.publicKey));
    expect(toHex(data.mlkemPublicKey)).toBe(toHex(sealKeys.mlkemPublicKey));
    expect(toHex(data.x25519PublicKey)).toBe(toHex(sealKeys.x25519PublicKey));
  });

  it("is deterministic and normalises incidental whitespace", () => {
    const a = SealAccountIdentity.fromMnemonic({ mnemonic: TEST_MNEMONIC, chainId: TEST_CHAIN_ID });
    const b = SealAccountIdentity.fromMnemonic({
      mnemonic: `  ${TEST_MNEMONIC.replace(/ /g, "   ")}\n`,
      chainId: TEST_CHAIN_ID,
    });
    expect(b.address).toBe(a.address);
    expect(b.toJSON()).toEqual(a.toJSON());
  });

  it("gives a different account for a different mnemonic", () => {
    const a = SealAccountIdentity.fromMnemonic({ mnemonic: TEST_MNEMONIC, chainId: TEST_CHAIN_ID });
    const b = SealAccountIdentity.fromMnemonic({
      mnemonic: TEST_MNEMONIC_B,
      chainId: TEST_CHAIN_ID,
    });
    expect(b.address).not.toBe(a.address);
    expect(b.publicData().hashes.mlkemSha3).not.toBe(a.publicData().hashes.mlkemSha3);
    expect(b.publicData().hashes.mlDsaSha3).not.toBe(a.publicData().hashes.mlDsaSha3);
  });

  it("publicData returns copies, so a caller cannot mutate the identity", () => {
    const identity = SealAccountIdentity.fromMnemonic({
      mnemonic: TEST_MNEMONIC,
      chainId: TEST_CHAIN_ID,
    });
    const first = identity.publicData();
    first.mlkemPublicKey[0] = (first.mlkemPublicKey[0] ?? 0) ^ 0xff;
    const second = identity.publicData();
    expect(second.mlkemPublicKey[0]).not.toBe(first.mlkemPublicKey[0]);
  });
});

describe("generation in memory", () => {
  it("generates 24 words, redacts them, and derives the same identity", () => {
    const { identity, mnemonic } = generateSealAccount({ chainId: TEST_CHAIN_ID });
    expect(mnemonic.wordCount).toBe(24);
    expect(String(mnemonic)).toBe("[redacted]");
    expect(JSON.stringify(mnemonic)).toBe('"[redacted]"');

    const revealed = mnemonic.use((value) => value);
    const again = SealAccountIdentity.fromMnemonic({ mnemonic: revealed, chainId: TEST_CHAIN_ID });
    expect(again.address).toBe(identity.address);
    expect(again.toJSON()).toEqual(identity.toJSON());
  });
});

describe("recipient card", () => {
  it("signs a card that verifies against the identity's own public keys", () => {
    const identity = SealAccountIdentity.fromMnemonic({
      mnemonic: TEST_MNEMONIC,
      chainId: TEST_CHAIN_ID,
    });
    expect(() => verifyOwnCard(identity)).not.toThrow();
  });

  it("uses the exact issuedAt supplied and records the ML-KEM hash", () => {
    const identity = SealAccountIdentity.fromMnemonic({
      mnemonic: TEST_MNEMONIC,
      chainId: TEST_CHAIN_ID,
    });
    const card = identity.recipientCard({ issuedAt: "2026-11-19T00:00:00Z" });
    expect(card.issuedAt).toBe("2026-11-19T00:00:00Z");
    expect(card.mlkemKeySha3).toBe(EXPECTED.mlkemSha3);
    expect(card.x25519PublicKey).toBe(EXPECTED.x25519);
    expect(card.address).toBe(EXPECTED.address);
  });
});
