import { describe, expect, it } from "vitest";
import { SealAccountIdentity } from "../src/identity.js";
import { TEST_CHAIN_ID, TEST_MNEMONIC, TEST_MNEMONIC_B } from "./fixtures.js";

const identity = (mnemonic: string): SealAccountIdentity =>
  SealAccountIdentity.fromMnemonic({ mnemonic, chainId: TEST_CHAIN_ID });

const PLAINTEXT = new TextEncoder().encode('{"kind":"loan-request","amount":"25","asset":"QOR"}');

describe("hybrid sealing to the account's own keys", () => {
  it("round-trips through seal and open", () => {
    const account = identity(TEST_MNEMONIC);
    const envelope = account.sealToSelf({
      purpose: "loanshark.request.v1",
      plaintext: PLAINTEXT,
      aad: new TextEncoder().encode("loan-1"),
    });

    expect(envelope).toBeInstanceOf(Uint8Array);
    expect(envelope.length).toBeGreaterThan(PLAINTEXT.length);

    const opened = account.openEnvelope({
      purpose: "loanshark.request.v1",
      envelope,
      aad: new TextEncoder().encode("loan-1"),
    });
    expect(opened).toEqual(PLAINTEXT);
  });

  it("is randomised: two envelopes for the same input differ", () => {
    const account = identity(TEST_MNEMONIC);
    const first = account.sealToSelf({ purpose: "loanshark.offer.v1", plaintext: PLAINTEXT });
    const second = account.sealToSelf({ purpose: "loanshark.offer.v1", plaintext: PLAINTEXT });
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(false);
  });

  it("seals an empty plaintext", () => {
    const account = identity(TEST_MNEMONIC);
    const envelope = account.sealToSelf({
      purpose: "loanshark.empty.v1",
      plaintext: new Uint8Array(0),
    });
    expect(account.openEnvelope({ purpose: "loanshark.empty.v1", envelope })).toEqual(
      new Uint8Array(0),
    );
  });

  it("refuses to open with a different account's keys", () => {
    const sender = identity(TEST_MNEMONIC);
    const other = identity(TEST_MNEMONIC_B);
    const envelope = sender.sealToSelf({ purpose: "loanshark.request.v1", plaintext: PLAINTEXT });

    expect(() => other.openEnvelope({ purpose: "loanshark.request.v1", envelope })).toThrow();
  });

  it("binds the purpose: a different purpose does not open", () => {
    const account = identity(TEST_MNEMONIC);
    const envelope = account.sealToSelf({ purpose: "loanshark.request.v1", plaintext: PLAINTEXT });

    expect(() => account.openEnvelope({ purpose: "loanshark.offer.v1", envelope })).toThrow();
  });

  it("binds the AAD: a missing or different AAD does not open", () => {
    const account = identity(TEST_MNEMONIC);
    const envelope = account.sealToSelf({
      purpose: "loanshark.request.v1",
      plaintext: PLAINTEXT,
      aad: new TextEncoder().encode("loan-1"),
    });

    expect(() => account.openEnvelope({ purpose: "loanshark.request.v1", envelope })).toThrow();
    expect(() =>
      account.openEnvelope({
        purpose: "loanshark.request.v1",
        envelope,
        aad: new TextEncoder().encode("loan-2"),
      }),
    ).toThrow();
  });

  it("refuses a tampered envelope", () => {
    const account = identity(TEST_MNEMONIC);
    const envelope = account.sealToSelf({ purpose: "loanshark.request.v1", plaintext: PLAINTEXT });
    const tampered = Uint8Array.from(envelope);
    const last = tampered.length - 1;
    tampered[last] = (tampered[last] ?? 0) ^ 0x01;

    expect(() =>
      account.openEnvelope({ purpose: "loanshark.request.v1", envelope: tampered }),
    ).toThrow();
  });

  it("validates its arguments before touching the cryptography", () => {
    const account = identity(TEST_MNEMONIC);

    expect(() => account.sealToSelf({ purpose: "", plaintext: PLAINTEXT })).toThrow(TypeError);
    expect(() =>
      account.sealToSelf({
        purpose: "loanshark.request.v1",
        plaintext: "not bytes" as unknown as Uint8Array,
      }),
    ).toThrow(TypeError);
    expect(() => account.openEnvelope({ purpose: "", envelope: new Uint8Array(1) })).toThrow(
      TypeError,
    );
    expect(() =>
      account.openEnvelope({
        purpose: "loanshark.request.v1",
        envelope: [] as unknown as Uint8Array,
      }),
    ).toThrow(TypeError);
  });
});
