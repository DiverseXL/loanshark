# LOANSHARK

Private financing on QoreChain: encrypted requests, separately encrypted lender offers, a verifiable agreement commitment, and real test-token settlement.

> Status: Phase 2 (M1 offline cryptographic slice). This repository contains the architecture, threat model, decision records and source lock from Phase 0, a hybrid signature verifier in `packages/chain-client`, and an offline QoreSeal adapter in `packages/qoreseal-adapter` with context-bound, signed envelopes and 55 offline tests. One real QoreX signature has been verified against the account's on-chain key. The on-chain ML-KEM registration path is BLOCKED, so the adapter uses explicit mlkem mode only. There is still no product workflow, contract, app or API. Every claim below is either backed by a link into `docs/` or marked as not yet built.

Built for the QoreChain hackathon, Encrypted Apps category. Target network: QoreChain Diana Testnet (`qorechain-diana`). Testnet only; not a regulated lending service.

## The problem

Borrowers need capital without publishing their financial documents or negotiating positions. Lenders need enough detail to price a request without seeing each other's offers. Both sides need to know exactly which agreement they accepted, and money has to move under explicit rules.

## What LOANSHARK is, and is not

| It does | It does not claim |
|---|---|
| Encrypt requests and offers client-side for chosen recipients (QoreSeal, ML-KEM-1024) | Anonymity. Wallet addresses, token transfers, timing and sizes are public. |
| Encrypt each lender offer separately for the borrower | A sealed-bid auction or private matching engine |
| Commit to a canonical agreement version by hash, anchored on-chain | Legal enforceability, or that off-chain statements are true |
| Settle a clearly labelled test ERC-20 through settlement contracts | Private transfers, real USDC/USDT, or production lending |
| Authenticate senders with QoreX hybrid (secp256k1 + ML-DSA-87) message signatures | That each ERC-20 transfer is itself ML-DSA-signed. EVM transactions are ECDSA-signed under a hybrid-authorised window. |

No zero-knowledge proofs, FHE or confidential computation are used or claimed.

## Status by milestone

| Milestone | Scope | Status |
|---|---|---|
| M0 | Protocol reconnaissance, ADRs, source lock | In progress. Evidence in `docs/evidence/phase-00-result.md` and `docs/evidence/phase-01-result.md`. M0-3 is DONE; M0-4, M0-5 and M0-6 are still open |
| M1 | Cryptographic vertical slice | Offline slice built and tested: `packages/qoreseal-adapter` (seal/open in explicit mlkem mode, canonical AAD, signed envelopes), with the official QoreSeal 0.1.0 vectors passing. On-chain KEM key registration and hybrid mode remain BLOCKED (ADR-0004). Evidence in `docs/evidence/phase-02-result.md` |
| M2 | Private request and offer workflow | Not started |
| M3 | Agreement commitment | Not started |
| M4 | Test token and settlement contracts | Not started |
| M5 | Hybrid authorisation and wallet flow | Not started |
| M6 | Integrated UI | Not started |
| M7 | Hardening and evidence pack | Not started |

The full requirement-to-test-to-evidence mapping is in `docs/ACCEPTANCE_MATRIX.md`. Nothing is marked DONE without a passing test and recorded evidence.

## QoreChain integration (verified so far)

- QoreX announces itself over EIP-6963 as `network.qore.qorex`. Its `native` interface exposes `signArbitrary`, and a live call returned an `ml-dsa-87-hybrid` signature with a classical part and a post-quantum part.
- The account's ML-DSA key is registered on-chain after a first QoreX transaction (`/qorechain/pqc/v1/account/{address}`, `possession_proven: true`).
- A real `signArbitrary` response for `qorechain-diana` verifies with `@qorechain/qoresign` 0.2.0 against that on-chain ML-DSA-87 key, with the post-quantum part required. Changing the message, the chain ID, the signer or the PQ part is refused. `packages/chain-client/src/verify-hybrid-message.ts`.
- The account has no ML-KEM key registered. A web app cannot register one through QoreX (ADR-0004).
- The official TypeScript package is on npm as `@qorechain/qoreseal` 0.1.0 and is pinned exactly; its published vector file reproduces in this repository (`docs/research/source-lock.md` claims 22 and 23).
- The offline slice seals in explicit mlkem mode, binds each envelope to a length-prefixed context (ADR-0007), and signs a domain-tagged hash of the envelope and context with a hybrid signature. Its tests use throwaway keys and mocked account and registry clients, and are labelled as such.

