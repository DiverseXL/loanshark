# Phase 3 result: agreement commitment and local settlement contracts

Date: 2026-11-17. Network: none used. Every test runs on the in-process Hardhat
network; no wallet, chain or QoreX call is made. Host: Windows, Node 26.13.0,
pnpm 12.21.0.

Commands and output below are unedited unless a truncation is marked.

## Task 0: baseline

Starting commit: `94f6dc5d085c1e5c04c8664ef51fe791a39fd9b2` on `main`.
`git status --short` returned no output.

`git remote -v` returned no output. The owner was asked and answered "No
remote - continue locally". Nothing is pushed and CI has not run.

Command:

```bash
pnpm verify-env
pnpm test
```

Output:

```
$ node scripts/verify-env.mjs
tool            pinned        actual
--------------  ------------  ------------
node            26.13.0       26.13.0
pnpm            12.21.0       12.21.0
typescript      5.9.3         5.9.3
@biomejs/biome  2.6.8         2.6.8
vitest          5.1.0         5.1.0

Toolchain matches the pinned versions.
VERIFY_EXIT=0
...
 Test Files  8 passed | 1 skipped (9)
      Tests  68 passed | 1 skipped (69)
   Start at  14:27:38
   Duration  12.52s (tests 51%, import 45%, worker 2%, transform 2%)

TEST_EXIT=0
```

## Task 2: identity binding, derived EVM address

Source fixture: `fixtures/onchain-account-qor1385.json`, account
`qor1385wkhky3qkjwq47t8904xrd6s82lmkfjnxxsr`, `key_type` `hybrid`,
`classical_key_source` `auth_account`, `possession_proven` true.

The fixture's `ecdsa_pubkey` is a base64 compressed secp256k1 key:

```
03d9ec2c76c3c28f0439c550b3dfbfb6a0d32878a5f9093699ae392b46be05acea
```

Method, run from `packages/qoreseal-adapter` (the package that already pins
`@noble/hashes` 2.4.0). Node's built-in `createECDH("secp256k1")` is used only
to decompress the point; `keccak_256` comes from the pinned
`@noble/hashes/sha3.js`. No hash is hand-rolled and no wallet or chain is
called.

Command:

```bash
node --input-type=module -e "
import { createECDH } from 'node:crypto';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { readFileSync } from 'node:fs';
const f = JSON.parse(readFileSync('../../fixtures/onchain-account-qor1385.json','utf8'));
const compressed = Buffer.from(f.account.ecdsa_pubkey, 'base64');
const ecdh = createECDH('secp256k1');
ecdh.setPublicKey(compressed);
const uncompressed = ecdh.getPublicKey();
console.log('compressed_hex', compressed.toString('hex'));
console.log('uncompressed_length', uncompressed.length);
console.log('uncompressed_hex', uncompressed.toString('hex'));
const hash = keccak_256(uncompressed.subarray(1));
console.log('keccak_hex', Buffer.from(hash).toString('hex'));
console.log('address', '0x' + Buffer.from(hash.subarray(12)).toString('hex'));
"
```

Output, unedited:

```
compressed_hex 03d9ec2c76c3c28f0439c550b3dfbfb6a0d32878a5f9093699ae392b46be05acea
uncompressed_length 65
uncompressed_hex 04d9ec2c76c3c28f0439c550b3dfbfb6a0d32878a5f9093699ae392b46be05acea37912359cf3c78956a65d3b4d4ba03f6f8e98c5f8c0449b1ac621478f8b8bbab
keccak_hex b2ec35dcfec754dc65bb88edd0a1453c7b8157aa0635076c33b3e24a50a923c5
address 0xd0a1453c7b8157aa0635076c33b3e24a50a923c5
```

Derived EVM-style address:
`0xd0a1453c7b8157aa0635076c33b3e24a50a923c5`.

This is a derivation from the saved public key. It is not evidence that QoreX
uses this address for EVM transactions; that is the ASSUMPTION in ADR-0009 and
the owner check recorded there.

## Task 3: agreement package

`packages/agreement` exports the ten-field `Terms`, `commitmentOf` (viem 2.57.11
`keccak256(abi.encode(terms))`), `agreementTextOf` (canonical `LOANSHARK
AGREEMENT v1` text), `agreementHashOf` (SHA-256 of that text) and the
confirmation message helpers built on the existing hybrid verifier. No QoreX
signer is used; the confirmation tests sign with generated throwaway QoreSign
keys.

Command:

```bash
pnpm --filter @loanshark/agreement test
```

Output, unedited:

```
 ✓ test/commitment.test.ts (8 tests) 64ms
 ✓ test/confirmation.test.ts (7 tests) 2065ms
   ✓ signAgreementConfirmation and verifyAgreementConfirmation (4)
     ✓ signs and verifies the confirmation with a throwaway identity (MOCK) 1081ms
     ✓ refuses a confirmation when the terms changed after signing (MOCK) 327ms
     ✓ refuses a confirmation signed by a different account (MOCK) 606ms

 Test Files  2 passed (2)
      Tests  15 passed (15)
   Start at  16:52:04
   Duration  6.74s (import 68%, tests 25%, transform 7%)

AGREEMENT_EXIT=0
```

