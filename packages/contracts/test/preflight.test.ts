import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { PreflightConfig, PreflightPlan, Terms } from "@loanshark/preflight";
import { MAX_UINT256, preflight, REVERT_ERRORS_ABI } from "@loanshark/preflight";
import { network } from "hardhat";
import { toFunctionSelector } from "viem";
import { deployWorld, nextSalt, ONE_USD } from "./support.js";

// REAL: the preflight runs against the in-process Hardhat network, the compiled
// LoanSettlement and the real TestUSD. The JSON-RPC function is a thin adapter
// over the network's public client; nothing is mocked.
//
// No transaction leaves this process: the in-process EVM is the same one every
// contract test in this package uses.

const artifacts = JSON.parse(
  readFileSync(
    join(
      import.meta.dirname,
      "..",
      "artifacts",
      "contracts",
      "LoanSettlement.sol",
      "LoanSettlement.json",
    ),
    "utf8",
  ),
) as { abi: Array<{ type: string; name?: string; inputs?: Array<{ type: string }> }> };

const errorSignatures = artifacts.abi
  .filter((item) => item.type === "error")
  .map((item) => `${item.name}(${(item.inputs ?? []).map((input) => input.type).join(",")})`);

describe("preflight against the in-process network", async () => {
  const net = await network.create();
  const world = await deployWorld(net);
  const client = await net.viem.getPublicClient();
  const chainId = await client.getChainId();
  const now = await net.networkHelpers.time.latest();

  const request = async (method: string, params: unknown[]): Promise<unknown> => {
    try {
      return await client.request({ method, params } as never);
    } catch (error) {
      const err = error as {
        shortMessage?: string;
        message?: string;
        data?: unknown;
        cause?: { data?: unknown; details?: string };
      };
      const candidates: unknown[] = [err.data, err.cause?.data];
      const nested =
        typeof err.data === "object" && err.data !== null && "data" in err.data
          ? (err.data as { data?: unknown }).data
          : undefined;
      candidates.push(nested);
      const hex = candidates.find(
        (value): value is string => typeof value === "string" && /^0x[0-9a-fA-F]{8,}$/.test(value),
      );
      throw new Error(
        `${err.shortMessage ?? err.message ?? "rpc failed"}${
          typeof hex === "string" ? ` revert data ${hex}` : ""
        }`,
      );
    }
  };

  const config: PreflightConfig = {
    expectedChainId: chainId,
    settlementAddress: world.settlement.address,
    allowedTokens: [world.token.address, world.fusd.address],
  };

  const termsFor = (overrides: Partial<Terms> = {}): Terms => ({
    borrower: world.borrower.account.address,
    lender: world.lender.account.address,
    token: world.token.address,
    principal: 10n * ONE_USD,
    interest: ONE_USD,
    dueDate: BigInt(now) + 90n * 86_400n,
    graceSeconds: 259_200n,
    fundingDeadline: BigInt(now) + 30n * 86_400n,
    claimDeadline: BigInt(now) + 60n * 86_400n,
    salt: nextSalt(),
    ...overrides,
  });

  const run = (plan: PreflightPlan, overrides: Partial<PreflightConfig> = {}) =>
    preflight(plan, { ...config, ...overrides }, { request, timeoutMs: 5_000 });

  const statusOf = (result: Awaited<ReturnType<typeof run>>, id: string) =>
    result.checks.find((check) => check.id === id)?.status;

  it("keeps the preflight error ABI in step with the compiled contract", () => {
    const ours = new Set(
      REVERT_ERRORS_ABI.filter((item) => item.type === "error").map((item) =>
        toFunctionSelector(
          `function ${item.name}(${item.inputs.map((input) => input.type).join(",")})`,
        ),
      ),
    );
    for (const signature of errorSignatures) {
      const selector = toFunctionSelector(`function ${signature}`);
      assert.ok(ours.has(selector), `preflight cannot decode ${signature} (selector ${selector})`);
    }
  });

  it("reports ready for propose, then refuses a second proposal", async () => {
    const terms = termsFor();
    const plan: PreflightPlan = {
      action: "propose",
      chainId,
      from: world.borrower.account.address,
      settlement: world.settlement.address,
      token: terms.token,
      amount: terms.principal,
      terms,
    };
    const loanId = (await world.settlement.read.commitmentOf([terms])) as `0x${string}`;
    const ready = await run({ ...plan, loanId });
    assert.equal(ready.status, "ready", JSON.stringify(ready.checks));
    assert.equal(ready.tokenDecimals, 6);
    assert.ok(ready.estimatedGas !== undefined && ready.estimatedGas > 0n);
    assert.ok(ready.publicFields.length > 0);

    await world.settlement.write.proposeLoan([terms], {
      account: world.borrower.account,
    });
    const again = await run({ ...plan, loanId });
    assert.equal(again.status, "blocked");
    assert.equal(statusOf(again, "loan-state"), "fail");
  });

  it("blocks fund without funds, then reports ready once funded and approved", async () => {
    // A fresh token and settlement with no balances and no allowances: the
    // shared fixture pre-funds and pre-approves every account, so it cannot show
    // the negative cases.
    const token = await net.viem.deployContract("TestUSD", [world.owner.account.address]);
    const settlement = await net.viem.deployContract("LoanSettlement", [
      token.address,
      world.fusd.address,
    ]);
    const isolated: PreflightConfig = {
      ...config,
      settlementAddress: settlement.address,
      allowedTokens: [token.address, world.fusd.address],
    };
    const terms = termsFor({ token: token.address });
    await settlement.write.proposeLoan([terms], { account: world.borrower.account });
    const loanId = (await settlement.read.commitmentOf([terms])) as `0x${string}`;
    const plan: PreflightPlan = {
      action: "fund",
      chainId,
      from: world.lender.account.address,
      settlement: settlement.address,
      token: token.address,
      amount: terms.principal,
      loanId,
    };
    const isolatedRun = (next: PreflightPlan) =>
      preflight(next, isolated, { request, timeoutMs: 5_000 });

    const broke = await isolatedRun(plan);
    assert.equal(broke.status, "blocked");
    assert.equal(statusOf(broke, "token-balance"), "fail");
    assert.equal(statusOf(broke, "allowance"), "fail");
    assert.equal(statusOf(broke, "loan-state"), "pass");
    assert.equal(statusOf(broke, "caller-role"), "pass");

    await token.write.mint([world.lender.account.address, 100n * ONE_USD]);
    await token.write.approve([settlement.address, terms.principal], {
      account: world.lender.account,
    });
    const ready = await isolatedRun(plan);
    assert.equal(ready.status, "ready");

    const wrongCaller = await isolatedRun({ ...plan, from: world.outsider.account.address });
    assert.equal(wrongCaller.status, "blocked");
    assert.equal(statusOf(wrongCaller, "caller-role"), "fail");

    const wrongToken = await isolatedRun({
      ...plan,
      token: "0x0000000000000000000000000000000000000001",
      amount: 1n,
    });
    assert.equal(wrongToken.status, "blocked");
    assert.equal(statusOf(wrongToken, "token-allowlisted"), "fail");

    await settlement.write.fund([loanId], { account: world.lender.account });
  });

  it("blocks claim before funding, and reports ready for the borrower while Funded", async () => {
    const terms = termsFor();
    await world.settlement.write.proposeLoan([terms], { account: world.borrower.account });
    const loanId = (await world.settlement.read.commitmentOf([terms])) as `0x${string}`;
    const plan: PreflightPlan = {
      action: "claim",
      chainId,
      from: world.borrower.account.address,
      settlement: world.settlement.address,
      token: world.token.address,
      amount: terms.principal,
      loanId,
    };
    const beforeFunding = await run(plan);
    assert.equal(beforeFunding.status, "blocked");
    assert.equal(statusOf(beforeFunding, "loan-state"), "fail");

    await world.token.write.mint([world.lender.account.address, 100n * ONE_USD]);
    await world.token.write.approve([world.settlement.address, terms.principal], {
      account: world.lender.account,
    });
    await world.settlement.write.fund([loanId], { account: world.lender.account });

    const ready = await run(plan);
    assert.equal(ready.status, "ready");

    const wrongCaller = await run({ ...plan, from: world.lender.account.address });
    assert.equal(wrongCaller.status, "blocked");
    assert.equal(statusOf(wrongCaller, "caller-role"), "fail");

    await world.settlement.write.claim([loanId], { account: world.borrower.account });
  });

  it("reports ready for repay within the outstanding and blocks an overpayment", async () => {
    const terms = termsFor();
    await world.settlement.write.proposeLoan([terms], { account: world.borrower.account });
    const loanId = (await world.settlement.read.commitmentOf([terms])) as `0x${string}`;
    await world.token.write.mint([world.lender.account.address, 100n * ONE_USD]);
    await world.token.write.approve([world.settlement.address, terms.principal], {
      account: world.lender.account,
    });
    await world.settlement.write.fund([loanId], { account: world.lender.account });
    await world.settlement.write.claim([loanId], { account: world.borrower.account });

    await world.token.write.mint([world.borrower.account.address, 100n * ONE_USD]);
    await world.token.write.approve([world.settlement.address, MAX_UINT256], {
      account: world.borrower.account,
    });

    const plan: PreflightPlan = {
      action: "repay",
      chainId,
      from: world.borrower.account.address,
      settlement: world.settlement.address,
      token: world.token.address,
      amount: ONE_USD,
      loanId,
    };
    const ready = await run(plan);
    assert.equal(ready.status, "ready");

    const overpay = await run({ ...plan, amount: 100n * ONE_USD });
    assert.equal(overpay.status, "blocked");
    assert.equal(statusOf(overpay, "repay-amount"), "fail");
    assert.equal(statusOf(overpay, "simulation"), "fail");

    await world.settlement.write.repay([loanId, ONE_USD], {
      account: world.borrower.account,
    });

    // The lender now has credit to withdraw.
    const withdraw: PreflightPlan = {
      action: "withdraw",
      chainId,
      from: world.lender.account.address,
      settlement: world.settlement.address,
      token: world.token.address,
      amount: 0n,
      loanId,
    };
    assert.equal((await run(withdraw)).status, "ready");
    const outsiderWithdraw = await run({ ...withdraw, from: world.outsider.account.address });
    assert.equal(outsiderWithdraw.status, "blocked");
    assert.equal(statusOf(outsiderWithdraw, "caller-role"), "fail");
  });

  it("blocks cancel and refund in the wrong state and with the wrong caller", async () => {
    const terms = termsFor();
    await world.settlement.write.proposeLoan([terms], { account: world.borrower.account });
    const loanId = (await world.settlement.read.commitmentOf([terms])) as `0x${string}`;
    const base: PreflightPlan = {
      action: "cancel",
      chainId,
      from: world.borrower.account.address,
      settlement: world.settlement.address,
      token: world.token.address,
      amount: 0n,
      loanId,
    };
    assert.equal((await run(base)).status, "ready");
    const wrongCaller = await run({ ...base, from: world.lender.account.address });
    assert.equal(wrongCaller.status, "blocked");

    await world.token.write.mint([world.lender.account.address, 100n * ONE_USD]);
    await world.token.write.approve([world.settlement.address, terms.principal], {
      account: world.lender.account,
    });
    await world.settlement.write.fund([loanId], { account: world.lender.account });

    const cancelFunded = await run(base);
    assert.equal(cancelFunded.status, "blocked");
    assert.equal(statusOf(cancelFunded, "loan-state"), "fail");

    const refund: PreflightPlan = { ...base, action: "refund", from: world.lender.account.address };
    const early = await run(refund);
    assert.equal(early.status, "blocked");
    assert.equal(statusOf(early, "simulation"), "fail");
  });

  it("flags an unlimited approval and accepts the exact amount", async () => {
    const plan: PreflightPlan = {
      action: "approve",
      chainId,
      from: world.borrower.account.address,
      settlement: world.settlement.address,
      token: world.token.address,
      amount: 10n * ONE_USD,
    };
    const ready = await run(plan);
    assert.equal(ready.status, "ready");

    const unlimited = await run({ ...plan, amount: MAX_UINT256 });
    assert.equal(unlimited.status, "blocked");
    assert.equal(statusOf(unlimited, "allowance"), "fail");
  });

  it("blocks on a wrong chain id in the config or the plan", async () => {
    const plan: PreflightPlan = {
      action: "approve",
      chainId,
      from: world.borrower.account.address,
      settlement: world.settlement.address,
      token: world.token.address,
      amount: ONE_USD,
    };
    const wrongConfig = await run(plan, { expectedChainId: 1 });
    assert.equal(wrongConfig.status, "blocked");
    assert.equal(statusOf(wrongConfig, "chain-id"), "fail");

    const wrongPlan = await run({ ...plan, chainId: 1 });
    assert.equal(wrongPlan.status, "blocked");
    assert.equal(statusOf(wrongPlan, "chain-id"), "fail");
  });

  it("blocks when the settlement address has no code", async () => {
    const plan: PreflightPlan = {
      action: "approve",
      chainId,
      from: world.borrower.account.address,
      settlement: "0x000000000000000000000000000000000000dEaD",
      token: world.token.address,
      amount: ONE_USD,
    };
    const result = await preflight(
      plan,
      { ...config, settlementAddress: plan.settlement },
      { request, timeoutMs: 5_000 },
    );
    assert.equal(result.status, "blocked");
    assert.equal(statusOf(result, "settlement-code"), "fail");
  });
});
