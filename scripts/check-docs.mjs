#!/usr/bin/env node
// Documentation checker: paths, evidence listing and test-count claims.
//
// Fails when:
//   1. a docs file references a repository path that does not exist;
//   2. docs/EVIDENCE.md does not list every file in docs/evidence/;
//   3. a docs file states a test count that disagrees with the runners.
//
// Test counts are read from .tmp/test-counts.json, which `pnpm test-counts`
// writes from the vitest JSON report and the Hardhat summary. A claim is a
// backticked test path followed by "(N tests)". A claim whose path cannot be
// resolved is also a failure: reword it or remove it rather than leaving it to
// rot. Paths under fixtures-out/ and .tmp/ are generated output, not source
// paths, and are exempt from check 1.
//
// Two kinds of reference are not repository paths and are reported as notes
// instead of failures: a bare filename (it cannot be resolved from the root
// reliably), and a path on a line that names an upstream repository or commit
// (for example `qoreseal` `packages/ts/src/keys.ts` at a commit).
//
// Usage:
//   pnpm docs:check

import { existsSync, globSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = process.cwd();
const COUNTS_PATH = ".tmp/test-counts.json";
const EVIDENCE_INDEX = "docs/EVIDENCE.md";
const SKIP_DIRECTORIES = new Set([
  ".git",
  ".tmp",
  "node_modules",
  "dist",
  "fixtures-out",
  "build",
  "cache",
  "artifacts",
]);
const GENERATED_PREFIXES = ["fixtures-out/", ".tmp/"];
const KNOWN_ROOTS = new Set(["apps", "packages", "scripts", "docs", "fixtures", ".github"]);
const UPSTREAM_MARKERS =
  /qoreseal|qoresign|wallet-adapter|npm tarball|at commit|node_modules|`[0-9a-f]{7,40}`/i;

const failures = [];
const notes = [];

function walk(directory) {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      found.push(...walk(join(directory, entry.name)));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      found.push(join(directory, entry.name));
    }
  }
  return found;
}

