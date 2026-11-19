import type { PqcAccountReader } from "@loanshark/chain-client";
import type { MessageSignature } from "@qorechain/qoresign";
import { addressFromPublicKey } from "@qorechain/qoresign";
import { describe, expect, it } from "vitest";
import type { BindingStatement, BindingStatementFields } from "../src/binding.js";
import {
  BINDING_STATEMENT_DOMAIN,
  bindingStatementBytes,
  bindingStatementText,
  createBindingStatementFields,
  DEFAULT_BINDING_LIFETIME_DAYS,
  formatTimestamp,
  MAX_BINDING_LIFETIME_DAYS,
  signBindingStatement,
  verifyBindingStatement,
} from "../src/binding.js";
import { SealAccountIdentity } from "../src/identity.js";
import { TEST_CHAIN_ID, TEST_MNEMONIC, TEST_MNEMONIC_B, walletEvmAddressOf } from "./fixtures.js";

// W is played by a second derived identity: its `signMessage` output has the
// same shape as a QoreX `signArbitrary` response, so the verifier sees the real
// hybrid message format. No wallet, chain or network is involved.
const W = SealAccountIdentity.fromMnemonic({ mnemonic: TEST_MNEMONIC_B, chainId: TEST_CHAIN_ID });
const E = SealAccountIdentity.fromMnemonic({ mnemonic: TEST_MNEMONIC, chainId: TEST_CHAIN_ID });
const OTHER = SealAccountIdentity.fromMnemonic({
  mnemonic: "zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong",
  chainId: TEST_CHAIN_ID,
});

const ISSUED_AT = new Date("2026-11-19T00:00:00Z");

const clientFor = (account: SealAccountIdentity): PqcAccountReader => ({
  readAccount: async (address) =>
    address === account.address
      ? { address, publicKey: account.publicData().mlDsaPublicKey, algorithmId: 1 }
      : null,
});

const emptyClient: PqcAccountReader = { readAccount: async () => null };

const fields = (overrides: Partial<Parameters<typeof createBindingStatementFields>[0]> = {}) =>
  createBindingStatementFields({
    chainId: TEST_CHAIN_ID,
    walletAddress: W.address,
    sealAddress: E.address,
    walletEvmAddress: walletEvmAddressOf(W),
    issuedAt: ISSUED_AT,
    ...overrides,
  });

const walletSignatureFor = (value: BindingStatementFields): MessageSignature =>
  W.signMessage(bindingStatementBytes(value));

const signed = (
  overrides: Partial<Parameters<typeof createBindingStatementFields>[0]> = {},
): BindingStatement => {
  const value = fields(overrides);
  return signBindingStatement({
    fields: value,
    walletSignature: walletSignatureFor(value),
    sealIdentity: E,
  });
};

const verify = (
  statement: BindingStatement,
  options: Partial<Parameters<typeof verifyBindingStatement>[0]> = {},
) =>
  verifyBindingStatement({
    statement,
    walletAccountClient: clientFor(W),
    sealAccountClient: clientFor(E),
    now: new Date("2026-11-20T00:00:00Z"),
    ...options,
  });