Sources, commits read, and what was confirmed at runtime versus read in source are in `docs/research/source-lock.md`.

## Architecture

See `docs/ARCHITECTURE.md` (component diagram, trust boundaries, the two signing lanes) and `docs/THREAT_MODEL.md`.

## Known limitations

1. **No product code yet.** Phase 2 added the offline adapter and its tests. No contract, app or API exists.
2. **KEM key registration is blocked.** QoreX refuses `MsgRegisterKEMKey` from web apps, so the registered-recipient-key flow has no confirmed path and the adapter exposes mlkem mode only. ADR-0004.
3. **QoreSeal envelopes are not signed.** This project adds a signed envelope, but its signer is a TEST-ONLY QoreSign key in this phase; the real QoreX `signArbitrary` signer is deferred to the browser step. ADR-0003.
4. **QoreSeal is 0.1.0 and pending external review** (its own documentation). The npm release is pinned exactly and its vectors pass; it has not been audited here.
5. **No confirmed stablecoin on Diana.** The plan is a self-deployed, labelled test ERC-20. The three `erc20:` balances on the test account are contracts reporting `Fest ETH` (`fETH`, 18 decimals), `Fest BTC` (`fBTC`, 8) and `Fest USD` (`fUSD`, 6); their deployer, issuer and backing are unknown, so none is treated as a stablecoin.
6. **Hackathon rules, deadline and licence requirement are unverified.** ADR-0001 is provisional.
7. **QoreX handles one signing request at a time.** The UI must queue requests.
8. **The QoreX dApp refusal list was read from the wallet-adapter source, not tested against QoreX.**
9. **Only message signatures are verified.** `verifyHybridMessage` covers `signArbitrary` messages, not transactions. Envelope authentication is built offline, but every envelope test signs with a throwaway QoreSign key and a MOCK account client; the recorded real QoreX fixture's message text is the string reported as signed, not an independently captured one.
10. **CI has not run on GitHub.** The workflow exists and its commands pass locally; no remote is configured and no run link exists.
11. **The offline tests prove behaviour, not chain registration.** They use generated throwaway keys, a mocked account client and a mocked KEM registry. No test in this phase registered a key, opened an EVM window or contacted the KEM endpoint.
12. **AAD and signed-message formats are project assumptions.** The length-prefixed encoding (ADR-0007) and the SHA-256 domain-tagged message (ADR-0003) are not QoreChain standards.

## Repository structure

```
docs/
  ARCHITECTURE.md        components, trust boundaries, signing lanes
  THREAT_MODEL.md        threats and required mitigations
  ACCEPTANCE_MATRIX.md   requirement -> implementation -> test -> evidence -> status
  adr/                   decision records
  research/source-lock.md  every external claim, its source, and how it was confirmed
  evidence/              dated, unedited results of each phase
packages/
  chain-client/          QoreChain reads and hybrid message verification
  qoreseal-adapter/      offline QoreSeal wrapper, canonical AAD and signed envelopes
fixtures/                raw chain responses and the QoreX hybrid signature fixture
scripts/verify-env.mjs   toolchain version check
.github/workflows/ci.yml install, checks and secret scan
CHANGELOG.md             changes by phase
CLAUDE.md                operating contract for AI coding agents
LICENSE                  Apache-2.0 (provisional, ADR-0001)
```

## AI assistant disclosure

This repository is built with AI assistance under the phase-gated contract in `CLAUDE.md`. External technical claims are recorded in `docs/research/source-lock.md` with their source and whether they were confirmed against a running system rather than recalled.

## Licence

Apache-2.0. See `LICENSE`.
