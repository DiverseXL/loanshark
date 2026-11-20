import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { commitmentOf } from "@loanshark/agreement";
import type { Terms } from "@loanshark/agreement";

// REAL: the Solidity view function and the TypeScript implementation both run,
// against each other, on the in-process Hardhat network.
//
// The frozen vectors are generated for chain 9800 and a TEST ONLY address, so
// they anchor the TypeScript implementation only. This test compares the two
// implementations at the deployment's own chain id and address, which is the
// pair the contract actually uses.

const TERMS: Terms = {
  borrower: "0x1111111111111111111111111111111111111111",
  lender: "0x2222222222222222222222222222222222222222",
  token: "0x3333333333333333333333333333333333333333",
  principal: 1_000_000n,
  interest: 50_000n,
  dueDate: 1_800_000_000n,
  graceSeconds: 259_200n,
  fundingDeadline: 1_790_000_000n,
  claimDeadline: 1_795_000_000n,
  salt: `0x${"aa".repeat(32)}`,
};

describe("Solidity and TypeScript commitment", async function () {
  const net = await network.create();
  // These are view-only tests; the two constructor addresses only satisfy the
  // non-zero, distinct rule and are never called.
  const tokenA = await net.viem.deployContract("MockDecimals18");
  const tokenB = await net.viem.deployContract("MockDecimals18");
  const settlement = await net.viem.deployContract("LoanSettlement", [
    tokenA.address,
    tokenB.address,
  ]);
  const publicClient = await net.viem.getPublicClient();
  const chainId = BigInt(await publicClient.getChainId());
  const domain = { chainId, verifyingContract: settlement.address };

  it("agrees for the test deployment's chain id and address", async function () {
    assert.equal(await settlement.read.commitmentOf([TERMS]), commitmentOf(TERMS, domain));
  });

  it("is not the terms-only hash, so the domain is part of the preimage", async function () {
    const zeroDomain = {
      chainId: 0n,
      verifyingContract: "0x0000000000000000000000000000000000000000" as const,
    };
    assert.notEqual(await settlement.read.commitmentOf([TERMS]), commitmentOf(TERMS, zeroDomain));
  });

  it("changes when any one of the ten terms changes", async function () {
    const base = await settlement.read.commitmentOf([TERMS]);
    const changed = [
      { ...TERMS, borrower: "0x9999999999999999999999999999999999999999" as const },
      { ...TERMS, lender: "0x8888888888888888888888888888888888888888" as const },
      { ...TERMS, token: "0x7777777777777777777777777777777777777777" as const },
      { ...TERMS, principal: TERMS.principal + 1n },
      { ...TERMS, interest: TERMS.interest + 1n },
      { ...TERMS, dueDate: TERMS.dueDate + 1n },
      { ...TERMS, graceSeconds: TERMS.graceSeconds + 1n },
      { ...TERMS, fundingDeadline: TERMS.fundingDeadline + 1n },
      { ...TERMS, claimDeadline: TERMS.claimDeadline + 1n },
      { ...TERMS, salt: `0x${"ab".repeat(32)}` as const },
    ];
    for (const [index, terms] of changed.entries()) {
      const next = await settlement.read.commitmentOf([terms]);
      assert.notEqual(next, base, `term ${index} did not change the commitment`);
      assert.equal(next, commitmentOf(terms, domain), `term ${index} disagrees with TypeScript`);
    }
  });

  it("differs between two deployments with the same terms", async function () {
    const other = await net.viem.deployContract("LoanSettlement", [tokenA.address, tokenB.address]);
    assert.notEqual(
      await settlement.read.commitmentOf([TERMS]),
      await other.read.commitmentOf([TERMS]),
    );
  });
});