describe("statement text", () => {
  it("is the exact seven frozen lines", () => {
    const value = fields();
    expect(bindingStatementText(value)).toBe(
      [
        BINDING_STATEMENT_DOMAIN,
        `Chain ID: ${TEST_CHAIN_ID}`,
        `Wallet account: ${W.address}`,
        `Seal account: ${E.address}`,
        `Wallet EVM address: ${walletEvmAddressOf(W)}`,
        "Issued at: 2026-11-19T00:00:00Z",
        "Expires at: 2026-12-19T00:00:00Z",
      ].join("\n"),
    );
    expect(bindingStatementText(value)).not.toMatch(/\n$/);
  });

  it("encodes as UTF-8 bytes of that text", () => {
    const value = fields();
    expect(bindingStatementBytes(value)).toEqual(
      new TextEncoder().encode(bindingStatementText(value)),
    );
  });

  it("defaults to 30 days and accepts exactly 90 days", () => {
    expect(DEFAULT_BINDING_LIFETIME_DAYS).toBe(30);
    expect(MAX_BINDING_LIFETIME_DAYS).toBe(90);
    expect(fields()).toMatchObject({
      issuedAt: "2026-11-19T00:00:00Z",
      expiry: "2026-12-19T00:00:00Z",
    });

    const latest = new Date(ISSUED_AT.getTime() + 90 * 24 * 60 * 60 * 1000);
    expect(fields({ expiry: latest }).expiry).toBe("2027-02-17T00:00:00Z");
  });

  it("normalises the EVM address to EIP-55 and rejects a non-canonical qor1 address", () => {
    const canonical = walletEvmAddressOf(W);
    expect(fields({ walletEvmAddress: canonical.toLowerCase() }).walletEvmAddress).toBe(canonical);
    expect(() => fields({ walletAddress: W.address.toUpperCase() })).toThrow(TypeError);
    expect(() => fields({ walletAddress: W.address.replace(/^qor1/, "0x") })).toThrow(TypeError);
  });

  it("rejects a newline in any field, an expiry that is not after issuedAt, and more than 90 days", () => {
    expect(() => fields({ chainId: "qorechain-diana\nInjected: yes" })).toThrow(TypeError);
    expect(() => fields({ chainId: "" })).toThrow(TypeError);
    expect(() => fields({ expiry: ISSUED_AT })).toThrow(TypeError);
    expect(() =>
      fields({ expiry: new Date(ISSUED_AT.getTime() + 91 * 24 * 60 * 60 * 1000) }),
    ).toThrow(TypeError);

    const injected = {
      ...fields(),
      walletAddress: `${W.address}\nInjected: yes`,
    };
    expect(() => bindingStatementText(injected)).toThrow();
  });

  it("formats timestamps at second resolution", () => {
    expect(formatTimestamp(new Date("2026-11-19T00:00:00.999Z"))).toBe("2026-11-19T00:00:00Z");
    expect(formatTimestamp(new Date("2026-11-19T00:00:00Z"))).toBe("2026-11-19T00:00:00Z");
  });
});

describe("signing", () => {
  it("produces the version and the fields it signed", () => {
    const statement = signed();
    expect(statement.version).toBe(1);
    expect(statement.fields).toEqual(fields());
    expect(statement.sealSignature.signatureType).toBe("ml-dsa-87-hybrid");
    expect(statement.sealSignature.pq?.algorithmId).toBe(1);
  });

  it("refuses a seal identity on another chain", () => {
    const otherChain = SealAccountIdentity.fromMnemonic({
      mnemonic: TEST_MNEMONIC,
      chainId: "qorechain-vladi",
    });
    expect(() =>
      signBindingStatement({
        fields: fields({ sealAddress: otherChain.address }),
        walletSignature: walletSignatureFor(fields()),
        sealIdentity: otherChain,
      }),
    ).toThrow(/different chain/);
  });

  it("refuses a seal identity that is not the sealAddress", () => {
    const value = fields();
    expect(() =>
      signBindingStatement({
        fields: { ...value, sealAddress: OTHER.address },
        walletSignature: walletSignatureFor({ ...value, sealAddress: OTHER.address }),
        sealIdentity: E,
      }),
    ).toThrow(/not the sealAddress/);
  });
});