The five vectors in `fixtures/agreement-vectors.json` were generated once from
the built TypeScript implementation and then frozen. Their SHA-256 is
`e0c33bbf65b0e19659721fce68ff035c64f432fcefaaf3fb7f6ffd57e3c1e777`
(`fixtures/agreement-vectors.meta.json`). `packages/agreement/test/commitment.test.ts`
recomputes every vector on each run, so the fixture cannot drift silently.

## Task 4: contract toolchain

Hardhat 3.22.0, `@nomicfoundation/hardhat-viem` 3.1.0,
`@nomicfoundation/hardhat-node-test-runner` 3.1.2,
`@nomicfoundation/hardhat-network-helpers` 3.0.12, OpenZeppelin Contracts 5.6.1
and viem 2.57.11, all exact pins. Solidity 0.8.34 with optimizer enabled at 200
runs. Only the in-process `hardhat` network is configured; no HTTP network,
deploy script or live transaction exists. Node support and the versions are in
`docs/adr/0011-contract-toolchain.md` and source-lock claims 31 to 33.

Command:

```bash
pnpm --filter @loanshark/contracts exec hardhat compile --force
```

Output, unedited:

```

Compiled 7 Solidity files with solc 0.8.34 (evm target: osaka)
COMPILE_EXIT=0
```

## Task 5 and Task 6: contracts and tests

Contracts:

- `contracts/TestUSD.sol`: name `LOANSHARK Test USD`, symbol `tUSD`, 6 decimals,
  owner-only `mint`.
- `contracts/LoanSettlement.sol`: the ADR-0008 state machine, immutable token
  allowlist, pull payments, custom errors, `SafeERC20`, `ReentrancyGuard`, CEI
  ordering and an exact balance-delta check on every transfer.
- `contracts/mocks/`: `MockDecimals18` plus four adversarial tokens
  (`MockNoReturnToken`, `MockFalseReturnToken`, `MockFeeOnTransferToken`,
  `MockReentrantToken`). All are test-only and named `Mock`.

Test inventory, 23 tests:

| File | Tests | Token used |
|---|---|---|
| `test/lifecycle.test.ts` | 7 | 6 with `TestUSD`, 1 with `MockDecimals18` (18 decimals) |
| `test/time.test.ts` | 5 | `TestUSD` |
| `test/default.test.ts` | 3 | `TestUSD` |
| `test/mock-tokens.test.ts` | 5 | four mock tokens plus an unlisted `TestUSD` deployment |
| `test/invariants.test.ts` | 1 (200 runs) | `TestUSD` |
| `test/cross-commitment.test.ts` | 2 | none; pure view calls |

Real `TestUSD`/settlement tests: 15. Tests that use a mock token as the token
under test: 6 (`MockDecimals18` in one lifecycle case, four mock tokens plus
the unlisted-token case in `mock-tokens.test.ts`). Commitment-only tests: 2.
No test in this phase used the live chain or a real stablecoin.

The seeded sequence uses seed `0x5eed1234` and 200 independent loans. After
every state change it asserts that the settlement token balance equals the sum
of the loan escrow and the lender's withdrawable amount, and that outstanding
equals the sum of unwithdrawn repayments. It withdraws at random points, so
the assertion covers both the escrowed and withdrawn sides.

The cross-implementation test compares the Solidity `commitmentOf` to the
frozen TypeScript `loanId` for all five vectors. The agreement package
recomputes those same vectors from the TypeScript implementation on every run,
so a change on either side fails one of the two tests.

Command and result are in the final checks below. The suite passed 23 of 23,
including `refuses a reentrant token with the reentrancy guard`, the
fee-on-transfer, false-return and no-return cases, and the boundary tests at
`deadline` and `deadline + 1`.

## Final checks

Command:

```bash
pnpm verify-env
pnpm typecheck
pnpm format:check
pnpm lint
pnpm test
```

Output (lint diagnostics omitted; the exit codes and summaries are unedited):

