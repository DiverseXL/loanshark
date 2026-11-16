#!/usr/bin/env node
// Prints the toolchain versions and fails when one differs from the pinned value.
// Pins are read from package.json (engines, packageManager, devDependencies) so
// there is a single source of truth. ASSUMPTION: exact pins, not ranges, for
// every tool; see docs/adr/0006-quality-tooling.md.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

/** @param {string} name */
function installedVersion(name) {
  const path = join(root, "node_modules", name, "package.json");
  try {
    return JSON.parse(readFileSync(path, "utf8")).version;
  } catch {
    return null;
  }
}

/** @param {string} command */
function commandVersion(command) {
  try {
    return execSync(command, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .trim()
      .replace(/^v/, "");
  } catch {
    return null;
  }
}

const packageManager = String(pkg.packageManager ?? "");
const pnpmMatch = /^pnpm@(.+)$/.exec(packageManager);
const expectedPnpm = pnpmMatch ? pnpmMatch[1] : null;

const checks = [
  { tool: "node", expected: pkg.engines?.node ?? null, actual: process.versions.node },
  { tool: "pnpm", expected: expectedPnpm, actual: commandVersion("pnpm --version") },
  {
    tool: "typescript",
    expected: pkg.devDependencies?.typescript ?? null,
    actual: installedVersion("typescript"),
  },
  {
    tool: "@biomejs/biome",
    expected: pkg.devDependencies?.["@biomejs/biome"] ?? null,
    actual: installedVersion("@biomejs/biome"),
  },
  {
    tool: "vitest",
    expected: pkg.devDependencies?.vitest ?? null,
    actual: installedVersion("vitest"),
  },
];

const failures = [];
console.log("tool            pinned        actual");
console.log("--------------  ------------  ------------");
for (const check of checks) {
  const actual = check.actual ?? "not found";
  const ok = check.expected !== null && check.actual === check.expected;
  if (!ok) {
    failures.push(`${check.tool}: pinned ${check.expected ?? "unknown"}, found ${actual}`);
  }
  console.log(`${check.tool.padEnd(14)}  ${(check.expected ?? "?").padEnd(12)}  ${actual}`);
}

if (failures.length > 0) {
  console.error("\nToolchain mismatch:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("\nToolchain matches the pinned versions.");
