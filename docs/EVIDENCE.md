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
| `phase-03-gas-stats.json` | 2026-11-17 | Raw tool output | `hardhat-gas-reporter` output for the local settlement suite, deployment sizes included | Local in-process Hardhat network; not a Diana gas measurement |
| `phase-03b-result.md` | 2026-11-17 | Review follow-up result | Settlement review cases, minimum claim window, Diana sampling | Local chain; deadlines depend on Diana block production |
| `phase-03b-block-time.json` | 2026-11-17 | Read-only network run | Raw `eth_getBlockByNumber` requests and responses sampled from the EVM testnet, used for the block-time figure | Five samples only; read-only, no transaction |
| `phase-03b-estimate-gas.json` | 2026-11-17 | Read-only network run | Raw `eth_estimateGas` requests and responses for the settlement actions, sent from a placeholder address | Estimation only; nothing was signed or sent |
| `phase-04-result.md` | 2026-11-17 | Build and test result | Diagnostics app, wallet detection, two chain guards, signing queue, local verification, static hygiene tests | Mock providers except the saved signature fixture; no owner browser run |
| `phase-05-token-scan.md` | 2026-11-17 | Offline analysis | Selector scan of the three saved fest-token runtime codes | Heuristic only; does not establish issuer, mint control or upgradeability |
| `phase-06-result.md` | 2026-11-18 | Build and test result | Two-token allowlist, reproducible manifest, click-only deploy panel, read-only verifier, owner documents | No deployment; every deployment field is blank |
| `phase-06-verify-smoke.md` | 2026-11-18 | Read-only network run | Verifier run against Diana with deliberately wrong addresses; raw JSON-RPC included | A smoke test of failure reporting, **not** deployment evidence |
| `phase-07-licences.md` | 2026-11-18 | Licence review | Every installed licence label, package counts and the allowlist decision | Declared licences only; not legal advice; current lockfile only |
| `phase-07-security.md` | 2026-11-18 | Security review | Full-history secret scan, the QoreSeal-vector allowlist, dependency audit and its accepted advisory, existing static checks | Review, not a penetration test or audit; advisory data is dated |
| `phase-08-source-check.md` | 2026-11-19 | Source check | QoreSign and QoreSeal commit pins, the fifteen installed exports actually used, the register-and-send path and the `signMessage` correction | Read from installed packages and published source; no live registration |
| `phase-08-onboarding-dry-run.md` | 2026-11-19 | Read-only network run | Offline derivation for the public test phrase and four raw Diana GET responses | TEST ONLY phrase; no transaction, no signature and no registration |
| `phase-08-browser-panel.md` | 2026-11-19 | Build and static check | Panel 6 source shape, static hygiene checks, production build sizes, CSP and bundle budget | Not opened in a browser; the phrase-erasure claim is a UI claim, not a memory proof |
| `phase-08-result.md` | 2026-11-19 | Phase result | What Step 8 added, measured test and build counts, and the limits that remain | Local and dry-run only; C13 and C14 are PENDING |
| `phase-09b-result.md` | 2026-11-20 | Phase result | Provider evaluation, the domain-separated commitment with old and new vector hashes, the manifest rebuild, the offer evaluator, the preflight and its Hardhat results, the footprint drift test, fail-closed coverage | Local and loopback only; read-only Diana smoke calls; no transaction and no owner-run binding |
| `phase-10-result.md` | 2026-11-26 | Phase result | What Step 10 added, the payload and confirmation tests, the full two-party simulation, measured counts split real and mock, the owner commands and the limits | Local and loopback only; MOCK account client and TEST ONLY wallet signer; no transaction and no live run |
| `phase-11a-result.md` | 2026-11-27 | Phase result | The owner's four console observations (recorded verbatim as OWNER-SUPPLIED), the bech32 decode of both accounts, one read-only account GET, the account guard, the coin-60 signature verification with four negative controls, the measured counts and the limits | The transaction and receipt are owner-supplied and were not queried by this repository; the signature is a saved fixture, not a live capture; the guard is tested with MOCK providers, not in a browser; `pnpm lint` fails on five pre-existing errors outside this step's files |
| `phase-09-result.md` | 2026-11-20 | Phase result | What Step 9 added, the relay behaviour the tests record, the docs checker's findings and fixes, measured test counts split real, mock and static, and the remaining limits | Loopback and local only; no transaction, no owner-run binding, CI not run on GitHub |

## Owner-supplied files

| File | Status | What the owner must supply |
|---|---|---|
| `phase-04-owner-checklist.md` | BLANK | Browser detection, both chain IDs, account comparison, a fresh signing prompt and the exact results |
| `phase-06-owner-checklist.md` | BLANK | Diana deployment run in the documented order, including the lane check and the exact wallet text |
| `phase-06-owner-deploy.md` | BLANK | The panel's JSON block and the owner's deployment record |
| `phase-06-verify.md` | NOT RUN | The report written by `scripts/verify-deployment.mjs` after a real deployment |
| `phase-08-owner-checklist.md` | BLANK | Fresh borrower and lender seal accounts, two dry runs, two `--execute` registrations with transaction hashes, independent read-back and the card. Binding statement fields and the W signature, with the E countersignature marked NOT PRODUCED |
| `phase-10-owner-checklist.md` | BLANK | Two Chrome profiles, the order of clicks, the fields to record and four negative checks for the live negotiation run |
| `phase-09-owner-checklist.md` | BLANK, NOT PRODUCED | A real W/E binding statement produced with QoreX and an owner seal account, published through the relay client and verified on fetch. No owner-run tool exists yet, so the file records what the tool must do and what to capture |

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
pnpm --filter @loanshark/web check:bundle
```

The secret scan command is in `docs/evidence/phase-07-security.md`. The deployment verifier command is in `docs/evidence/phase-06-owner-checklist.md`; it needs owner-supplied addresses and has no transaction path.

## Where not to look for proof

- `docs/evidence/phase-06-verify-smoke.md` is a deliberate failure test. It must not be cited as a deployment result.
- A passing mock-provider test does not prove QoreX behaviour in a browser.
- A passing local Hardhat test does not prove Diana compatibility, gas cost or deployed bytecode.
- The reproducible manifest proves the build inputs produce the recorded hashes. It does not prove that those bytes were deployed; only the owner's verifier report and explorer check can show that.
