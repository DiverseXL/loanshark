import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { assertBalance, deployWorld, makeTerms, now, ONE_USD, openActiveLoan } from "./support.js";

describe("LoanSettlement default", async function () {
  const net = await network.create();

  it("lets anyone mark an overdue active loan Defaulted, then accepts repayment to Repaid", async function () {
    const world = await deployWorld(net);
    const { token, settlement, borrower, lender, outsider } = world;
    const terms = makeTerms({
      borrower,
      lender,
      token: token.address,
      now: await now(net),
      dueIn: 1_000n,
      graceSeconds: 100n,
      fundingIn: 300n,
      claimIn: 500n,
    });
    const loanId = await openActiveLoan(world, terms);

    await net.networkHelpers.time.increaseTo(Number(terms.dueDate + terms.graceSeconds + 1n));
    await settlement.write.markDefault([loanId], { account: outsider.account });
    assert.equal(await settlement.read.stateOf([loanId]), 4); // Defaulted
    assert.equal(await settlement.read.outstandingOf([loanId]), 1_050n * ONE_USD);

    // No penalty, no liquidation: the amount due is unchanged.
    await settlement.write.repay([loanId, 400n * ONE_USD], { account: borrower.account });
    assert.equal(await settlement.read.stateOf([loanId]), 4); // still Defaulted
    assert.equal(await settlement.read.outstandingOf([loanId]), 650n * ONE_USD);
    await assertBalance(token, settlement.address, 400n * ONE_USD);

    await settlement.write.repay([loanId, 650n * ONE_USD], { account: borrower.account });
    assert.equal(await settlement.read.stateOf([loanId]), 5); // Repaid
    assert.equal(await settlement.read.outstandingOf([loanId]), 0n);

    await settlement.write.withdraw([loanId], { account: lender.account });
    await assertBalance(token, settlement.address, 0n);
    await assertBalance(token, lender.account.address, 10_050n * ONE_USD);
  });

  it("cannot mark a proposed, funded, repaid or refunded loan as defaulted", async function () {
    const world = await deployWorld(net);
    const { token, settlement, borrower, lender, outsider } = world;
    const current = await now(net);

    const terms = makeTerms({ borrower, lender, token: token.address, now: current });
    const loanId = await settlement.read.commitmentOf([terms]);

    await settlement.write.proposeLoan([terms], { account: borrower.account });
    await assert.rejects(
      settlement.write.markDefault([loanId], { account: outsider.account }),
      /InvalidState/,
    );

    await settlement.write.fund([loanId], { account: lender.account });
    await assert.rejects(
      settlement.write.markDefault([loanId], { account: outsider.account }),
      /InvalidState/,
    );

    await settlement.write.claim([loanId], { account: borrower.account });
    await settlement.write.repay([loanId, 1_050n * ONE_USD], { account: borrower.account });
    assert.equal(await settlement.read.stateOf([loanId]), 5); // Repaid
    await assert.rejects(
      settlement.write.markDefault([loanId], { account: outsider.account }),
      /InvalidState/,
    );
    await assert.rejects(
      settlement.write.repay([loanId, 1n], { account: borrower.account }),
      /InvalidState/,
    );

    const refundTerms = makeTerms({ borrower, lender, token: token.address, now: current });
    const refundId = await settlement.read.commitmentOf([refundTerms]);
    await settlement.write.proposeLoan([refundTerms], { account: borrower.account });
    await settlement.write.fund([refundId], { account: lender.account });
    await net.networkHelpers.time.increaseTo(Number(refundTerms.claimDeadline + 1n));
    await settlement.write.refund([refundId], { account: lender.account });
    assert.equal(await settlement.read.stateOf([refundId]), 8); // Refunded
    await assert.rejects(
      settlement.write.markDefault([refundId], { account: outsider.account }),
      /InvalidState/,
    );
  });

  it("keeps a defaulted loan open to repayment but rejects cancellation, refund and double default", async function () {
    const world = await deployWorld(net);
    const { token, settlement, borrower, lender, outsider } = world;
    const terms = makeTerms({
      borrower,
      lender,
      token: token.address,
      now: await now(net),
      dueIn: 500n,
      graceSeconds: 0n,
      fundingIn: 200n,
      claimIn: 300n,
    });
    const loanId = await openActiveLoan(world, terms);
    await net.networkHelpers.time.increaseTo(Number(terms.dueDate + 1n));
    await settlement.write.markDefault([loanId], { account: outsider.account });

    await assert.rejects(
      settlement.write.cancel([loanId], { account: borrower.account }),
      /InvalidState/,
    );
    await assert.rejects(
      settlement.write.refund([loanId], { account: lender.account }),
      /InvalidState/,
    );
    await assert.rejects(
      settlement.write.markDefault([loanId], { account: outsider.account }),
      /InvalidState/,
    );
  });
});
