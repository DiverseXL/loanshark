import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { network } from "hardhat";

const FIXTURES = fileURLToPath(new URL("../../../fixtures/", import.meta.url));

interface VectorTerms {
  borrower: `0x${string}`;
  lender: `0x${string}`;
  token: `0x${string}`;
  principal: string;
  interest: string;
  dueDate: string;
  graceSeconds: string;
  fundingDeadline: string;
  claimDeadline: string;
  salt: `0x${string}`;
}

interface AgreementVector {
  name: string;
  terms: VectorTerms;
  loanId: `0x${string}`;
  agreementHash: `0x${string}`;
}

const VECTORS = (
  JSON.parse(readFileSync(join(FIXTURES, "agreement-vectors.json"), "utf8")) as {
    vectors: AgreementVector[];
  }
).vectors;

/**
 * The fixture's `loanId` is the output of the TypeScript `commitmentOf` when
 * the vectors were generated. `packages/agreement/test/commitment.test.ts`
 * recomputes it with the TypeScript implementation on every run. This test
 * makes the Solidity view function produce the same bytes32 for the same terms.
 */
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

  it("matches every frozen TypeScript vector", async function () {
    for (const vector of VECTORS) {
      const terms = {
        borrower: vector.terms.borrower,
        lender: vector.terms.lender,
        token: vector.terms.token,
        principal: BigInt(vector.terms.principal),
        interest: BigInt(vector.terms.interest),
        dueDate: BigInt(vector.terms.dueDate),
        graceSeconds: BigInt(vector.terms.graceSeconds),
        fundingDeadline: BigInt(vector.terms.fundingDeadline),
        claimDeadline: BigInt(vector.terms.claimDeadline),
        salt: vector.terms.salt,
      };
      assert.equal(
        await settlement.read.commitmentOf([terms]),
        vector.loanId,
        `${vector.name}: Solidity commitment differs from the TypeScript vector`,
      );
    }
  });

  it("uses abi.encode, not packed encoding, so field boundaries matter", async function () {
    const base = VECTORS[0]!;
    const terms = {
      borrower: base.terms.borrower,
      lender: base.terms.lender,
      token: base.terms.token,
      principal: BigInt(base.terms.principal),
      interest: BigInt(base.terms.interest),
      dueDate: BigInt(base.terms.dueDate),
      graceSeconds: BigInt(base.terms.graceSeconds),
      fundingDeadline: BigInt(base.terms.fundingDeadline),
      claimDeadline: BigInt(base.terms.claimDeadline),
      salt: base.terms.salt,
    };
    const changedInterest = { ...terms, interest: terms.interest + 1n };
    assert.notEqual(
      await settlement.read.commitmentOf([terms]),
      await settlement.read.commitmentOf([changedInterest]),
    );
  });
});
