# Acceptance matrix

Every requirement maps to an implementation path, a test path, an evidence path and a status. No requirement is DONE without a passing test and recorded evidence.

Status values: `PENDING`, `IN PROGRESS`, `DONE`, `BLOCKED`.

Last updated: Phase 3b (settlement review follow-up), 2026-11-17.

| ID | Assertion | Implementation | Test | Evidence | Status |
|---|---|---|---|---|---|
| M0-1 | QoreX exposes message signing that returns a hybrid signature | none (probe) | manual console probe | `evidence/phase-00-result.md` | DONE |
| M0-2 | The account's ML-DSA key is registered on-chain | none (QoreX first transaction) | REST query | `evidence/phase-00-result.md` | DONE |
| M0-3 | A QoreX hybrid signature verifies against the on-chain key | `packages/chain-client/src/verify-hybrid-message.ts` | `packages/chain-client/test/verify-hybrid-message.test.ts` (12 tests, mock client) and a live test gated on `LIVE_CHAIN=1` | `evidence/phase-01-result.md` | DONE (verified against the on-chain key on `qorechain-diana`; four tampering controls refused) |
| M0-4 | Diana EVM chain ID, RPC, explorer, faucet confirmed | none | `eth_chainId` call | `evidence/phase-01-result.md` | IN PROGRESS (chain ID 9800 and RPC confirmed; explorer and faucet not checked) |
| M0-5 | Hackathon rules, deadline, licence confirmed | none | n/a | pending | BLOCKED (link needed) |
| M0-6 | Path to register an ML-KEM key for a web-app user | unknown | n/a | `adr/0004` | BLOCKED |
| M0-7 | Three `erc20:` denominations on the test account identified | none | read-only contract calls | `evidence/phase-01-result.md` | DONE (contract metadata only; issuer and backing unknown, not established as stablecoins) |
| C1 | Wrong recipient cannot decrypt | `packages/qoreseal-adapter` (`sealMlkemToRecipient`, `openEnvelope`) | `packages/qoreseal-adapter/test/adapter.test.ts` ("C1: the wrong recipient cannot open it") | `evidence/phase-02-result.md` | DONE (offline, throwaway keys) |
| C2 | Lender B cannot read lender A's offer | `packages/qoreseal-adapter` (one single-recipient envelope per offer) | `packages/qoreseal-adapter/test/adapter.test.ts` (two C2 tests) | `evidence/phase-02-result.md` | DONE (offline, throwaway keys; no app or UI e2e exists yet) |
| C3 | Tampered envelope or wrong AAD is rejected | `packages/qoreseal-adapter` (`encodeAad`, signed envelopes) | `packages/qoreseal-adapter/test/adapter.test.ts` and `test/signed-envelope.test.ts` (flipped byte, each field, moved request); `test/aad.test.ts` (frozen vectors) | `evidence/phase-02-result.md` | DONE (offline, throwaway keys) |
| C4 | Sender signature requires the post-quantum part and the on-chain key | `packages/chain-client` | unit | pending | PENDING |
| C5 | Same agreement data gives the same hash across clients; any change alters it | `packages/agreement` (`commitmentOf`, `agreementHashOf`) and `packages/contracts/contracts/LoanSettlement.sol` (`commitmentOf`) | `packages/agreement/test/commitment.test.ts` (all ten fields; five frozen vectors) and `packages/contracts/test/cross-commitment.test.ts` (Solidity equals the TypeScript vectors) | `evidence/phase-03-result.md` | DONE (local Hardhat network, not deployed) |
| C6 | No disbursement before funding; none twice | `LoanSettlement` `fund`/`claim` state checks and exact transfers | `packages/contracts/test/lifecycle.test.ts` (claim before fund, double fund, double claim), `test/default.test.ts`, `test/mock-tokens.test.ts` | `evidence/phase-03-result.md` | DONE (local Hardhat network, not deployed) |
| C7 | No over-repayment; closed loans reject payments | `LoanSettlement` `repay` outstanding check and terminal-state checks | `packages/contracts/test/lifecycle.test.ts` (`Overpayment`, zero, Repaid re-payment), `test/default.test.ts` | `evidence/phase-03-result.md` | DONE (local Hardhat network, not deployed) |
| C8 | Wrong chain is rejected by the app | `apps/web` | e2e | pending | PENDING |
| C9 | Native hybrid transaction followed by an EVM transaction under an authorised window | `apps/web`, `packages/chain-client` | e2e on Diana | pending | PENDING (window must be opened in QoreX) |
| C10 | No key material or plaintext reaches the server | `apps/api` | test plus review | pending | PENDING |
| C11 | The UI recomputes the commitment from the signed agreement and compares it with the `loanId` and `termsOf()` before enabling fund | `apps/web` (not yet built) | pending (UI e2e) | pending | PENDING |
| T3 | A recipient card for a different KEM key is rejected | `packages/qoreseal-adapter` (uses the official `verifyRecipientCard`) | `packages/qoreseal-adapter/test/cards.test.ts` against a MOCKED registry | `evidence/phase-02-result.md` | DONE (offline, throwaway keys, mocked registry; no real chain call) |
| T5 | Forged sender is rejected: classical-only and wrong-key signatures | `packages/qoreseal-adapter` (`verifySignedEnvelope` via `verifyHybridMessage`) | `packages/qoreseal-adapter/test/signed-envelope.test.ts` ("T5", "T5 and T7") | `evidence/phase-02-result.md` | DONE (offline, throwaway keys, mocked account client) |
| T6 | A lender cannot forge a request variant for another lender | `packages/qoreseal-adapter` (domain-tagged hash over envelope bytes plus AAD) | `packages/qoreseal-adapter/test/signed-envelope.test.ts` ("T6") | `evidence/phase-02-result.md` | DONE (offline, throwaway keys, mocked account client) |
| T7 | The app does not trust classical-only fields; a removed `pq` is refused | `packages/qoreseal-adapter` (rebuilt signature, `requirePq`) | `packages/qoreseal-adapter/test/signed-envelope.test.ts` ("T7", "T5 and T7") | `evidence/phase-02-result.md` | DONE (offline, throwaway keys, mocked account client) |
| T9 | Unauthorised withdrawal, reentrancy or a malicious token drains funds | `LoanSettlement` role checks, `ReentrancyGuard`, `SafeERC20`, exact balance deltas and immutable allowlist | `packages/contracts/test/mock-tokens.test.ts` (reentrant, no-return, false-return, fee-on-transfer, not allowlisted) and `test/lifecycle.test.ts` (wrong callers) | `evidence/phase-03-result.md` | DONE (local Hardhat network, mock tokens, not deployed) |
| T10 | Decimal or amount errors | Amounts are base units; no rate math; tests cover 6 and 18 decimals | `packages/contracts/test/lifecycle.test.ts` (both decimals) and `test/invariants.test.ts` | `evidence/phase-03-result.md` | DONE (local Hardhat network, not deployed) |
| T11 | Replay or duplicate repayment | One loan per commitment; terminal-state and exact-outstanding checks | `packages/contracts/test/lifecycle.test.ts` (duplicate proposal, double fund/claim, repayment after Repaid) and `test/invariants.test.ts` | `evidence/phase-03-result.md` | DONE (local Hardhat network, not deployed) |
