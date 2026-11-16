# Phase 1 result: workspace, signature verification spike (M0-3), read-only chain checks, CI

Date started: 2026-11-16. Network: QoreChain Diana Testnet (`qorechain-diana`). Host: Windows, PowerShell primary shell; commands below were run through Git Bash and are repeated in PowerShell form where the shell matters.

This file records commands and their unedited output. Nothing here is reconstructed. Where a value was truncated for width it is marked as truncated; nothing is paraphrased.

## Task 0: environment and connectivity

### Tool versions

Command:

```powershell
node --version; git --version; pnpm --version; npm --version
```

Output:

```
v26.13.0
git version 2.56.0.windows.4
no pnpm
11.20.0
```

`pnpm` was not installed at the start of this phase. Corepack is not present in this Node build either (`corepack --version` returned `no corepack`). pnpm is therefore installed as a pinned dev tool in Task 1 and the exact version is recorded in `package.json` (`packageManager`) and `docs/adr/0006-quality-tooling.md`.

### Working tree

`git status --porcelain` returned no output before Task 0 work began, and `git branch --show-current` returned `main`.

### Connectivity

Command (Git Bash; the PowerShell equivalent is in the final report):

```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://github.com
curl -sS -o /dev/null -w "%{http_code}\n" https://api-testnet.qore.host
curl -sS -o /dev/null -w "%{http_code}\n" https://evm-testnet.qore.host
```

Output:

```
200
501
405
```

Interpretation: all three hosts answered. `github.com` returned 200. The two QoreChain hosts returned HTTP errors for the bare root path (501 Not Implemented and 405 Method Not Allowed), which are server responses, so neither host is blocked by the local network. Neither status is a health check of the API; the API was exercised properly below.

### On-chain account fixture

Command:

```powershell
curl.exe -sS -o fixtures/onchain-account-qor1385.json "https://api-testnet.qore.host/qorechain/pqc/v1/account/qor1385wkhky3qkjwq47t8904xrd6s82lmkfjnxxsr"
```

Result: HTTP 200, `Content-Type: application/json`, `x-cosmos-block-height: 10194644`, 3831 bytes, SHA-256 `3976669d8b5d57b4279780c448b1d8e8feb247d193c9863f1c320572ddf05de5`, fetched 2026-11-16T12:33:30Z.

The response body is stored unedited in `fixtures/onchain-account-qor1385.json`. The fetch date, URL, status and hash are in `fixtures/onchain-account-qor1385.meta.json` (ASSUMPTION: a sidecar file was used rather than adding a date field to the JSON, because the task said not to edit the response).

The record contains public keys only: `key_type: hybrid`, `algorithm_id: 1`, `algorithm_name: dilithium5`, `possession_proven: true`, `classical_key_source: auth_account`. No private key, seed phrase or recovery code is present.

## Task 6: read-only EVM chain checks (M0-4, M0-7)

All calls are JSON-RPC `POST https://evm-testnet.qore.host` with `Content-Type: application/json`. Nothing was signed, broadcast or spent. Every raw response body is stored under `fixtures/chain-reads/` exactly as received.

PowerShell form of the first call:

```powershell
$body = '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
Invoke-RestMethod -Method Post -Uri https://evm-testnet.qore.host -ContentType 'application/json' -Body $body
```

Raw bodies (Git Bash commands in the same shape as above, one per line):

```
{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}
  -> {"jsonrpc":"2.0","id":1,"result":"0x2648"}
{"jsonrpc":"2.0","id":2,"method":"eth_blockNumber","params":[]}
  -> {"jsonrpc":"2.0","id":2,"result":"0x9b9214"}
```

`0x2648` is 9800, which matches source-lock claim 3. The block height at the time of the reads was 10195476.

### eth_getCode

Command, once per address:

```bash
curl -sS -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_getCode","params":["<address>","latest"]}' \
  https://evm-testnet.qore.host
```

Result for each of the three addresses: code exists, 1798 bytes (3598 hex characters), no error field. The three runtime byte strings are identical except two hex characters at offset 578, which encode the `decimals()` return value pushed by the constructor. Their SHA-256 values, over the saved response files:

```
76c6398eeb0c53636767f24e9f16ec81457af710bd52294188fc5bade25c6c8b  getCode-0x0229...1c28.json
cde01466afdd7260d934de00303e69e9c24286373587056c56a479337f5de90a  getCode-0x4604...451A.json
9a0bb82f6707cae8000405e98865bf6f51dbdc02a0302ca6acbe9e58a37aa608  getCode-0x9714...63CA.json
```

The runtime code exposes the standard selectors `06fdde03` (`name()`), `95d89b41` (`symbol()`), `313ce567` (`decimals()`), `18160ddd` (`totalSupply()`), `70a08231` (`balanceOf(address)`), `a9059cbb` (`transfer(address,uint256)`), `095ea7b3` (`approve(address,uint256)`), `23b872dd` (`transferFrom(address,address,uint256)`) and `dd62ed3e` (`allowance(address,address)`).

### eth_call

Command, once per address and selector:

```bash
curl -sS -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_call","params":[{"to":"<address>","data":"<selector>"},"latest"]}' \
  https://evm-testnet.qore.host
```

Raw results, unedited:

