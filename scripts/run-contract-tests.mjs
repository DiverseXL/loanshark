#!/usr/bin/env node
// Runs the Hardhat suite and keeps its output for scripts/test-counts.mjs.
//
// The count of passing tests is read from the runner's own summary line, so the
// docs checker can compare a written claim with what the runner actually
// reported. Nothing here sends a transaction: the suite runs on the in-process
// Hardhat network.
//
// Usage:
//   node scripts/run-contract-tests.mjs

import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const OUTPUT_PATH = ".tmp/contract-tests.txt";

export function parsePassing(output) {
  const match = /(\d+) passing\b/.exec(output);
  return match ? Number(match[1]) : null;
}

export function parseFailing(output) {
  const match = /(\d+) failing\b/.exec(output);
  return match ? Number(match[1]) : 0;
}

const main = async () => {
  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const chunks = [];
  const child = spawn(command, ["--filter", "@loanshark/contracts", "test"], {
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
  });
  child.stdout.on("data", (chunk) => {
    chunks.push(chunk);
    process.stdout.write(chunk);
  });
  child.stderr.on("data", (chunk) => {
    chunks.push(chunk);
    process.stderr.write(chunk);
  });
  const code = await new Promise((done) => child.on("close", (value) => done(value ?? 1)));
  const output = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
  await mkdir(dirname(resolve(OUTPUT_PATH)), { recursive: true });
  await writeFile(
    OUTPUT_PATH,
    JSON.stringify({
      exitCode: code,
      passing: parsePassing(output),
      failing: parseFailing(output),
    }),
    "utf8",
  );
  if (code !== 0) {
    console.error(`contract tests failed with exit code ${code}`);
    process.exitCode = code;
  }
};

const invoked = process.argv[1] === undefined ? "" : resolve(process.argv[1]);
if (invoked === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`contract test run failed: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  });
}
