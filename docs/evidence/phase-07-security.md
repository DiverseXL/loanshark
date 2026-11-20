# Phase 7 security review: secrets, dependency audit and static checks

Run: 2026-11-18 on Windows, Node 26.13.0, pnpm 12.21.0. This review found no committed credential. It found one high-severity advisory in a transitive optional peer dependency and records why it is accepted for this submission. It is a review, not a penetration test or an audit.

## 1. Secret scan over the full history

Tool: gitleaks 8.30.1, the same version pinned in `.github/workflows/ci.yml`. The Windows archive was downloaded from the pinned release and its SHA-256 was checked against the release checksum file:

```text
d29144deff3a68aa93ced33dddf84b7fdc26070add4aa0f4513094c8332afc4e  gitleaks_8.30.1_windows_x64.zip
```

Command:

```powershell
gitleaks detect --source . --redact --no-banner --exit-code 1
```

### First run

Scanned 48 commits, about 1.16 MB. Result: exit 1, 19 findings.

All 19 findings were in `fixtures/qoreseal-vectors-v1.json`, rule `generic-api-key`, on field names from the official public QoreSeal test vectors: `mlkemSecretKeySha3`, `x25519SecretKey`, `sharedSecret`, `ephemeralSecretKey`, `mlkemSharedSecret`, `x25519SharedSecret`, and generic `key` / `key SHA3-256`. These are published test vectors, not credentials. No finding was in application code, scripts, configuration or commit history outside that fixture.

This also means the CI `secrets` job would have failed before this review. That was a real defect in the preparation, now fixed.

### Fix and rerun

Added `.gitleaks.toml`. It keeps the default rules and allowlists exactly one path, `fixtures/qoreseal-vectors-v1.json`, with the reason recorded in the file. Nothing else is exempt.

Rerun after the config change:

```text
49 commits scanned.
scanned ~1166736 bytes (1.17 MB) in 957ms
no leaks found
exit 0
```

The commit count is 49 because the licence-check commit is now in history. The configuration applies automatically to the CI invocation in `.github/workflows/ci.yml`.

## 2. Dependency audit

Commands:

```powershell
pnpm audit --json
pnpm audit --prod --json
```

Both exited 1 with the same single advisory.

| Field | Value |
|---|---|
| Advisory | GHSA-mrhx-c7xc-m3w5 |
| Module | `zod` 3.25.76 |
| Title | Zod can exhaust memory while validating oversized constrained collections |
| Severity | high (CWE-770) |
| Vulnerable | `<4.6.6` |
| Patched | `>=4.6.6` |
| Production paths | `packages/agreement > viem > abitype > zod`, `packages/agreement > viem > ox > abitype > zod` |
| Full-tree paths | the same paths plus Hardhat 3.22.0 and its plugins |
| Optional | yes (production audit reports `optional: true`) |

No critical, moderate, low or info advisory was reported. Full-tree counts: 278 dependencies, 1 high.

### Why it is accepted for this submission

- The affected package is an **optional peer dependency of `abitype`**. Neither this repository nor the installed `viem` package imports `abitype/zod` or `zod` at runtime. A search of the installed viem package for `abitype/zod`, `from "zod"` and `require("zod")` returned no runtime import.
- The browser bundle was built and searched for `ZodError` / `zod`; no match. The shipped `apps/web` bundle does not contain the vulnerable code.
- The paths that install zod are ABI type helpers and the Hardhat toolchain. They validate build-time data supplied by the repository, not untrusted network input.
- Forcing `zod` 4.6.6 through a pnpm override would conflict with Hardhat 3.22.0's `^3.23.8` requirement. A scoped override was not applied because the vulnerable path is unused; changing a pinned toolchain without a need would add risk.

Revisit condition: when Hardhat or viem/abitype resolve a patched `zod`, update the pins, run `pnpm install`, `pnpm test` and `pnpm --filter @loanshark/web build`, and remove this exception. The advisory is recorded in the README known limitations.

## 3. Static checks already in the test suite

The Phase 4 static tests were rerun as part of `pnpm test` (the reproduce commands are in `docs/EVIDENCE.md`). They cover:

- no `localStorage`, `sessionStorage`, IndexedDB, Cache Storage, cookies, analytics or key-like material in `apps/web/src`;
- no raw-transaction, broadcast, account-request, key-management or extra signing method; `eth_sendTransaction` only in `src/deploy/flow.ts`, called from the panel's click handler;
- a CSP with no inline script, no `unsafe-eval`, no third-party origin, and only the REST and EVM hosts in `connect-src`;
- no `dangerouslySetInnerHTML`, `eval` or `new Function`, and no inline event handler in `index.html`.

Those tests are heuristic guards, not a proof of absence.

## 4. What this review does not cover

- No manual code audit by a second person, no formal verification and no economic review.
- No browser or wallet run; the owner checklist for Phase 4 and the deployment checklist for Phase 6 remain OWNER-SUPPLIED and blank.
- The audit reflects the advisory database on 2026-11-18. A later advisory is not covered.
- The gitleaks run covers tracked Git history on this machine. CI has not run on GitHub, so its remote result is not claimed.
