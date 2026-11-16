# Acceptance matrix

Every requirement maps to an implementation path, a test path, an evidence path and a status. No requirement is DONE without a passing test and recorded evidence.

Status values: `PENDING`, `IN PROGRESS`, `DONE`, `BLOCKED`.

Last updated: Phase 1, 2026-11-16.

| ID | Assertion | Implementation | Test | Evidence | Status |
|---|---|---|---|---|---|
| M0-1 | QoreX exposes message signing that returns a hybrid signature | none (probe) | manual console probe | `evidence/phase-00-result.md` | DONE |
| M0-2 | The account's ML-DSA key is registered on-chain | none (QoreX first transaction) | REST query | `evidence/phase-00-result.md` | DONE |
| M0-3 | A QoreX hybrid signature verifies against the on-chain key | `packages/chain-client` | verification spike | `evidence/phase-01-result.md` | BLOCKED (verifier ready; QoreX signature fixture not supplied) |
| M0-4 | Diana EVM chain ID, RPC, explorer, faucet confirmed | none | `eth_chainId` call | `evidence/phase-01-result.md` | IN PROGRESS (chain ID 9800 and RPC confirmed; explorer and faucet not checked) |
| M0-5 | Hackathon rules, deadline, licence confirmed | none | n/a | pending | BLOCKED (link needed) |
| M0-6 | Path to register an ML-KEM key for a web-app user | unknown | n/a | `adr/0004` | BLOCKED |
| M0-7 | Three `erc20:` denominations on the test account identified | none | read-only contract calls | `evidence/phase-01-result.md` | DONE (contract metadata only; issuer and backing unknown, not established as stablecoins) |
| C1 | Wrong recipient cannot decrypt | `packages/qoreseal-adapter` | unit | pending | PENDING (offline slice unblocked; on-chain registry path BLOCKED) |
| C2 | Lender B cannot read lender A's offer | `packages/qoreseal-adapter` | unit and e2e | pending | PENDING |
| C3 | Tampered envelope or wrong AAD is rejected | `packages/qoreseal-adapter` | unit | pending | PENDING |
| C4 | Sender signature requires the post-quantum part and the on-chain key | `packages/chain-client` | unit | pending | PENDING |
| C5 | Same agreement data gives the same hash across clients; any change alters it | `packages/agreement` | unit and vectors | pending | PENDING |
| C6 | No disbursement before funding; none twice | `contracts/` | unit, adversarial | pending | PENDING |
| C7 | No over-repayment; closed loans reject payments | `contracts/` | unit | pending | PENDING |
| C8 | Wrong chain is rejected by the app | `apps/web` | e2e | pending | PENDING |
| C9 | Native hybrid transaction followed by an EVM transaction under an authorised window | `apps/web`, `packages/chain-client` | e2e on Diana | pending | PENDING (window must be opened in QoreX) |
| C10 | No key material or plaintext reaches the server | `apps/api` | test plus review | pending | PENDING |
