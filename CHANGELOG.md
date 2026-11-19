# Changelog

No release has been made. The project is built one phase at a time and each entry below is a phase, not a version.

## Unreleased

### Step 8: seal account and W/E binding

Added:

- `packages/seal-account`: a browser-safe, mnemonic-derived seal account E with ML-DSA-87, ML-KEM-1024 and X25519 keys, redacted public data, the official signed recipient card, hybrid message signing, seal-to-self and the ADR-0014 W/E binding statement. 52 tests, including five frozen test vectors and the frozen binding text.
- `scripts/onboard-seal-account.mjs`: owner-run onboarding for E. Defaults to a read-only dry run; `--execute` registers a missing ML-DSA-87 key with a `classicalOnly` signature and a missing ML-KEM key with a hybrid signature, then reads both back. Refuses any chain other than `qorechain-diana`, any REST endpoint other than `https://api-testnet.qore.host`, and needs an exact typed `REGISTER <address>` confirmation. 13 tests.
- Panel 6 in `apps/web`: generates an E identity in memory, shows the 24-word phrase once, clears it on confirmation, signs the recipient card and can forget the identity. No network, storage, log or transaction call.
- `scripts/check-web-bundle.mjs` and `pnpm --filter @loanshark/web check:bundle`: project size, remote-asset and CSP budgets.
- ADR-0014 (two-account identity), rewritten ADR-0004 and ADR-0005, threat rows T29 to T32, source-lock claims 57 to 65, and evidence files `phase-08-source-check.md`, `phase-08-onboarding-dry-run.md`, `phase-08-browser-panel.md`, `phase-08-owner-checklist.md` and `phase-08-result.md`.

Changed:

- ML-KEM registration is UNBLOCKED in source (M0-6): fund E, register ML-DSA-87 with QoreSign `register-and-send`, then register ML-KEM with QoreSeal. It is not proven live.
- E countersigns statements with QoreSign `signMessage`, not `signHybrid`: source-lock claim 63 records that `signHybrid` signs transaction bytes. The shape still verifies with `verifyHybridMessage`.
- Binding text is fixed at seven lines; every field is validated so no newline can shift the layout. The default lifetime is 30 days and the maximum is 90 (project choices).
- README milestone and limitation sections, the acceptance matrix (C13/C14 PENDING, status `UNBLOCKED`) and the evidence index.

Not done:

- No seal account was created and no key was registered by this repository. `--execute` was not run. The dry run used the public all-zero test phrase and sent nothing.
- No owner-run command produces or verifies a binding statement, so C14 is PENDING. Frozen AAD and agreement encodings are unchanged; W-versus-E envelope addresses remain a Step 9 item.
- The browser panel was built and checked statically, not driven in a browser.
- No phrase is persisted; reloading the page loses the identity. Test-only phrase generation is not suitable for an owner account.

### Step 6b: deployment readiness for Diana

Added:

- ADR-0013 is Accepted: Option A, allowlist `TestUSD` and the fest fUSD at `0x97143B771D34ddb9130b807b135Ae675A5a963CA`.
- `LoanSettlement` now takes two constructor addresses (`testUsd_`, `fusd_`) in that order, rejects zero or duplicate addresses, keeps the allowlist immutable, and has no admin or upgrade path.
- `MockFusdProfile`: a test-only 6-decimal mock with the recorded fUSD metadata profile, named `Mock Fest USD` (`mFUSD`) so it cannot be mistaken for the real token.
- Five local Hardhat tests: exact allowlist and order, zero/duplicate constructor rejection, a full lifecycle in `TestUSD`, a full lifecycle in the mock fUSD profile, and rejection of a token outside the allowlist. Hardhat total: 38 tests.
- `scripts/build-manifest.mjs` and `docs/deployments/manifest.json`: ABI, creation and runtime bytecode SHA-256, compiler settings, constructor shape and source commit. Two builds produced the same manifest SHA-256.
- `apps/web` deploy panel behind a visible testnet warning: chain guard first, `eth_estimateGas` shown, one click-triggered send per step, receipt polling with visible pending, confirmed, reverted and timeout states, exact raw errors and a copyable evidence JSON block. No key input and no storage.
- `scripts/verify-deployment.mjs`: read-only `eth_chainId`, `eth_getCode` and `eth_call` checks for bytecode hashes, `allowedTokens()`, `MINIMUM_CLAIM_WINDOW`, TestUSD metadata and owner balances. It reports a metadata-only mismatch explicitly and never sends a transaction.
- `docs/evidence/phase-06-owner-checklist.md`, a blank `phase-06-owner-deploy.md`, a placeholder `phase-06-verify.md`, and `phase-06-result.md` with measured counts and hashes.
- Threat-model rows T20 to T25 and acceptance-matrix C12 (PENDING).

