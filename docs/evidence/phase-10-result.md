# Step 10 result: the negotiation flow

Recorded 2026-11-26. This phase sent no transaction and signed nothing live with
a real wallet. No real mnemonic or private key was read, printed, read from disk
or stored. All relay traffic in the tests is loopback and in-process. The live
two-party run is owner-supplied and PENDING
(`docs/evidence/phase-10-owner-checklist.md`).

Precondition check: Step 9b was committed at `c04aaa3` and the working tree was
clean before Step 10 began.

## Task 0: baseline and line endings

Start commit `c04aaa3`. `pnpm format:check` failed on two scripts
(`scripts/token-selector-scan.mjs`, `scripts/verify-deployment.mjs`) because the
Windows checkout converted committed LF content to CRLF with
`core.autocrlf=true`. `.gitattributes` now sets `* text=auto eol=lf`, keeps
`fixtures/** -text` byte-exact and marks binary assets. The index was already
LF, so renaming changed no file content; the working tree was re-checked out.
After: `pnpm format:check` checked 143 files and passed.

Baseline `pnpm test`: vitest 238 passed, 1 skipped; Hardhat 38 passing at the
Step 9 close, and 284 / 53 after the Step 9b close. During this phase the vault's
PBKDF2 tests timed out under one-worker-per-file load; the runner timeout was
raised to 60 seconds (the tampering case to 90) as a resource allowance, with no
assertion changed.

## Task 1: ADR

`docs/adr/0019-negotiation-flow.md` defines both payloads, canonical JSON, the
strict validation rules, the state machine and its actors, the binding/card/KEM
resolution order, envelope signing, the confirmation, the deployment config and
the test tooling ASSUMPTION. Written before code, as required.

## Task 2: packages/negotiation

Pure package: schemas, canonical encoder/decoder, validators, builders, exact
amount conversion and the reducer. 33 tests:

- `test/payloads.test.ts` (20): valid request and offer; unknown field at the
  top level and inside `terms`; number where a decimal string is required;
  negative, float, hex, exponent and leading-zero numbers; maximum total below
  principal; same borrower and lender; non-canonical `qor1`; overlong note; wrong
  schema; bad timestamp; canonical key-order independence; numbers and booleans
  refused; round trip; over-size and invalid UTF-8; malformed offer terms.
- `test/amounts-and-reducer.test.ts` (10): exact 6/18-decimal conversion, too many
  decimals refused, signs and exponents refused, formatting; the happy path,
  out-of-order refusal, ineligible acceptance refused, blocked/reset and
  relay-unavailable.
- `test/integration.test.ts` (3): the offer terms feed `LocalOfferEvaluator` as
  eligible, the loan id equals `@loanshark/agreement`'s commitment, the offer id
  is not in the preimage, and another chain changes the id.

## Task 3: relay confirmations

`POST /v1/confirmations` and `GET /v1/confirmations/:loanId` store an immutable,
content-addressed record and verify nothing, like the other endpoints. Fields:
loanId, chainId (decimal string), verifyingContract, agreementHash, signerW,
role, signature, createdAt. The schema, size limit, secret-field rejection and
write header are the existing ones.

`RelayClient.postConfirmation` and `getConfirmations` verify every signature
over the ADR-0010 v2 message with the post-quantum part required, and refuse a
confirmation whose loan id, chain id, contract, signer or role is not the
expected one. To keep the Node server out of the browser bundle, the client
computes content addresses with `@noble/hashes` and a test proves the two
implementations agree (record fetch verification passes against server ids).

Tests: `apps/api/test/confirmations.test.ts` (5) and
`packages/relay-client/test/confirmations.test.ts` (5, REAL relay and REAL
hybrid signatures with a MOCK account client).

## Task 4: screens

Four areas: Setup, Borrower, Lender, Diagnostics. The existing technical panels
remain, unchanged, under Diagnostics.

- Setup: wallet and chain summary, the existing seal-account panel with an
  identity callback, publish card, W/E binding (W signs through the injected
  signer, E countersigns), read-only registration status and a checklist.
- Borrower: request form with human-unit amounts converted with the token's
  decimals, exact canonical payload preview, seal/sign/send, verified offer
  list with every evaluator check and its explanation, and Accept disabled
  unless eligible and a settlement address exists.
- Lender: verified request inbox, request display, offer composer with the
  3600-second claim-window rule, random salt, exact payload preview,
  seal/sign/send, then the canonical text, hashes, loan id and both confirmation
  states.
- Every action uses `PrivacyNotice`, which renders the typed footprint.

The deployment config is `apps/web/public/deployment.json`; it reports
`"settlement": null`, so confirmation steps are disabled and say "not deployed".
No address is hard-coded. The relay URL is `VITE_RELAY_URL` or
`http://127.0.0.1:8787`, and `connect-src` was extended to exactly those two
loopback origins, which the static test now asserts.

No money screen exists.

## Task 5: tests

