# LOANSHARK

Private financing on QoreChain: encrypted requests, separately encrypted lender offers, a verifiable agreement commitment, and real test-token settlement.

> Status: Phase 4 (browser diagnostics app and QoreX read/sign-message layer, local only). This repository contains the architecture, threat model, decision records and source lock from Phase 0, a hybrid signature verifier in `packages/chain-client`, an offline QoreSeal adapter in `packages/qoreseal-adapter`, an agreement package in `packages/agreement`, a local Hardhat settlement package in `packages/contracts`, and a client-only diagnostics app in `apps/web`. The on-chain ML-KEM registration path is BLOCKED, so the adapter uses explicit mlkem mode only. No contract has been deployed, no transaction is sent from the app, and there is no product app or API. Every claim below is either backed by a link into `docs/` or marked as not yet built.

Built for the QoreChain hackathon, Encrypted Apps category. Target network: QoreChain Diana Testnet (`qorechain-diana`). Testnet only; not a regulated lending service.

Submission deadline: 2 December 2026, 23:59 UTC. Internal freeze for this repository: 1 December 2026. The requirement-by-requirement checklist is `docs/SUBMISSION.md`; the rules are recorded in `docs/research/source-lock.md` claims 45 to 56.

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
| M3 | Agreement commitment | Local: terms, `keccak256(abi.encode(terms))` commitment, canonical agreement text and signed confirmation. 15 tests. Evidence in `docs/evidence/phase-03-result.md` |
| M4 | Test token and settlement contracts | Local: `TestUSD` and `LoanSettlement` on the in-process Hardhat network, with 33 tests including adversarial mock tokens, a seeded 200-run invariant test and the Phase 3b review cases. Not deployed. Evidence in `docs/evidence/phase-03-result.md` and `docs/evidence/phase-03b-result.md` |
| M5 | Hybrid authorisation and wallet flow | Partial, local only: `apps/web` detects QoreX, guards both chain IDs and signs one fixed message on explicit button press, verifying it locally with the post-quantum part required. No EVM window, no transaction and no EVM authorisation flow. Owner-run browser evidence is pending. Evidence in `docs/evidence/phase-04-result.md` and the blank checklist in `docs/evidence/phase-04-owner-checklist.md` |
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
- `apps/web` has the browser code path for QoreX detection, the two chain guards and a fixed-message `signArbitrary` call whose result is verified locally with the post-quantum part required. Its tests pass with mock providers and the saved real signature fixture; no owner-run browser result is claimed yet.

Sources, commits read, and what was confirmed at runtime versus read in source are in `docs/research/source-lock.md`.

## Architecture

See `docs/ARCHITECTURE.md` (component diagram, trust boundaries, the two signing lanes) and `docs/THREAT_MODEL.md`.

## Known limitations

