# Threat model

Status: initial, Phase 0. Each row needs a test before its milestone can be marked DONE.

| # | Threat | Treatment | Test (planned) |
|---|---|---|---|
| T1 | Unauthorised party reads a request or offer | Recipient-scoped encryption | Wrong recipient fails to decrypt |
| T2 | Lender reads another lender's offer | One single-recipient envelope per offer | Lender B cannot open lender A's offer |
| T3 | Key substitution / fake recipient key | Verify recipient card against the on-chain ML-DSA and KEM keys (blocked: KEM registration) | Card for a different KEM key is rejected |
| T4 | Ciphertext tampering or moving an envelope between deals | QoreSeal AEAD plus project-defined AAD binding request, offer, parties, version (ADR-0003) | Wrong AAD and flipped bytes fail |
| T5 | Forged sender | Hybrid message signature over the envelope hash, post-quantum part required, checked against the on-chain key (ADR-0003) | Classical-only and wrong-key signatures rejected |
| T6 | A recipient of a multi-recipient envelope forges a variant for other recipients (QoreSeal spec) | Borrower signs the request; lenders verify the signature and hash | Altered request fails verification |
| T7 | App trusts classical-only fields in a signature response | Verifier ignores top-level `pub_key` and `signature`; requires `pq` | Response with `pq` removed is rejected |
| T8 | Server compromise | Server holds ciphertext and metadata only | Review plus a test that no key material is sent |
| T9 | Unauthorised token withdrawal, reentrancy, malicious tokens | State machine, role checks, safe transfers, reentrancy guard, token allowlist | Adversarial contract tests |
| T10 | Decimal and amount errors | Read decimals per token; bounds checks | Unit tests with non-18-decimal tokens |
| T11 | Replay or duplicate repayment | Strict state checks, unique accounting | Replay tests |
| T12 | Metadata leakage | Minimise and document; no privacy claims beyond evidence | Limitations list |
| T13 | Lost decryption key | Backup phrase shown once; documented loss of data (ADR-0005) | UX review |
| T14 | Concurrent signing requests rejected by QoreX | Queue requests in the UI | UI test |

Non-goals: anonymity, private ERC-20 transfers, FHE, a private matching engine, credit scoring, legal enforceability, production lending.
