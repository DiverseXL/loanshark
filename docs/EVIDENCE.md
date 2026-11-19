# Evidence index

This index lists every file in `docs/evidence/` and what it does and does not prove. The acceptance authority remains `docs/ACCEPTANCE_MATRIX.md`; this page is a map, not a second set of claims.

Rules used throughout:

- A result file records commands and output from the phase it names. It is not rewritten to look better later.
- A file marked OWNER-SUPPLIED is blank until the owner runs the named steps. An agent cannot fill it.
- Local Hardhat and mock-provider results are labelled as such. No local test is presented as a Diana deployment.
- Where a value is truncated for width, the file says so.

## Result and review files

| File | Date | Kind | What it records | Limit |
|---|---|---|---|---|
| `phase-00-result.md` | 2026-11-16 | Owner console and terminal observations | QoreX provider announcement, hybrid signature shape, on-chain account and KEM state, chain reads | Copied from the owner's session; not produced by a repository script |
| `phase-01-result.md` | 2026-11-16 | Build and test result | Workspace, pinned toolchain, CI workflow, hybrid signature verification against the on-chain key, read-only Diana checks | Live-chain test is gated; CI has not run on GitHub |
| `phase-02-result.md` | 2026-11-17 | Test result | Offline QoreSeal slice: sealing, opening, AAD, signed envelopes, recipient cards and official vectors | Throwaway keys and mocked registry/account clients; no chain call |
| `phase-03-result.md` | 2026-11-17 | Test result | Agreement commitment, `TestUSD`, `LoanSettlement`, lifecycle, boundaries, adversarial tokens and the 200-run invariant | In-process Hardhat network; not deployed |
| `phase-03b-result.md` | 2026-11-17 | Review follow-up result | Settlement review cases, minimum claim window, Diana sampling | Local chain; deadlines depend on Diana block production |
| `phase-04-result.md` | 2026-11-17 | Build and test result | Diagnostics app, wallet detection, two chain guards, signing queue, local verification, static hygiene tests | Mock providers except the saved signature fixture; no owner browser run |
| `phase-05-token-scan.md` | 2026-11-17 | Offline analysis | Selector scan of the three saved fest-token runtime codes | Heuristic only; does not establish issuer, mint control or upgradeability |
| `phase-06-result.md` | 2026-11-18 | Build and test result | Two-token allowlist, reproducible manifest, click-only deploy panel, read-only verifier, owner documents | No deployment; every deployment field is blank |
| `phase-06-verify-smoke.md` | 2026-11-18 | Read-only network run | Verifier run against Diana with deliberately wrong addresses; raw JSON-RPC included | A smoke test of failure reporting, **not** deployment evidence |
| `phase-07-licences.md` | 2026-11-18 | Licence review | Every installed licence label, package counts and the allowlist decision | Declared licences only; not legal advice; current lockfile only |
| `phase-07-security.md` | 2026-11-18 | Security review | Full-history secret scan, the QoreSeal-vector allowlist, dependency audit and its accepted advisory, existing static checks | Review, not a penetration test or audit; advisory data is dated |

## Owner-supplied files

| File | Status | What the owner must supply |
|---|---|---|
| `phase-04-owner-checklist.md` | BLANK | Browser detection, both chain IDs, account comparison, a fresh signing prompt and the exact results |
| `phase-06-owner-checklist.md` | BLANK | Diana deployment run in the documented order, including the lane check and the exact wallet text |
| `phase-06-owner-deploy.md` | BLANK | The panel's JSON block and the owner's deployment record |
| `phase-06-verify.md` | NOT RUN | The report written by `scripts/verify-deployment.mjs` after a real deployment |

A blank owner file is evidence of a missing step, not of a passing one.

## Reproduce the current local checks

```powershell
pnpm install --frozen-lockfile
pnpm verify-env
pnpm licence-check
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @loanshark/web build
```

The secret scan command is in `docs/evidence/phase-07-security.md`. The deployment verifier command is in `docs/evidence/phase-06-owner-checklist.md`; it needs owner-supplied addresses and has no transaction path.

## Where not to look for proof

- `docs/evidence/phase-06-verify-smoke.md` is a deliberate failure test. It must not be cited as a deployment result.
- A passing mock-provider test does not prove QoreX behaviour in a browser.
- A passing local Hardhat test does not prove Diana compatibility, gas cost or deployed bytecode.
- The reproducible manifest proves the build inputs produce the recorded hashes. It does not prove that those bytes were deployed; only the owner's verifier report and explorer check can show that.
