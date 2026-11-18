// Deploy flow tests with a MOCK EIP-1193 provider. No socket, no wallet, no
// chain. They assert the rules that matter before the owner runs the real panel:
// no send without a call, the guard blocks first, a rejection is not retried,
// the next step stays disabled until a receipt confirms, and a reverted receipt
// is a failure.

import { describe, expect, it } from "vitest";
import { canRunStep, createDeployFlow, evidenceJson, rawError } from "../src/deploy/flow.js";
import {
  addressFromWord,
  encodeAddress,
  encodeUint256,
  MINT_AMOUNT_BASE_UNITS,
  MINT_SELECTOR,
  mintData,
  settlementDeployData,
  testUsdDeployData,
} from "../src/deploy/encoding.js";
import { FUSD_ADDRESS, manifest } from "../src/deploy/manifest.js";
import type { ChainGuardState } from "../src/wallet/chains.js";
import type { Eip1193Provider } from "../src/wallet/types.js";

const ACCOUNT = "0xd0a1453c7b8157aa0635076c33b3e24a50a923c5";
const TESTUSD = "0x1111111111111111111111111111111111111111";
const LOAN = "0x2222222222222222222222222222222222222222";
const HASH_A = `0x${"a".repeat(64)}` as const;
const HASH_B = `0x${"b".repeat(64)}` as const;
const HASH_C = `0x${"c".repeat(64)}` as const;
const HASH_D = `0x${"d".repeat(64)}` as const;

const READY: ChainGuardState = {
  status: "ready",
  nativeChainId: "qorechain-diana",
  evmChainId: "0x2648",
};
const WRONG: ChainGuardState = {
  status: "wrong-chain",
  reason: "evm",
  nativeChainId: "qorechain-diana",
  evmChainId: "0x1",
  message: "The EVM provider is on 0x1; this page requires 0x2648 (9800).",
};

const readyGuard = async (): Promise<ChainGuardState> => READY;
const wrongGuard = async (): Promise<ChainGuardState> => WRONG;

interface Call {
  readonly method: string;
  readonly params: unknown;
}

class MockProvider implements Eip1193Provider {
  readonly calls: Call[] = [];
  private readonly handlers: Record<string, (params: unknown) => unknown>;

  constructor(handlers: Record<string, (params: unknown) => unknown>) {
    this.handlers = handlers;
  }

  async request(args: { method: string; params?: unknown[] }): Promise<unknown> {
    this.calls.push({ method: args.method, params: args.params });
    const handler = this.handlers[args.method];
    if (handler === undefined) throw new Error(`Unexpected MOCK method ${args.method}`);
    return handler(args.params);
  }

  count(method: string): number {
    return this.calls.filter((call) => call.method === method).length;
  }
}

// A small factory with an explicit receipt sequence.
const makeProvider = (
  receipts: Array<Record<string, unknown> | null>,
  sendHashes: string[] = [HASH_A],
): MockProvider => {
  let sendIndex = 0;
  return new MockProvider({
    eth_accounts: () => [ACCOUNT],
    eth_estimateGas: () => "0x5208",
    eth_sendTransaction: () => sendHashes[sendIndex++] ?? HASH_A,
    eth_getTransactionReceipt: () => receipts.shift() ?? null,
    eth_call: () => `0x${"0".repeat(24)}${ACCOUNT.slice(2)}`,
  });
};

const noSleep = async (): Promise<void> => {};

