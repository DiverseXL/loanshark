# Phase 3b result: LoanSettlement review follow-up

Date: 2026-11-17. Starting commit:
`60ee8fe83f41c8ef1234ea343d494e949782b9cc` on `main`. `git status --short`
returned no output at the start.

No contract was deployed and no transaction was sent or signed on any live
chain. Diana was contacted read-only for `eth_chainId`, `eth_blockNumber`,
`eth_estimateGas` of creation bytecode and `eth_getBlockByNumber`. Raw requests
and responses are committed with this file. No private key, seed phrase or
mnemonic exists in the repository or in any test output.

## Task 0: baseline

Command:

```bash
pnpm test
```

Output before any change:

```
 Test Files  10 passed | 1 skipped (11)
      Tests  83 passed | 1 skipped (84)
23 passing (23 nodejs)
TEST_EXIT=0
```

## Task 1: coverage map

| Case | Existing coverage or added test |
|---|---|
| (a) borrower cancel on a Funded loan reverts | `packages/contracts/test/lifecycle.test.ts`, "rejects out-of-order transitions and duplicate proposals" (cancel after fund, `InvalidState`) |
| (b) expire on a Funded loan reverts | ADDED: `test/review.test.ts`, "rejects expire on a funded loan" |
| (c) re-proposing identical terms after cancel or expire reverts with `LoanExists` | ADDED: `test/review.test.ts`, "rejects re-proposing identical terms after cancel and after expire" |
| (d) after claim, refund reverts; after refund, claim reverts | After claim: `test/lifecycle.test.ts`, "rejects out-of-order transitions and duplicate proposals". After refund: ADDED in `test/review.test.ts`, "rejects claim after a refund" |
| (e) withdraw by the borrower or a third party reverts | `test/lifecycle.test.ts`, "rejects every wrong caller" (borrower and outsider, `NotLender`) |
| (f) repay by a non-borrower reverts in Active and Defaulted | Active: `test/lifecycle.test.ts`, "rejects every wrong caller". Defaulted: ADDED in `test/review.test.ts`, "rejects repayment by a non-borrower while the loan is Defaulted" |
| (g) partial repayment, markDefault, partial withdraw, final repayment, second withdraw | ADDED: `test/review.test.ts`, "lets the lender withdraw a partial repayment after default, then the remainder" |
| (h) fund at `fundingDeadline` succeeds and +1 reverts; claim at `claimDeadline` succeeds and refund at that second reverts | `test/time.test.ts`: "accepts fund at the funding deadline and rejects it one second later", "accepts claim at the claim deadline and rejects it one second later", "refunds only after the claim deadline" |
| (i) direct tokens do not change accounting and cannot be withdrawn | ADDED: `test/review.test.ts`, "keeps tokens sent directly to the contract outside every loan's accounting" |
| (j) a reentrant token cannot re-enter withdraw, repay or claim | Repay: `test/mock-tokens.test.ts`, "refuses a reentrant token with the reentrancy guard". Withdraw: ADDED in `test/review.test.ts`, "refuses a reentrant token that calls withdraw". Claim: ADDED in `test/review.test.ts`, "refuses a reentrant token that calls claim" |

Ten tests were added, all in `packages/contracts/test/review.test.ts`. No
existing test was deleted or weakened. Existing test timelines were widened
only to satisfy the new 3600-second claim-window rule; the assertions are
unchanged.

Two contract changes were required by the review cases:

1. `proposeLoan` checks `LoanExists` before `_validateTerms`, so an id that was
   cancelled or expired reports `LoanExists` even though its funding deadline
   is now in the past.
2. `MockReentrantToken` can target `repay`, `withdraw` or `claim`. It remains a
   test-only contract; its default `setReentry` still targets `repay`, so the
   existing test is unchanged.

## Task 2: documentation

- `docs/THREAT_MODEL.md` gained T15 to T19: lender-side agreement verification,
  the minimum claim window, stuck direct tokens, blocklisting tokens, and
  unconfirmed Diana timestamp semantics.