1. **No product app or API yet.** Phase 4 added a diagnostics page in `apps/web`, not a product UI. No contract is deployed, there is no API, and the page cannot create, fund or settle a loan.
2. **KEM key registration is blocked.** QoreX refuses `MsgRegisterKEMKey` from web apps, so the registered-recipient-key flow has no confirmed path and the adapter exposes mlkem mode only. ADR-0004.
3. **QoreSeal envelopes are not signed by QoreX.** This project adds a signed envelope, but its tests sign with a TEST-ONLY QoreSign key. The diagnostics app now has a QoreX `signArbitrary` signer, but it is used only for the fixed test message and is not wired to envelope signing. ADR-0003.
4. **QoreSeal is 0.1.0 and pending external review** (its own documentation). The npm release is pinned exactly and its vectors pass; it has not been audited here.
5. **No confirmed stablecoin on Diana.** The plan is a self-deployed, labelled test ERC-20. The three `erc20:` balances on the test account are contracts reporting `Fest ETH` (`fETH`, 18 decimals), `Fest BTC` (`fBTC`, 8) and `Fest USD` (`fUSD`, 6); their deployer, issuer and backing are unknown, so none is treated as a stablecoin.
6. **The rules are recorded from the organiser's pages, not from a contract with the organiser.** The rules, start and prizes pages were fetched on 2026-11-17 and are summarised in `docs/research/source-lock.md` claims 45 to 56. The pages themselves say the rules, prizes and dates may change until the end of the event, and the rules page and the start page disagree on whether the cover image is required.
7. **QoreX handles one signing request at a time.** The diagnostics signer queues requests defensively and its MOCK-provider test covers the queue. The wallet's own one-at-a-time behaviour is an owner report (source-lock claim 44), not reproduced here.
8. **The QoreX dApp refusal list was read from the wallet-adapter source, not tested against QoreX.**
9. **Only message signatures are verified.** `verifyHybridMessage` covers `signArbitrary` messages, not transactions. Envelope authentication is built offline, but every envelope test signs with a throwaway QoreSign key and a MOCK account client; the recorded real QoreX fixture's message text is the string reported as signed, not an independently captured one.
10. **CI has not run on GitHub.** The workflow exists and its commands pass locally; no remote is configured and no run link exists.
11. **The offline tests prove behaviour, not chain registration.** They use generated throwaway keys, a mocked account client and a mocked KEM registry. No test in this phase registered a key, opened an EVM window or contacted the KEM endpoint.
12. **AAD and signed-message formats are project assumptions.** The length-prefixed encoding (ADR-0007), the SHA-256 domain-tagged message (ADR-0003) and the agreement text/confirmation formats (ADR-0010) are not QoreChain standards.
13. **The contracts are local only and unaudited.** They run on the in-process Hardhat network and have never been deployed to Diana or any other chain. No gas, security or economic review has been done beyond the tests listed in `docs/evidence/phase-03-result.md`.
14. **The qor1-to-0x identity link is unconfirmed.** The derived address is `0xd0a1453c7b8157aa0635076c33b3e24a50a923c5`, but the owner has not compared it with the address QoreX reports on its EVM provider. ADR-0009 records the check and the fallback.
15. **The only production-intended token is the project's own test token.** `TestUSD` is labelled testnet demo money and has no value. The Fest tokens on the account are not used. Contract tests additionally deploy clearly named `Mock...` tokens; those are test only.
16. **The contract does not verify the signed agreement.** A lender must compare the stored terms with the signed document, and the UI must recompute the commitment and compare it with `loanId` and `termsOf()` before enabling `fund`. The contract only commits to the terms it is given; it cannot verify a signature or read a document. C11 is PENDING because the fund UI does not exist.
17. **The claim window is a project minimum, not a chain rule.** As of Phase 3b, `claimDeadline` must be at least 3600 seconds after `fundingDeadline` (owner-confirmed, ADR-0008 decision 9). Before that change a zero-length window was allowed.
18. **`block.timestamp` semantics on Diana are not yet confirmed.** Phase 3b samples the latest block time against the local clock, but deadlines remain approximate and depend on Diana block production. ADR-0011.
19. **Tokens sent directly to the contract are stuck.** They are outside every loan's accounting, no function can withdraw them, and there is no admin sweep. This is deliberate but means a mistaken transfer is unrecoverable.
20. **Blocklisting and fee-changing tokens are out of scope.** The immutable allowlist is intended to hold only this project's `TestUSD`, which has no blocklist or transfer fee. The adversarial mock tokens exist only in tests.
21. **No owner-run browser result exists yet.** The diagnostics page builds, its unit and static tests pass, and the saved real QoreX signature verifies locally in the test suite. Detection, chain reading, account comparison, CORS behaviour and a fresh signing prompt have not been observed in a browser by the owner; every field in `docs/evidence/phase-04-owner-checklist.md` is blank and OWNER-SUPPLIED.
22. **The native chain ID is inferred, not read.** QoreX exposes no native chain-id getter in the adapter source or the runtime record. The guard treats a resolved `enable('qorechain-diana')` as the native-chain signal; that is an ASSUMPTION (ADR-0012 decision 5). The argument lists for `getKey`, `signArbitrary` and `listAccounts` are also ASSUMPTIONs: the source and probe do not record them, and only the returned shape is recorded.
23. **The REST host's CORS policy is unknown.** A browser may refuse the read-only `api-testnet.qore.host` request. The page reports the exact error and whether it looks like a CORS refusal; it adds no proxy, so verification cannot succeed in that case.
24. **The diagnostics app is not product code and stores nothing.** It signs only `LOANSHARK test message, no funds`, has no EVM window or transaction path, no account-request prompt and no seal-key custody. The browser seal-key flow in ADR-0005 is still unimplemented.

## Repository structure

```
docs/
  ARCHITECTURE.md        components, trust boundaries, signing lanes
  THREAT_MODEL.md        threats and required mitigations
  ACCEPTANCE_MATRIX.md   requirement -> implementation -> test -> evidence -> status
  adr/                   decision records
  research/source-lock.md  every external claim, its source, and how it was confirmed
  evidence/              dated, unedited results of each phase
apps/
  web/                   client-only diagnostics page (Vite, React, strict TypeScript)
packages/
  chain-client/          QoreChain reads and hybrid message verification
  qoreseal-adapter/      offline QoreSeal wrapper, canonical AAD and signed envelopes
  agreement/             terms, commitment, canonical text and confirmation message
  contracts/             TestUSD and LoanSettlement (local Hardhat only)
fixtures/                raw chain responses and the QoreX hybrid signature fixture
scripts/verify-env.mjs   toolchain version check
.github/workflows/ci.yml install, checks and secret scan
CHANGELOG.md             changes by phase
CLAUDE.md                operating contract for AI coding agents
LICENSE                  Apache-2.0 (ADR-0001, accepted 2026-11-17)
```

## AI assistant disclosure

This repository is built with AI assistance under the phase-gated contract in `CLAUDE.md`. External technical claims are recorded in `docs/research/source-lock.md` with their source and whether they were confirmed against a running system rather than recalled.

## Licence

Apache-2.0. See `LICENSE`.
