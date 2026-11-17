import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { deployWorld, makeTerms, now, openActiveLoan } from "./support.js";

describe("LoanSettlement time boundaries", async function () {
  const net = await network.create();

  it("accepts fund at the funding deadline and rejects it one second later", async function () {
    const world = await deployWorld(net);
    const { token, settlement, borrower, lender } = world;
    const terms = makeTerms({ borrower, lender, token: token.address, now: await now(net) });
    const loanId = await settlement.read.commitmentOf([terms]);
    await settlement.write.proposeLoan([terms], { account: borrower.account });

    await net.networkHelpers.time.setNextBlockTimestamp(Number(terms.fundingDeadline));
    await settlement.write.fund([loanId], { account: lender.account });
    assert.equal(await settlement.read.stateOf([loanId]), 2); // Funded

    const later = makeTerms({ borrower, lender, token: token.address, now: await now(net) });
    const laterId = await settlement.read.commitmentOf([later]);
    await settlement.write.proposeLoan([later], { account: borrower.account });
    await net.networkHelpers.time.setNextBlockTimestamp(Number(later.fundingDeadline + 1n));
    await assert.rejects(
      settlement.write.fund([laterId], { account: lender.account }),
      /FundingDeadlinePassed/,
    );
  });

  it("expires a proposal only after the funding deadline", async function () {
    const world = await deployWorld(net);
    const { token, settlement, borrower, lender, outsider } = world;
    const terms = makeTerms({ borrower, lender, token: token.address, now: await now(net) });
    const loanId = await settlement.read.commitmentOf([terms]);
    await settlement.write.proposeLoan([terms], { account: borrower.account });

    await net.networkHelpers.time.setNextBlockTimestamp(Number(terms.fundingDeadline));
    await assert.rejects(
      settlement.write.expire([loanId], { account: outsider.account }),
      /FundingDeadlineNotReached/,
    );

    await net.networkHelpers.time.setNextBlockTimestamp(Number(terms.fundingDeadline + 1n));
    await settlement.write.expire([loanId], { account: outsider.account });
    assert.equal(await settlement.read.stateOf([loanId]), 7); // Expired
  });

  it("accepts claim at the claim deadline and rejects it one second later", async function () {
    const world = await deployWorld(net);
    const { token, settlement, borrower, lender } = world;
    const terms = makeTerms({ borrower, lender, token: token.address, now: await now(net) });
    const loanId = await settlement.read.commitmentOf([terms]);
    await settlement.write.proposeLoan([terms], { account: borrower.account });
    await settlement.write.fund([loanId], { account: lender.account });

    await net.networkHelpers.time.setNextBlockTimestamp(Number(terms.claimDeadline));
    await settlement.write.claim([loanId], { account: borrower.account });
    assert.equal(await settlement.read.stateOf([loanId]), 3); // Active

    const late = makeTerms({ borrower, lender, token: token.address, now: await now(net) });
    const lateId = await settlement.read.commitmentOf([late]);
    await settlement.write.proposeLoan([late], { account: borrower.account });
    await settlement.write.fund([lateId], { account: lender.account });
    await net.networkHelpers.time.setNextBlockTimestamp(Number(late.claimDeadline + 1n));
    await assert.rejects(
      settlement.write.claim([lateId], { account: borrower.account }),
      /ClaimDeadlinePassed/,
    );
  });

  it("refunds only after the claim deadline", async function () {
    const world = await deployWorld(net);
    const { token, settlement, borrower, lender } = world;
    const terms = makeTerms({ borrower, lender, token: token.address, now: await now(net) });
    const loanId = await settlement.read.commitmentOf([terms]);
    await settlement.write.proposeLoan([terms], { account: borrower.account });
    await settlement.write.fund([loanId], { account: lender.account });

    await net.networkHelpers.time.setNextBlockTimestamp(Number(terms.claimDeadline));
    await assert.rejects(
      settlement.write.refund([loanId], { account: lender.account }),
      /ClaimDeadlineNotReached/,
    );

    await net.networkHelpers.time.setNextBlockTimestamp(Number(terms.claimDeadline + 1n));
    await settlement.write.refund([loanId], { account: lender.account });
    assert.equal(await settlement.read.stateOf([loanId]), 8); // Refunded
    assert.equal(await settlement.read.outstandingOf([loanId]), 0n);
  });

  it("marks default only after dueDate plus graceSeconds", async function () {
    const world = await deployWorld(net);
    const { token, settlement, borrower, lender, outsider } = world;
    const terms = makeTerms({
      borrower,
      lender,
      token: token.address,
      now: await now(net),
      dueIn: 3_000n,
      graceSeconds: 300n,
    });
    const loanId = await openActiveLoan(world, terms);
    const due = terms.dueDate + terms.graceSeconds;

    await net.networkHelpers.time.setNextBlockTimestamp(Number(due));
    await assert.rejects(
      settlement.write.markDefault([loanId], { account: outsider.account }),
      /DefaultNotYetAvailable/,
    );

    await net.networkHelpers.time.setNextBlockTimestamp(Number(due + 1n));
    await settlement.write.markDefault([loanId], { account: outsider.account });
    assert.equal(await settlement.read.stateOf([loanId]), 4); // Defaulted
  });
});
