// Chain guard tests. Every provider here is a MOCK: no wallet, no network.
// The guard is the only thing under test; the real provider call is the
// owner's checklist step.

import { describe, expect, it, vi } from "vitest";
import { evaluateChainGuard, readChains } from "../src/wallet/chains.js";
import type { Eip1193Provider, QorexNativeProvider } from "../src/wallet/types.js";

const mockEvm = (answer: unknown | Error): Eip1193Provider => ({
  request: vi.fn(async () => {
    if (answer instanceof Error) throw answer;
    return answer;
  }),
});

const mockNative = (mode: "accept" | "reject" = "accept"): QorexNativeProvider => ({
  enable: vi.fn(async () => {
    if (mode === "reject") throw new Error("QoreX: wrong network");
  }),
});

const MOCK_READY = {
  nativeChainId: "qorechain-diana",
  evmChainId: "0x2648",
  nativeError: null,
  evmError: null,
} as const;

describe("chain guard (MOCK providers)", () => {
  it("is ready only when the EVM chain is 0x2648 and the native enable resolves", async () => {
    const reading = await readChains({
      native: mockNative("accept"),
      evm: mockEvm("0x2648"),
    });
    expect(reading).toEqual(MOCK_READY);
    expect(evaluateChainGuard(reading).status).toBe("ready");
  });

  it("reports a distinct wrong EVM chain and keeps the native reading", () => {
    const state = evaluateChainGuard({
      nativeChainId: "qorechain-diana",
      evmChainId: "0x1",
      nativeError: null,
      evmError: null,
    });
    expect(state.status).toBe("wrong-chain");
    if (state.status === "wrong-chain") {
      expect(state.reason).toBe("evm");
      expect(state.evmChainId).toBe("0x1");
      expect(state.nativeChainId).toBe("qorechain-diana");
    }
  });

  it("reports a distinct wrong native chain when enable rejects, even on EVM 0x2648", async () => {
    const reading = await readChains({
      native: mockNative("reject"),
      evm: mockEvm("0x2648"),
    });
    const state = evaluateChainGuard(reading);
    expect(state.status).toBe("wrong-chain");
    if (state.status === "wrong-chain") {
      expect(state.reason).toBe("native");
      expect(state.nativeChainId).toBeNull();
      expect(state.evmChainId).toBe("0x2648");
      expect(state.message).toContain("qorechain-diana");
    }
  });

  it("is not ready while the native side has not accepted Diana", () => {
    const state = evaluateChainGuard({
      nativeChainId: null,
      evmChainId: "0x2648",
      nativeError: "no native provider",
      evmError: null,
    });
    expect(state.status).toBe("wrong-chain");
  });

  it("is unavailable, not ready, when no EVM provider exists", () => {
    const state = evaluateChainGuard({
      nativeChainId: "qorechain-diana",
      evmChainId: null,
      nativeError: null,
      evmError: "No EVM provider was found over EIP-6963.",
    });
    expect(state.status).toBe("unavailable");
  });

  it("is unavailable when eth_chainId throws", async () => {
    const reading = await readChains({
      native: mockNative("accept"),
      evm: mockEvm(new Error("rpc down")),
    });
    const state = evaluateChainGuard(reading);
    expect(state.status).toBe("unavailable");
    if (state.status === "unavailable") expect(state.message).toContain("rpc down");
  });

  it("is unavailable when eth_chainId answers with a non-hex value", async () => {
    const reading = await readChains({
      native: mockNative("accept"),
      evm: mockEvm(9800),
    });
    expect(reading.evmChainId).toBeNull();
    expect(reading.evmError).toContain("not a hex chain id");
    expect(evaluateChainGuard(reading).status).toBe("unavailable");
  });

  it("lowercases the hex chain id before comparing", async () => {
    const reading = await readChains({
      native: mockNative("accept"),
      evm: mockEvm("0x2648"),
    });
    expect(reading.evmChainId).toBe("0x2648");
    expect(evaluateChainGuard(reading).status).toBe("ready");
  });
});
