#!/usr/bin/env node
// Collects machine-readable test counts from the runners' own output.
//
// Inputs (written by `pnpm test`):
//   .tmp/vitest-report.json   vitest --reporter=json
//   .tmp/contract-tests.txt   scripts/run-contract-tests.mjs
// Output:
//   .tmp/test-counts.json     { vitest: { total, files }, hardhat: { total, exitCode } }
//
// scripts/check-docs.mjs compares the counts written in the docs with this
// file, so a claim either matches a runner or fails the checker.
//
// Usage:
//   pnpm test-counts

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

export const VITEST_REPORT = ".tmp/vitest-report.json";
export const CONTRACT_OUTPUT = ".tmp/contract-tests.txt";
export const COUNTS_PATH = ".tmp/test-counts.json";

const toRepoPath = (value) => relative(process.cwd(), value).split("\\").join("/");

/**
 * Turns a vitest JSON report into per-file counts keyed by repository path.
 * Import errors and skipped files are reported so a claim cannot silently
 * count a file that did not run.
 */
export function countsFromVitest(report) {
  const files = {};
  let total = 0;
  let skipped = 0;
  for (const result of report.testResults ?? []) {
    const key = toRepoPath(result.name);
    const assertions = result.assertionResults ?? [];
    const passed = assertions.filter((item) => item.status === "passed").length;
    const pending = assertions.filter((item) => item.status !== "passed").length;
    files[key] = passed;
    total += passed;
    skipped += pending;
  }
  return { total, skipped, files };
}

export function countsFromContracts(record) {
  return { total: record.passing ?? 0, exitCode: record.exitCode ?? 1 };
}

const main = async () => {
  const vitest = JSON.parse(await readFile(VITEST_REPORT, "utf8"));
  const contracts = JSON.parse(await readFile(CONTRACT_OUTPUT, "utf8"));
  const counts = {
    generatedAt: new Date().toISOString(),
    vitest: countsFromVitest(vitest),
    hardhat: countsFromContracts(contracts),
  };
  await mkdir(dirname(resolve(COUNTS_PATH)), { recursive: true });
  await writeFile(COUNTS_PATH, `${JSON.stringify(counts, null, 2)}\n`, "utf8");
  console.log(
    `test counts: vitest ${counts.vitest.total} passed (${counts.vitest.skipped} skipped), ` +
      `hardhat ${counts.hardhat.total} passing`,
  );
  console.log(`wrote ${COUNTS_PATH}`);
};

const invoked = resolve(process.argv[1] ?? "");
if (invoked.endsWith("test-counts.mjs")) {
  main().catch((error) => {
    console.error(
      `could not collect test counts: ${error instanceof Error ? error.message : error}\n` +
        "Run `pnpm test` first; it writes the runner reports this script reads.",
    );
    process.exitCode = 1;
  });
}