function looksLikeRepoPath(candidate) {
  if (candidate.length === 0 || candidate.length > 200) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(candidate)) return false; // URLs, C:, mailto
  if (candidate.startsWith("/") || candidate.startsWith("~")) return false;
  if (/[\s(){}<>|=#,$"'`]/.test(candidate)) return false;
  if (candidate.startsWith("-")) return false;
  if (candidate.includes("@") && !candidate.includes("/")) return false;
  if (GENERATED_PREFIXES.some((prefix) => candidate.startsWith(prefix))) return false;
  if (candidate.startsWith("node_modules/")) return false;
  // Bare filenames resolve against no fixed directory, so they are not checked.
  if (!candidate.includes("/")) return false;
  if (candidate.includes("/")) {
    const first = candidate.split("/")[0];
    if (!KNOWN_ROOTS.has(first) && !existsSync(resolve(ROOT, first))) return false;
  }
  return true;
}

function pathExists(candidate) {
  const trimmed = candidate.replace(/[.,;:]+$/, "");
  if (trimmed.includes("*")) {
    const matches = globSync(trimmed, { cwd: ROOT });
    return matches.length > 0;
  }
  const absolute = resolve(ROOT, trimmed);
  return existsSync(absolute) && statSync(absolute) !== undefined;
}

function checkPaths(files) {
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const relativeFile = relative(ROOT, file).split("\\").join("/");
    const seen = new Set();
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      for (const match of line.matchAll(/`([^`\n]+)`/g)) {
        const candidate = (match[1] ?? "").trim();
        if (!looksLikeRepoPath(candidate) || seen.has(candidate)) continue;
        seen.add(candidate);
        if (pathExists(candidate)) continue;
        if (UPSTREAM_MARKERS.test(line)) {
          notes.push(
            `${relativeFile}: upstream reference, not checked against this tree: ${candidate}`,
          );
          continue;
        }
        failures.push(`${relativeFile}: referenced path does not exist: ${candidate}`);
      }
    }
    for (const match of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = match[1] ?? "";
      if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#")) continue;
      const withoutAnchor = target.split("#")[0] ?? "";
      if (withoutAnchor.length === 0) continue;
      const base = resolve(ROOT, relativeFile, "..");
      if (!existsSync(resolve(base, withoutAnchor))) {
        failures.push(`${relativeFile}: markdown link target does not exist: ${target}`);
      }
    }
  }
}

function checkEvidenceIndex() {
  const index = readFileSync(resolve(ROOT, EVIDENCE_INDEX), "utf8");
  const evidenceDirectory = resolve(ROOT, "docs/evidence");
  const listed = new Set(
    readdirSync(evidenceDirectory)
      .filter((name) => statSync(join(evidenceDirectory, name)).isFile())
      .map((name) => name),
  );
  for (const name of listed) {
    if (!index.includes(name)) {
      failures.push(`${EVIDENCE_INDEX}: does not list docs/evidence/${name}`);
    }
  }
}

function resolveClaim(claimPath, counts) {
  if (Object.hasOwn(counts.vitest.files, claimPath)) {
    return { count: counts.vitest.files[claimPath], source: "vitest" };
  }
  if (claimPath.startsWith("packages/contracts/")) {
    return { count: counts.hardhat.total, source: "hardhat" };
  }
  if (claimPath.includes("*")) {
    const matches = Object.keys(counts.vitest.files).filter((key) => {
      const pattern = new RegExp(
        `^${claimPath.replace(/[.+^${}()|\\]/g, "\\$&").replace(/\*/g, "[^/]*")}$`,
      );
      return pattern.test(key);
    });
    if (matches.length === 0) return null;
    return {
      count: matches.reduce((sum, key) => sum + counts.vitest.files[key], 0),
      source: `vitest (${matches.length} files)`,
    };
  }
  return null;
}

function checkCounts(files) {
  const claims = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const relativeFile = relative(ROOT, file).split("\\").join("/");
    for (const match of text.matchAll(/`([^`\n]+)`\s*\((\d+) tests?\b/g)) {
      claims.push({
        file: relativeFile,
        path: (match[1] ?? "").trim(),
        stated: Number(match[2]),
      });
    }
  }
  if (claims.length === 0) {
    notes.push("no test-count claims found in the docs");
    return;
  }
  if (!existsSync(resolve(ROOT, COUNTS_PATH))) {
    failures.push(
      `${claims.length} test-count claims exist but ${COUNTS_PATH} is missing; run \`pnpm test\` and \`pnpm test-counts\` first`,
    );
    return;
  }
  const counts = JSON.parse(readFileSync(resolve(ROOT, COUNTS_PATH), "utf8"));
  for (const claim of claims) {
    const resolved = resolveClaim(claim.path, counts);
    if (!resolved) {
      failures.push(
        `${claim.file}: cannot resolve the test count for \`${claim.path}\`; add the test path or reword the claim`,
      );
      continue;
    }
    if (resolved.count !== claim.stated) {
      failures.push(
        `${claim.file}: says ${claim.stated} tests for \`${claim.path}\`, the runner reported ${resolved.count} (${resolved.source})`,
      );
    }
  }
}

function main() {
  const files = [resolve(ROOT, "README.md"), ...walk(resolve(ROOT, "docs"))].filter((file) =>
    existsSync(file),
  );
  for (const extra of ["CHANGELOG.md", "AI_USAGE.md"]) {
    const absolute = resolve(ROOT, extra);
    if (existsSync(absolute)) files.push(absolute);
  }
  for (const group of ["apps", "packages"]) {
    const base = resolve(ROOT, group);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const readme = resolve(base, entry.name, "README.md");
      if (existsSync(readme)) files.push(readme);
    }
  }

  checkPaths(files);
  checkEvidenceIndex();
  checkCounts(files);

  console.log(`docs checker: ${files.length} markdown files`);
  for (const note of notes) console.log(`note: ${note}`);
  if (failures.length > 0) {
    for (const failure of failures) console.error(`FAIL ${failure}`);
    console.error(`${failures.length} problem(s) found`);
    process.exitCode = 1;
    return;
  }
  console.log("all documented paths exist, every evidence file is listed, every count matches");
}

main();
