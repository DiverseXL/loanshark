import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import type { World } from "./support.js";
import { deployWorld, makeTerms, now, ONE_USD } from "./support.js";

// REAL: named invariant tests on the in-process Hardhat network (Step 9b
// Task 6). These are the invariants ADR-0008 lists, asserted directly rather
// than only through the randomised sequence in invariants.test.ts.

const STATE = {
  None: 0,
  Proposed: 1,
  Funded: 2,
  Active: 3,
  Defaulted: 4,
  Repaid: 5,
  Cancelled: 6,
  Expired: 7,
  Refunded: 8,
} as const;

type Token = World["token"];

/** Sum of escrow for Funded loans plus every loan's withdrawable amount. */
async function accountedBalance(world: World, token: Token, loanIds: `0x${string}`[]) {
  let expected = 0n;
  for (const loanId of loanIds) {
    const state = await world.settlement.read.stateOf([loanId]);
    const withdrawable = await world.settlement.read.withdrawableOf([loanId]);
    if (state === STATE.None) continue;
    const terms = await world.settlement.read.termsOf([loanId]);
    if (terms.token.toLowerCase() !== token.address.toLowerCase()) continue;
    if (state === STATE.Funded) expected += terms.principal;
    expected += withdrawable;
  }
  return expected;
}

async function assertAccounting(
  world: World,
  token: Token,
  loanIds: `0x${string}`[],
  label: string,
) {
  const actual = await token.read.balanceOf([world.settlement.address]);
  const expected = await accountedBalance(world, token, loanIds);
  assert.equal(actual, expected, `${label}: contract balance vs escrow plus withdrawable`);
}

