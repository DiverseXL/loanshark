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
| T13 | Lost decryption key | Backup phrase shown once; documented loss of data (ADR-0005) | UX review |
| T14 | Concurrent signing requests rejected by QoreX | Queue requests in the UI | UI test |

Non-goals: anonymity, private ERC-20 transfers, FHE, a private matching engine, credit scoring, legal enforceability, production lending.
