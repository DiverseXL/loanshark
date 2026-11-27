// The ADR-0009 account guard. The provider here is a MOCK object named
// mockNative: it is not QoreX, no wallet is opened and no network call is made.
//
// The two addresses are the real ones from docs/evidence/phase-11a-result.md:
// qor1hklq... is the coin-60 account whose payload is the EVM address QoreX
// reported, and qor1385... is the coin-118 account, whose payload is not.

import { describe, expect, it, vi } from "vitest";
import type { ChainGuardState } from "../src/wallet/chains.js";
import type { AccountIdentity } from "../src/wallet/identity.js";
import { evaluateAccountIdentity, readEvmAccounts } from "../src/wallet/identity.js";
import { QorexMessageSigner } from "../src/wallet/signer.js";
import type { Eip1193Provider, QorexNativeProvider } from "../src/wallet/types.js";

const COIN60 = "qor1hklqwsqwncrmfc9m772mclkdfesz3zpv4eykrn";
const COIN118 = "qor1385wkhky3qkjwq47t8904xrd6s82lmkfjnxxsr";
const EVM = "0xBDbE07400e9E07B4E0BBf795bC7ecd4E6028882c";

const READY: ChainGuardState = {
  status: "ready",
  nativeChainId: "qorechain-diana",
  evmChainId: "0x2648",
};

const MATCHED: AccountIdentity = {
  status: "match",
  nativeAddress: COIN60,
  nativeEvmAddress: "0xbdbe07400e9e07b4e0bbf795bc7ecd4e6028882c",
  evmAddress: EVM,
};

describe("evaluateAccountIdentity", () => {
  it("matches the coin-60 account with the provider address, ignoring case", () => {
    const result = evaluateAccountIdentity({ nativeAddress: COIN60, evmAccounts: [EVM] });
    expect(result).toEqual(MATCHED);
  });

  it("reports ACCOUNT_MISMATCH for the coin-118 account and explains what to do", () => {
    const result = evaluateAccountIdentity({ nativeAddress: COIN118, evmAccounts: [EVM] });
    expect(result.status).toBe("account-mismatch");
    if (result.status !== "account-mismatch") throw new Error("expected a mismatch");
    expect(result.nativeEvmAddress).toBe("0x89e8eb5ec4882d2702be59cafa986dd40eafeec9");
    expect(result.evmAddress).toBe(EVM);
    expect(result.message).toContain("regardless of which account is active");
    expect(result.message).toContain("Ethereum (coin 60)");
  });

  it("does not compare when no EVM account was reported", () => {
    const result = evaluateAccountIdentity({ nativeAddress: COIN60, evmAccounts: [] });
    expect(result.status).toBe("unreadable");
    if (result.status !== "unreadable") throw new Error("expected an unreadable state");
    expect(result.message).toContain("blocked");
  });

  it("does not compare when no native account was read", () => {
    const result = evaluateAccountIdentity({ nativeAddress: null, evmAccounts: [EVM] });
    expect(result.status).toBe("unreadable");
  });

  it("treats an undecodable native address as unreadable, never as a match", () => {
    const result = evaluateAccountIdentity({
      nativeAddress: "cosmos1hklqwsqwncrmfc9m772mclkdfesz3zpv4eykrn",
      evmAccounts: [EVM],
    });
    expect(result.status).toBe("unreadable");
    if (result.status !== "unreadable") throw new Error("expected an unreadable state");
    expect(result.message).toContain("could not be decoded");
  });
});

describe("readEvmAccounts (MOCK provider)", () => {
  it("returns the accounts and no error", async () => {
    const provider: Eip1193Provider = {
      request: async () => [EVM],
    };
    const result = await readEvmAccounts(provider);
    expect(result).toEqual({ accounts: [EVM], error: null });
  });

  it("reports a provider failure instead of throwing", async () => {
    const provider: Eip1193Provider = {
      request: async () => {
        throw new Error("provider down");
      },
    };
    const result = await readEvmAccounts(provider);
    expect(result).toEqual({ accounts: null, error: "provider down" });
  });
});

const encoder = new TextEncoder();

function makeSigner(options: {
  native: QorexNativeProvider;
  identity: AccountIdentity;
}): QorexMessageSigner {
  return new QorexMessageSigner({
    native: options.native,
    address: COIN118,
    nativeChainId: "qorechain-diana",
    guard: async () => READY,
    accountIdentity: async () => options.identity,
    authorize: async () => true,
  });
}

describe("ACCOUNT_MISMATCH blocks signing (MOCK provider)", () => {
  it("does not reach signArbitrary when the account mismatches", async () => {
    const signArbitrary = vi.fn(async () => ({ signatureType: "ml-dsa-87-hybrid" }));
    const signer = makeSigner({
      native: { enable: async () => undefined, signArbitrary },
      identity: {
        status: "account-mismatch",
        nativeAddress: COIN118,
        nativeEvmAddress: "0x89e8eb5ec4882d2702be59cafa986dd40eafeec9",
        evmAddress: EVM,
        message: "ACCOUNT_MISMATCH: switch to the Ethereum (coin 60) account.",
      },
    });

    const result = await signer.requestSignature(
      encoder.encode("LOANSHARK test message, no funds"),
    );

    expect(signArbitrary).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, code: "account-mismatch" });
  });

  it("signs when the account matches", async () => {
    const signArbitrary = vi.fn(async () => ({ signatureType: "ml-dsa-87-hybrid" }));
    const signer = makeSigner({
      native: { enable: async () => undefined, signArbitrary },
      identity: MATCHED,
    });

    const result = await signer.requestSignature(
      encoder.encode("LOANSHARK test message, no funds"),
    );

    expect(signArbitrary).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
  });

  it("fails closed when the identity check itself throws", async () => {
    const signArbitrary = vi.fn(async () => ({}));
    const signer = new QorexMessageSigner({
      native: { enable: async () => undefined, signArbitrary },
      address: COIN60,
      nativeChainId: "qorechain-diana",
      guard: async () => READY,
      accountIdentity: async () => {
        throw new Error("eth_accounts unavailable");
      },
      authorize: async () => true,
    });

    const result = await signer.requestSignature(encoder.encode("message"));

    expect(signArbitrary).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, code: "account-mismatch" });
  });
});
