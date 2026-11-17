import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { maxUint256 } from "viem";
import { deployWorld, makeTerms, now, ONE_USD } from "./support.js";

describe("LoanSettlement adversarial tokens", async function () {
  const net = await network.create();

  it("settles normally with a USDT-style token that returns no value", async function () {
    const clients = await net.viem.getWalletClients();
    const borrower = clients[1]!;
    const lender = clients[2]!;
    const token = await net.viem.deployContract("MockNoReturnToken");
    const settlement = await net.viem.deployContract("LoanSettlement", [[token.address]]);

    await token.write.mint([borrower.account.address, 10_000n * ONE_USD]);
    await token.write.mint([lender.account.address, 10_000n * ONE_USD]);
    await token.write.approve([settlement.address, maxUint256], { account: borrower.account });
    await token.write.approve([settlement.address, maxUint256], { account: lender.account });

    const terms = makeTerms({ borrower, lender, token: token.address, now: await now(net) });
    const loanId = await settlement.read.commitmentOf([terms]);
    await settlement.write.proposeLoan([terms], { account: borrower.account });
    await settlement.write.fund([loanId], { account: lender.account });
    await settlement.write.claim([loanId], { account: borrower.account });
    await settlement.write.repay([loanId, 1_050n * ONE_USD], { account: borrower.account });
    await settlement.write.withdraw([loanId], { account: lender.account });

    assert.equal(await settlement.read.stateOf([loanId]), 5); // Repaid
    assert.equal(await token.read.balanceOf([settlement.address]), 0n);
    assert.equal(await token.read.balanceOf([lender.account.address]), 10_050n * ONE_USD);
  });

  it("reverts when a token returns false instead of moving funds", async function () {
    const clients = await net.viem.getWalletClients();
    const borrower = clients[1]!;
    const lender = clients[2]!;
    const token = await net.viem.deployContract("MockFalseReturnToken");
    const settlement = await net.viem.deployContract("LoanSettlement", [[token.address]]);

    await token.write.mint([borrower.account.address, 10_000n * ONE_USD]);
    await token.write.mint([lender.account.address, 10_000n * ONE_USD]);
    await token.write.approve([settlement.address, maxUint256], { account: borrower.account });
    await token.write.approve([settlement.address, maxUint256], { account: lender.account });

    const terms = makeTerms({ borrower, lender, token: token.address, now: await now(net) });
    const loanId = await settlement.read.commitmentOf([terms]);
    await settlement.write.proposeLoan([terms], { account: borrower.account });

    await assert.rejects(
      settlement.write.fund([loanId], { account: lender.account }),
      /SafeERC20FailedOperation|InexactTransfer/,
    );
    assert.equal(await settlement.read.stateOf([loanId]), 1); // still Proposed
    assert.equal(await token.read.balanceOf([settlement.address]), 0n);
  });

  it("reverts when a token charges a fee on transfer", async function () {
    const clients = await net.viem.getWalletClients();
    const borrower = clients[1]!;
    const lender = clients[2]!;
    const token = await net.viem.deployContract("MockFeeOnTransferToken");
    const settlement = await net.viem.deployContract("LoanSettlement", [[token.address]]);

    await token.write.mint([lender.account.address, 10_000n * 10n ** 18n]);
    await token.write.approve([settlement.address, maxUint256], { account: lender.account });

    const terms = makeTerms({
      borrower,
      lender,
      token: token.address,
      now: await now(net),
      principal: 1_000n * 10n ** 18n,
      interest: 50n * 10n ** 18n,
    });
    const loanId = await settlement.read.commitmentOf([terms]);
    await settlement.write.proposeLoan([terms], { account: borrower.account });

    const lenderBefore = await token.read.balanceOf([lender.account.address]);
    await assert.rejects(
      settlement.write.fund([loanId], { account: lender.account }),
      /InexactTransfer/,
    );
    assert.equal(await settlement.read.stateOf([loanId]), 1); // still Proposed
    assert.equal(await token.read.balanceOf([settlement.address]), 0n);
    assert.equal(await token.read.balanceOf([lender.account.address]), lenderBefore);
  });

  it("rejects a token that is not on the immutable allowlist", async function () {
    const world = await deployWorld(net);
    const { settlement, borrower, lender, owner } = world;
    const otherToken = await net.viem.deployContract("TestUSD", [owner.account.address]);
    const terms = makeTerms({
      borrower,
      lender,
      token: otherToken.address,
      now: await now(net),
    });

    await assert.rejects(
      settlement.write.proposeLoan([terms], { account: borrower.account }),
      /TokenNotAllowed/,
    );
    assert.equal(await settlement.read.isAllowedToken([otherToken.address]), false);
    assert.equal(await settlement.read.isAllowedToken([world.token.address]), true);
  });

  it("refuses a reentrant token with the reentrancy guard", async function () {
    const clients = await net.viem.getWalletClients();
    const borrower = clients[1]!;
    const lender = clients[2]!;
    const token = await net.viem.deployContract("MockReentrantToken");
    const settlement = await net.viem.deployContract("LoanSettlement", [[token.address]]);

    await token.write.mint([borrower.account.address, 10_000n * ONE_USD]);
    await token.write.mint([lender.account.address, 10_000n * ONE_USD]);
    await token.write.approve([settlement.address, maxUint256], { account: borrower.account });
    await token.write.approve([settlement.address, maxUint256], { account: lender.account });

    const terms = makeTerms({ borrower, lender, token: token.address, now: await now(net) });
    const loanId = await settlement.read.commitmentOf([terms]);
    await settlement.write.proposeLoan([terms], { account: borrower.account });
    await settlement.write.fund([loanId], { account: lender.account });
    await settlement.write.claim([loanId], { account: borrower.account });

    await token.write.setReentry([settlement.address, loanId]);
    await assert.rejects(
      settlement.write.repay([loanId, 10n * ONE_USD], { account: borrower.account }),
      /ReentrancyGuardReentrantCall|reentrant/i,
    );

    // The failed outer call left no accounting behind.
    assert.equal(await settlement.read.stateOf([loanId]), 3); // Active
    assert.equal(await settlement.read.repaidOf([loanId]), 0n);
    assert.equal(await token.read.balanceOf([settlement.address]), 0n);
  });
});
