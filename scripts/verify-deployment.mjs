// Read-only post-deployment verifier.
//
// It performs only these JSON-RPC calls: eth_chainId, eth_getCode and eth_call.
// It has no code path that can send a transaction, and it never asks for a key.
//
// Usage (PowerShell):
//   node scripts/verify-deployment.mjs `
//     --testusd 0xYourTestUsd --settlement 0xYourSettlement --owner 0xYourAccount
//
// Optional: --rpc <url> (default https://evm-testnet.qore.host)
//           --out <path> (default docs/evidence/phase-06-verify.md)
//
// The bytecode check hashes the bytes returned by eth_getCode and compares them
// with the manifest's runtime hash. A mismatch is reported, never hidden. If the
// only difference is the trailing CBOR metadata, the report says so explicitly.

import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const manifestPath = join(repoRoot, "docs", "deployments", "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

// viem is pinned in packages/contracts. It is used locally only for selectors
// and ABI decoding; the script itself makes plain JSON-RPC calls with fetch.
const requireFromContracts = createRequire(join(repoRoot, "packages", "contracts", "package.json"));
const { decodeAbiParameters, toFunctionSelector } = requireFromContracts("viem");

const FUSD = "0x97143B771D34ddb9130b807b135Ae675A5a963CA";

const args = process.argv.slice(2);
const readArg = (name, fallback = null) => {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (value === undefined) throw new Error(`${name} needs a value`);
  return value;
};

const isAddress = (value) => typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);

const testUsd = readArg("--testusd");
const settlement = readArg("--settlement");
const owner = readArg("--owner");
const rpc = readArg("--rpc", "https://evm-testnet.qore.host");
const outPath = readArg("--out", join(repoRoot, "docs", "evidence", "phase-06-verify.md"));

if (!isAddress(testUsd) || !isAddress(settlement) || !isAddress(owner)) {
  console.error(
    "Usage: node scripts/verify-deployment.mjs --testusd 0x.. --settlement 0x.. --owner 0x.. [--rpc url] [--out path]",
  );
  process.exit(2);
}

const raw = [];
let id = 0;

/** One read-only JSON-RPC call, with the request and response recorded. */
const call = async (method, params) => {
  const request = { jsonrpc: "2.0", id: ++id, method, params };
  const response = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  raw.push({ request, httpStatus: response.status, responseText: text });
  if (parsed === null) throw new Error(`${method}: HTTP ${response.status}, body is not JSON: ${text}`);
  if (parsed.error !== undefined) {
    throw new Error(`${method}: JSON-RPC error ${JSON.stringify(parsed.error)}`);
  }
  return parsed.result;
};

const hexToBuffer = (hex) => Buffer.from(hex.slice(2), "hex");
const sha256 = (buffer) => `0x${createHash("sha256").update(buffer).digest("hex")}`;

/** Splits the trailing CBOR metadata: the last two bytes are its big-endian length. */
const splitMetadata = (buffer) => {
  if (buffer.length < 2) return { body: buffer, metadata: Buffer.alloc(0) };
  const length = buffer.readUInt16BE(buffer.length - 2);
  const total = length + 2;
  if (total > buffer.length) return { body: buffer, metadata: Buffer.alloc(0) };
  return {
    body: buffer.subarray(0, buffer.length - total),
    metadata: buffer.subarray(buffer.length - total),
  };
};

const firstDifference = (a, b) => {
  const limit = Math.min(a.length, b.length);
  for (let index = 0; index < limit; index++) {
    if (a[index] !== b[index]) return index;
  }
  return limit;
};

const checks = [];

const record = (name, ok, detail) => {
  checks.push({ name, ok, detail });
};

