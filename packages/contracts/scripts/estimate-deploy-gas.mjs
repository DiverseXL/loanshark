// Read-only Phase 3b reproduction: estimate creation gas on Diana for the
// already-compiled artifacts of one EVM target. No transaction is sent.
import { readFileSync } from "node:fs";
import { encodeDeployData } from "viem";

const RPC = "https://evm-testnet.qore.host";
const FROM = "0xd0a1453c7b8157aa0635076c33b3e24a50a923c5";
const PLACEHOLDER = "0x000000000000000000000000000000000000dEaD";
const version = process.argv[2] ?? "osaka";

async function rpc(request) {
  const response = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  return { status: response.status, body: await response.text() };
}

let id = 1;
const chainId = await rpc({ jsonrpc: "2.0", id: id++, method: "eth_chainId", params: [] });
console.log("eth_chainId", chainId.status, chainId.body);

for (const contract of ["LoanSettlement", "TestUSD"]) {
  const artifact = JSON.parse(
    readFileSync(
      new URL(`../artifacts/contracts/${contract}.sol/${contract}.json`, import.meta.url),
      "utf8",
    ),
  );
  const args = contract === "LoanSettlement" ? [[PLACEHOLDER]] : [FROM];
  const data = encodeDeployData({ abi: artifact.abi, bytecode: artifact.bytecode, args });
  const request = {
    jsonrpc: "2.0",
    id: id++,
    method: "eth_estimateGas",
    params: [{ from: FROM, data }],
  };
  const response = await rpc(request);
  console.log(`${version} ${contract}`, response.status, response.body);
}
