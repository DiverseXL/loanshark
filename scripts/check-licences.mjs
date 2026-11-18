#!/usr/bin/env node
// Checks every installed dependency licence against a fixed allowlist.
//
// The repository is distributed under Apache-2.0 (ADR-0001). This script is the
// M7 licence review: it fails on a licence that has not been reviewed, rather
// than assuming that a package is permissive because it is popular.
//
// It reads the installed tree through `pnpm -r licenses list --json`, so it
// covers direct and transitive dependencies of every workspace package. It does
// not contact the network itself; pnpm reads the packages already installed by
// `pnpm install --frozen-lockfile`.

import { execSync } from "node:child_process";

// Reviewed and accepted. MPL-2.0 is file-level copyleft: the packages below are
// used unmodified as build tooling and are not patched or redistributed as
// source. CC-BY-4.0 is data (caniuse-lite) used at build time; its attribution
// requirement is noted by the README credits and this file.
const ALLOWED = new Set([
  "0BSD",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "CC-BY-4.0",
  "CC0-1.0",
  "ISC",
  "MIT",
  "MIT OR Apache-2.0",
  "MPL-2.0",
  "Unlicense",
]);

const NOTES = new Map([
  [
    "CC-BY-4.0",
    "attribution required: caniuse-lite data is used at build time and credited in README.md",
  ],
  [
    "MPL-2.0",
    "weak copyleft: lightningcss is used unmodified as build tooling; no files are patched",
  ],
]);

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

let raw;
try {
  raw = execSync("pnpm -r licenses list --json", {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
} catch (error) {
  fail(`could not list licences: ${error instanceof Error ? error.message : String(error)}`);
}

let data;
try {
  data = JSON.parse(raw);
} catch (error) {
  fail(`licence output is not JSON: ${error instanceof Error ? error.message : String(error)}`);
}

const licences = Object.keys(data).sort();
const total = licences.reduce((count, licence) => count + data[licence].length, 0);

if (total === 0) {
  fail("no packages were reported; run pnpm install before this check");
}

console.log(`checked ${total} installed packages across ${licences.length} licence labels`);
for (const licence of licences) {
  const note = NOTES.get(licence);
  console.log(
    `  ${licence.padEnd(20)} ${String(data[licence].length).padStart(4)}${note ? `  (${note})` : ""}`,
  );
}

const disallowed = licences.filter((licence) => !ALLOWED.has(licence));
if (disallowed.length > 0) {
  console.error("\nUnreviewed licence labels:");
  for (const licence of disallowed) {
    const packages = data[licence].map((entry) => entry.name).join(", ");
    console.error(`- ${licence}: ${packages}`);
  }
  console.error("\nReview each package before adding its licence to the allowlist.");
  process.exit(1);
}

console.log("\nAll installed licences are on the reviewed allowlist.");
