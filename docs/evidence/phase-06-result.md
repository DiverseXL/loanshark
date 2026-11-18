# Phase 6b result: deployment readiness (no deployment)

Date: 2026-11-18. Status: **READY FOR THE OWNER TO DEPLOY. NOTHING HAS BEEN DEPLOYED.**

The assistant prepared the contract, the manifest, the click-only deploy panel, the read-only verifier and the owner checklist. It sent no transaction, signed nothing and never touched a key, seed or mnemonic. No contract address in this repository is a deployment result. Every deployment field is OWNER-SUPPLIED and stays blank until the owner runs `docs/evidence/phase-06-owner-checklist.md`.

## 1. What changed

| Area | Change |
|---|---|
| Contract | `LoanSettlement` constructor is exactly `constructor(address testUsd_, address fusd_)`. It rejects a zero address, the same address twice and any duplicate with `InvalidAddress`. The allowlist is immutable, with no admin and no upgrade path (ADR-0013 Option A). |
| Local fUSD stand-in | `MockFusdProfile` is a test-only 6-decimal token named `Mock Fest USD` (`mFUSD`). It is **not** the real fUSD. One local lifecycle test runs against it. |
| Manifest | `scripts/build-manifest.mjs` writes `docs/deployments/manifest.json`: ABI, creation and runtime bytecode, SHA-256 hashes, compiler settings and a source commit. Rebuilding twice produces the same bytes. |
| Deploy panel | `apps/web/src/deploy/` plus `DeployPanel.tsx`: warning gate, chain guard, one button per transaction, visible receipt polling, copyable JSON evidence block. `flow.ts` is the only module that calls `eth_sendTransaction`, and only from a button press. |
| Verifier | `scripts/verify-deployment.mjs` performs only `eth_chainId`, `eth_getCode` and `eth_call`. It reports a bytecode mismatch verbatim and distinguishes a metadata-only difference from a real code difference. |
| Owner documents | `docs/evidence/phase-06-owner-checklist.md` (ordered run and STOP rules), `docs/evidence/phase-06-owner-deploy.md` (blank owner record) and `docs/evidence/phase-06-verify.md` (NOT RUN placeholder). |
| Docs | README limitations, THREAT_MODEL T20-T25, ACCEPTANCE_MATRIX C12 (PENDING), ADR-0011, ADR-0013, source-lock claims 21/53/54 and CHANGELOG. |

## 2. Reproducible manifest

Built twice in a clean run; both files were byte-identical.

| Item | Value |
|---|---|
| Manifest file SHA-256 | `0x8b648699d3144aae5c9504b8119358702eaf556ead2dd085a28adcdf6258e1a1` |
| Manifest `sourceCommit` | `457936d620ec17136254dab812a720d6afd0b673` |
| Manifest `workingTreeDirty` | `false` |
| Compiler | solc `0.8.34+commit.80d5c536`, EVM `osaka`, optimizer on, 200 runs |
| TestUSD creation bytecode SHA-256 | `0xfee21a5d8e6c269c479cb50c096e287a8b253da62b3c16b53652582951d1958e` |
| TestUSD runtime bytecode SHA-256 | `0x9a2ed16929ac11fc248c7ddc7bb89632b500836b5795979d07f73ec271c044e7` |
| LoanSettlement creation bytecode SHA-256 | `0x4ecf8bf89ee4a1d05b736bca0fbce082ea9d0d468ae228bb539164f4abc5cb39` |
| LoanSettlement runtime bytecode SHA-256 | `0xc04df2eed7c843f16642cefb054289798f1bd739295a2151fafb8c7a1ca6108e` |

`sourceCommit` is the last commit that touched compiler inputs
(`packages/contracts/contracts` or `hardhat.config.ts`). `workingTreeDirty` covers
the same paths, so a documentation-only commit does not change the manifest.
This definition is a project convention, not proof that a third-party machine
reproduces the build.

## 3. Verification snapshot

| Command | Result |
|---|---|
| `pnpm verify-env` | exit 0 |
| `pnpm typecheck` | exit 0 |
| `pnpm format:check` | exit 0 |
| `pnpm lint` | exit 0 (warnings/infos only) |
| `pnpm test` | Vitest 133 passed, 1 skipped; Hardhat 38 passed |

Baseline before Step 6b was 120 Vitest passed, 1 skipped and 33 Hardhat tests.
The increase is 13 web tests and 5 contract tests.

Real versus mock, stated plainly:

- **Real (local chain):** 38 Hardhat tests, including the two-token constructor
  tests, one full lifecycle in the real local `TestUSD` and one full lifecycle in
  `MockFusdProfile`. Hardhat runs an in-process local chain.
- **Mock (no chain):** all 12 deploy-panel tests use a hand-written EIP-1193
  provider double. No browser wallet, QoreX or Diana node is exercised by those
  tests.
- **Unproven:** the real fest fUSD is never called. No test proves it behaves as
  a standard ERC-20. That is the owner-accepted risk in ADR-0013.

## 4. Read-only network check (smoke test, not a deployment)

To show the verifier fails loudly, it was run once against Diana with deliberately
wrong addresses: the fUSD address was supplied as TestUSD, LoanSettlement and
owner. Raw requests and responses are saved in
`docs/evidence/phase-06-verify-smoke.md`; the run exited 1.

Observed, with no value sent:

- `eth_chainId` returned `0x2648` (Diana EVM), matching the manifest.
- fUSD `eth_getCode` at `0x97143B771D34ddb9130b807b135Ae675A5a963CA` returned 1798
  bytes, SHA-256 `0x9a09b07f888f4295762109039dd587ad9eb2889c5682276264ac3343bc6ed822`.
- The verifier reported both bytecode checks as FAIL, both settlement calls as
  reverted, and TestUSD `name()`/`symbol()` as the fUSD values. It did not hide a
  mismatch.

This smoke file is **not** deployment evidence and must not be cited as such.
`docs/evidence/phase-06-verify.md` remains the NOT RUN placeholder for the
owner's real run.

## 5. ASSUMPTIONS

Every non-evidence choice is listed here; none of these is proof.

1. ASSUMPTION: `sourceCommit` covering only compiler inputs is a sufficient
   reproducibility key for this project. It does not cover the pnpm lockfile,
   Node version or solc download.
2. ASSUMPTION (owner-accepted in ADR-0013): the real fUSD behaves as a standard
   ERC-20 for `transfer`, `transferFrom`, `approve` and `balanceOf`. Untested
   here. A small owner-run fUSD transfer before the demo would test it.
3. ASSUMPTION: the 60-poll, 2-second receipt wait in the panel is long enough for
   Diana. It is a UI choice, not a chain guarantee. A timeout leaves the step
   unconfirmed and never unlocks the next one.
4. ASSUMPTION: `vite preview` serves the production build at
   `http://localhost:4173` and `--strictPort` makes it fail rather than move to
   another port. The CSP only applies to this production preview.
5. ASSUMPTION: the explorer `https://explore.qore.network` and faucet URL are
   correct as recorded from the organiser's start page (source-lock claims 53 and
   54). The assistant did not open them in a browser.
6. ASSUMPTION: the panel shows `eth_estimateGas` as an estimate only; the wallet
   may add its own buffer and may still reject. No gas value is promised.
7. ASSUMPTION: minting 1000 tUSD is optional and owner-only; the panel enables
   the button only when on-chain `owner()` equals the connected account.
8. ASSUMPTION: QoreX exposes a standard EIP-1193 provider. Only a mock provider
   is tested in this repository.

## 6. Commit list for Step 6b

```
5d30281 docs: accept ADR-0013 option A (TestUSD and fUSD)
457936d feat(contracts): allowlist TestUSD and fUSD in two-argument constructor
17fc793 build: reproducible deployment manifest with bytecode hashes
4b0d86b feat(web): owner-run testnet deploy panel with click-only sends
8156157 feat(scripts): read-only post-deployment verifier
0b6f603 docs: owner checklist and blank deployment evidence
```

Baseline commit before Step 6b was `68b24d0`.

## 7. Owner next steps (PowerShell)

```powershell
Set-Location C:\path\to\loanshark
pnpm install
pnpm --filter @loanshark/web build
pnpm --filter @loanshark/web preview
```

Then follow `docs/evidence/phase-06-owner-checklist.md` in order. After the two
deployments, run:

```powershell
node scripts/verify-deployment.mjs `
  --testusd <TestUSD address from step 3> `
  --settlement <LoanSettlement address from step 4> `
  --owner <connected EVM account>
```

Do not paste expected values into any owner field. If a step fails, stop and
report the exact text.

## 8. Explicit non-claims

- No contract was deployed to Diana or any network.
- No transaction was sent or signed; no key material was requested or used.
- The real fUSD was not exercised.
- C12 in `docs/ACCEPTANCE_MATRIX.md` remains PENDING until owner evidence exists.
- Step 7 was not started.
