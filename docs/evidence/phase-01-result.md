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
