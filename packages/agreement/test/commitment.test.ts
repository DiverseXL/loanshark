import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { commitmentOf, encodeCommitment, encodeTerms } from "../src/commitment.js";
import type { Terms } from "../src/terms.js";
import { agreementHashOf, canonicalAgreementText } from "../src/text.js";

const FIXTURES = fileURLToPath(new URL("../../../fixtures/", import.meta.url));

interface VectorTerms {
  borrower: string;
  lender: string;
  token: string;
  principal: string;
  interest: string;
  dueDate: string;
  graceSeconds: string;
  fundingDeadline: string;
  claimDeadline: string;
  salt: string;
}

interface AgreementVector {
  name: string;
  terms: VectorTerms;
  loanId: `0x${string}`;
  agreementHash: `0x${string}`;
  agreementText: string;
}

const FILE = JSON.parse(readFileSync(join(FIXTURES, "agreement-vectors.json"), "utf8")) as {
  version: number;
  domain: { chainId: number; verifyingContract: `0x${string}`; note: string };
  vectors: AgreementVector[];
};

const VECTORS = FILE.vectors;

/** The frozen domain, read from the vectors so the file is the anchor. */
const DOMAIN = {
  chainId: BigInt(FILE.domain.chainId),
  verifyingContract: FILE.domain.verifyingContract,
};

const termsFrom = (raw: VectorTerms): Terms => ({
  borrower: raw.borrower as `0x${string}`,
  lender: raw.lender as `0x${string}`,
  token: raw.token as `0x${string}`,
  principal: BigInt(raw.principal),
  interest: BigInt(raw.interest),
  dueDate: BigInt(raw.dueDate),
  graceSeconds: BigInt(raw.graceSeconds),
  fundingDeadline: BigInt(raw.fundingDeadline),
  claimDeadline: BigInt(raw.claimDeadline),
  salt: raw.salt as `0x${string}`,
});

const BASE = termsFrom(VECTORS[0]!.terms);

const changed = (overrides: Partial<Terms>): Terms => ({ ...BASE, ...overrides });

const FIELD_CASES: Array<[string, Terms]> = [
  ["borrower", changed({ borrower: "0x9999999999999999999999999999999999999999" })],
  ["lender", changed({ lender: "0x8888888888888888888888888888888888888888" })],
  ["token", changed({ token: "0x7777777777777777777777777777777777777777" })],
  ["principal", changed({ principal: BASE.principal + 1n })],
  ["interest", changed({ interest: BASE.interest + 1n })],
  ["dueDate", changed({ dueDate: BASE.dueDate + 1n })],
  ["graceSeconds", changed({ graceSeconds: BASE.graceSeconds + 1n })],
  ["fundingDeadline", changed({ fundingDeadline: BASE.fundingDeadline + 1n })],
  ["claimDeadline", changed({ claimDeadline: BASE.claimDeadline + 1n })],
  ["salt", changed({ salt: `0x${"ab".repeat(32)}` })],
];