describe("LoanSettlement named invariants", async () => {
  const net = await network.create();

  it("token balance equals Funded escrow plus withdrawable, per token", async () => {
    const world = await deployWorld(net);
    const { settlement, token, fusd, borrower, lender } = world;

    const a = makeTerms({
      borrower,
      lender,
      token: token.address,
      now: await now(net),
      principal: 10n * ONE_USD,
      interest: ONE_USD,
    });
    const b = makeTerms({
      borrower,
      lender,
      token: fusd.address,
      now: await now(net),
      principal: 7n * ONE_USD,
      interest: 2n * ONE_USD,
    });
    const idA = await settlement.read.commitmentOf([a]);
    const idB = await settlement.read.commitmentOf([b]);
    const ids = [idA, idB];

    await assertAccounting(world, token, ids, "after deploy");
    await settlement.write.proposeLoan([a], { account: borrower.account });
    await assertAccounting(world, token, ids, "after propose A");
    await settlement.write.fund([idA], { account: lender.account });
    await assertAccounting(world, token, ids, "after fund A");
    await settlement.write.proposeLoan([b], { account: borrower.account });
    await settlement.write.fund([idB], { account: lender.account });
    await assertAccounting(world, token, ids, "after fund B");
    await assertAccounting(world, fusd, ids, "after fund B, fUSD side");
    await settlement.write.claim([idA], { account: borrower.account });
    await assertAccounting(world, token, ids, "after claim A");
    await settlement.write.repay([idA, 2n * ONE_USD], { account: borrower.account });
    await assertAccounting(world, token, ids, "after partial repay A");
    await settlement.write.withdraw([idA], { account: lender.account });
    await assertAccounting(world, token, ids, "after withdraw A");
    await net.networkHelpers.time.increase(10_000);
    await settlement.write.refund([idB], { account: lender.account, gas: 1_000_000n });
    await assertAccounting(world, fusd, ids, "after refund B");
  });

  it("repaid never exceeds principal plus interest, and Repaid iff repaid equals the total", async () => {
    const world = await deployWorld(net);
    const { settlement, token, borrower, lender } = world;
    const terms = makeTerms({
      borrower,
      lender,
      token: token.address,
      now: await now(net),
      principal: 5n * ONE_USD,
      interest: ONE_USD,
    });
    const loanId = await settlement.read.commitmentOf([terms]);
    await settlement.write.proposeLoan([terms], { account: borrower.account });
    await settlement.write.fund([loanId], { account: lender.account });
    await settlement.write.claim([loanId], { account: borrower.account });

    const total = terms.principal + terms.interest;
    assert.equal(await settlement.read.stateOf([loanId]), STATE.Active);
    assert.equal(await settlement.read.repaidOf([loanId]), 0n);

    for (const amount of [ONE_USD, 2n * ONE_USD]) {
      await settlement.write.repay([loanId, amount], { account: borrower.account });
      const repaid = await settlement.read.repaidOf([loanId]);
      assert.ok(repaid <= total, "repaid exceeds principal plus interest");
      assert.equal(repaid, total - (await settlement.read.outstandingOf([loanId])));
      assert.notEqual(
        await settlement.read.stateOf([loanId]),
        STATE.Repaid,
        "Repaid before the total was paid",
      );
    }

    await settlement.write.repay([loanId, total - (await settlement.read.repaidOf([loanId]))], {
      account: borrower.account,
    });
    const repaid = await settlement.read.repaidOf([loanId]);
    assert.equal(repaid, total);
    assert.equal(await settlement.read.stateOf([loanId]), STATE.Repaid);
    assert.equal(await settlement.read.outstandingOf([loanId]), 0n);
  });

  it("disburses at most once per loan", async () => {
    const world = await deployWorld(net);
    const { settlement, token, borrower, lender } = world;
    const terms = makeTerms({
      borrower,
      lender,
      token: token.address,
      now: await now(net),
      principal: 3n * ONE_USD,
      interest: ONE_USD,
    });
    const loanId = await settlement.read.commitmentOf([terms]);
    await settlement.write.proposeLoan([terms], { account: borrower.account });
    await settlement.write.fund([loanId], { account: lender.account });

    const before = await token.read.balanceOf([borrower.account.address]);
    await settlement.write.claim([loanId], { account: borrower.account });
    const after = await token.read.balanceOf([borrower.account.address]);
    assert.equal(after - before, terms.principal, "claim moved more than the principal once");

    await assert.rejects(
      settlement.write.claim([loanId], { account: borrower.account }),
      /InvalidState/,
      "a second claim must revert",
    );
    const afterSecond = await token.read.balanceOf([borrower.account.address]);
    assert.equal(afterSecond, after, "a rejected second claim moved funds");
  });

  it("moves funds only through claim, refund and withdraw", async () => {
    const world = await deployWorld(net);
    const { settlement, token, borrower, lender } = world;
    const terms = makeTerms({
      borrower,
      lender,
      token: token.address,
      now: await now(net),
      principal: 4n * ONE_USD,
      interest: ONE_USD,
    });
    const loanId = await settlement.read.commitmentOf([terms]);
    await settlement.write.proposeLoan([terms], { account: borrower.account });

    const empty = await token.read.balanceOf([settlement.address]);
    await settlement.write.cancel([loanId], { account: borrower.account });
    assert.equal(await token.read.balanceOf([settlement.address]), empty, "cancel moved funds");

    const second = makeTerms({
      borrower,
      lender,
      token: token.address,
      now: await now(net),
      principal: 2n * ONE_USD,
      interest: ONE_USD,
    });
    const secondId = await settlement.read.commitmentOf([second]);
    await settlement.write.proposeLoan([second], { account: borrower.account });
    await net.networkHelpers.time.increase(2_000);
    await settlement.write.expire([secondId]);
    assert.equal(await token.read.balanceOf([settlement.address]), empty, "expire moved funds");

    const third = makeTerms({
      borrower,
      lender,
      token: token.address,
      now: await now(net),
      principal: 2n * ONE_USD,
      interest: ONE_USD,
    });
    const thirdId = await settlement.read.commitmentOf([third]);
    await settlement.write.proposeLoan([third], { account: borrower.account });
    await settlement.write.fund([thirdId], { account: lender.account });
    const funded = await token.read.balanceOf([settlement.address]);
    assert.equal(funded - empty, third.principal, "fund did not escrow exactly the principal");

    // Claim is an allowed exit: it pays exactly the principal to the borrower.
    await settlement.write.claim([thirdId], { account: borrower.account });
    assert.equal(
      await token.read.balanceOf([settlement.address]),
      empty,
      "claim did not pay out exactly the escrow",
    );

    // Marking default moves nothing.
    await net.networkHelpers.time.increase(10_000);
    await settlement.write.markDefault([thirdId]);
    assert.equal(
      await token.read.balanceOf([settlement.address]),
      empty,
      "markDefault moved funds",
    );
  });
});
