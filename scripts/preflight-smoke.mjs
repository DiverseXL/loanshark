#!/usr/bin/env node
// Read-only preflight smoke test against Diana.
//
// It performs exactly two JSON-RPC calls and nothing else:
//   eth_chainId
//   eth_call  { to: fUSD, data: 0x313ce567 }   // decimals()
//
// There is no code path that signs, sends, estimates gas or asks for a key. The
// method allowlist below is checked before every call, so a later edit that adds
// a write method fails rather than runs.
//
// Usage:
//   node scripts/preflight-smoke.mjs
//   node scripts/preflight-smoke.mjs --rpc https://evm-testnet.qore.host

const DEFAULT_RPC = "https://evm-testnet.qore.host";
const FUSD = "0x97143B771D34ddb9130b807b135Ae675A5a963CA";
const DECIMALS_SELECTOR = "0x313ce567";
const ALLOWED_METHODS = new Set(["eth_chainId", "eth_call"]);

const args = process.argv.slice(2);
const rpcIndex = args.indexOf("--rpc");
const rpc = rpcIndex === -1 ? DEFAULT_RPC : args[rpcIndex + 1];

if (typeof rpc !== "string" || !/^https:\/\//.test(rpc)) {
  console.error("refusing a non-https RPC URL");
  process.exitCode = 1;
} else {
  let id = 0;
  const call = async (method, params) => {
    if (!ALLOWED_METHODS.has(method)) {
      throw new Error(`refusing method ${method}: this script is read-only`);
    }
    id += 1;
    const body = JSON.stringify({ jsonrpc: "2.0", id, method, params });
    const started = Date.now();
    const response = await fetch(rpc, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body,
      signal: AbortSignal.timeout(20_000),
    });
    const text = await response.text();
    return { method, params, status: response.status, ms: Date.now() - started, text };
  };

  const main = async () => {
    const results = [];
    results.push(await call("eth_chainId", []));
    results.push(await call("eth_call", [{ to: FUSD, data: DECIMALS_SELECTOR }, "latest"]));
    const output = {
      rpc,
      note: "Read-only. Two JSON-RPC calls only. No transaction was built, signed or sent.",
      calls: results,
    };
    console.log(JSON.stringify(output, null, 2));
    const failed = results.filter((result) => result.status !== 200);
    if (failed.length > 0) process.exitCode = 1;
  };

  main().catch((error) => {
    console.error(`smoke failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
