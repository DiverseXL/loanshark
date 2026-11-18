import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { assertBalance, deployWorld, makeTerms, now, ONE_USD } from "./support.js";

/**
 * ADR-0013 Option A: the settlement allowlists exactly TestUSD and the fest
 * fUSD address. The local lifecycle test for the second entry uses
 * MockFusdProfile, a MOCK with the recorded fUSD metadata (6 decimals). It is
 * not the real fUSD contract and no local test exercises the real one.
 */
describe("LoanSettlement two-token allowlist (ADR-0013 Option A)", async function () {
  const net = await network.create();

  it("allows exactly the two constructor addresses, in order", async function () {
    const world = await deployWorld(net);
    const allowed = (await world.settlement.read.allowedTokens()).map((entry) =>
      entry.toLowerCase(),
    );
    assert.deepEqual(allowed, [world.token.address.toLowerCase(), world.fusd.address.toLowerCase()]);
    assert.equal(await world.settlement.read.isAllowedToken([world.token.address]), true);
    assert.equal(await world.settlement.read.isAllowedToken([world.fusd.address]), true);
    assert.equal(await world.settlement.read.isAllowedToken([world.token18.address]), false);
  });

  it("rejects a zero address, a duplicate address and a second zero address in the constructor", async function () {
    const zero = "0x0000000000000000000000000000000000000000" as const;
    const other = "0x0000000000000000000000000000000000000001" as const;
    await assert.rejects(
      net.viem.deployContract("LoanSettlement", [zero, other]),
      /InvalidAddress/,
    );
    await assert.rejects(
      net.viem.deployContract("LoanSettlement", [other, zero]),
      /InvalidAddress/,
    );
    await assert.rejects(
      net.viem.deployContract("LoanSettlement", [other, other]),
      /InvalidAddress/,
    );
  });

  it("completes the full lifecycle in TestUSD", async function () {
    const world = await deployWorld(net);
    const { token, settlement, borrower, lender } = world;
    const terms = makeTerms({ borrower, lender, token: token.address, now: await now(net) });
    const loanId = await settlement.read.commitmentOf([terms]);

    await settlement.write.proposeLoan([terms], { account: borrower.account });
    await settlement.write.fund([loanId], { account: lender.account });
    await settlement.write.claim([loanId], { account: borrower.account });
    await settlement.write.repay([loanId, 1_050n * ONE_USD], { account: borrower.account });
    assert.equal(await settlement.read.stateOf([loanId]), 5); // Repaid
    await settlement.write.withdraw([loanId], { account: lender.account });

    await assertBalance(token, settlement.address, 0n);
    await assertBalance(token, lender.account.address, 10_050n * ONE_USD);
    await assertBalance(token, borrower.account.address, 9_950n * ONE_USD);
  });

  it("completes the full lifecycle in the MOCK fUSD-profile token", async function () {
    const world = await deployWorld(net);
    const { fusd, settlement, borrower, lender } = world;

    // The MOCK's own metadata, so the profile is checked and visibly labelled.
    assert.equal(await fusd.read.name(), "Mock Fest USD");
    assert.equal(await fusd.read.symbol(), "mFUSD");
    assert.equal(await fusd.read.decimals(), 6);

    const terms = makeTerms({ borrower, lender, token: fusd.address, now: await now(net) });
    const loanId = await settlement.read.commitmentOf([terms]);

    await settlement.write.proposeLoan([terms], { account: borrower.account });
    assert.equal(await settlement.read.stateOf([loanId]), 1); // Proposed
    await settlement.write.fund([loanId], { account: lender.account });
    assert.equal(await settlement.read.stateOf([loanId]), 2); // Funded
    await assertBalance(fusd, settlement.address, 1_000n * ONE_USD, "mock fUSD escrow");
    await settlement.write.claim([loanId], { account: borrower.account });
    assert.equal(await settlement.read.stateOf([loanId]), 3); // Active
    await settlement.write.repay([loanId, 1_050n * ONE_USD], { account: borrower.account });
    assert.equal(await settlement.read.stateOf([loanId]), 5); // Repaid
    await settlement.write.withdraw([loanId], { account: lender.account });

    await assertBalance(fusd, settlement.address, 0n);
    await assertBalance(fusd, lender.account.address, 10_050n * ONE_USD);
    await assertBalance(fusd, borrower.account.address, 9_950n * ONE_USD);
  });

  it("rejects a token outside the allowlist", async function () {
    const world = await deployWorld(net);
    const { settlement, borrower, lender } = world;
    // A second TestUSD deployment is a valid ERC-20 with the same profile but
    // a different address, so the rejection is about the allowlist only.
    const unlisted = await net.viem.deployContract("TestUSD", [world.owner.account.address]);
    const terms = makeTerms({
      borrower,
      lender,
      token: unlisted.address,
      now: await now(net),
    });

    await assert.rejects(
      settlement.write.proposeLoan([terms], { account: borrower.account }),
      /TokenNotAllowed/,
    );
    assert.equal(await settlement.read.isAllowedToken([unlisted.address]), false);
    assert.equal((await settlement.read.allowedTokens()).length, 2);
  });
});
