import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { assertBalance, deployWorld, makeTerms, now, ONE_USD, openActiveLoan } from "./support.js";

describe("LoanSettlement lifecycle", async function () {
  const net = await network.create();

  it("runs propose, fund, claim, partial repayments, withdrawal and Repaid with exact balances", async function () {
    const world = await deployWorld(net);
    const { token, settlement, borrower, lender } = world;
    const terms = makeTerms({ borrower, lender, token: token.address, now: await now(net) });
    const loanId = await settlement.read.commitmentOf([terms]);

    await assertBalance(token, borrower.account.address, 10_000n * ONE_USD);
    await assertBalance(token, lender.account.address, 10_000n * ONE_USD);

    await settlement.write.proposeLoan([terms], { account: borrower.account });
    assert.equal(await settlement.read.stateOf([loanId]), 1); // Proposed
    await assertBalance(token, settlement.address, 0n, "no escrow before funding");

    await settlement.write.fund([loanId], { account: lender.account });
    assert.equal(await settlement.read.stateOf([loanId]), 2); // Funded
    await assertBalance(token, lender.account.address, 9_000n * ONE_USD);
    await assertBalance(token, settlement.address, 1_000n * ONE_USD, "escrow after funding");

    await settlement.write.claim([loanId], { account: borrower.account });
    assert.equal(await settlement.read.stateOf([loanId]), 3); // Active
    await assertBalance(token, borrower.account.address, 11_000n * ONE_USD);
    await assertBalance(token, settlement.address, 0n, "no escrow after claim");

    await settlement.write.repay([loanId, 400n * ONE_USD], { account: borrower.account });
    assert.equal(await settlement.read.outstandingOf([loanId]), 650n * ONE_USD);
    assert.equal(await settlement.read.withdrawableOf([loanId]), 400n * ONE_USD);
    await assertBalance(token, borrower.account.address, 10_600n * ONE_USD);
    await assertBalance(token, settlement.address, 400n * ONE_USD);

    await settlement.write.withdraw([loanId], { account: lender.account });
    await assertBalance(token, lender.account.address, 9_400n * ONE_USD);
    await assertBalance(token, settlement.address, 0n);

    await settlement.write.repay([loanId, 650n * ONE_USD], { account: borrower.account });
    assert.equal(await settlement.read.stateOf([loanId]), 5); // Repaid
    assert.equal(await settlement.read.outstandingOf([loanId]), 0n);
    assert.equal(await settlement.read.withdrawableOf([loanId]), 650n * ONE_USD);
    await assertBalance(token, borrower.account.address, 9_950n * ONE_USD);
    await assertBalance(token, settlement.address, 650n * ONE_USD);

    await settlement.write.withdraw([loanId], { account: lender.account });
    await assertBalance(token, lender.account.address, 10_050n * ONE_USD);
    await assertBalance(token, settlement.address, 0n);
    await assertBalance(token, borrower.account.address, 9_950n * ONE_USD);
  });

  it("supports an 18-decimal token with the same rules", async function () {
    const world = await deployWorld(net);
    const { token18, settlement, borrower, lender } = world;
    const unit = 10n ** 18n;
    const terms = makeTerms({
      borrower,
      lender,
      token: token18.address,
      now: await now(net),
      principal: 1_000n * unit,
      interest: 50n * unit,
    });
    const loanId = await settlement.read.commitmentOf([terms]);

    await settlement.write.proposeLoan([terms], { account: borrower.account });
    await settlement.write.fund([loanId], { account: lender.account });
    await settlement.write.claim([loanId], { account: borrower.account });
    await settlement.write.repay([loanId, 1_050n * unit], { account: borrower.account });
    assert.equal(await settlement.read.stateOf([loanId]), 5); // Repaid
    await settlement.write.withdraw([loanId], { account: lender.account });

    await assertBalance(token18, settlement.address, 0n);
    await assertBalance(token18, lender.account.address, 10_050n * unit);
    await assertBalance(token18, borrower.account.address, 9_950n * unit);
  });

  it("rejects every wrong caller", async function () {
    const world = await deployWorld(net);
    const { token, settlement, borrower, lender, outsider, otherLender } = world;
    const terms = makeTerms({ borrower, lender, token: token.address, now: await now(net) });
    const loanId = await settlement.read.commitmentOf([terms]);

    await assert.rejects(
      settlement.write.proposeLoan([terms], { account: outsider.account }),
      /NotBorrower/,
    );
    await settlement.write.proposeLoan([terms], { account: borrower.account });
    await assert.rejects(
      settlement.write.fund([loanId], { account: outsider.account }),
      /NotLender/,
    );
    await assert.rejects(
      settlement.write.fund([loanId], { account: otherLender.account }),
      /NotLender/,
    );
    await settlement.write.fund([loanId], { account: lender.account });
    await assert.rejects(
      settlement.write.claim([loanId], { account: outsider.account }),
      /NotBorrower/,
    );
    await assert.rejects(
      settlement.write.claim([loanId], { account: lender.account }),
      /NotBorrower/,
    );
    await settlement.write.claim([loanId], { account: borrower.account });
    await assert.rejects(
      settlement.write.repay([loanId, 1n], { account: outsider.account }),
      /NotBorrower/,
    );
    await assert.rejects(
      settlement.write.repay([loanId, 1n], { account: lender.account }),
      /NotBorrower/,
    );
    await assert.rejects(
      settlement.write.withdraw([loanId], { account: borrower.account }),
      /NotLender/,
    );
    await assert.rejects(
      settlement.write.withdraw([loanId], { account: outsider.account }),
      /NotLender/,
    );
  });

  it("rejects wrong callers for cancel and refund", async function () {
    const world = await deployWorld(net);
    const { token, settlement, borrower, lender, outsider } = world;
    const current = await now(net);

    const cancelTerms = makeTerms({ borrower, lender, token: token.address, now: current });
    const cancelId = await settlement.read.commitmentOf([cancelTerms]);
    await settlement.write.proposeLoan([cancelTerms], { account: borrower.account });
    await assert.rejects(
      settlement.write.cancel([cancelId], { account: lender.account }),
      /NotBorrower/,
    );

    const refundTerms = makeTerms({ borrower, lender, token: token.address, now: current });
    const refundId = await settlement.read.commitmentOf([refundTerms]);
    await settlement.write.proposeLoan([refundTerms], { account: borrower.account });
    await settlement.write.fund([refundId], { account: lender.account });
    await net.networkHelpers.time.increaseTo(Number(refundTerms.claimDeadline + 1n));
    await assert.rejects(
      settlement.write.refund([refundId], { account: borrower.account }),
      /NotLender/,
    );
    await assert.rejects(
      settlement.write.refund([refundId], { account: outsider.account }),
      /NotLender/,
    );
  });

  it("rejects out-of-order transitions and duplicate proposals", async function () {
    const world = await deployWorld(net);
    const { token, settlement, borrower, lender } = world;
    const terms = makeTerms({ borrower, lender, token: token.address, now: await now(net) });
    const loanId = await settlement.read.commitmentOf([terms]);

    await settlement.write.proposeLoan([terms], { account: borrower.account });
    await assert.rejects(
      settlement.write.proposeLoan([terms], { account: borrower.account }),
      /LoanExists/,
    );
    await assert.rejects(
      settlement.write.claim([loanId], { account: borrower.account }),
      /InvalidState/,
    );
    await assert.rejects(
      settlement.write.repay([loanId, 1n], { account: borrower.account }),
      /InvalidState/,
    );
    await assert.rejects(
      settlement.write.withdraw([loanId], { account: lender.account }),
      /NothingToWithdraw/,
    );

    await settlement.write.fund([loanId], { account: lender.account });
    await assert.rejects(
      settlement.write.fund([loanId], { account: lender.account }),
      /InvalidState/,
    );
    await assert.rejects(
      settlement.write.cancel([loanId], { account: borrower.account }),
      /InvalidState/,
    );

    await settlement.write.claim([loanId], { account: borrower.account });
    await assert.rejects(
      settlement.write.claim([loanId], { account: borrower.account }),
      /InvalidState/,
    );
    await assert.rejects(
      settlement.write.cancel([loanId], { account: borrower.account }),
      /InvalidState/,
    );
    await assert.rejects(
      settlement.write.refund([loanId], { account: lender.account }),
      /InvalidState/,
    );
  });

  it("rejects overpayment and zero payment without changing balances", async function () {
    const world = await deployWorld(net);
    const { token, settlement, borrower, lender } = world;
    const terms = makeTerms({ borrower, lender, token: token.address, now: await now(net) });
    const loanId = await openActiveLoan(world, terms);

    const borrowerBefore = await token.read.balanceOf([borrower.account.address]);
    const contractBefore = await token.read.balanceOf([settlement.address]);
    await assert.rejects(
      settlement.write.repay([loanId, 1_050n * ONE_USD + 1n], { account: borrower.account }),
      /Overpayment/,
    );
    await assert.rejects(
      settlement.write.repay([loanId, 0n], { account: borrower.account }),
      /ZeroAmount/,
    );
    assert.equal(await token.read.balanceOf([borrower.account.address]), borrowerBefore);
    assert.equal(await token.read.balanceOf([settlement.address]), contractBefore);
    assert.equal(await settlement.read.stateOf([loanId]), 3); // still Active

    await settlement.write.repay([loanId, 1_050n * ONE_USD], { account: borrower.account });
    assert.equal(await settlement.read.stateOf([loanId]), 5); // Repaid
    await assert.rejects(
      settlement.write.repay([loanId, 1n], { account: borrower.account }),
      /InvalidState/,
    );
  });

  it("cancels an unfunded proposal and then rejects funding it", async function () {
    const world = await deployWorld(net);
    const { token, settlement, borrower, lender } = world;
    const terms = makeTerms({ borrower, lender, token: token.address, now: await now(net) });
    const loanId = await settlement.read.commitmentOf([terms]);

    await settlement.write.proposeLoan([terms], { account: borrower.account });
    await settlement.write.cancel([loanId], { account: borrower.account });
    assert.equal(await settlement.read.stateOf([loanId]), 6); // Cancelled
    await assert.rejects(
      settlement.write.fund([loanId], { account: lender.account }),
      /InvalidState/,
    );
  });
});
