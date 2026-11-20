import { describe, expect, it } from "vitest";
import { preflight } from "../src/preflight.js";
import type { PreflightConfig, PreflightPlan } from "../src/types.js";

// MOCK: the JSON-RPC function is a stand-in. These tests prove the fail-closed
// behaviour of every check; the real contract behaviour is tested in Hardhat in
// packages/contracts/test/preflight.test.ts.

const PLAN: PreflightPlan = {
  action: "fund",
  chainId: 9800,
  from: "0x2222222222222222222222222222222222222222",
  settlement: "0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD",
  token: "0x3333333333333333333333333333333333333333",
  amount: 1_000_000n,
  loanId: `0x${"11".repeat(32)}`,
};

const CONFIG: PreflightConfig = {
  expectedChainId: 9800,
  settlementAddress: "0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD",
  allowedTokens: ["0x3333333333333333333333333333333333333333"],
};

describe("preflight fails closed (MOCK RPC)", () => {
  it("is unknown, never ready, when every call fails", async () => {
    const result = await preflight(PLAN, CONFIG, {
      request: async () => {
        throw new Error("socket hang up");
      },
    });
    expect(result.status).toBe("unknown");
    expect(result.checks.every((check) => check.status === "unknown")).toBe(true);
    expect(result.checks.map((check) => check.id)).toContain("chain-id");
    expect(result.status).not.toBe("ready");
  });

  it("is unknown when a call hangs past the timeout", async () => {
    const result = await preflight(PLAN, CONFIG, {
      timeoutMs: 10,
      request: () => new Promise(() => {}),
    });
    expect(result.status).toBe("unknown");
    expect(result.checks[0]?.explanation).toContain("timed out");
  });

  it("is unknown when a response is malformed", async () => {
    const result = await preflight(PLAN, CONFIG, {
      request: async (method) => (method === "eth_chainId" ? "0x2648" : { not: "hex" }),
    });
    expect(result.status).toBe("unknown");
    expect(result.checks.find((check) => check.id === "chain-id")?.status).toBe("pass");
    expect(result.checks.find((check) => check.id === "settlement-code")?.status).toBe("unknown");
  });

  it("is blocked, not unknown, on a wrong chain", async () => {
    const result = await preflight(PLAN, CONFIG, {
      request: async (method) => (method === "eth_chainId" ? "0x1" : "0x"),
    });
    expect(result.status).toBe("blocked");
    expect(result.checks.find((check) => check.id === "chain-id")?.status).toBe("fail");
  });

  it("is blocked before any RPC when the settlement address differs", async () => {
    const result = await preflight(
      { ...PLAN, settlement: "0x1111111111111111111111111111111111111111" },
      CONFIG,
      {
        request: async (method) => (method === "eth_chainId" ? "0x2648" : "0x"),
      },
    );
    expect(result.status).toBe("blocked");
    expect(result.checks.find((check) => check.id === "settlement-address")?.status).toBe("fail");
  });

  it("never reports ready while any check is unknown", async () => {
    const result = await preflight(PLAN, CONFIG, {
      request: async (method) => {
        if (method === "eth_chainId") return "0x2648";
        if (method === "eth_getCode") return "0x6080";
        if (method === "eth_estimateGas") throw new Error("gas estimation unavailable");
        return "0x";
      },
    });
    expect(result.status).not.toBe("ready");
    expect(result.status).toBe("unknown");
    expect(result.checks.find((check) => check.id === "gas-estimate")?.status).toBe("unknown");
  });
});
