# Threat model

Status: initial, Phase 0. Each row needs a test before its milestone can be marked DONE.

| # | Threat | Treatment | Test (planned) |
|---|---|---|---|
| T1 | Unauthorised party reads a request or offer | Recipient-scoped encryption | Wrong recipient fails to decrypt: `packages/qoreseal-adapter/test/adapter.test.ts` (C1, offline, throwaway keys) |
| T2 | Lender reads another lender's offer | One single-recipient envelope per offer | Lender B cannot open lender A's offer: `packages/qoreseal-adapter/test/adapter.test.ts` (C2, offline, throwaway keys) |
| T3 | Key substitution / fake recipient key | Verify recipient card against the on-chain ML-DSA and KEM keys (blocked: KEM registration) | Card for a different KEM key is rejected: `packages/qoreseal-adapter/test/cards.test.ts` (offline, throwaway keys, MOCKED registry; the real chain is not called) |
| T4 | Ciphertext tampering or moving an envelope between deals | QoreSeal AEAD plus project-defined AAD binding request, offer, parties, version (ADR-0007) | Wrong AAD and flipped bytes fail: `packages/qoreseal-adapter/test/adapter.test.ts` and `test/signed-envelope.test.ts` (C3, offline, throwaway keys); frozen bytes in `fixtures/aad-vectors.json` |
| T5 | Forged sender | Hybrid message signature over the envelope hash, post-quantum part required, checked against the on-chain key (ADR-0003) | Classical-only and wrong-key signatures rejected: `packages/qoreseal-adapter/test/signed-envelope.test.ts` (offline, throwaway keys, MOCK account client) |
| T6 | A recipient of a multi-recipient envelope forges a variant for other recipients (QoreSeal spec) | Borrower signs the request; lenders verify the signature and hash | Altered request fails verification: `packages/qoreseal-adapter/test/signed-envelope.test.ts` (offline, throwaway keys, MOCK account client) |
| T7 | App trusts classical-only fields in a signature response | Verifier ignores top-level `pub_key` and `signature`; requires `pq` | Response with `pq` removed is rejected: `packages/qoreseal-adapter/test/signed-envelope.test.ts` and `packages/chain-client/test/verify-hybrid-message.test.ts` |
| T8 | Server compromise | Server holds ciphertext and metadata only | Review plus a test that no key material is sent |
| T9 | Unauthorised token withdrawal, reentrancy, malicious tokens | State machine, role checks, safe transfers, reentrancy guard, token allowlist | `packages/contracts/test/mock-tokens.test.ts` (reentrant, no-return, false-return, fee-on-transfer, not allowlisted) and `test/lifecycle.test.ts` (wrong callers): local Hardhat network, mock tokens, not deployed |
| T10 | Decimal and amount errors | Amounts are base units; no rate math; no decimal assumption | `packages/contracts/test/lifecycle.test.ts` runs the lifecycle with a 6-decimal and an 18-decimal token; `test/invariants.test.ts` asserts exact outstanding and balances |
| T11 | Replay or duplicate repayment | One loan per commitment, strict state checks, exact outstanding | `packages/contracts/test/lifecycle.test.ts` (duplicate proposal, double fund, double claim, repayment after Repaid) and `test/default.test.ts` |
| T12 | Metadata leakage | Minimise and document; no privacy claims beyond evidence | Limitations list |
| T15 | A lender funds terms that do not match the signed agreement | The UI must recompute the commitment and compare it with `loanId` and `termsOf()` before enabling fund; the contract only commits to the terms it is given and cannot verify a signature or document | C11 in `docs/ACCEPTANCE_MATRIX.md` (PENDING, `apps/web` not built) |
| T16 | A borrower is given no time to claim | `LoanSettlement` requires `claimDeadline >= fundingDeadline + MINIMUM_CLAIM_WINDOW` (3600 seconds, owner-confirmed) | `packages/contracts/test/review.test.ts` (3599 reverts, 3600 succeeds); ADR-0008 decision 9 |
| T17 | Tokens sent directly to the contract are lost | No sweep function exists by design; such tokens are outside every loan's accounting and stay in the contract | `packages/contracts/test/review.test.ts` (donation does not change accounting and cannot be withdrawn) |
| T18 | A blocklisting or fee-changing token breaks settlement | Out of scope: the immutable allowlist is intended to hold only this project's `TestUSD`, which has no blocklist or fee | Limitations list; `TestUSD` source reviewed |
| T19 | `block.timestamp` on Diana has different semantics or skew from this machine | Read-only block-time comparison during Phase 3b; treat deadlines as approximate until confirmed | `evidence/phase-03b-result.md` (read-only sample); ADR-0011 |
| T13 | Lost decryption key | Backup phrase shown once; documented loss of data (ADR-0005) | UX review |
| T14 | Concurrent signing requests rejected by QoreX | Queue requests in the UI | UI test |

Non-goals: anonymity, private ERC-20 transfers, FHE, a private matching engine, credit scoring, legal enforceability, production lending.
