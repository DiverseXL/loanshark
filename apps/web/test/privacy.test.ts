// The privacy panel must match the README claims table exactly. This test
// parses README.md rather than trusting a copy, so the panel cannot drift.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CLAIM_ROWS, NO_ZK_CLAIM } from "../src/privacy.js";

const readme = readFileSync(fileURLToPath(new URL("../../../README.md", import.meta.url)), "utf8");

const readClaimTable = (): Array<{ does: string; doesNotClaim: string }> => {
  const lines = readme.split(/\r?\n/);
  const header = lines.findIndex((line) => line.trim() === "| It does | It does not claim |");
  expect(header).toBeGreaterThan(-1);
  const table: string[] = [];
  for (let index = header; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (!line.trim().startsWith("|")) break;
    table.push(line);
  }
  return table.slice(2).map((line) => {
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    expect(cells).toHaveLength(2);
    return { does: cells[0] ?? "", doesNotClaim: cells[1] ?? "" };
  });
};

describe("privacy boundary panel", () => {
  it("copies every row of the README claims table exactly", () => {
    expect(CLAIM_ROWS).toEqual(readClaimTable());
  });

  it("copies the no-zero-knowledge sentence exactly", () => {
    expect(readme).toContain(NO_ZK_CLAIM);
  });

  it("does not claim anonymity or private transfers in either column", () => {
    for (const row of CLAIM_ROWS) {
      expect(row.doesNotClaim.toLowerCase()).not.toMatch(/^anonymous$/);
    }
    expect(CLAIM_ROWS[0]?.doesNotClaim).toContain("public");
  });
});
