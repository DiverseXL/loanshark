# LOANSHARK

Private financing on QoreChain: encrypted requests, separately encrypted lender offers, a verifiable agreement commitment, and real test-token settlement.

> Status: Phase 0 (protocol reconnaissance). This repository currently contains the architecture, threat model, decision records, source lock and evidence from the reconnaissance. No product code exists yet. Every claim below is either backed by a link into `docs/` or marked as not yet built.

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
| M0 | Protocol reconnaissance, ADRs, source lock | In progress. See `docs/evidence/phase-00-result.md` |
| M1 | Cryptographic vertical slice | Not started. On-chain KEM key registration is BLOCKED (ADR-0004) |
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
- The account has no ML-KEM key registered. A web app cannot register one through QoreX (ADR-0004).

Sources, commits read, and what was confirmed at runtime versus read in source are in `docs/research/source-lock.md`.

## Architecture

See `docs/ARCHITECTURE.md` (component diagram, trust boundaries, the two signing lanes) and `docs/THREAT_MODEL.md`.

## Known limitations

1. **Nothing is built yet.** This is a Phase 0 repository.
2. **KEM key registration is blocked.** QoreX refuses `MsgRegisterKEMKey` from web apps, so the registered-recipient-key flow has no confirmed path. ADR-0004.
3. **QoreSeal envelopes are not signed.** Sender authentication is added by this project and needs review. ADR-0003.
4. **QoreSeal is 0.1.0 and pending external review** (its own documentation).
5. **No confirmed stablecoin on Diana.** The plan is a self-deployed, labelled test ERC-20. The three `erc20:` balances on the test account are contracts reporting `Fest ETH` (`fETH`, 18 decimals), `Fest BTC` (`fBTC`, 8) and `Fest USD` (`fUSD`, 6); their deployer, issuer and backing are unknown, so none is treated as a stablecoin.
6. **Hackathon rules, deadline and licence requirement are unverified.** ADR-0001 is provisional.
7. **QoreX handles one signing request at a time.** The UI must queue requests.
8. **The QoreX dApp refusal list was read from the wallet-adapter source, not tested against QoreX.**

## Repository structure

```
docs/
  ARCHITECTURE.md        components, trust boundaries, signing lanes
  THREAT_MODEL.md        threats and required mitigations
  ACCEPTANCE_MATRIX.md   requirement -> implementation -> test -> evidence -> status
  adr/                   decision records
  research/source-lock.md  every external claim, its source, and how it was confirmed
  evidence/              dated, unedited results of each phase
CLAUDE.md                operating contract for AI coding agents
LICENSE                  Apache-2.0 (provisional, ADR-0001)
```

## AI assistant disclosure

This repository is built with AI assistance under the phase-gated contract in `CLAUDE.md`. External technical claims are recorded in `docs/research/source-lock.md` with their source and whether they were confirmed against a running system rather than recalled.

## Licence

Apache-2.0. See `LICENSE`.