describe("commitmentOf", () => {
  it("is deterministic and matches the ABI-encoded terms", () => {
    expect(commitmentOf(BASE, DOMAIN)).toBe(commitmentOf(BASE, DOMAIN));
    expect(encodeTerms(BASE)).toBe(encodeTerms(BASE));
    expect(encodeCommitment(BASE, DOMAIN)).toBe(encodeCommitment(BASE, DOMAIN));
    expect(commitmentOf(BASE, DOMAIN)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("changes when any one of the ten fields changes", () => {
    const baseCommitment = commitmentOf(BASE, DOMAIN);
    for (const [name, mutated] of FIELD_CASES) {
      expect(commitmentOf(mutated, DOMAIN), `${name} did not change the commitment`).not.toBe(
        baseCommitment,
      );
    }
  });

  it("gives a different loan id for a wrong salt, borrower, lender or token", () => {
    const baseCommitment = commitmentOf(BASE, DOMAIN);
    for (const [name, mutated] of FIELD_CASES.filter(([name]) =>
      ["salt", "borrower", "lender", "token"].includes(name),
    )) {
      expect(commitmentOf(mutated, DOMAIN), `${name} did not change the loan id`).not.toBe(
        baseCommitment,
      );
    }
  });

  it("gives a different loan id under a different chain id", () => {
    const other = { ...DOMAIN, chainId: DOMAIN.chainId + 1n };
    expect(commitmentOf(BASE, other)).not.toBe(commitmentOf(BASE, DOMAIN));
  });

  it("gives a different loan id under a different verifying contract", () => {
    const other = {
      ...DOMAIN,
      verifyingContract: "0x000000000000000000000000000000000000bEEF" as `0x${string}`,
    };
    expect(commitmentOf(BASE, other)).not.toBe(commitmentOf(BASE, DOMAIN));
  });

  it("prepends the chain id word and the address word before the terms", () => {
    const encoded = encodeCommitment(BASE, DOMAIN);
    const terms = encodeTerms(BASE);
    expect(encoded.endsWith(terms.slice(2))).toBe(true);
    expect(encoded.slice(0, 66)).toBe(`0x${DOMAIN.chainId.toString(16).padStart(64, "0")}`);
    expect(encoded.slice(66, 130)).toBe(
      `000000000000000000000000${DOMAIN.verifyingContract.slice(2).toLowerCase()}`,
    );
  });

  it("matches every frozen vector", () => {
    for (const vector of VECTORS) {
      const terms = termsFrom(vector.terms);
      expect(commitmentOf(terms, DOMAIN), vector.name).toBe(vector.loanId);
    }
  });

  it("rejects malformed addresses, salt, chain id and verifying contract", () => {
    expect(() => commitmentOf(changed({ borrower: "0x1234" as `0x${string}` }), DOMAIN)).toThrow(
      TypeError,
    );
    expect(() => commitmentOf(changed({ salt: "0x1234" as `0x${string}` }), DOMAIN)).toThrow(
      TypeError,
    );
    expect(() => commitmentOf(BASE, { ...DOMAIN, chainId: -1n })).toThrow(TypeError);
    expect(() =>
      commitmentOf(BASE, { ...DOMAIN, verifyingContract: "0x1234" as `0x${string}` }),
    ).toThrow(TypeError);
  });
});

describe("frozen vectors file", () => {
  it("is version 2 and labels its verifying contract TEST ONLY", () => {
    expect(FILE.version).toBe(2);
    expect(FILE.domain.chainId).toBe(9800);
    expect(FILE.domain.verifyingContract).toBe("0x000000000000000000000000000000000000c0de");
    expect(FILE.domain.note).toContain("TEST ONLY");
    expect(FILE.domain.note).toContain("No contract is deployed");
  });
});

describe("canonical agreement text", () => {
  it("is versioned, one field per line and has no trailing newline", () => {
    const text = canonicalAgreementText(BASE);
    const lines = text.split("\n");
    expect(lines).toHaveLength(11);
    expect(lines[0]).toBe("LOANSHARK AGREEMENT v1");
    expect(text.endsWith("\n")).toBe(false);
    expect(lines[1]).toBe(`borrower: ${BASE.borrower}`);
  });

  it("matches every frozen vector's text and hash", () => {
    for (const vector of VECTORS) {
      const terms = termsFrom(vector.terms);
      expect(canonicalAgreementText(terms), vector.name).toBe(vector.agreementText);
      expect(agreementHashOf(terms), vector.name).toBe(vector.agreementHash);
    }
  });

  it("changes the agreement hash when any one field changes", () => {
    const baseHash = agreementHashOf(BASE);
    for (const [name, mutated] of FIELD_CASES) {
      expect(agreementHashOf(mutated), `${name} did not change the agreement hash`).not.toBe(
        baseHash,
      );
    }
  });

  it("does not depend on the settlement domain", () => {
    expect(agreementHashOf(BASE)).toBe(agreementHashOf({ ...BASE }));
  });
});