`apps/web/test/negotiation-simulation.test.ts` (8, Node, REAL relay server and
client, REAL seal identities and QoreSeal, REAL verifiers, MOCK account client,
TEST ONLY wallet signer):

| Case | Result |
|---|---|
| Borrower sends a request the lender verifies and opens | pass |
| Lender composes an offer the borrower evaluates as eligible | pass |
| The same offer is ineligible against a lower maximum total cost | pass |
| Both confirmations verify for the same loan and domain | pass |
| A confirmation replayed for another contract is refused | pass |
| A missing binding is CounterpartyNotOnboarded and nothing is sent | pass |
| A down relay is RelayUnavailable | pass |
| A hostile relay's tampered ciphertext is refused | pass |
| A different seal account cannot open the envelope | pass |

`apps/web/test/negotiation-screens.test.tsx` (5, jsdom, MOCK relay and MOCK
wallet reads): Setup checklist and privacy data; Borrower preview and send once
on a double click; disabled acceptance and the not-deployed text; Lender empty
inbox and not-deployed; Lender RelayUnavailable.

Test-only tooling, pinned: jsdom 31.0.1, `@testing-library/react` 16.3.3,
`@testing-library/dom` 10.4.2 (ASSUMPTION recorded in ADR-0019).

## Task 6: owner checklist

`docs/evidence/phase-10-owner-checklist.md` is blank and OWNER-SUPPLIED: services,
two Chrome profiles, the exact order of clicks, the fields to record and four
negative checks. `scripts/run-relay.mjs` (and `pnpm relay`) is the loopback
starter; it has no transaction path.

## Measured test counts

`pnpm test` at the end of Step 10: vitest 340 passed, 1 skipped
(`LIVE_CHAIN=1`), 39 files; Hardhat 53 passing.

| Kind | Files | Tests |
|---|---|---|
| REAL (negotiation, pure) | `packages/negotiation/test/*` | 33 |
| REAL (relay confirmations; real signatures, MOCK account client) | `packages/relay-client/test/confirmations.test.ts` | 5 |
| REAL (server endpoints) | `apps/api/test/confirmations.test.ts` | 5 |
| REAL transport and crypto, MOCK account client and wallet signer | `apps/web/test/negotiation-simulation.test.ts` | 8 |
| MOCK relay and MOCK wallet reads (jsdom) | `apps/web/test/negotiation-screens.test.tsx` | 5 |

Step 10 added 56 vitest tests. Hardhat is unchanged. No existing test was
weakened or deleted; two static expectations changed because the app gained a
codec and a loopback origin, and both are stated in the commit.

## Assumptions

- ASSUMPTION: canonical JSON with sorted keys and no numbers, instead of RFC 8785
  (ADR-0019).
- ASSUMPTION: a per-offer CSPRNG salt, not a deterministic one (ADR-0019).
- ASSUMPTION: the confirmation binds the EVM chain id (9800), while QoreSign
  prefixes the native chain id; both are checked.
- ASSUMPTION: the local EVM address is QoreX's `eth_accounts[0]`, falling back to
  the ADR-0009 derived address only when no EVM account is readable. The link
  remains the ADR-0009 assumption.
- ASSUMPTION: the test-only tooling versions above; jsdom is not a browser.

## Limitations recorded this phase

- Negotiation state lives in page memory only. A reload loses the request and the
  offer being evaluated; there is no draft persistence, by design (storage stays
  in the vault module).
- The live two-party run is not done. Every flow test uses a MOCK account client
  and a TEST ONLY wallet signer.
- Confirmations are disabled until a deployment config names a settlement
  contract. None is deployed.
- The confirmation endpoint is unauthenticated and loopback-only; a record is
  trusted only after the client verifies it.
- No money screen: propose, approve, fund, claim, repay, withdraw, cancel and
  refund are not built.

## Commits

| Task | Commit | Subject |
|---|---|---|
| 0 | `1222d29` | `chore: normalise line endings to LF on every platform` |
| 0 | `c69c4db` | `test: allow the PBKDF2 vault cases to finish under parallel load` |
| 1 | `d8c03a6` | `docs(adr): define the negotiation flow and payload schemas` |
| 2 | `ac1839c` | `feat(negotiation): add the pure payload, encoding and reducer package` |
| 3 | `f0e093a` | `feat(relay): add public signed agreement confirmations` |
| 4 | `b17e81a` | `feat(web): add the setup, borrower and lender negotiation screens` |
| 5 | `71ab83f` | `test(web): add screen tests and a two-party negotiation simulation` |
| 4 | `0a0a2ea` | `fix(relay-client): compute content addresses without the Node server` |
| 6 | `25f2a6b` | `docs: add the owner checklist and a loopback relay starter` |
| 7 | this commit | `docs: close the Step 10 milestone and record its evidence` |

## Confirmation

No secret was read, printed or stored by the agent in Step 10. No environment
variable holding a phrase was read, no mnemonic appears in any command output or
file written here, and no transaction was built, signed or sent. The only
network use was the local package install and loopback test traffic.
