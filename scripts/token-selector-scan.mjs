// Read-only, offline scan of saved runtime bytecode for function selectors.
// Selectors are computed from signatures with viem (pinned by
// packages/agreement/package.json), never typed by hand. No network is used.
//
// Usage: node scripts/token-selector-scan.mjs

import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const require = createRequire(path.join(root, "packages", "agreement", "package.json"));
const { toFunctionSelector } = require("viem");
const viemVersion = require("viem/package.json").version;

const signatures = [
  "owner()",
  "mint(address,uint256)",
  "burn(uint256)",
  "burnFrom(address,uint256)",
  "pause()",
  "unpause()",
  "paused()",
  "blacklist(address)",
  "addToBlacklist(address)",
  "isBlacklisted(address)",
  "transferOwnership(address)",
  "renounceOwnership()",
  "upgradeTo(address)",
  "upgradeToAndCall(address,bytes)",
  "implementation()",
];

const selectors = signatures.map((signature) => ({
  signature,
  selector: toFunctionSelector(signature),
}));

const contracts = [
  { address: "0x02292293c13880a26242690eb70a0e42B8E91c28", label: "fETH" },
  { address: "0x4604e7E45b2ecdbfbDc157103f5B2b62cb16451A", label: "fBTC" },
  { address: "0x97143B771D34ddb9130b807b135Ae675A5a963CA", label: "fUSD" },
];

function normaliseCode(result) {
  if (result === "0x") return "";
  return result.toLowerCase().replace(/^0x/, "");
}

const codes = [];
for (const contract of contracts) {
  const file = path.join(root, "fixtures", "chain-reads", `getCode-${contract.address}.json`);
  const parsed = JSON.parse(await readFile(file, "utf8"));
  const code = normaliseCode(parsed.result);
  codes.push({ ...contract, code });
}

const rows = selectors.map(({ signature, selector }) => {
  const needle = selector.slice(2).toLowerCase();
  const cells = codes.map(({ code }) => {
    const at = code.indexOf(needle);
    return at === -1 ? "no" : `yes (offset ${at / 2})`;
  });
  return { signature, selector, cells };
});

console.log(`viem ${viemVersion}; ${signatures.length} selectors; ${contracts.length} contracts`);
console.log("");
console.log(`| Function | Selector | ${contracts.map((c) => `${c.label} \`${c.address}\``).join(" | ")} |`);
console.log(`|---|---|${contracts.map(() => "---").join("|")}|`);
for (const row of rows) {
  console.log(`| \`${row.signature}\` | \`${row.selector}\` | ${row.cells.join(" | ")} |`);
}
console.log("");
for (const { label, address, code } of codes) {
  console.log(`${label} ${address}: ${code.length / 2} bytes of runtime code`);
}