/** A read that records a failure instead of aborting the whole report. */
const attempt = async (label, method, params) => {
  try {
    return await call(method, params);
  } catch (error) {
    record(label, false, `Read failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
};

const main = async () => {
  const chainId = await attempt("Chain ID", "eth_chainId", []);
  if (chainId !== null) {
    const chainOk =
      typeof chainId === "string" && chainId.toLowerCase() === manifest.network.evmChainId;
    record(
      "Chain ID",
      chainOk,
      `eth_chainId returned ${JSON.stringify(chainId)}; manifest requires ${manifest.network.evmChainId}.`,
    );
  }

  const bytecodeResults = [];
  for (const [label, address, expected] of [
    ["TestUSD", testUsd, manifest.contracts.TestUSD.runtimeBytecodeSha256],
    ["LoanSettlement", settlement, manifest.contracts.LoanSettlement.runtimeBytecodeSha256],
  ]) {
    const code = await attempt(`${label} eth_getCode`, "eth_getCode", [address, "latest"]);
    if (code === null) {
      bytecodeResults.push({
        label,
        address,
        actual: "unavailable",
        expected,
        exact: false,
        metadataOnly: null,
      });
      continue;
    }
    const buffer = hexToBuffer(code);
    const actual = sha256(buffer);
    if (actual === expected) {
      record(`${label} runtime bytecode`, true, `eth_getCode SHA-256 ${actual} equals the manifest.`);
      bytecodeResults.push({ label, address, actual, expected, exact: true, metadataOnly: false });
      continue;
    }
    const onChain = splitMetadata(buffer);
    const built = splitMetadata(hexToBuffer(manifestBytecode(label)));
    const metadataOnly =
      onChain.body.length === built.body.length &&
      Buffer.compare(onChain.body, built.body) === 0 &&
      onChain.metadata.length > 0 &&
      built.metadata.length > 0 &&
      Buffer.compare(onChain.metadata, built.metadata) !== 0;
    const offset = firstDifference(buffer, hexToBuffer(manifestBytecode(label)));
    record(
      `${label} runtime bytecode`,
      false,
      metadataOnly
        ? `MISMATCH, METADATA ONLY. On-chain SHA-256 ${actual}; manifest ${expected}. Code before the CBOR metadata is identical; the metadata trailers differ (${onChain.metadata.length} vs ${built.metadata.length} bytes). This can happen when a compiler embeds a different metadata hash. The runtime code excluding metadata matches.`
        : `MISMATCH. On-chain SHA-256 ${actual}; manifest ${expected}; on-chain ${buffer.length} bytes, compiled ${hexToBuffer(manifestBytecode(label)).length} bytes; first difference at byte ${offset}. The code differs beyond the metadata trailer (or has no comparable trailer). Do not accept this deployment as matching the manifest.`,
    );
    bytecodeResults.push({
      label,
      address,
      actual,
      expected,
      exact: false,
      metadataOnly,
      offset,
    });
  }

  const allowedSelector = toFunctionSelector("function allowedTokens() view returns (address[])");
  const allowedRaw = await attempt("LoanSettlement allowedTokens()", "eth_call", [
    { to: settlement, data: allowedSelector },
    "latest",
  ]);
  if (allowedRaw !== null) {
    try {
      const [allowed] = decodeAbiParameters([{ type: "address[]" }], allowedRaw);
      const expected = [testUsd.toLowerCase(), FUSD.toLowerCase()];
      const actual = allowed.map((entry) => entry.toLowerCase());
      const allowedOk =
        actual.length === expected.length &&
        actual.every((entry, index) => entry === expected[index]);
      record(
        "LoanSettlement allowedTokens()",
        allowedOk,
        `Decoded ${JSON.stringify(actual)}; expected ${JSON.stringify(expected)} in this order (TestUSD, fUSD).`,
      );
    } catch (error) {
      record(
        "LoanSettlement allowedTokens()",
        false,
        `Could not decode ${JSON.stringify(allowedRaw)}: ${String(error)}`,
      );
    }
  }

  const minimumSelector = toFunctionSelector(
    "function MINIMUM_CLAIM_WINDOW() view returns (uint256)",
  );
  const minimumRaw = await attempt("LoanSettlement MINIMUM_CLAIM_WINDOW", "eth_call", [
    { to: settlement, data: minimumSelector },
    "latest",
  ]);
  if (minimumRaw !== null) {
    try {
      const [minimum] = decodeAbiParameters([{ type: "uint256" }], minimumRaw);
      record(
        "LoanSettlement MINIMUM_CLAIM_WINDOW",
        minimum === 3600n,
        `Decoded ${minimum.toString()}; expected 3600 (ADR-0008 decision 9).`,
      );
    } catch (error) {
      record(
        "LoanSettlement MINIMUM_CLAIM_WINDOW",
        false,
        `Could not decode ${minimumRaw}: ${String(error)}`,
      );
    }
  }

  const metadataReads = [
    ["name()", "function name() view returns (string)", "LOANSHARK Test USD"],
    ["symbol()", "function symbol() view returns (string)", "tUSD"],
    ["decimals()", "function decimals() view returns (uint8)", 6],
  ];
  for (const [label, signature, expected] of metadataReads) {
    const selector = toFunctionSelector(signature);
    const result = await attempt(`TestUSD ${label}`, "eth_call", [
      { to: testUsd, data: selector },
      "latest",
    ]);
    if (result === null) continue;
    try {
      const [value] = decodeAbiParameters(
        [{ type: signature.includes("uint8") ? "uint8" : "string" }],
        result,
      );
      const shown = typeof value === "bigint" ? `${value.toString()}n` : JSON.stringify(value);
      const shownExpected =
        typeof expected === "bigint" ? `${expected.toString()}n` : JSON.stringify(expected);
      record(
        `TestUSD ${label}`,
        value === expected,
        `Decoded ${shown}; expected ${shownExpected}.`,
      );
    } catch (error) {
      record(`TestUSD ${label}`, false, `Could not decode ${result}: ${String(error)}`);
    }
  }

  const balanceOf = toFunctionSelector("function balanceOf(address) view returns (uint256)");
  for (const [label, token] of [
    ["TestUSD", testUsd],
    ["fUSD", FUSD],
  ]) {
    const data = `${balanceOf}${owner.slice(2).toLowerCase().padStart(64, "0")}`;
    const result = await attempt(`${label} balanceOf(owner)`, "eth_call", [
      { to: token, data },
      "latest",
    ]);
    if (result === null) continue;
    try {
      const [balance] = decodeAbiParameters([{ type: "uint256" }], result);
      record(
        `${label} balanceOf(owner)`,
        true,
        `Owner ${owner} holds ${balance.toString()} base units (read-only; no threshold is asserted).`,
      );
    } catch (error) {
      record(`${label} balanceOf(owner)`, false, `Could not decode ${result}: ${String(error)}`);
    }
  }

  const allOk = checks.every((check) => check.ok);
  const lines = [
    "# Phase 6 deployment verification (read-only)",
    "",
    `Run at ${new Date().toISOString()}.`,
    "",
    "This file was written by `scripts/verify-deployment.mjs`. The script performs only `eth_chainId`, `eth_getCode` and `eth_call`. It has no transaction path and never requested a key. A filled file is OWNER-SUPPLIED evidence: the assistant did not run it against a deployment.",
    "",
    `- RPC: \`${rpc}\``,
    `- Manifest source commit: \`${manifest.sourceCommit}\``,
    `- TestUSD: \`${testUsd}\``,
    `- LoanSettlement: \`${settlement}\``,
    `- Owner account: \`${owner}\``,
    `- fUSD (ADR-0013 Option A): \`${FUSD}\``,
    "",
    `Result: ${allOk ? "ALL CHECKS PASSED" : "ONE OR MORE CHECKS FAILED"}.`,
    "",
    "## Checks",
    "",
    "| Check | Result | Detail |",
    "|---|---|---|",
    ...checks.map(
      (check) =>
        `| ${check.name} | ${check.ok ? "PASS" : "FAIL"} | ${check.detail.replaceAll("|", "\\|")} |`,
    ),
    "",
    "## Bytecode summary",
    "",
    "| Contract | Address | On-chain SHA-256 | Manifest SHA-256 | Exact | Metadata-only difference |",
    "|---|---|---|---|---|---|",
    ...bytecodeResults.map(
      (entry) =>
        `| ${entry.label} | \`${entry.address}\` | \`${entry.actual}\` | \`${entry.expected}\` | ${entry.exact ? "yes" : "no"} | ${entry.metadataOnly ? "yes" : "no"} |`,
    ),
    "",
    "## Raw JSON-RPC requests and responses",
    "",
    "```json",
    JSON.stringify(raw, null, 2),
    "```",
    "",
  ];

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, lines.join("\n"), "utf8");
  console.log(`wrote ${outPath}`);
  for (const check of checks) {
    console.log(`${check.ok ? "PASS" : "FAIL"}  ${check.name}: ${check.detail}`);
  }
  process.exitCode = allOk ? 0 : 1;
};

function manifestBytecode(label) {
  return label === "TestUSD"
    ? manifest.contracts.TestUSD.runtimeBytecode
    : manifest.contracts.LoanSettlement.runtimeBytecode;
}

main().catch((error) => {
  console.error(`verification stopped: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