```
0x02292293c13880a26242690eb70a0e42B8E91c28 0x06fdde03
  {"jsonrpc":"2.0","id":1,"result":"0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000084665737420455448000000000000000000000000000000000000000000000000"}
0x02292293c13880a26242690eb70a0e42B8E91c28 0x95d89b41
  {"jsonrpc":"2.0","id":1,"result":"0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000046645544800000000000000000000000000000000000000000000000000000000"}
0x02292293c13880a26242690eb70a0e42B8E91c28 0x313ce567
  {"jsonrpc":"2.0","id":1,"result":"0x0000000000000000000000000000000000000000000000000000000000000012"}
0x4604e7E45b2ecdbfbDc157103f5B2b62cb16451A 0x06fdde03
  {"jsonrpc":"2.0","id":1,"result":"0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000084665737420425443000000000000000000000000000000000000000000000000"}
0x4604e7E45b2ecdbfbDc157103f5B2b62cb16451A 0x95d89b41
  {"jsonrpc":"2.0","id":1,"result":"0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000046642544300000000000000000000000000000000000000000000000000000000"}
0x4604e7E45b2ecdbfbDc157103f5B2b62cb16451A 0x313ce567
  {"jsonrpc":"2.0","id":1,"result":"0x0000000000000000000000000000000000000000000000000000000000000008"}
0x97143B771D34ddb9130b807b135Ae675A5a963CA 0x06fdde03
  {"jsonrpc":"2.0","id":1,"result":"0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000084665737420555344000000000000000000000000000000000000000000000000"}
0x97143B771D34ddb9130b807b135Ae675A5a963CA 0x95d89b41
  {"jsonrpc":"2.0","id":1,"result":"0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000046655534400000000000000000000000000000000000000000000000000000000"}
0x97143B771D34ddb9130b807b135Ae675A5a963CA 0x313ce567
  {"jsonrpc":"2.0","id":1,"result":"0x0000000000000000000000000000000000000000000000000000000000000006"}
```

Decoded (ABI string decoding for `name`/`symbol`, integer for `decimals`):

| Address | `name()` | `symbol()` | `decimals()` | Code |
|---|---|---|---|---|
| `0x02292293c13880a26242690eb70a0e42B8E91c28` | `Fest ETH` | `fETH` | 18 | present |
| `0x4604e7E45b2ecdbfbDc157103f5B2b62cb16451A` | `Fest BTC` | `fBTC` | 8 | present |
| `0x97143B771D34ddb9130b807b135Ae675A5a963CA` | `Fest USD` | `fUSD` | 6 | present |

What these calls establish: each address is a contract, each answers the three ERC-20 metadata calls without reverting, and each reports the name, symbol and decimals above.

What remains unknown, and is not concluded here:

- Who deployed each contract, and whether the name or symbol is accurate about the asset. The strings are claims by the contract, not proof of backing.
- Whether any of them is a stablecoin, a wrapped asset or a test faucet token. `fUSD` with 6 decimals is suggestive and nothing more. No issuer, reserve, or peg was checked.
- Whether supply is fixed or mintable, who can mint, and what the test account's balances are worth.
- The explorer and faucet for Diana. They are named in acceptance item M0-4 and were not exercised by this task, so M0-4 is not complete.

## Task 3 and Task 4: blocked on the signature fixture

`fixtures/qorex-signarbitrary.json` is not present in the repository. Task 3 says to stop and ask when it is missing, and Task 4 cannot run without a real QoreX response. No signature was reconstructed, retyped or generated in its place, and Task 5 was not started because it depends on Task 4 passing. The verifier itself is ready and recorded (source-lock claims 17 to 19).

## Task 7: CI

`.github/workflows/ci.yml` runs on `push` to `main` and on every `pull_request`:

- job `verify`: `actions/checkout` and `actions/setup-node` pinned by commit, `pnpm/action-setup` pinned by commit with `12.21.0`, Node `26.13.0`, then `pnpm install --frozen-lockfile`, `pnpm verify-env`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.
- job `secrets`: the gitleaks 8.30.1 linux-x64 binary, verified against the published SHA-256 before running `gitleaks detect --source . --redact`.

Unit tests need no network: no test currently opens a socket, and the live-chain test required by Task 5 does not exist yet (Task 5 was not started).

Status: the workflow file parses as YAML (`js-yaml` 4.1.1) and every command in the `verify` job has been run locally with the same result recorded below, but the workflow has NOT executed on GitHub. The repository has no remote. No passing badge or "CI passes" claim is made in the README until a real run exists; the run link and test counts get recorded here when it does.

## Task 8: local check results

Commands, run from the repository root on 2026-11-16:

```bash
pnpm verify-env
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Output of `pnpm verify-env`:

```
tool            pinned        actual
--------------  ------------  ------------
node            26.13.0       26.13.0
pnpm            12.21.0       12.21.0
typescript      5.9.3         5.9.3
@biomejs/biome  2.6.8         2.6.8
vitest          5.1.0         5.1.0

Toolchain matches the pinned versions.
```

`pnpm format:check` and `pnpm lint` both reported `Checked 9 files` with no fixes and exited 0. `pnpm typecheck` and `pnpm build` completed without diagnostics. `pnpm test` reported:

```
 Test Files  1 passed (1)
      Tests  1 passed (1)
```

The single test is the `chain-client` smoke test. It is the only test that exists, because the verification spike (Task 4) and the verifier module (Task 5) did not run; the counts above must not be read as coverage of the verifier.
