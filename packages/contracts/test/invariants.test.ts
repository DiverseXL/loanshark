import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { deployWorld, makeTerms, now, ONE_USD } from "./support.js";

/** Deterministic PRNG so the sequence can be replayed. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("LoanSettlement seeded randomised sequence", async function () {
  const net = await network.create();
  const SEED = 0x5eed1234;

  it(`keeps the balance invariant after every step across 200 runs (seed 0x${SEED.toString(16)})`, async function () {
    const world = await deployWorld(net);
    const { token, settlement, borrower, lender } = world;
    const random = mulberry32(SEED);
    // The 200 runs pay interest each time; give the borrower enough headroom
    // for the whole sequence. This is test funding, not product behaviour.
    await token.write.mint([borrower.account.address, 1_000_000n * ONE_USD]);

    for (let run = 0; run < 200; run++) {
      const principalUsd = BigInt(1 + Math.floor(random() * 500));
      const interestUsd = BigInt(Math.floor(random() * 100));
      const principal = principalUsd * ONE_USD;
      const interest = interestUsd * ONE_USD;

      const terms = makeTerms({
        borrower,
        lender,
        token: token.address,
        now: await now(net),
        principal,
        interest,
      });
      const loanId = await settlement.read.commitmentOf([terms]);

      let contractBalance = 0n;
      const check = async (label: string, escrow = 0n) => {
        assert.equal(
          await token.read.balanceOf([settlement.address]),
          contractBalance,
          `run ${run}: ${label}`,
        );
        assert.equal(
          await settlement.read.withdrawableOf([loanId]),
          contractBalance - escrow,
          `run ${run}: withdrawable ${label}`,
        );
      };

      await settlement.write.proposeLoan([terms], { account: borrower.account });
      await check("after propose");

      await settlement.write.fund([loanId], { account: lender.account });
      contractBalance = principal;
      await check("after fund", principal);

      await settlement.write.claim([loanId], { account: borrower.account });
      contractBalance = 0n;
      await check("after claim");

      let remainingUsd = principalUsd + interestUsd;
      const parts = 1 + Math.floor(random() * 5);
      for (let part = 0; part < parts - 1; part++) {
        if (remainingUsd <= 1n) break;
        const maxUsd = Number(remainingUsd - 1n);
        const amountUsd = BigInt(1 + Math.floor(random() * maxUsd));
        const amount = amountUsd * ONE_USD;
        await settlement.write.repay([loanId, amount], { account: borrower.account });
        contractBalance += amount;
        remainingUsd -= amountUsd;
        assert.equal(
          await settlement.read.outstandingOf([loanId]),
          remainingUsd * ONE_USD,
          `run ${run}: outstanding after partial repayment`,
        );
        await check("after partial repayment");

        if (random() < 0.3) {
          const withdrawable = await settlement.read.withdrawableOf([loanId]);
          await settlement.write.withdraw([loanId], { account: lender.account });
          contractBalance -= withdrawable;
          await check("after withdrawal");
        }
      }

      const finalAmount = remainingUsd * ONE_USD;
      await settlement.write.repay([loanId, finalAmount], { account: borrower.account });
      contractBalance += finalAmount;
      assert.equal(await settlement.read.stateOf([loanId]), 5); // Repaid
      assert.equal(await settlement.read.outstandingOf([loanId]), 0n);
      await check("after final repayment");

      const withdrawable = await settlement.read.withdrawableOf([loanId]);
      await settlement.write.withdraw([loanId], { account: lender.account });
      contractBalance -= withdrawable;
      assert.equal(contractBalance, 0n);
      await check("after final withdrawal");
    }
  });
});
