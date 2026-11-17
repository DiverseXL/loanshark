import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { maxUint256 } from "viem";
import { assertBalance, deployWorld, makeTerms, now, ONE_USD, openActiveLoan } from "./support.js";

describe("LoanSettlement review follow-up", async function () {
  const net = await network.create();

  it("rejects expire on a funded loan", async function () {
    const world = await deployWorld(net);
    const { token, settlement, borrower, lender, outsider } = world;
    const terms = makeTerms({ borrower, lender, token: token.address, now: await now(net) });
    const loanId = await settlement.read.commitmentOf([terms]);

    await settlement.write.proposeLoan([terms], { account: borrower.account });
    await settlement.write.fund([loanId], { account: lender.account });
    await assert.rejects(
      settlement.write.expire([loanId], { account: outsider.account }),
      /InvalidState/,
    );
    assert.equal(await settlement.read.stateOf([loanId]), 2); // Funded
  });

  it("rejects re-proposing identical terms after cancel and after expire", async function () {
    const world = await deployWorld(net);
    const { token, settlement, borrower, lender, outsider } = world;
    const current = await now(net);

    const cancelled = makeTerms({ borrower, lender, token: token.address, now: current });
    const cancelledId = await settlement.read.commitmentOf([cancelled]);
    await settlement.write.proposeLoan([cancelled], { account: borrower.account });
    await settlement.write.cancel([cancelledId], { account: borrower.account });
    await assert.rejects(
      settlement.write.proposeLoan([cancelled], { account: borrower.account }),
      /LoanExists/,
    );

    const expired = makeTerms({ borrower, lender, token: token.address, now: current });
    const expiredId = await settlement.read.commitmentOf([expired]);
    await settlement.write.proposeLoan([expired], { account: borrower.account });
    await net.networkHelpers.time.increaseTo(Number(expired.fundingDeadline + 1n));
    await settlement.write.expire([expiredId], { account: outsider.account });
    await assert.rejects(
      settlement.write.proposeLoan([expired], { account: borrower.account }),
      /LoanExists/,
    );
  });

  it("rejects a claim window one second below the 3600-second minimum", async function () {
    const world = await deployWorld(net);
    const { token, settlement, borrower, lender } = world;
    const current = await now(net);
    const terms = makeTerms({
      borrower,
      lender,
      token: token.address,
      now: current,
      fundingIn: 1_000n,
      claimIn: 4_599n,
      dueIn: 5_000n,
    });

    await assert.rejects(
      settlement.write.proposeLoan([terms], { account: borrower.account }),
      /ClaimWindowTooShort/,
    );
  });

  it("accepts a claim window of exactly the 3600-second minimum", async function () {
    const world = await deployWorld(net);
    const { token, settlement, borrower, lender } = world;
    const current = await now(net);
    const terms = makeTerms({
      borrower,
      lender,
      token: token.address,
      now: current,
      fundingIn: 1_000n,
      claimIn: 4_600n,
      dueIn: 5_000n,
    });
    const loanId = await settlement.read.commitmentOf([terms]);

    await settlement.write.proposeLoan([terms], { account: borrower.account });
    assert.equal(await settlement.read.stateOf([loanId]), 1); // Proposed
  });

  it("rejects claim after a refund", async function () {
    const world = await deployWorld(net);
    const { token, settlement, borrower, lender } = world;
    const terms = makeTerms({ borrower, lender, token: token.address, now: await now(net) });
    const loanId = await settlement.read.commitmentOf([terms]);

    await settlement.write.proposeLoan([terms], { account: borrower.account });
    await settlement.write.fund([loanId], { account: lender.account });
    await net.networkHelpers.time.increaseTo(Number(terms.claimDeadline + 1n));
    await settlement.write.refund([loanId], { account: lender.account });
    assert.equal(await settlement.read.stateOf([loanId]), 8); // Refunded
    await assert.rejects(
      settlement.write.claim([loanId], { account: borrower.account }),
      /InvalidState/,
    );
  });

  it("rejects repayment by a non-borrower while the loan is Defaulted", async function () {
    const world = await deployWorld(net);
    const { token, settlement, borrower, lender, outsider } = world;
    const terms = makeTerms({
      borrower,
      lender,
      token: token.address,
      now: await now(net),
      dueIn: 4_000n,
      graceSeconds: 0n,
      fundingIn: 200n,
      claimIn: 3_800n,
    });
    const loanId = await openActiveLoan(world, terms);
    await net.networkHelpers.time.increaseTo(Number(terms.dueDate + 1n));
    await settlement.write.markDefault([loanId], { account: outsider.account });
    assert.equal(await settlement.read.stateOf([loanId]), 4); // Defaulted

    await assert.rejects(
      settlement.write.repay([loanId, 1n], { account: outsider.account }),
      /NotBorrower/,
    );
    await assert.rejects(
      settlement.write.repay([loanId, 1n], { account: lender.account }),
      /NotBorrower/,
    );
    assert.equal(await settlement.read.repaidOf([loanId]), 0n);
  });

  it("lets the lender withdraw a partial repayment after default, then the remainder", async function () {
    const world = await deployWorld(net);
    const { token, settlement, borrower, lender, outsider } = world;
    const terms = makeTerms({
      borrower,
      lender,
      token: token.address,
      now: await now(net),
      dueIn: 4_000n,
      graceSeconds: 0n,
      fundingIn: 200n,
      claimIn: 3_800n,
    });
    const loanId = await openActiveLoan(world, terms);

    await settlement.write.repay([loanId, 400n * ONE_USD], { account: borrower.account });
    assert.equal(await settlement.read.stateOf([loanId]), 3); // Active
    await net.networkHelpers.time.increaseTo(Number(terms.dueDate + 1n));
    await settlement.write.markDefault([loanId], { account: outsider.account });
    assert.equal(await settlement.read.stateOf([loanId]), 4); // Defaulted

    await settlement.write.withdraw([loanId], { account: lender.account });
    assert.equal(await settlement.read.withdrawableOf([loanId]), 0n);
    await assertBalance(token, lender.account.address, 9_400n * ONE_USD, "partial withdrawal");

    await settlement.write.repay([loanId, 650n * ONE_USD], { account: borrower.account });
    assert.equal(await settlement.read.stateOf([loanId]), 5); // Repaid
    assert.equal(await settlement.read.outstandingOf([loanId]), 0n);
    assert.equal(await settlement.read.withdrawableOf([loanId]), 650n * ONE_USD);

    await settlement.write.withdraw([loanId], { account: lender.account });
    await assertBalance(token, lender.account.address, 10_050n * ONE_USD, "remainder");
    await assertBalance(token, settlement.address, 0n);
    await assert.rejects(
      settlement.write.withdraw([loanId], { account: lender.account }),
      /NothingToWithdraw/,
    );
  });

  it("keeps tokens sent directly to the contract outside every loan's accounting", async function () {
    const world = await deployWorld(net);
    const { token, settlement, borrower, lender, outsider } = world;
    const terms = makeTerms({ borrower, lender, token: token.address, now: await now(net) });
    const loanId = await openActiveLoan(world, terms);

    const donated = 777n * ONE_USD;
    await token.write.transfer([settlement.address, donated], { account: outsider.account });
    await assertBalance(token, settlement.address, donated, "donation received");

    assert.equal(await settlement.read.outstandingOf([loanId]), 1_050n * ONE_USD);
    assert.equal(await settlement.read.repaidOf([loanId]), 0n);
    assert.equal(await settlement.read.withdrawableOf([loanId]), 0n);
    await assertBalance(token, lender.account.address, 9_000n * ONE_USD);

    await settlement.write.repay([loanId, 100n * ONE_USD], { account: borrower.account });
    await assertBalance(token, settlement.address, donated + 100n * ONE_USD);
    await settlement.write.withdraw([loanId], { account: lender.account });
    await assertBalance(token, settlement.address, donated, "only the accounting amount left");
    await assertBalance(token, lender.account.address, 9_100n * ONE_USD);

    // No function exists that can move the donation: withdraw is empty and
    // every other transfer path is tied to a loan's own accounting.
    await assert.rejects(
      settlement.write.withdraw([loanId], { account: lender.account }),
      /NothingToWithdraw/,
    );
    assert.equal(await settlement.read.withdrawableOf([loanId]), 0n);
  });

  async function deployReentrantWorld() {
    const clients = await net.viem.getWalletClients();
    const borrower = clients[1]!;
    const lender = clients[2]!;
    const token = await net.viem.deployContract("MockReentrantToken");
    const settlement = await net.viem.deployContract("LoanSettlement", [[token.address]]);

    await token.write.mint([borrower.account.address, 10_000n * ONE_USD]);
    await token.write.mint([lender.account.address, 10_000n * ONE_USD]);
    await token.write.approve([settlement.address, maxUint256], { account: borrower.account });
    await token.write.approve([settlement.address, maxUint256], { account: lender.account });

    return { token, settlement, borrower, lender };
  }

  it("refuses a reentrant token that calls withdraw", async function () {
    const { token, settlement, borrower, lender } = await deployReentrantWorld();
    const terms = makeTerms({ borrower, lender, token: token.address, now: await now(net) });
    const loanId = await settlement.read.commitmentOf([terms]);
    await settlement.write.proposeLoan([terms], { account: borrower.account });
    await settlement.write.fund([loanId], { account: lender.account });
    await settlement.write.claim([loanId], { account: borrower.account });
    await settlement.write.repay([loanId, 100n * ONE_USD], { account: borrower.account });

    await token.write.setReentryAction([settlement.address, loanId, 1]);
    await assert.rejects(
      settlement.write.withdraw([loanId], { account: lender.account }),
      /ReentrancyGuardReentrantCall|reentrant/i,
    );
    assert.equal(await settlement.read.withdrawableOf([loanId]), 100n * ONE_USD);
    assert.equal(await token.read.balanceOf([settlement.address]), 100n * ONE_USD);
  });

  it("refuses a reentrant token that calls claim", async function () {
    const { token, settlement, borrower, lender } = await deployReentrantWorld();
    const terms = makeTerms({ borrower, lender, token: token.address, now: await now(net) });
    const loanId = await settlement.read.commitmentOf([terms]);
    await settlement.write.proposeLoan([terms], { account: borrower.account });
    await settlement.write.fund([loanId], { account: lender.account });

    await token.write.setReentryAction([settlement.address, loanId, 2]);
    await assert.rejects(
      settlement.write.claim([loanId], { account: borrower.account }),
      /ReentrancyGuardReentrantCall|reentrant/i,
    );
    assert.equal(await settlement.read.stateOf([loanId]), 2); // still Funded
    assert.equal(await token.read.balanceOf([settlement.address]), 1_000n * ONE_USD);
  });
});
