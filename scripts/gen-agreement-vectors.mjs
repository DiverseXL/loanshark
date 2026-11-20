#!/usr/bin/env node
// Regenerates fixtures/agreement-vectors.json from @loanshark/agreement.
//
// The vectors are FROZEN. This script exists so the file can be reproduced, not
// so a failing test can be made to pass: it refuses to write unless the caller
// passes --rewrite-frozen-vectors, and the owning ADR records why a rewrite was
// approved.
//
// Historical rewrites:
//   2026-11-17  v1, terms-only commitment (keccak256(abi.encode(terms))).
//   2026-11-20  v2, domain-separated commitment for chain 9800 and the TEST ONLY
//               verifying contract (ADR-0008 decision 8 amendment, ADR-0010).
//
// Usage:
//   pnpm --filter @loanshark/agreement build
//   node scripts/gen-agreement-vectors.mjs --rewrite-frozen-vectors

import { writeFileSync } from "node:fs";
import {
  agreementHashOf,
  canonicalAgreementText,
  commitmentOf,
  DIANA_EVM_CHAIN_ID,
  TEST_ONLY_DOMAIN,
  TEST_ONLY_VERIFYING_CONTRACT,
} from "../packages/agreement/dist/index.js";

if (!process.argv.includes("--rewrite-frozen-vectors")) {
  console.error(
    "refusing to rewrite frozen vectors: pass --rewrite-frozen-vectors only when an ADR records the change",
  );
  process.exitCode = 1;
} else {
  const addr = (byte) => `0x${byte.repeat(20)}`;
  const salt = (byte) => `0x${byte.repeat(32)}`;

  const cases = [
    {
      name: "base-6-decimals",
      terms: {
        borrower: addr("11"),
        lender: addr("22"),
        token: addr("33"),
        principal: 1_000_000n,
        interest: 50_000n,
        dueDate: 1_800_000_000n,
        graceSeconds: 259_200n,
        fundingDeadline: 1_790_000_000n,
        claimDeadline: 1_795_000_000n,
        salt: salt("aa"),
      },
    },
    {
      name: "zero-interest",
      terms: {
        borrower: addr("11"),
        lender: addr("22"),
        token: addr("33"),
        principal: 1_000_000n,
        interest: 0n,
        dueDate: 1_800_000_000n,
        graceSeconds: 0n,
        fundingDeadline: 1_790_000_000n,
        claimDeadline: 1_795_000_000n,
        salt: salt("bb"),
      },
    },
    {
      name: "18-decimals",
      terms: {
        borrower: addr("44"),
        lender: addr("55"),
        token: addr("66"),
        principal: 123_456_789_012_345_678_901n,
        interest: 9_876_543_210_987_654_321n,
        dueDate: 1_900_000_000n,
        graceSeconds: 86_400n,
        fundingDeadline: 1_850_000_000n,
        claimDeadline: 1_860_000_000n,
        salt: salt("cc"),
      },
    },
    {
      name: "different-salt-only",
      terms: {
        borrower: addr("11"),
        lender: addr("22"),
        token: addr("33"),
        principal: 1_000_000n,
        interest: 50_000n,
        dueDate: 1_800_000_000n,
        graceSeconds: 259_200n,
        fundingDeadline: 1_790_000_000n,
        claimDeadline: 1_795_000_000n,
        salt: salt("dd"),
      },
    },
    {
      name: "different-parties-and-token",
      terms: {
        borrower: addr("77"),
        lender: addr("88"),
        token: addr("99"),
        principal: 2_000_000n,
        interest: 100_000n,
        dueDate: 1_810_000_000n,
        graceSeconds: 172_800n,
        fundingDeadline: 1_792_000_000n,
        claimDeadline: 1_797_000_000n,
        salt: salt("ee"),
      },
    },
  ];

  const vectors = cases.map(({ name, terms }) => ({
    name,
    terms: Object.fromEntries(
      Object.entries(terms).map(([key, value]) => [
        key,
        typeof value === "bigint" ? value.toString(10) : value,
      ]),
    ),
    loanId: commitmentOf(terms, TEST_ONLY_DOMAIN),
    agreementHash: agreementHashOf(terms),
    agreementText: canonicalAgreementText(terms),
  }));

  const out = {
    version: 2,
    domain: {
      chainId: Number(DIANA_EVM_CHAIN_ID),
      verifyingContract: TEST_ONLY_VERIFYING_CONTRACT,
      note: "TEST ONLY. No contract is deployed at this address. The vectors pin the domain-separated commitment for chain 9800.",
    },
    note: "Frozen agreement vectors, regenerated once on 2026-11-20 for the domain-separated commitment (ADR-0008 decision 8, ADR-0010) with the pinned viem 2.57.11, then locked. Do not regenerate to make a test pass.",
    termsEncoding:
      "uint256 and uint64 fields are decimal strings; addresses and salts are lowercase 0x hex.",
    vectors,
  };
  writeFileSync("fixtures/agreement-vectors.json", `${JSON.stringify(out, null, 2)}\n`);
  console.log(`wrote ${vectors.length} vectors for chain ${DIANA_EVM_CHAIN_ID}`);
}
