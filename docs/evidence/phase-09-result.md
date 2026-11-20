# Step 9 result: relay server, encrypted local vault, binding flow

Recorded 2026-11-20 at commit `decbd2a` (binding-flow commit; the commits for the
Step 9 tasks are listed at the end). This repository has sent no transaction and
signed nothing live in Step 9. No real mnemonic or private key was read, printed,
stored or transmitted by the assistant. The only network calls were loopback
calls to an in-process HTTP server started by the tests.

## What Step 9 added

| Task | Artefact | Tests |
|---|---|---|
| 1 | ADR-0015 (AAD party identity), ADR-0016 (encrypted local vault), ADR-0017 (relay server) | n/a (decision records) |
| 2 | `apps/api`: `node:http` relay, append-only JSON-lines store, content-addressed envelopes, cards, bindings | `apps/api/test/server.test.ts`, 12 tests |
| 3 | `packages/relay-client`: typed client that verifies every fetched object before returning it | `packages/relay-client/test/relay-client.test.ts`, 5 tests |
| 4 | `apps/web/src/vault`: PBKDF2-HMAC-SHA256 plus AES-256-GCM record for a seal account, with save, unlock, lock and forget controls in panel 6 | `apps/web/test/vault.test.ts`, 6 tests |
| 5 | `packages/relay-client/src/binding-flow.ts`: producer and verifier for the ADR-0014 statement | `packages/relay-client/test/binding-flow.test.ts`, 3 tests |
| 6a | `scripts/onboard-seal-account.mjs`: `--execute` refuses a known public test phrase | 4 new tests in `scripts/onboard-seal-account.test.mjs` |
| 6b | `scripts/check-docs.mjs`, `scripts/test-counts.mjs`, `scripts/run-contract-tests.mjs`, wired into `pnpm test-counts` and `pnpm docs:check` and a CI step | the checker runs on the tree; its findings are below |

## Measured test counts

`pnpm test` at `decbd2a`:

- vitest: 238 passed, 1 skipped (`LIVE_CHAIN=1` live test), 239 total across 28 files.
- Hardhat (in-process EVM): 38 passing.

Split by what the test actually exercises (vitest only, 238 + 1 skipped):

| Kind | Files | Tests |
|---|---|---|
| REAL: implementations run for real with no stand-in for the code under test | `apps/api/test/server.test.ts` 12, `apps/web/test/vault.test.ts` 6, `scripts/onboard-seal-account.test.mjs` 17, `scripts/gen-test-mnemonic.test.mjs` 4, `packages/agreement/test/*` 15, `packages/seal-account/test/*` 52, `packages/qoreseal-adapter/test` (aad, adapter, cards, signed-envelope and vectors files) 50 | 156 |
| MOCK: the relay, account client, provider or registry is an in-process stand-in | `packages/relay-client/test/*` 8, `apps/web/test/chains.test.ts` 8, `deploy.test.ts` 12, `signer.test.ts` 9, `signing.test.ts` 8 | 45 |
| FIXTURE and STATIC: source, bundle, CSP or saved-response scans | `apps/web/test/hygiene.test.ts` 15, `privacy.test.ts` 3, `packages/qoreseal-adapter/test/hygiene.test.ts` 6, `packages/chain-client/test/verify-hybrid-message.test.ts` 12 (saved real signature), `smoke.test.ts` 1 | 37 |
| SKIPPED | `packages/chain-client/test/verify-hybrid-message.live.test.ts` (needs `LIVE_CHAIN=1`) | 1 |

The relay tests start the real server on `127.0.0.1:0` and speak HTTP to it; the
account clients that verify ML-DSA-87 keys are mocks. The vault tests use Node's
real WebCrypto. No test contacts QoreChain, and no test sends a transaction.

## Relay server behaviour recorded by the tests

- `POST /v1/envelopes` stores an immutable record keyed by the SHA-256 of its
  canonical bytes; posting the same bytes twice returns the first record, and a
  second write with different bytes under the same id is refused.
- Every endpoint has a positive and a negative case: missing fields, wrong types,
  oversize body (413), wrong `Origin`, wrong `Host`, missing `X-Loanshark-Action`
  header, unknown route, path traversal in an id.
- A request whose JSON contains a key named like a secret (`mnemonic`,
  `privateKey`, `seed`, `secret`, at any depth) is refused with 400.
- A test seals a message with a throwaway key and asserts that neither the stored
  JSON-lines file nor the captured log lines contain the plaintext.
- The log records method, path and status only. No test observed a body in a log
  line.

## Documentation checker findings on the current tree

`node scripts/check-docs.mjs` reads every markdown file in `README.md`,
`docs/**` and every package `README.md`, checks backticked repository paths,
markdown link targets, the `docs/EVIDENCE.md` listing and every stated test count
against `.tmp/test-counts.json`.

Genuine problems it found, all fixed in this change:

| Finding | Fix |
|---|---|
| phase-07-security.md pointed at a docs/evidence/phase-07-result.md that was never written | The sentence now points at `docs/EVIDENCE.md`, which holds the reproduce commands |
| `docs/EVIDENCE.md` did not list `phase-03-gas-stats.json`, `phase-03b-block-time.json` or `phase-03b-estimate-gas.json` | Three rows added with their limits |
| `docs/ACCEPTANCE_MATRIX.md` claimed 13 tests for `scripts/onboard-seal-account.test.mjs`; the runner reports 17 | Corrected after the Step 6a guard added four tests |
| `docs/ACCEPTANCE_MATRIX.md` claimed 5 tests for a single Hardhat file; the Hardhat runner reports one suite total | Reworded to the suite path and its 38 tests, naming the file in prose |
| `README.md` and `docs/DEMO_SCRIPT.md` stated counts with no resolvable test path | Reworded to name the test path next to the count |

The checker was also run against a deliberately broken document: it reported the
nonexistent path and the wrong count, then passed once the document was removed.
Two classes of reference are reported as notes rather than failures, because they
are not paths in this repository: a bare filename, and a path on a line that names
an upstream repository or commit (for example a QoreSeal source file at the commit
named beside it).

## What is not proven

- The relay is local only. It binds to `127.0.0.1`, has no TLS, no authentication
  and no deployment. Its store is a file on the testing machine.
- The vault protects against casual local access to the browser profile, not
  against a compromised browser, XSS, a malicious extension, a weak passphrase or
  a lost passphrase.
- The binding flow has no owner-run tool. No real QoreX signature has been
  combined with a real seal-account signature, so C17 stays PENDING.
- The AAD still carries the wallet (W) qor1 addresses (ADR-0015); the refusal of
  an envelope whose AAD names E is tested, but no app produces envelopes yet.
- CI has not run on GitHub. The new `test-counts` and `docs:check` steps have run
  locally only.

## Owner-run commands for the binding checklist

The binding flow is library code. There is no command to run yet, so
`docs/evidence/phase-09-owner-checklist.md` is blank and marked NOT PRODUCED.

## Commits

| Task | Commit | Subject |
|---|---|---|
| 1 | `a86e72f` | `docs(adr): record AAD party identity, vault design, and relay server ADRs` |
| 2 | `c3a5008` | `feat(api): create apps/api ephemeral ciphertext relay server` |
| 3 | `d38c9dd` | `feat(relay-client): add verifying relay client package` |
| 4 | `e245c2d` | `feat(vault): add encrypted local vault module and panel controls` |
| 5 | `decbd2a` | `feat(relay-client): add producer and verifier for the binding statement` |
