# ADR-0013: Settlement token allowlist for the submission

Status: Accepted, 2026-11-18. The owner chose Option A: allowlist the project's
`TestUSD` and the fest `fUSD` at `0x97143B771D34ddb9130b807b135Ae675A5a963CA`.
The contract constructor changed to two token arguments in Step 6b. Nothing has
been deployed; the deployment is owner-run.

Context: `LoanSettlement` takes an immutable list of allowed tokens in its constructor (`address[] allowedTokens_`, `packages/contracts/contracts/LoanSettlement.sol` line 102). Whatever is allowlisted at deployment cannot be changed later without deploying again. The demo therefore needs the token decision before the deployment, not after it.

The project's own token is `TestUSD`: ERC-20, 6 decimals, named `LOANSHARK Test USD` (`tUSD`), with an owner-only `mint` and no other privileged function (`packages/contracts/contracts/TestUSD.sol`). It is labelled test money and is not a stablecoin.

The organiser's start page says the fest faucet gives fUSD, fETH and fBTC test tokens once every 24 hours (`docs/research/source-lock.md` claim 53). The account's fUSD contract reports `Fest USD`, symbol `fUSD`, 6 decimals (claim 21). A local selector scan of the saved runtime code of all three fest tokens found none of fifteen common admin selectors (`docs/evidence/phase-05-token-scan.md`), which is a heuristic only.

Unknown for fUSD: the deployer, the account that can mint, the current supply, any backing, whether transfers can be paused or an address blocklisted by another name or path, and whether the code can be upgraded. The saved code is 1798 bytes and contains no `owner()`, `mint`, `pause`, blocklist or upgrade selector, but that does not prove those powers are absent. fUSD has not been transferred, approved or otherwise exercised by this project.

## Option A: allowlist TestUSD and fUSD at deployment

Consequences:

- A visitor can use the token the fest faucet gives them, so the settlement flow can be reproduced with funds a juror already has. This is the stronger demo.
- The contract accepts two tokens, so every UI and test path must state which one a loan uses. The contract already keys loans by token, so this is disclosure work, not a contract change.
- Settlement depends on a token this project does not control. If the organiser pauses, freezes or changes it, loans in that token stop settling. Direct transfers are public and irreversible, so the risk is to the demo, not to other users' funds.
- The project would be treating an unverified token as acceptable collateral for a demo. The README must say its issuer, backing and controls are unknown.
- `TestUSD` remains the fallback if fUSD fails on the day.

## Option B: allowlist TestUSD only

Consequences:

- The project controls every token in the contracts. Mint, decimals and transfer behaviour are known, tested and documented.
- A juror with only fest tokens cannot reproduce a settlement without first obtaining `tUSD`, which needs the owner's mint key or a faucet the project must build. That weakens the claim that real test-token settlement works.
- The fest faucet tokens remain unused, and the README limitation saying so stays true.

## Evidence common to both

- `TestUSD` is 6 decimals, matching fUSD, so the existing 6-decimal and 18-decimal tests cover the amount handling either way (`docs/evidence/phase-03-result.md`).
- The contract rejects any token not on the list and the adversarial token tests already cover false-return, fee-on-transfer, reentrancy and no-return tokens (`packages/contracts/test/mock-tokens.test.ts`). Those tests use mocks, not fUSD.
- Neither option has been deployed or tested on Diana. No transaction has been sent.

## Decision

Option A, chosen by the owner on 2026-11-18: `LoanSettlement` is deployed with
exactly two allowed tokens, `TestUSD` (deployed first in the same session) and
the fest `fUSD` at `0x97143B771D34ddb9130b807b135Ae675A5a963CA`. The allowlist
stays immutable, with no admin and no upgrade path.

Implementation in Step 6b:

- The constructor is now `constructor(address testUsd_, address fusd_)`. It
  rejects a zero address, a duplicate and the same address twice with
  `InvalidAddress`. There is no array argument and no mutator.
- A lifecycle test completes in `TestUSD` and a second lifecycle test completes
  in a MOCK 6-decimal token labelled with the fUSD profile
  (`MockFusdProfile`). The mock exists because the real fUSD is not touched or
  exercised locally; no local test proves anything about the real fUSD contract.
- A test asserts that a token outside the allowlist is rejected at
  `proposeLoan`.

ASSUMPTION (owner accepted the risk in ADR-0013): the real fUSD behaves as a
standard ERC-20 for `transfer`, `transferFrom`, `approve` and `balanceOf`. This
has not been tested by this project. The owner should make one small fUSD
transfer from their own wallet before the demo if they want that confirmed.

Still required after the decision, and not performed in Step 6b: the live
deployment and the live read-only `balanceOf`/`allowance` checks. Both are in
`docs/evidence/phase-06-owner-checklist.md` and are OWNER-SUPPLIED.

## Verification in Step 6b

- Five local Hardhat tests cover the two-token constructor: exact allowlist and
  order, rejection of a zero or duplicate address, a full lifecycle in
  `TestUSD`, a full lifecycle in the MOCK fUSD-profile token, and rejection of a
  token outside the allowlist. The mock is `MockFusdProfile`, name
  `Mock Fest USD`, symbol `mFUSD`, 6 decimals; it is not the real fUSD.
- The deploy panel builds the LoanSettlement constructor data as
  `abi.encode(TestUSD address, 0x97143B771D34ddb9130b807b135Ae675A5a963CA)`,
  with the TestUSD address taken from the confirmed deployment receipt.
- `scripts/verify-deployment.mjs` checks `allowedTokens()` equals the two
  addresses in that order after deployment.
- No local or live test proves that the real fUSD transfers, approves or
  reports balances as a standard ERC-20. That remains the owner-accepted risk
  above.