describe("transaction data encoding", () => {
  it("encodes addresses and uint256 as 32-byte words", () => {
    expect(encodeAddress("0x0000000000000000000000000000000000000001")).toBe(`${"0".repeat(63)}1`);
    expect(encodeAddress(ACCOUNT)).toBe(`${"0".repeat(24)}${ACCOUNT.slice(2)}`);
    expect(encodeUint256(0n)).toBe("0".repeat(64));
    expect(encodeUint256(255n)).toBe(`${"0".repeat(62)}ff`);
    expect(encodeUint256(MINT_AMOUNT_BASE_UNITS)).toBe(
      MINT_AMOUNT_BASE_UNITS.toString(16).padStart(64, "0"),
    );
    expect(() => encodeAddress("0x1234")).toThrow();
    expect(() => encodeUint256(-1n)).toThrow();
  });

  it("builds creation data from the manifest plus constructor words", () => {
    const testUsd = testUsdDeployData(ACCOUNT);
    expect(testUsd.startsWith(manifest.contracts.TestUSD.creationBytecode)).toBe(true);
    expect(testUsd.endsWith(encodeAddress(ACCOUNT))).toBe(true);

    const settlement = settlementDeployData(TESTUSD, FUSD_ADDRESS);
    expect(settlement.startsWith(manifest.contracts.LoanSettlement.creationBytecode)).toBe(true);
    expect(settlement.endsWith(`${encodeAddress(TESTUSD)}${encodeAddress(FUSD_ADDRESS)}`)).toBe(
      true,
    );
  });

  it("pins the mint selector and its amount and recipient", () => {
    expect(MINT_SELECTOR).toBe("0x40c10f19");
    const data = mintData(ACCOUNT, MINT_AMOUNT_BASE_UNITS);
    expect(data.startsWith("0x40c10f19")).toBe(true);
    expect(data.slice(10)).toBe(
      `${encodeAddress(ACCOUNT)}${encodeUint256(MINT_AMOUNT_BASE_UNITS)}`,
    );
    expect(MINT_AMOUNT_BASE_UNITS).toBe(1_000_000_000n);
  });

  it("reads the owner from an address word and refuses a short one", () => {
    expect(addressFromWord(`0x${"0".repeat(24)}${ACCOUNT.slice(2)}`)).toBe(ACCOUNT);
    expect(addressFromWord("0x1234")).toBeNull();
  });
});