Changed:

- `apps/web` tests: 50 total, including 12 MOCK-provider deploy tests. The hygiene test now allows `eth_sendTransaction` only in the deploy module and only from the click handler, and keeps raw transactions, broadcasts, key-management messages and signing methods forbidden elsewhere.
- README milestone M4, known limitations, repository structure and source-lock deployment references (explorer and faucet, docs only).
- ADR-0011 records the reproducible manifest and verifier.

Not done:

- No deployment. No transaction was sent or signed by the assistant. C12 stays PENDING until the owner supplies the checklist, the JSON block and the verifier report.

### Step 6a: rules recorded, repository prepared for publication, submission documents

Added:

- Source-lock claims 45 to 56, fetched from `https://build.qorechain.io/rules`, `/start` and `/prizes` on 2026-11-17, with the differences from the earlier owner summary recorded in the mismatches section.
- `docs/SUBMISSION.md`: every submission requirement mapped to its artefact, owner action or evidence, all PENDING, with the 2 December 2026 23:59 UTC deadline and the 1 December internal freeze.
- `docs/adr/0013-settlement-token.md`: Options A (TestUSD and fUSD) and B (TestUSD only), Proposed, no contract change.
- `scripts/token-selector-scan.mjs` and `docs/evidence/phase-05-token-scan.md`: fifteen selectors computed with viem 2.57.11 and searched in the saved runtime code of the three fest tokens. None was found. The limits of the heuristic are stated.
- `AI_USAGE.md` and `docs/DEMO_SCRIPT.md`, with the storyboard marked real, mocked or blocked.
- A README Credits section naming the two QoreChain kits and every external library with its licence.

Changed:

- ADR-0001 is Accepted, with the fetched licence rule as evidence. M0-5 is DONE; M0-4 and M0-7 are qualified; the README carries the deadline, the freeze and a limitation for the blocked registered-recipient-key requirement.
- `LICENSE` is the canonical Apache-2.0 text. The previous copy had replaced the appendix placeholder with a copyright line naming the QoreChain Association, which is not the copyright holder.
- Absolute repository paths in two evidence files were replaced with `<repo root>`, with a redaction note added. History was not rewritten.

Known publication findings, not fixed:

- All commits are authored by `DiverseXL <samuelakinjo59@gmail.com>`, and 30 carry a `Generated with Codebuff` footer with an emoji. Both become public on push; changing them needs a history rewrite, which the owner has not authorised.

### Phase 4: browser app foundation and QoreX read/sign-message layer

Added:

- `apps/web`: Vite 7.3.8, React 19.3.1 and strict TypeScript 5.9.3, client-side only and pinned exactly. No SSR, no analytics, no remote fonts and no third-party script. A CSP meta tag allows `script-src 'self'` and limits `connect-src` to `api-testnet.qore.host` and `evm-testnet.qore.host`.
- `apps/web/src/wallet`: EIP-6963 and `window.qorex.native` detection, a two-lane chain guard (`0x2648` and `qorechain-diana`), `connectNative` returning the bech32 address, and `QorexMessageSigner` implementing the existing `MessageSigner` with one promise queue, an explicit authorisation callback and no retry.
- `apps/web/src/wallet/signing.ts`: local verification with `verifyHybridMessage` (post-quantum part required, on-chain key) plus the four negative controls. Success is shown only when the positive check passes and all four controls are refused.
- Six diagnostics panels, each with a raw JSON toggle: detection, chain guard, accounts with the ADR-0009 comparison, a read-only account-record fetch that reports CORS, the fixed-message signing flow, and the README privacy claims table copied verbatim.
- 37 `apps/web` tests: 5 use the saved real QoreX signature and on-chain key (no network), 17 use MOCK providers, 3 use synthetic verifier results and 12 are static source, CSP or README scans. No test opens a socket.
- ADR-0012 (client-only, thin wrapper, exact pins, CSP, guard, queue, no storage), source-lock claims 36 to 44 refreshed and the adapter HEAD re-resolved, `docs/evidence/phase-04-result.md`, and a blank `docs/evidence/phase-04-owner-checklist.md`.

Changed:

- Root `pnpm test` builds `packages/chain-client` and `packages/qoreseal-adapter` before Vitest so `apps/web` resolves their declared entry points. Root typecheck and build now include `apps/web`; Biome includes `.tsx` so the React source is formatted and linted.
- Threat model T8 and T14, acceptance matrix C8 and C10 (test references added, both stay PENDING), README milestone M5 (partial) and limitations 21 to 24.

Known in this phase:

- No owner-run browser result exists. Detection, chain reading, accounts, CORS and a fresh signing prompt are unobserved; the owner checklist is blank.
- No deployment, no transaction, no EVM window and no `signAndBroadcast`. The only signing request is `LOANSHARK test message, no funds`.
- The native chain ID is inferred from `enable`, not read, and the REST host's CORS policy is unknown.

### Phase 3b: settlement review follow-up

Added:

- Minimum claim window: `claimDeadline` must be at least `fundingDeadline + 3600` seconds, with the public constant `MINIMUM_CLAIM_WINDOW` and custom error `ClaimWindowTooShort`. Owner confirmed N = 3600 in chat; ADR-0008 decision 9.
- Ten review tests in `packages/contracts/test/review.test.ts`: expire on Funded, re-proposal after cancel and expire, the 3599/3600 claim-window boundary, claim after refund, defaulted non-borrower repayment, the partial-repayment/default/two-withdrawal sequence, direct-token donations, and reentry through `withdraw` and `claim`.
- The reentrant mock token can now target `repay`, `withdraw` or `claim`; the existing repay test is unchanged.
- C11 (UI commitment check before fund) as PENDING, plus threat-model rows T15 to T19 and README limitations 16 to 20.
- Read-only Diana compatibility evidence: creation estimates for `osaka`, `cancun`, `shanghai` and `paris`, three block-time samples, and raw JSON in `docs/evidence/phase-03b-*`.

Changed:

- `proposeLoan` checks for an existing loan id before deadline validation, so re-proposing the same terms reports `LoanExists` after cancel or expire.
- Hardhat now sets `evmVersion: "osaka"` explicitly, the highest target whose creation simulations succeeded. ADR-0011 records the table and the assumption that a successful estimate is not a runtime-safety proof.
- Contract tests: 33 passing (was 23). Vitest remains 83 passing with 1 skipped.

### Phase 3: agreement commitment and local settlement contracts

Added:

- `packages/agreement`: the ten-field `Terms` type, `commitmentOf` using viem 2.57.11 `abi.encode` and keccak, a canonical versioned agreement text with its SHA-256, and the offline confirmation message signed and verified through the existing hybrid verifier. No QoreX signer is built.
- Five frozen agreement vectors in `fixtures/agreement-vectors.json`, produced once and recomputed by both the TypeScript and Solidity tests.
- `packages/contracts`: Hardhat 3.22.0 with pinned viem, node-test-runner and network-helpers plugins, OpenZeppelin 5.6.1, Solidity 0.8.34 and optimizer 200. No HTTP network is configured.
- `TestUSD` (LOANSHARK Test USD, tUSD, 6 decimals, owner-only mint) and `LoanSettlement` with the ADR-0008 states, immutable token allowlist, pull payments, custom errors, SafeERC20, ReentrancyGuard and exact balance-delta checks on every transfer.
- 23 contract tests: full lifecycle and exact balances, wrong callers, ordering, 6 and 18 decimals, deadline boundaries, default, four adversarial mock tokens plus an unlisted token, a seeded 200-run invariant sequence, and the cross-implementation commitment comparison.
- ADR-0008 (loan model), ADR-0009 (identity binding assumption), ADR-0010 (agreement hashing) and ADR-0011 (contract toolchain); Phase 3 evidence and raw gas statistics.

Changed:

- The root `pnpm test` now runs both Vitest and the Hardhat suite; Vitest excludes `packages/contracts`.
- Acceptance matrix: C5, C6 and C7 DONE as local Hardhat results, not deployed; T9 to T11 have test references. README milestones M3 and M4, limitations, structure and source-lock claims 31 to 33.

Known in this phase:

- No contract is deployed. The identity link between the qor1 account and the derived 0x address is unconfirmed (ADR-0009).
- The ADR-0008 decisions are still marked for owner confirmation.
- CI has still not run on GitHub because no remote is configured.

### Phase 2: M1 offline cryptographic slice

Added:

- `packages/qoreseal-adapter`, a typed offline wrapper around `@qorechain/qoreseal` 0.1.0. It exposes sealing to one recipient in explicit mlkem mode, opening with typed failures, and no network helpers.
- `@qorechain/qoreseal` 0.1.0 pinned exactly, with the official `vectors/qoreseal-v1.json` copied unedited to `fixtures/qoreseal-vectors-v1.json`; its 20 cases pass in this repository.
- `src/aad.ts` and ADR-0007: an eight-field, length-prefixed canonical AAD encoding, frozen in `fixtures/aad-vectors.json`.
- `src/envelope.ts`: `SignedEnvelope`, `MessageSigner`, a domain-tagged SHA-256 message, `signEnvelope` and `verifySignedEnvelope` on top of `verifyHybridMessage` with the post-quantum part required.
- `src/testing.ts` as a separate TEST-ONLY entry point: throwaway identity generation, a QoreSign-backed signer, a classical-only signer and a mocked account client.
- 55 tests covering C1 to C3 and T3, T5 to T7, plus hygiene: no network imports, no console output, no secret keys in results. Signing uses throwaway keys and the account/registry clients are mocked and labelled.
- `docs/open-questions-for-qorechain.md` and `docs/evidence/phase-02-result.md`.

Changed:

- Source lock claims 22 to 30 and a corrected claim 13: the TypeScript package is on npm, and its API surface, vectors, modes, card helpers and injected fetch are recorded.
- Acceptance matrix: C1 to C3 and T3, T5 to T7 DONE with offline, throwaway-key evidence. README milestone M1 and limitations; threat-model test references; ADRs 0003 to 0005 and 0007.

Known in this phase:

- The on-chain KEM key registration path is still BLOCKED, so hybrid mode is not exposed by the adapter and no real account can use the offline slice yet.
- The real QoreX signer is deferred; tests use QoreSign with throwaway keys and a mock account client.
- CI has still not run on GitHub because no remote is configured.

### Phase 1: workspace, verification groundwork, read-only chain checks

Added:

- pnpm workspace pinned to node 26.13.0, pnpm 12.21.0, TypeScript 5.9.3, Biome 2.6.8 and Vitest 5.1.0, with `scripts/verify-env.mjs` failing on any toolchain mismatch.
- `packages/chain-client` with strict TypeScript settings and a smoke test.
- `@qorechain/qoresign` 0.2.0 as the official verifier, recorded with its exact `verifyMessage` signature and the bytes it checks (source lock claims 17 to 19).
- Raw fixtures: the PQC account record for `qor1385...xxsr`, and the JSON-RPC responses for `eth_chainId`, `eth_blockNumber`, `eth_getCode` and the ERC-20 metadata calls on three test addresses.
- `.github/workflows/ci.yml`: frozen install, format check, lint, typecheck, tests, and a gitleaks 8.30.1 scan verified by SHA-256.
- ADR-0006 recording the tooling choices as assumptions, and `docs/evidence/phase-01-result.md`.
- `fixtures/qorex-signarbitrary.json`, the real QoreX `signArbitrary` response, with a sidecar recording its provenance and SHA-256, plus `.gitattributes` so fixture bytes survive a checkout.
- `packages/chain-client/src/spike/verify-qorex-signature.ts`, a labelled spike that verifies that response against the on-chain ML-DSA-87 key and runs four tampering controls.
- `packages/chain-client/src/verify-hybrid-message.ts`: `verifyHybridMessage` always requires the post-quantum part, reads keys only from an injected account client, and returns a discriminated result with a typed failure reason. Unit tests use a mocked client; one live test runs only when `LIVE_CHAIN=1`.

Changed:

- README status, milestone row, known limitations and repository structure.
- `docs/research/source-lock.md`: EVM chain ID and JSON-RPC endpoint confirmed at runtime; the three `erc20:` denominations identified by contract metadata.
- `docs/ACCEPTANCE_MATRIX.md`: M0-7 and M0-3 DONE, M0-4 IN PROGRESS.
- ADR-0003: the open question it recorded (does a real response verify unchanged) is answered.

Resolved within the phase:

- M0-3 was blocked at first because the raw QoreX `signArbitrary` response had not been supplied; no signature was reconstructed in its place. The response was supplied later in the same phase, verified on the first attempt with no input adjusted, and the four tampering controls were refused. Recorded in `docs/evidence/phase-01-result.md`.

### Phase 0: protocol reconnaissance

Added:

- Architecture, threat model, acceptance matrix, ADRs 0001 to 0005, source lock and Phase 0 evidence.
- Apache-2.0 licence (provisional, ADR-0001) and the operating contract in `CLAUDE.md`.
