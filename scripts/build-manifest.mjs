// Builds docs/deployments/manifest.json from Hardhat's compile output.
//
// The manifest is deterministic: it contains no timestamp, no machine path and
// no private data. Run it twice and the SHA-256 of the file must not change
// (scripts/build-manifest.mjs --check does exactly that).
//
// What is hashed: the raw bytecode bytes decoded from the artifact's hex string.
// The "0x" prefix and the hex encoding are not part of the hash input. Both the
// creation and the runtime bytecode are hashed this way.
//
// No chain call and no deployment happens here.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const artifactsRoot = join(repoRoot, "packages", "contracts", "artifacts");
const outPath = join(repoRoot, "docs", "deployments", "manifest.json");

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

const sha256OfHex = (hex) => {
  if (!/^0x[0-9a-fA-F]*$/.test(hex)) throw new Error(`Not a hex string: ${hex.slice(0, 16)}...`);
  return `0x${createHash("sha256")
    .update(Buffer.from(hex.slice(2), "hex"))
    .digest("hex")}`;
};

const git = (args) => execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();

const contractArtifact = (sourceFile, contractName) => {
  const path = join(artifactsRoot, "contracts", sourceFile, `${contractName}.json`);
  const artifact = readJson(path);
  const buildInfo = readJson(join(artifactsRoot, "build-info", `${artifact.buildInfoId}.json`));
  const output = buildInfo.input.settings;
  return {
    artifact,
    compiler: {
      version: buildInfo.solcVersion,
      longVersion: buildInfo.solcLongVersion,
      evmVersion: output.evmVersion,
      optimizer: {
        enabled: output.optimizer.enabled,
        runs: output.optimizer.runs,
      },
    },
  };
};

const testUsd = contractArtifact("TestUSD.sol", "TestUSD");
const settlement = contractArtifact("LoanSettlement.sol", "LoanSettlement");

if (testUsd.compiler.version !== "0.8.34") {
  throw new Error(`Expected solc 0.8.34, found ${testUsd.compiler.version}`);
}
if (testUsd.compiler.evmVersion !== "osaka") {
  throw new Error(`Expected evmVersion osaka, found ${testUsd.compiler.evmVersion}`);
}
if (testUsd.compiler.optimizer.enabled !== true || testUsd.compiler.optimizer.runs !== 200) {
  throw new Error("Expected optimizer enabled at 200 runs");
}
if (settlement.artifact.bytecode === "0x" || settlement.artifact.deployedBytecode === "0x") {
  throw new Error("LoanSettlement artifact has no bytecode; compile first.");
}

// The commit and dirty flag refer to the compiler inputs only, so later
// documentation commits do not change the manifest.
const compilerInputs = ["packages/contracts/contracts", "packages/contracts/hardhat.config.ts"];
const sourceCommit = git(["log", "-1", "--format=%H", "--", ...compilerInputs]);
const workingTreeDirty =
  git(["status", "--porcelain", "--untracked-files=no", "--", ...compilerInputs]).length > 0;

const manifest = {
  format: "loanshark-deployment-manifest-v1",
  network: {
    name: "qorechain-diana",
    evmChainId: "0x2648",
    evmChainIdDecimal: 9800,
    evmRpc: "https://evm-testnet.qore.host",
    explorer: "https://explore.qore.network",
  },
  sourceCommit,
  sourceCommitNote:
    "Last commit that touched packages/contracts/contracts or hardhat.config.ts; the dirty flag covers the same paths only.",
  workingTreeDirty,
  compiler: testUsd.compiler,
  hashInput:
    "SHA-256 over the raw bytecode bytes decoded from the hex string; the 0x prefix and hex encoding are excluded.",
  allowlist: {
    option: "A",
    adr: "docs/adr/0013-settlement-token.md",
    tokens: [
      {
        label: "TestUSD",
        address: null,
        note: "Deployed in step 2 of the owner checklist; the address is not known before the owner runs it.",
      },
      {
        label: "fUSD (fest)",
        address: "0x97143B771D34ddb9130b807b135Ae675A5a963CA",
        note: "Existing fest token. Not deployed or verified by this project; see ADR-0013.",
      },
    ],
  },
  contracts: {
    TestUSD: {
      sourceName: testUsd.artifact.sourceName,
      abi: testUsd.artifact.abi,
      creationBytecode: testUsd.artifact.bytecode,
      creationBytecodeSha256: sha256OfHex(testUsd.artifact.bytecode),
      runtimeBytecode: testUsd.artifact.deployedBytecode,
      runtimeBytecodeSha256: sha256OfHex(testUsd.artifact.deployedBytecode),
      constructor: {
        signature: "constructor(address initialOwner)",
        arguments: [
          {
            name: "initialOwner",
            type: "address",
            source:
              "The connected EVM account, read from eth_accounts immediately before the click.",
          },
        ],
        encoding: "abi.encode(address initialOwner)",
        encodingNote:
          "One address argument: a single 32-byte word, the 20 address bytes left-padded with twelve zero bytes. The deploy panel builds the data as creationBytecode followed by that word.",
      },
    },
    LoanSettlement: {
      sourceName: settlement.artifact.sourceName,
      abi: settlement.artifact.abi,
      creationBytecode: settlement.artifact.bytecode,
      creationBytecodeSha256: sha256OfHex(settlement.artifact.bytecode),
      runtimeBytecode: settlement.artifact.deployedBytecode,
      runtimeBytecodeSha256: sha256OfHex(settlement.artifact.deployedBytecode),
      constructor: {
        signature: "constructor(address testUsd_, address fusd_)",
        arguments: [
          {
            name: "testUsd_",
            type: "address",
            source: "The TestUSD address returned by step 2 of the panel.",
          },
          {
            name: "fusd_",
            type: "address",
            source: "0x97143B771D34ddb9130b807b135Ae675A5a963CA (ADR-0013 Option A).",
          },
        ],
        encoding: "abi.encode(address testUsd_, address fusd_)",
        encodingNote:
          "Two address arguments: two 32-byte words in this order, each address left-padded with twelve zero bytes. The deploy panel builds the data as creationBytecode followed by those words.",
      },
    },
  },
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

const fileHash = createHash("sha256").update(readFileSync(outPath)).digest("hex");
console.log(`wrote ${outPath}`);
console.log(`manifest_sha256 0x${fileHash}`);
console.log(`TestUSD creation   ${manifest.contracts.TestUSD.creationBytecodeSha256}`);
console.log(`TestUSD runtime    ${manifest.contracts.TestUSD.runtimeBytecodeSha256}`);
console.log(`LoanSettlement creation ${manifest.contracts.LoanSettlement.creationBytecodeSha256}`);
console.log(`LoanSettlement runtime  ${manifest.contracts.LoanSettlement.runtimeBytecodeSha256}`);
console.log(`sourceCommit ${manifest.sourceCommit} dirty=${manifest.workingTreeDirty}`);