describe("deploy flow with a MOCK provider", () => {
  it("sends nothing without a call, even after a read-only refresh", async () => {
    const provider = makeProvider([]);
    const flow = createDeployFlow({
      provider,
      guard: readyGuard,
      pollIntervalMs: 0,
      sleep: noSleep,
    });
    expect(provider.calls).toEqual([]);

    await flow.refresh();
    expect(provider.count("eth_estimateGas")).toBe(0);
    expect(provider.count("eth_sendTransaction")).toBe(0);
    expect(provider.count("eth_getTransactionReceipt")).toBe(0);
    expect(flow.getState().account).toBe(ACCOUNT);
  });

  it("blocks every send on the wrong chain, before estimate or send", async () => {
    const provider = makeProvider([]);
    const flow = createDeployFlow({
      provider,
      guard: wrongGuard,
      pollIntervalMs: 0,
      sleep: noSleep,
    });

    await flow.runStep("lane");

    expect(provider.calls).toEqual([]);
    expect(flow.getState().steps.lane.status).toBe("blocked");
    expect(flow.getState().steps.lane.error).toContain("0x2648");
    expect(canRunStep(flow.getState(), "testusd")).toBe(false);
  });

  it("shows the exact rejection and does not retry it", async () => {
    let sends = 0;
    const provider = new MockProvider({
      eth_accounts: () => [ACCOUNT],
      eth_estimateGas: () => "0x5208",
      eth_sendTransaction: () => {
        sends += 1;
        throw {
          code: 4001,
          message:
            "Request rejected: the EVM authorization window is closed. Open the window in QoreX and try again.",
        };
      },
    });
    const flow = createDeployFlow({
      provider,
      guard: readyGuard,
      pollIntervalMs: 0,
      sleep: noSleep,
    });

    await flow.runStep("lane");

    expect(sends).toBe(1);
    expect(provider.count("eth_sendTransaction")).toBe(1);
    expect(provider.count("eth_getTransactionReceipt")).toBe(0);
    const record = flow.getState().steps.lane;
    expect(record.status).toBe("failed");
    expect(record.error).toContain("the EVM authorization window is closed");
    expect(record.error).toContain("4001");
    expect(record.note).toContain("not retried");
  });

  it("shows a reverted receipt as failed and keeps the next step disabled", async () => {
    const provider = makeProvider([{ status: "0x0", blockNumber: "0x20", contractAddress: null }]);
    const flow = createDeployFlow({
      provider,
      guard: readyGuard,
      pollIntervalMs: 0,
      sleep: noSleep,
    });

    await flow.runStep("lane");

    const record = flow.getState().steps.lane;
    expect(record.status).toBe("reverted");
    expect(record.receiptStatus).toBe("0x0");
    expect(record.blockNumber).toBe("0x20");
    expect(record.note).toContain("not a success");
    expect(canRunStep(flow.getState(), "testusd")).toBe(false);
  });

  it("keeps polling a pending receipt, then shows a visible timeout and never success", async () => {
    const provider = makeProvider([null, null, null]);
    const flow = createDeployFlow({
      provider,
      guard: readyGuard,
      pollAttempts: 3,
      pollIntervalMs: 0,
      sleep: noSleep,
    });

    await flow.runStep("lane");

    const record = flow.getState().steps.lane;
    expect(provider.count("eth_getTransactionReceipt")).toBe(3);
    expect(provider.count("eth_sendTransaction")).toBe(1);
    expect(record.status).toBe("timeout");
    expect(record.txHash).toBe(HASH_A);
    expect(record.note).toContain("NOT confirmed");
    expect(canRunStep(flow.getState(), "testusd")).toBe(false);
  });

  it("unlocks the next step only after a confirmed receipt", async () => {
    const provider = makeProvider([{ status: "0x1", blockNumber: "0x21", contractAddress: null }]);
    const flow = createDeployFlow({
      provider,
      guard: readyGuard,
      pollIntervalMs: 0,
      sleep: noSleep,
    });

    await flow.runStep("lane");
    expect(flow.getState().steps.lane.status).toBe("confirmed");
    expect(canRunStep(flow.getState(), "testusd")).toBe(true);

    const evidence = evidenceJson(flow.getState());
    expect(evidence.transactions[0]?.txHash).toBe(HASH_A);
    expect(evidence.transactions[0]?.blockNumber).toBe("0x21");
    expect(evidence.transactions[0]?.receiptStatus).toBe("0x1");
  });

  it("runs the full sequence with the manifest data and the two-token constructor", async () => {
    const provider = makeProvider(
      [
        { status: "0x1", blockNumber: "0x1", contractAddress: null },
        { status: "0x1", blockNumber: "0x2", contractAddress: TESTUSD },
        { status: "0x1", blockNumber: "0x3", contractAddress: LOAN },
        { status: "0x1", blockNumber: "0x4", contractAddress: null },
      ],
      [HASH_A, HASH_B, HASH_C, HASH_D],
    );
    const flow = createDeployFlow({
      provider,
      guard: readyGuard,
      pollIntervalMs: 0,
      sleep: noSleep,
    });

    await flow.runStep("lane");
    await flow.runStep("testusd");
    await flow.refreshOwner();
    await flow.runStep("settlement");
    await flow.runStep("mint");

    const state = flow.getState();
    expect(state.steps.lane.status).toBe("confirmed");
    expect(state.steps.testusd.status).toBe("confirmed");
    expect(state.steps.testusd.contractAddress).toBe(TESTUSD);
    expect(state.steps.settlement.status).toBe("confirmed");
    expect(state.steps.settlement.contractAddress).toBe(LOAN);
    expect(state.steps.mint.status).toBe("confirmed");
    expect(state.owner).toBe(ACCOUNT);
    expect(state.ownerMatches).toBe(true);

    const sent = provider.calls.filter((call) => call.method === "eth_sendTransaction");
    expect(sent).toHaveLength(4);
    const settlementTx = sent[2]?.params as Array<Record<string, string>>;
    expect(settlementTx[0]?.["data"]).toBe(settlementDeployData(TESTUSD, FUSD_ADDRESS));
    const mintTx = sent[3]?.params as Array<Record<string, string>>;
    expect(mintTx[0]?.["to"]).toBe(TESTUSD);
    expect(mintTx[0]?.["data"]).toBe(mintData(ACCOUNT, MINT_AMOUNT_BASE_UNITS));

    const evidence = evidenceJson(state);
    expect(evidence.deployed).toEqual({ testUsd: TESTUSD, loanSettlement: LOAN });
    expect(evidence.fusd).toBe(FUSD_ADDRESS);
    expect(evidence.transactions.map((tx) => tx.receiptStatus)).toEqual([
      "0x1",
      "0x1",
      "0x1",
      "0x1",
    ]);
  });

  it("serialises an Error with its code and message without paraphrasing", () => {
    const error = Object.assign(new Error("authorization window not open"), { code: 4001 });
    const text = rawError(error);
    expect(text).toContain("authorization window not open");
    expect(text).toContain("4001");
  });
});
