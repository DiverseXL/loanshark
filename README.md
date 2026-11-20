# LOANSHARK

Private financing on QoreChain: encrypted requests, separately encrypted lender offers, a verifiable agreement commitment, and real test-token settlement.

> Status: Phase 4 (browser diagnostics app and QoreX read/sign-message layer, local only), plus Step 6a submission preparation, Step 6b deployment readiness for Diana, Step 7 local hardening and evidence packing, and Step 8 seal-account onboarding. This repository contains the architecture, threat model, decision records and source lock from Phase 0, a hybrid signature verifier in `packages/chain-client`, an offline QoreSeal adapter in `packages/qoreseal-adapter`, a browser-safe seal-account package in `packages/seal-account`, an agreement package in `packages/agreement`, a local Hardhat settlement package in `packages/contracts`, and a client-only diagnostics app in `apps/web` with an owner-run testnet deployment panel and an in-memory seal-account panel. The on-chain ML-KEM registration path is no longer blocked in source: a separate app-held account E can register its own keys through an owner-run script, but no registration has been executed by this repository. The adapter still uses explicit mlkem mode only. No contract has been deployed by this repository or the assistant, and there is no product app or API. Every claim below is either backed by a link into `docs/` or marked as not yet built.

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
| M0 | Protocol reconnaissance, ADRs, source lock | In progress. Evidence in `docs/evidence/phase-00-result.md` and `docs/evidence/phase-01-result.md`. M0-3, M0-5 and M0-7 are DONE; M0-4 is in progress (explorer and faucet recorded from the organiser's start page, not loaded); M0-6 is UNBLOCKED (a source-backed owner-run path exists, not yet exercised live) |
| M1 | Cryptographic vertical slice | Offline slice built and tested: `packages/qoreseal-adapter` (seal/open in explicit mlkem mode, canonical AAD, signed envelopes), with the official QoreSeal 0.1.0 vectors passing. Step 8 adds `packages/seal-account`: a mnemonic-derived app-held account E with ML-DSA-87, ML-KEM-1024, a signed recipient card and a W/E binding statement, all tested offline. On-chain registration is implemented in an owner-run script and dry-run only; the adapter still exposes mlkem mode only (ADR-0004, ADR-0014). Evidence in `docs/evidence/phase-02-result.md` and `docs/evidence/phase-08-result.md` |
| M2 | Private request and offer workflow | Not started |
| M3 | Agreement commitment | Local: terms, `keccak256(abi.encode(terms))` commitment, canonical agreement text and signed confirmation. `packages/agreement/test/*` (15 tests). Evidence in `docs/evidence/phase-03-result.md` |
| M4 | Test token and settlement contracts | Deployment-ready, not deployed. `TestUSD` and `LoanSettlement` run on the in-process Hardhat network, `packages/contracts/test` (38 tests), including the ADR-0013 Option A two-token constructor and a full lifecycle in `TestUSD` and in a MOCK fUSD-profile token. A reproducible manifest (`docs/deployments/manifest.json`) pins the bytecode hashes, and `apps/web` has an owner-run, click-only deploy panel. No deployment exists; C12 is PENDING. Evidence in `docs/evidence/phase-03-result.md`, `docs/evidence/phase-03b-result.md` and `docs/evidence/phase-06-result.md` |
| M5 | Hybrid authorisation and wallet flow | Partial, local only: `apps/web` detects QoreX, guards both chain IDs and signs one fixed message on explicit button press, verifying it locally with the post-quantum part required. No EVM window, no transaction and no EVM authorisation flow. Owner-run browser evidence is pending. Evidence in `docs/evidence/phase-04-result.md` and the blank checklist in `docs/evidence/phase-04-owner-checklist.md` |
| M6 | Integrated UI | Not started |
| M7 | Hardening and evidence pack | Local: dependency licence allowlist enforced in CI, full-history secret scan with a one-file reviewable allowlist, dependency audit recorded with one accepted advisory, evidence index and docs consistency pass. CI has not run on GitHub; owner-run browser and deployment evidence remain blank. Evidence in `docs/EVIDENCE.md`, `docs/evidence/phase-07-licences.md` and `docs/evidence/phase-07-security.md` |

The full requirement-to-test-to-evidence mapping is in `docs/ACCEPTANCE_MATRIX.md`. Nothing is marked DONE without a passing test and recorded evidence. The organiser's submission requirements, and the owner action each one needs, are tracked separately in `docs/SUBMISSION.md`; every item there is PENDING until the repository is public and the project is entered.

## QoreChain integration (verified so far)

- QoreX announces itself over EIP-6963 as `network.qore.qorex`. Its `native` interface exposes `signArbitrary`, and a live call returned an `ml-dsa-87-hybrid` signature with a classical part and a post-quantum part.
- The account's ML-DSA key is registered on-chain after a first QoreX transaction (`/qorechain/pqc/v1/account/{address}`, `possession_proven: true`).
- A real `signArbitrary` response for `qorechain-diana` verifies with `@qorechain/qoresign` 0.2.0 against that on-chain ML-DSA-87 key, with the post-quantum part required. Changing the message, the chain ID, the signer or the PQ part is refused. `packages/chain-client/src/verify-hybrid-message.ts`.
- The account has no ML-KEM key registered. QoreX refuses key-management messages from web apps, so a web app cannot register one through QoreX (ADR-0004).
- Step 8 answers that with a separate app-held account E: `packages/seal-account` derives E from its own 24-word phrase, signs the recipient card and signs the W/E binding statement, and `scripts/onboard-seal-account.mjs` is the owner-run registration path. A dry run against Diana derived an existing test account and read its account, balance, ML-DSA-87 and ML-KEM state; nothing was signed or sent. No fresh E was created and `--execute` has not been run.
- The official TypeScript package is on npm as `@qorechain/qoreseal` 0.1.0 and is pinned exactly; its published vector file reproduces in this repository (`docs/research/source-lock.md` claims 22 and 23).
- The offline slice seals in explicit mlkem mode, binds each envelope to a length-prefixed context (ADR-0007), and signs a domain-tagged hash of the envelope and context with a hybrid signature. Its tests use throwaway keys and mocked account and registry clients, and are labelled as such.
- `apps/web` has the browser code path for QoreX detection, the two chain guards and a fixed-message `signArbitrary` call whose result is verified locally with the post-quantum part required. Its tests pass with mock providers and the saved real signature fixture; no owner-run browser result is claimed yet.
- Panel 6 in `apps/web` generates a seal account in memory, shows the phrase once, clears it on confirmation, signs the recipient card and can forget the identity. It makes no network, storage, log or transaction call. The production page was built and checked statically, not opened in a browser.
- The W/E binding statement is a fixed seven-line text signed by W with QoreX `signArbitrary` and countersigned by E with QoreSign `signMessage`. Verification requires both post-quantum parts, the on-chain keys and W's derived EVM address. It is tested offline and has no owner-run signing tool in Step 8.
- The testnet deployment panel is owner-run: every send is inside a click handler for a button labelled with exactly what it does, after both chain lanes pass, with `eth_estimateGas` shown first. It polls receipts and never shows an unconfirmed transaction as final. No transaction has been sent by this project.
- `scripts/build-manifest.mjs` produced `docs/deployments/manifest.json` from the pinned compiler; two builds gave the same file hash. `scripts/verify-deployment.mjs` is the read-only post-deployment check; it has not run against a deployment.

Sources, commits read, and what was confirmed at runtime versus read in source are in `docs/research/source-lock.md`.

## Architecture

See `docs/ARCHITECTURE.md` (component diagram, trust boundaries, the two signing lanes) and `docs/THREAT_MODEL.md`.

## Known limitations

1. **No product app or API yet.** Phase 4 added a diagnostics page in `apps/web`, not a product UI. No contract is deployed, there is no API, and the page cannot create, fund or settle a loan.
2. **KEM key registration is unblocked in source, not proven live.** QoreX refuses `MsgRegisterKEMKey` from web apps, so the registered-recipient-key flow uses a separate app-held account E. `scripts/onboard-seal-account.mjs` implements registration for E and was dry-run only; `--execute` has not been run against Diana, so the adapter still exposes mlkem mode only. ADR-0004, ADR-0014, C13.
3. **QoreSeal envelopes are not signed by QoreX.** This project adds a signed envelope, but its tests sign with a TEST-ONLY QoreSign key. The diagnostics app now has a QoreX `signArbitrary` signer, but it is used only for the fixed test message and is not wired to envelope signing. ADR-0003.
4. **QoreSeal is 0.1.0 and pending external review** (its own documentation). The npm release is pinned exactly and its vectors pass; it has not been audited here.
5. **No confirmed stablecoin on Diana.** The plan is a self-deployed, labelled test ERC-20. The three `erc20:` balances on the test account are contracts reporting `Fest ETH` (`fETH`, 18 decimals), `Fest BTC` (`fBTC`, 8) and `Fest USD` (`fUSD`, 6); their deployer, issuer and backing are unknown, so none is treated as a stablecoin.
6. **The rules are recorded from the organiser's pages, not from a contract with the organiser.** The rules, start and prizes pages were fetched on 2026-11-17 and are summarised in `docs/research/source-lock.md` claims 45 to 56. The pages themselves say the rules, prizes and dates may change until the end of the event, and the rules page and the start page disagree on whether the cover image is required.
7. **QoreX handles one signing request at a time.** The diagnostics signer queues requests defensively and its MOCK-provider test covers the queue. The wallet's own one-at-a-time behaviour is an owner report (source-lock claim 44), not reproduced here.
8. **The QoreX dApp refusal list was read from the wallet-adapter source, not tested against QoreX.**
9. **Only message signatures are verified.** `verifyHybridMessage` covers `signArbitrary` messages, not transactions. Envelope authentication is built offline, but every envelope test signs with a throwaway QoreSign key and a MOCK account client; the recorded real QoreX fixture's message text is the string reported as signed, not an independently captured one.
10. **CI has not run on GitHub.** The workflow exists and its commands pass locally, including the licence check and the configured gitleaks scan; no remote is configured and no run link exists.
11. **The offline tests prove behaviour, not chain registration.** They use generated throwaway keys, a mocked account client and a mocked KEM registry. No test in this phase registered a key, opened an EVM window or contacted the KEM endpoint.
12. **AAD and signed-message formats are project assumptions.** The length-prefixed encoding (ADR-0007), the SHA-256 domain-tagged message (ADR-0003) and the agreement text/confirmation formats (ADR-0010) are not QoreChain standards.
13. **The contracts are not deployed and are unaudited.** They run on the in-process Hardhat network and have never been deployed to Diana or any other chain by this project. A reproducible manifest and a read-only verifier exist, but no deployment result is claimed. No gas, security or economic audit has been done beyond the tests in `docs/evidence/phase-03-result.md` and `docs/evidence/phase-06-result.md`; the local hardening review in `docs/evidence/phase-07-security.md` is not an audit.
14. **The qor1-to-0x identity link is unconfirmed.** The derived address is `0xd0a1453c7b8157aa0635076c33b3e24a50a923c5`, but the owner has not compared it with the address QoreX reports on its EVM provider. ADR-0009 records the check and the fallback.
15. **The allowlist is TestUSD and fUSD (ADR-0013 Option A).** `TestUSD` is labelled testnet demo money and has no value. The fest fUSD at `0x97143B771D34ddb9130b807b135Ae675A5a963CA` is also allowed so a juror can use faucet tokens. Its issuer, backing and controls are unknown, and this project has not exercised a real fUSD transfer. Contract tests use a clearly named `MockFusdProfile` for the second token; that is a mock, not the real contract.
16. **The contract does not verify the signed agreement.** A lender must compare the stored terms with the signed document, and the UI must recompute the commitment and compare it with `loanId` and `termsOf()` before enabling `fund`. The contract only commits to the terms it is given; it cannot verify a signature or read a document. C11 is PENDING because the fund UI does not exist.
17. **The claim window is a project minimum, not a chain rule.** As of Phase 3b, `claimDeadline` must be at least 3600 seconds after `fundingDeadline` (owner-confirmed, ADR-0008 decision 9). Before that change a zero-length window was allowed.
18. **`block.timestamp` semantics on Diana are not yet confirmed.** Phase 3b samples the latest block time against the local clock, but deadlines remain approximate and depend on Diana block production. ADR-0011.
19. **Tokens sent directly to the contract are stuck.** They are outside every loan's accounting, no function can withdraw them, and there is no admin sweep. This is deliberate but means a mistaken transfer is unrecoverable.
20. **Blocklisting and fee-changing tokens are out of scope.** The immutable allowlist holds this project's `TestUSD` and the fest fUSD. `TestUSD` has no blocklist or transfer fee; fUSD's behaviour is not verified. The adversarial mock tokens exist only in tests.
21. **No owner-run browser result exists yet.** The diagnostics page builds, its unit and static tests pass, and the saved real QoreX signature verifies locally in the test suite. Detection, chain reading, account comparison, CORS behaviour, a fresh signing prompt and the deployment panel have not been observed in a browser by the owner; every field in `docs/evidence/phase-04-owner-checklist.md` and `docs/evidence/phase-06-owner-checklist.md` is blank and OWNER-SUPPLIED.
22. **The native chain ID is inferred, not read.** QoreX exposes no native chain-id getter in the adapter source or the runtime record. The guard treats a resolved `enable('qorechain-diana')` as the native-chain signal; that is an ASSUMPTION (ADR-0012 decision 5). The argument lists for `getKey`, `signArbitrary` and `listAccounts` are also ASSUMPTIONs: the source and probe do not record them, and only the returned shape is recorded.
23. **The REST host's CORS policy is unknown.** A browser may refuse the read-only `api-testnet.qore.host` request. The page reports the exact error and whether it looks like a CORS refusal; it adds no proxy, so verification cannot succeed in that case.
24. **The diagnostics app is not product code and stores nothing.** It signs only `LOANSHARK test message, no funds`, has no EVM window or transaction path, no account-request prompt and no seal-key persistence. Panel 6 can generate, show once, sign a card and forget an in-memory seal identity; reloading loses it, and importing an existing phrase into the page is deferred (ADR-0005).
25. **The Encrypted Apps requirement for registered recipient keys is unblocked in source (M0-6).** The category requires registered recipient keys, ML-KEM-1024 encryption, ML-DSA key binding and client-side encryption and decryption. QoreX still refuses `MsgRegisterKEMKey` from web apps, so this project adds an app-held account E and an owner-run registration script. No key has been registered by this repository; `packages/qoreseal-adapter` still runs in explicit mlkem mode, recipient-card verification is tested only against a MOCKED registry, and no live registry flow exists. ADR-0004, ADR-0014, `docs/SUBMISSION.md` row S12 and C13.
26. **The repository has not been published.** There is no remote, CI has not run on GitHub, and the commit author email and the AI tool footer in the history are visible only once it is pushed.
27. **No deployment exists.** The owner has not run the deployment checklist. C12 is PENDING, `docs/evidence/phase-06-verify.md` is a placeholder, and every deployment field in `docs/evidence/phase-06-owner-deploy.md` is OWNER-SUPPLIED and blank.
28. **The deploy panel cannot switch the wallet's network and requires QoreX.** It sends only from the connected EVM account, and a wallet rejection is shown verbatim, including any authorization-window message. If the lane check is rejected, the checklist says stop rather than retry.
29. **A bytecode hash proves code equality, not correct behaviour.** The verifier compares `eth_getCode` with the manifest. If only the CBOR metadata trailer differs it reports that explicitly; it does not prove the contract is safe, that storage is initialised as intended, or that the owner controls the deployer account.
30. **fUSD is a third-party token.** Its issuer, deployer, mint control, backing and pause or blocklist powers are unknown. Allowing it trades a reproducibility gain for a dependency this project does not control; ADR-0013 records the owner's decision and the residual risk.
31. **One high-severity dependency advisory is accepted, not fixed.** `pnpm audit --prod` reports GHSA-mrhx-c7xc-m3w5 for `zod` 3.25.76, which is installed as an optional peer of `abitype` under `viem` and under Hardhat. The vulnerable export is not imported by this repository or by the installed `viem`, and the built `apps/web` bundle contains no zod code. A global override would conflict with Hardhat's `^3.23.8` requirement. The review and revisit condition are in `docs/evidence/phase-07-security.md`.
32. **The secret scan allowlists one public fixture.** `.gitleaks.toml` keeps the default rules and allowlists only `fixtures/qoreseal-vectors-v1.json`, whose published field names match the generic-api-key heuristic. A gitleaks 8.30.1 full-history run passes locally, but CI has not run on GitHub.
33. **The licence check is not legal advice.** `pnpm licence-check` reads declared licence labels from the current lockfile. MPL-2.0 (lightningcss) and CC-BY-4.0 (caniuse-lite) are build-time packages with conditions recorded in `README.md` and `docs/evidence/phase-07-licences.md`; it does not prove that a package's declared licence is complete or correct.
34. **The seal-account registration transaction is untested live.** `--execute` has never run. Its simulate, sign and broadcast path is assembled from the pinned official examples, and the KEM registry error mapping is a source reading, not a live observation. No seal-account transaction hash exists. C13 is PENDING.
35. **The binding statement has no owner-run producer or verifier.** The text builder, countersignature and verifier are library code with offline tests only. No real QoreX `signArbitrary` output has been combined with a real seal-account signature, so C14 is PENDING. Whether envelopes should carry W or E addresses remains a Step 9 item; the frozen AAD and agreement encodings were not changed.
36. **Two QoreSign versions are installed.** The workspace uses `@qorechain/qoresign` 0.2.0 directly, while `@qorechain/qoreseal` 0.1.0 installs its own nested 0.1.0, so card signing runs on 0.1.0 and the direct message signing and verification on 0.2.0. The shapes are compatible in the tested paths; that is not a proof of equivalence (source-lock claim 59).
37. **A phrase in a page or terminal cannot be proven erased.** The panel clears its state and warns the owner, and the script never writes the phrase to its report, but JavaScript memory, terminal scrollback, XSS, an extension or a malicious dependency can retain it while it is exposed. Phrase exposure burns the account; the owner checklist forbids sending any phrase to the assistant. `scripts/gen-test-mnemonic.mjs` prints a random throwaway phrase for test vectors and must never be used for an owner account.
38. **The browser seal panel was not driven in a real browser.** Its state transitions, `crypto.getRandomValues` behaviour and the production CSP were checked by build and static tests, not by a browser run. The 600 KiB JavaScript budget is a project ASSUMPTION, not a browser or QoreChain limit.
39. **The web bundle grew to fit post-quantum code.** ML-DSA-87, ML-KEM-1024 and hybrid signing are bundled for panel 6, taking the production JavaScript to about 480 KB (151.59 kB gzip) against the project budget. It is under budget but not optimised or lazily loaded; the page now loads cryptography a user may never use.
40. **Every Step 8 live result is owner-supplied and blank.** The dry run used the public all-zero test phrase from the tests, not an owner account. `possession_proven` and `created_at_height` were recorded as observations and not interpreted. `docs/evidence/phase-08-owner-checklist.md` has no result filled in.

## Repository structure

```
docs/
  ARCHITECTURE.md        components, trust boundaries, signing lanes
  THREAT_MODEL.md        threats and required mitigations
  EVIDENCE.md            index of every evidence file and what it does not prove
  ACCEPTANCE_MATRIX.md   requirement -> implementation -> test -> evidence -> status
  SUBMISSION.md          organiser requirements -> artefact -> owner action -> status
  DEMO_SCRIPT.md         storyboard for the submission video, with blocked shots marked
  adr/                   decision records
  deployments/           reproducible deployment manifest (ABI, bytecode hashes, constructor)
  research/source-lock.md  every external claim, its source, and how it was confirmed
  evidence/              dated, unedited results of each phase
apps/
  web/                   client-only diagnostics page and owner-run deploy panel (Vite, React)
packages/
  chain-client/          QoreChain reads and hybrid message verification
  qoreseal-adapter/      offline QoreSeal wrapper, canonical AAD and signed envelopes
  seal-account/          browser-safe seal account E: identity, card, hybrid signing, W/E binding
  agreement/             terms, commitment, canonical text and confirmation message
  contracts/             TestUSD and LoanSettlement (local Hardhat only)
fixtures/                raw chain responses and the QoreX hybrid signature fixture
scripts/verify-env.mjs   toolchain version check
scripts/check-licences.mjs  dependency licence allowlist check
scripts/token-selector-scan.mjs  offline selector scan of the saved token bytecode
scripts/build-manifest.mjs  reproducible deployment manifest from Hardhat artifacts
scripts/verify-deployment.mjs  read-only post-deployment bytecode and state check
scripts/onboard-seal-account.mjs  owner-run seal-account dry run and key registration
scripts/gen-test-mnemonic.mjs  throwaway TEST ONLY phrase generator, never for an owner account
scripts/check-web-bundle.mjs  production bundle size and CSP budget check
.gitleaks.toml           secret-scan allowlist for the public QoreSeal vectors
.github/workflows/ci.yml install, checks and secret scan
AI_USAGE.md              AI workflow, generated areas and human contribution
CHANGELOG.md             changes by phase
CLAUDE.md                operating contract for AI coding agents
LICENSE                  Apache-2.0 (ADR-0001, accepted 2026-11-17)
```

## Credits

Built with the QoreChain open source kits and the libraries below. Versions are pinned exactly in the workspace `package.json` files and `pnpm-lock.yaml`. Licence values were read from each installed package's `package.json` on 2026-11-19.

| Component | Version | Licence | Used for |
|---|---|---|---|
| `@qorechain/qoreseal` | 0.1.0 | Apache-2.0 | Client-side ML-KEM-1024/X25519 envelope sealing and opening, recipient cards, official vector reproduction. The QoreChain kit this project is built on. |
| `@qorechain/qoresign` | 0.2.0 | Apache-2.0 | Hybrid (secp256k1 + ML-DSA-87) message signature verification, recipient-card signatures and offline test keys. The second QoreChain kit used. |
| `@scure/bip39` | 2.4.0 | MIT | BIP-39 phrase generation and mnemonic-to-seed derivation for the app-held seal account. |
| `@cosmjs/amino`, `@cosmjs/proto-signing` | 0.39.0 | Apache-2.0 | Owner-run script only: public-key encoding and auth-info construction for the registration transactions. Not shipped to the browser. |
| `cosmjs-types` | 0.11.0 | Apache-2.0 | Owner-run script only: protobuf `TxBody` and sign-mode types for the registration transactions. Not shipped to the browser. |
| `@noble/hashes` | 2.4.0 | MIT | SHA-256 for the envelope domain tag and SHA3-256 for key hashes. |
| `viem` | 2.57.11 | MIT | Chain reads, ABI encoding and the agreement commitment hash. |
| `@openzeppelin/contracts` | 5.6.1 | MIT | `ERC20`, `Ownable`, `SafeERC20` and `ReentrancyGuard` in `TestUSD` and `LoanSettlement`. |
| `react`, `react-dom` | 19.3.1 | MIT | The diagnostics page in `apps/web`. |
| `vite` | 7.3.8 | MIT | Build tool for `apps/web`. |
| `@vitejs/plugin-react` | 5.2.0 | MIT | React support in Vite. |
| `caniuse-lite` | 1.0.30001826 | CC-BY-4.0 | Browser data used by browserslist at build time. Data from caniuse.com, used under CC-BY-4.0. |
| `lightningcss` | 1.33.0 | MPL-2.0 | CSS minifier used by Vite at build time; used unmodified. |
| `typescript` | 5.9.3 | Apache-2.0 | All TypeScript packages and the app. |
| `vitest` | 5.1.0 | MIT | Unit and static tests. |
| `@biomejs/biome` | 2.6.8 | MIT OR Apache-2.0 | Formatting and linting. |
| `hardhat` | 3.22.0 | MIT | Local in-process EVM and Solidity tests. |
| `@nomicfoundation/hardhat-viem` | 3.1.0 | MIT | viem integration for the contract tests. |
| `@nomicfoundation/hardhat-node-test-runner` | 3.1.2 | MIT | `node:test` runner for the contract tests. |
| `@nomicfoundation/hardhat-network-helpers` | 3.0.12 | MIT | Time control in the contract tests. |
| `@types/node`, `@types/react`, `@types/react-dom` | 26.6.6, 19.3.0, 19.3.0 | MIT | Type declarations for development only. |

QoreChain kits: `@qorechain/qoreseal` and `@qorechain/qoresign` are the only QoreChain code used. No starter kit, template or `create-qorechain-dapp` output is used. `@qorechain/wallet-adapter` 0.6.0 was read as source for the wallet behaviour recorded in `docs/research/source-lock.md`; it is not a dependency.

Not distributed with the repository: `solc` 0.8.34 (GPL-3.0), downloaded by Hardhat on first compile; `pnpm` 12.21.0 (MIT), the package manager; and the GitHub Actions `actions/checkout`, `pnpm/action-setup` and `actions/setup-node`, pinned by commit SHA in `.github/workflows/ci.yml` (MIT).

## AI assistant disclosure

This repository is built with AI assistance under the phase-gated contract in `CLAUDE.md`. External technical claims are recorded in `docs/research/source-lock.md` with their source and whether they were confirmed against a running system rather than recalled.

## Licence

Apache-2.0. See `LICENSE`.