describe("verification", () => {
  it("accepts a statement signed by both accounts", async () => {
    const result = await verify(signed());
    expect(result).toEqual({
      ok: true,
      value: {
        chainId: TEST_CHAIN_ID,
        walletAddress: W.address,
        sealAddress: E.address,
        walletEvmAddress: walletEvmAddressOf(W),
        issuedAt: "2026-11-19T00:00:00Z",
        expiry: "2026-12-19T00:00:00Z",
        walletPqPublicKeyLength: 2592,
        sealPqPublicKeyLength: 2592,
      },
    });
  });

  it("tolerates five minutes of clock skew but not more", async () => {
    const statement = signed();
    const justBefore = new Date(ISSUED_AT.getTime() - 60 * 1000);
    expect((await verify(statement, { now: justBefore })).ok).toBe(true);

    const tooEarly = new Date(ISSUED_AT.getTime() - 10 * 60 * 1000);
    expect(await verify(statement, { now: tooEarly })).toMatchObject({
      ok: false,
      code: "not-yet-valid",
    });
  });

  it("rejects a statement at or after its expiry", async () => {
    const statement = signed();
    expect(await verify(statement, { now: new Date("2026-12-19T00:00:00Z") })).toMatchObject({
      ok: false,
      code: "expired",
    });
    expect(await verify(statement, { now: new Date("2026-12-18T23:59:59Z") })).toMatchObject({
      ok: true,
    });
  });

  it("rejects an unsupported version", async () => {
    const statement = signed();
    expect(await verify({ ...statement, version: 2 } as unknown as BindingStatement)).toMatchObject(
      { ok: false, code: "invalid-statement" },
    );
  });

  it("rejects a lifetime above the 90-day cap even when both signatures are real", async () => {
    const overlong: BindingStatementFields = {
      ...fields(),
      expiry: "2027-02-20T00:00:00Z",
    };
    const statement = signBindingStatement({
      fields: overlong,
      walletSignature: walletSignatureFor(overlong),
      sealIdentity: E,
    });
    expect(await verify(statement)).toMatchObject({ ok: false, code: "invalid-statement" });
  });

  it("rejects a statement whose text was changed after signing", async () => {
    const statement = signed();
    const tampered: BindingStatement = {
      ...statement,
      fields: { ...statement.fields, issuedAt: "2026-11-19T00:00:01Z" },
    };
    expect(await verify(tampered)).toMatchObject({
      ok: false,
      code: "wallet-signature-invalid",
    });
  });

  it("rejects a statement with no wallet signature", async () => {
    const value = fields();
    const statement: BindingStatement = {
      version: 1,
      fields: value,
      walletSignature: null,
      sealSignature: E.signMessage(bindingStatementBytes(value)),
    };
    expect(await verify(statement)).toMatchObject({
      ok: false,
      code: "wallet-signature-invalid",
    });
  });

  it("requires the post-quantum part of the wallet signature", async () => {
    const statement = signed();
    const { pq: _pq, ...classicalOnly } = statement.walletSignature as MessageSignature;
    expect(await verify({ ...statement, walletSignature: classicalOnly })).toMatchObject({
      ok: false,
      code: "wallet-signature-invalid",
    });
  });

  it("requires the post-quantum part of the seal signature", async () => {
    const statement = signed();
    const { pq: _pq, ...classicalOnly } = statement.sealSignature;
    expect(
      await verify({ ...statement, sealSignature: classicalOnly as MessageSignature }),
    ).toMatchObject({
      ok: false,
      code: "seal-signature-invalid",
    });
  });

  it("rejects a seal signature made by another account", async () => {
    const value = fields();
    const statement: BindingStatement = {
      version: 1,
      fields: value,
      walletSignature: walletSignatureFor(value),
      sealSignature: OTHER.signMessage(bindingStatementBytes(value)),
    };
    expect(await verify(statement)).toMatchObject({
      ok: false,
      code: "seal-signature-invalid",
    });
  });

  it("rejects when either account has no registered key", async () => {
    const statement = signed();
    expect(await verify(statement, { walletAccountClient: emptyClient })).toMatchObject({
      ok: false,
      code: "wallet-signature-invalid",
    });
    expect(await verify(statement, { sealAccountClient: emptyClient })).toMatchObject({
      ok: false,
      code: "seal-signature-invalid",
    });
  });

  it("rejects an EVM address that is not the 0x form of W's signing key", async () => {
    const wrong = "0x0000000000000000000000000000000000000001";
    const statement = signed({ walletEvmAddress: wrong });
    expect(await verify(statement)).toMatchObject({
      ok: false,
      code: "evm-address-mismatch",
    });
  });

  it("can skip the EVM check only when explicitly asked", async () => {
    const wrong = "0x0000000000000000000000000000000000000001";
    const statement = signed({ walletEvmAddress: wrong });
    const result = await verify(statement, { requireEvmAddressMatch: false });
    expect(result.ok).toBe(true);
  });

  it("derives the EVM address from the key inside the signature, not from the field", async () => {
    // Replace W's signature with one from a different key while naming W's EVM
    // address: the signature check must already fail.
    const value = fields();
    const statement: BindingStatement = {
      version: 1,
      fields: value,
      walletSignature: OTHER.signMessage(bindingStatementBytes(value)),
      sealSignature: E.signMessage(bindingStatementBytes(value)),
    };
    expect(await verify(statement)).toMatchObject({
      ok: false,
      code: "wallet-signature-invalid",
    });
  });
});

describe("EVM address derivation used by the verifier", () => {
  it("is the Ethereum form of the same secp256k1 key", () => {
    expect(addressFromPublicKey(W.publicData().classicalPublicKey, "eth_secp256k1").hex).toBe(
      walletEvmAddressOf(W),
    );
  });
});