- `README.md` Known limitations gained items 16 to 20 with the same points.
- `docs/ACCEPTANCE_MATRIX.md` gained C11, "The UI recomputes the commitment from
  the signed agreement and compares it with the `loanId` and `termsOf()` before
  enabling fund", implementation `apps/web` (not built), status PENDING.

## Task 3: minimum claim window

The owner was asked in chat: "Add a minimum claim window (claimDeadline must be
at least N seconds after fundingDeadline)? Proposed N = 3600." The owner
selected "Yes, adopt N = 3600". The decision is recorded in ADR-0008 decision 9.

Implementation:

- `uint256 public constant MINIMUM_CLAIM_WINDOW = 3_600;`
- New custom error `ClaimWindowTooShort(uint256 minimum)`.
- `_validateTerms` rejects `claimDeadline < fundingDeadline + 3600`.
- Boundary tests: 3599 reverts (`ClaimWindowTooShort`); exactly 3600 is
  accepted.
- The terms encoding did not change, so `fixtures/agreement-vectors.json` and
  the frozen TypeScript vectors were not regenerated. The cross-implementation
  test still passes.

## Task 4: Diana EVM compatibility and block time

The contracts were compiled with each target in order. Each build was checked
with a read-only `eth_estimateGas` that had no `to` field and the creation
bytecode as `data`, `from` = `0xd0a1453c7b8157aa0635076c33b3e24a50a923c5`.
`LoanSettlement` used one non-zero placeholder allowlist address,
`0x000000000000000000000000000000000000dEaD`. The RPC was
`https://evm-testnet.qore.host`; it returned `eth_chainId` `0x2648` (9800).

| evmVersion | LoanSettlement | TestUSD | Result |
|---|---|---|---|
| `osaka` | `0x1c3bad` = 1,850,285 | `0x93924` = 604,452 | success |
| `cancun` | `0x1c3bad` = 1,850,285 | `0x93924` = 604,452 | success |
| `shanghai` | `0x1c3bad` = 1,850,285 | `0x94bb4` = 609,204 | success |
| `paris` | `0x1c8e20` = 1,871,392 | `0x970ec` = 618,732 | success |

All eight creation simulations succeeded. The highest target, `osaka`, is now
the explicit default in `packages/contracts/hardhat.config.ts`. The
`LOANSHARK_EVM_VERSION` environment variable exists only to reproduce the
table; the default is `osaka`. Raw requests and responses, including the full
creation bytecode and JSON-RPC bodies, are in
`docs/evidence/phase-03b-estimate-gas.json`.

ASSUMPTION: a successful `eth_estimateGas` shows that the node accepts the
creation opcodes for that target. It does not prove every runtime path is safe,
that a real deployment would succeed, or anything about gas cost under real
network conditions.

Block-time samples, read-only:

| Sample | Block | Block time (UTC) | Local UTC | Skew |
|---|---|---|---|---|
| 1 | 10274291 | 2026-11-17T20:08:18Z | 2026-11-17T20:08:19.610Z | -1.610 s |
| 2 | 10274333 | 2026-11-17T20:09:18Z | 2026-11-17T20:09:20.378Z | -2.378 s |
| 3 | 10274376 | 2026-11-17T20:10:20Z | 2026-11-17T20:10:21.174Z | -1.174 s |

The latest block timestamp was 1.174 to 2.378 seconds behind the local clock.
Block timestamps have whole-second resolution and the comparison includes
request latency, so this is an observation, not a calibrated clock offset.
Diana's timestamp rule and long-run drift remain unverified. Raw JSON-RPC
bodies and local timestamps are in
`docs/evidence/phase-03b-block-time.json`.

## Final checks

Command:

```bash
pnpm verify-env
pnpm typecheck
pnpm format:check
pnpm lint
pnpm test
```

Output, with lint diagnostics omitted and exit codes preserved:

```
### pnpm verify-env
Toolchain matches the pinned versions.
VERIFY_EXIT=0

### pnpm typecheck
TYPECHECK_EXIT=0

### pnpm format:check
Checked 50 files in 205ms. No fixes applied.
FORMAT_EXIT=0

### pnpm lint
Checked 50 files in 164ms. No fixes applied.
Found 58 warnings.
Found 24 infos.
LINT_EXIT=0

### pnpm test
 Test Files  10 passed | 1 skipped (11)
      Tests  83 passed | 1 skipped (84)
   Duration  12.22s (import 63%, tests 34%, transform 2%, worker 2%)
...
No contracts to compile
...
  LoanSettlement review follow-up
    ✔ rejects expire on a funded loan (98ms)
    ✔ rejects re-proposing identical terms after cancel and after expire (174ms)
    ✔ rejects a claim window one second below the 3600-second minimum (80ms)
    ✔ accepts a claim window of exactly the 3600-second minimum (76ms)
    ✔ rejects claim after a refund (143ms)
    ✔ rejects repayment by a non-borrower while the loan is Defaulted (167ms)
    ✔ lets the lender withdraw a partial repayment after default, then the remainder (167ms)
    ✔ keeps tokens sent directly to the contract outside every loan's accounting (138ms)
    ✔ refuses a reentrant token that calls withdraw (92ms)
    ✔ refuses a reentrant token that calls claim

...
33 passing (33 nodejs)

TEST_EXIT=0
```

Totals: 83 Vitest tests passed, 1 live-chain test skipped, 33 Hardhat tests
passed. The lint warnings are style suggestions (mostly non-null assertions and
literal keys), not errors; lint exits 0.

## Assumptions

- N = 3600 is an owner-confirmed project rule, not a QoreChain rule.
- A successful creation `eth_estimateGas` is evidence of opcode acceptance only.
- The block-time comparison assumes the local clock and request latency are
  small enough for a seconds-scale observation; no calibrated reference clock
  was used.
- The placeholder allowlist entry `0x...dEaD` is not a token and no code at that
  address is read by the constructor; it is only a non-zero constructor value.
- The new proposal-existence ordering changes which custom error is returned
  for a reused id, not whether the call reverts.
- Direct tokens remain stuck by design; no recovery function was added.
- C11 remains PENDING because `apps/web` does not exist.

## Reproduction in PowerShell

Compile each target and run the read-only estimate. The script never sends a
transaction.

```powershell
Set-Location C:\path\to\loanshark
$versions = "osaka", "cancun", "shanghai", "paris"
foreach ($v in $versions) {
    $env:LOANSHARK_EVM_VERSION = $v
    pnpm --filter @loanshark/contracts exec hardhat compile --force
    node packages/contracts/scripts/estimate-deploy-gas.mjs $v
}
Remove-Item Env:LOANSHARK_EVM_VERSION
pnpm test
```

Block-time sample (three reads one minute apart):

```powershell
1..3 | ForEach-Object {
    $body = '{"jsonrpc":"2.0","id":1,"method":"eth_getBlockByNumber","params":["latest",false]}'
    $r = Invoke-RestMethod -Uri "https://evm-testnet.qore.host" -Method Post `
        -ContentType "application/json" -Body $body
    $blockUtc = [DateTimeOffset]::FromUnixTimeSeconds([Convert]::ToInt64($r.result.timestamp, 16)).UtcDateTime
    "block $([Convert]::ToInt64($r.result.number, 16)) $($blockUtc.ToString('o')) local $((Get-Date).ToUniversalTime().ToString('o'))"
    if ($_ -lt 3) { Start-Sleep -Seconds 60 }
}
```

## Status and limitations

- C5, C6 and C7 remain DONE as local Hardhat results only; nothing is deployed.
- C11 is PENDING.
- ADR-0008 decisions 1 to 8 remain "proposed by assistant, owner to confirm";
  decision 9 is owner-confirmed.
- The identity link to `0xd0a1453c7b8157aa0635076c33b3e24a50a923c5` is still
  unconfirmed (ADR-0009).
- No remote is configured, so CI has not run on GitHub.