```
### pnpm verify-env
$ node scripts/verify-env.mjs
tool            pinned        actual
--------------  ------------  ------------
node            26.13.0       26.13.0
pnpm            12.21.0       12.21.0
typescript      5.9.3         5.9.3
@biomejs/biome  2.6.8         2.6.8
vitest          5.1.0         5.1.0

Toolchain matches the pinned versions.
VERIFY_EXIT=0

### pnpm typecheck
$ pnpm -r --if-present typecheck
packages/contracts typecheck$ tsc -p tsconfig.json --noEmit
packages/chain-client typecheck$ tsc -p tsconfig.json --noEmit
packages/chain-client typecheck: Done
packages/qoreseal-adapter typecheck$ tsc -p tsconfig.json --noEmit
packages/qoreseal-adapter typecheck: Done
packages/agreement typecheck$ tsc -p tsconfig.json --noEmit
packages/agreement typecheck: Done
packages/contracts typecheck: Done
TYPECHECK_EXIT=0

### pnpm format:check
$ biome format .
Checked 46 files in 134ms. No fixes applied.
FORMAT_EXIT=0

### pnpm lint
$ biome lint .
...
Checked 46 files in 230ms. No fixes applied.
Found 45 warnings.
Found 24 infos.
LINT_EXIT=0

### pnpm test
...
 Test Files  10 passed | 1 skipped (11)
      Tests  83 passed | 1 skipped (84)
   Duration  15.85s (import 56%, tests 40%, worker 2%, transform 2%)
...
$ hardhat test
No contracts to compile

Running Solidity tests


Running node:test tests

  Solidity and TypeScript commitment
    ✔ matches every frozen TypeScript vector
    ✔ uses abi.encode, not packed encoding, so field boundaries matter

  LoanSettlement default
    ✔ lets anyone mark an overdue active loan Defaulted, then accepts repayment to Repaid (176ms)
    ✔ cannot mark a proposed, funded, repaid or refunded loan as defaulted (212ms)
    ✔ keeps a defaulted loan open to repayment but rejects cancellation, refund and double default (95ms)

  LoanSettlement seeded randomised sequence
    ✔ keeps the balance invariant after every step across 200 runs (seed 0x5eed1234) (19088ms)

  LoanSettlement lifecycle
    ✔ runs propose, fund, claim, partial repayments, withdrawal and Repaid with exact balances (101ms)
    ✔ supports an 18-decimal token with the same rules (92ms)
    ✔ rejects every wrong caller (194ms)
    ✔ rejects wrong callers for cancel and refund (85ms)
    ✔ rejects out-of-order transitions and duplicate proposals (82ms)
    ✔ rejects overpayment and zero payment without changing balances (90ms)
    ✔ cancels an unfunded proposal and then rejects funding it (93ms)

  LoanSettlement adversarial tokens
    ✔ settles normally with a USDT-style token that returns no value
    ✔ reverts when a token returns false instead of moving funds
    ✔ reverts when a token charges a fee on transfer
    ✔ rejects a token that is not on the immutable allowlist
    ✔ refuses a reentrant token with the reentrancy guard

  LoanSettlement time boundaries
    ✔ accepts fund at the funding deadline and rejects it one second later
    ✔ expires a proposal only after the funding deadline (104ms)
    ✔ accepts claim at the claim deadline and rejects it one second later (145ms)
    ✔ refunds only after the claim deadline (90ms)
    ✔ marks default only after dueDate plus graceSeconds (84ms)


23 passing (23 nodejs)

TEST_EXIT=0
```

Totals: 83 Vitest tests passed, 1 live-chain test skipped, 23 Hardhat tests
passed. The 45 lint warnings and 24 infos are pre-existing style suggestions
(mostly `useLiteralKeys` and non-null assertions in tests); lint exits 0 and no
diagnostic is an error.

## Gas statistics

Collected with:

```bash
pnpm --filter @loanshark/contracts exec hardhat test --gas-stats --gas-stats-json .tmp/gas-stats.json
```

The unedited JSON is `docs/evidence/phase-03-gas-stats.json`. LoanSettlement
numbers, in gas:

| Function | Min | Average | Median | Max | Calls |
|---|---|---|---|---|---|
| `cancel` | 30532 | 30532 | 30532 | 30532 | 1 |
| `claim` | 53654 | 55319 | 55318 | 57501 | 212 |
| `commitmentOf` | 27540 | 27723 | 27720 | 28020 | 230 |
| `expire` | 30583 | 30583 | 30583 | 30583 | 1 |
| `fund` | 60533 | 77554 | 77633 | 79794 | 217 |
| `isAllowedToken` | 24038 | 24038 | 24038 | 24038 | 2 |
| `markDefault` | 30719 | 30719 | 30719 | 30719 | 3 |
| `outstandingOf` | 24285 | 28587 | 30672 | 30824 | 620 |
| `proposeLoan` | 214283 | 214320 | 214319 | 214403 | 223 |
| `refund` | 55327 | 57739 | 57739 | 60151 | 2 |
| `repaidOf` | 24119 | 24119 | 24119 | 24119 | 1 |
| `repay` | 68641 | 93914 | 102865 | 124189 | 622 |
| `stateOf` | 24150 | 24172 | 24174 | 24174 | 222 |
| `withdraw` | 46861 | 48187 | 48192 | 48207 | 329 |
| `withdrawableOf` | 24031 | 24053 | 24055 | 24055 | 1864 |

Deployment: min 1756948, average 1856420, median 1869822, max 1869822 over 22
deployments; runtime size 7731 bytes. These are local EVM measurements, not
Diana gas costs, and no deployment was made.

## Status and limitations recorded with this evidence

- C5, C6 and C7 are DONE only as local Hardhat results. Nothing was deployed.
- The qor1 account to `0xd0a1453c7b8157aa0635076c33b3e24a50a923c5` identity link
  remains unconfirmed (ADR-0009, owner check).
- The eight decision points in ADR-0008 are marked "proposed by assistant,
  owner to confirm".
- No remote is configured, so the updated CI step has not run on GitHub.
- The contract suite needs the pinned solc 0.8.34 compiler; Hardhat downloads
  it on first compile. The tests themselves contact no external chain.
