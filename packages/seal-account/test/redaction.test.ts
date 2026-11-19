import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import {
  generateSealAccount,
  REDACTION_MARKER,
  SEAL_ACCOUNT_REDACTION,
  SealAccountIdentity,
  SecretBytes,
  SecretString,
} from "../src/index.js";
import { TEST_CHAIN_ID, TEST_MNEMONIC } from "./fixtures.js";

const identity = () =>
  SealAccountIdentity.fromMnemonic({ mnemonic: TEST_MNEMONIC, chainId: TEST_CHAIN_ID });

describe("SecretString", () => {
  const secret = new SecretString("vault material");

  it("redacts every implicit string conversion", () => {
    expect(REDACTION_MARKER).toBe("[redacted]");
    expect(SEAL_ACCOUNT_REDACTION).toBe("[redacted]");
    expect(String(secret)).toBe("[redacted]");
    expect(`${secret}`).toBe("[redacted]");
    expect(secret.toString()).toBe("[redacted]");
    expect(JSON.stringify(secret)).toBe('"[redacted]"');
    expect(JSON.stringify({ secret })).toBe('{"secret":"[redacted]"}');
    expect(inspect(secret)).toBe("[redacted]");
    expect([secret].join(",")).toBe("[redacted]");
  });

  it("reveals the value only through an explicit callback", () => {
    expect(secret.use((value) => value)).toBe("vault material");
    expect(secret.use((value) => value.length)).toBe(14);
  });

  it("reports a word count without exposing the words", () => {
    expect(new SecretString("one two  three").wordCount).toBe(3);
    expect(new SecretString("   ").wordCount).toBe(0);
  });
});

describe("SecretBytes", () => {
  const bytes = new SecretBytes(new Uint8Array([1, 2, 3]));

  it("redacts every implicit string conversion", () => {
    expect(String(bytes)).toBe("[redacted]");
    expect(JSON.stringify(bytes)).toBe('"[redacted]"');
    expect(inspect(bytes)).toBe("[redacted]");
  });

  it("holds a copy and reveals it only through an explicit callback", () => {
    const input = new Uint8Array([4, 5, 6]);
    const wrapped = new SecretBytes(input);
    input[0] = 0xff;
    expect(wrapped.length).toBe(3);
    expect(wrapped.use((value) => Array.from(value))).toEqual([4, 5, 6]);
  });
});

describe("SealAccountIdentity", () => {
  it("redacts inspect and string output but names the public address", () => {
    const account = identity();
    expect(inspect(account)).toBe(`SealAccountIdentity(${account.address}) [secrets redacted]`);
    expect(String(account)).toBe(`SealAccountIdentity(${account.address}) [secrets redacted]`);
    expect(inspect(account)).not.toContain("abandon");
  });

  it("serialises public data only", () => {
    const account = identity();
    const json = JSON.stringify(account);
    expect(json).not.toMatch(/abandon|about/);
    expect(json).not.toMatch(/mnemonic|seed|private|secret/i);
    expect(JSON.parse(json)).toEqual(account.toJSON());
    expect(Object.keys(account.toJSON()).sort()).toEqual(
      [
        "address",
        "addressHex",
        "algorithmIds",
        "chainId",
        "classicalKeyType",
        "classicalPublicKey",
        "hashes",
        "mlDsaPublicKey",
        "mlkemPublicKey",
        "x25519PublicKey",
      ].sort(),
    );
  });

  it("exposes the phrase only through useMnemonic", () => {
    const account = identity();
    expect(account.useMnemonic((value) => value)).toBe(TEST_MNEMONIC);
  });

  it("keeps the generated phrase redacted and out of the identity JSON", () => {
    const { identity: generated, mnemonic } = generateSealAccount({ chainId: TEST_CHAIN_ID });
    const phrase = mnemonic.use((value) => value);
    expect(inspect(mnemonic)).toBe("[redacted]");
    expect(JSON.stringify(generated)).not.toContain(phrase);
    expect(generated.address).toBe(
      SealAccountIdentity.fromMnemonic({ mnemonic: phrase, chainId: TEST_CHAIN_ID }).address,
    );
  });
});
