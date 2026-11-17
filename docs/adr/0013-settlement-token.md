# ADR-0013: Settlement token allowlist for the submission

Status: Proposed. The owner has not decided. No contract has been changed.

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

Not made. The owner decides after weighing the reproducibility gain in Option A against the unverified third-party token risk. ASSUMPTION if Option A is chosen: fUSD behaves as a standard ERC-20 for transfers and approvals; that must be tested with a real fUSD transfer from the owner's wallet before the demo.

Test required after the decision: a settlement test in the chosen token on the local Hardhat network (both options), and, for Option A, one live read-only `balanceOf`/`allowance` check against fUSD plus any owner-run transfer the owner chooses to make in their own wallet.
