# Step 9b result: provider record, domain-separated commitment, evaluator, preflight, footprint

Recorded 2026-11-20. This phase sent no transaction and signed nothing live. No
real mnemonic or private key was read, printed, read from disk or stored by the
agent. Read-only network calls were made for the provider evaluation and the
preflight smoke run; their raw results are below.

Precondition check: Step 9 was committed (`f2e5ca3`) and the tree was clean before
Step 9b began. `docs/evidence/phase-06-owner-deploy.md` is blank, so no deployed
contract address or transaction hash exists and Task 2 proceeded.

## Task 1: provider evaluation record

See `docs/adr/0018-confidential-computing-providers.md`. It records the read-only
checks (documentation HTTP status, DNS failures, npm registry responses), the
classification of each provider, the gates a future provider must pass, the
QoreSeal-on-npm mismatch and the documented provider-neutral interface.

No provider package, code or dependency was added. `git diff` for the task touched
only the ADR, the README section and one threat row.

## Task 2: domain-separated commitment

- Solidity: `_commitment` is `keccak256(abi.encode(block.chainid, address(this),
  terms))`; `commitmentOf` is now `view` instead of `pure`.
- TypeScript: `commitmentOf(terms, { chainId, verifyingContract })` in
  `packages/agreement`, built from `abi.encode(chainId, address,
  (borrower, lender, token, principal, interest, dueDate, graceSeconds,
  fundingDeadline, claimDeadline, salt))`.
- Confirmation: `loanshark/v2/agreement|<chain id>|<verifying contract>|<loanId>|
  <agreementHash>`; the v1 tag is refused (no v1 parser exists).

Frozen vectors, regenerated once and frozen again:

| Value | SHA-256 |
|---|---|
| `fixtures/agreement-vectors.json` before (v1, terms-only, 2026-11-17) | `e0c33bbf65b0e19659721fce68ff035c64f432fcefaaf3fb7f6ffd57e3c1e777` |
| `fixtures/agreement-vectors.json` after (v2, domain-separated, chain 9800, TEST ONLY address) | `83568e0ca461f50e1d594d1f941457948b952f3ae0f2dbb0c31bb3b868f0124b` |

The v2 file records `domain.chainId = 9800` and
`domain.verifyingContract = 0x000000000000000000000000000000000000c0de` with the
note "TEST ONLY. No contract is deployed at this address."

Deployment manifest, rebuilt after two clean compiles (`cmp` reported the two
manifest files identical):

| Contract | Bytecode | Before | After |
|---|---|---|---|
| TestUSD | creation | `0xfee21a5d8e6c269c479cb50c096e287a8b253da62b3c16b53652582951d1958e` | unchanged |
| TestUSD | runtime | `0x9a2ed16929ac11fc248c7ddc7bb89632b500836b5795979d07f73ec271c044e7` | unchanged |
| LoanSettlement | creation | `0x4ecf8bf89ee4a1d05b736bca0fbce082ea9d0d468ae228bb539164f4abc5cb39` | `0xcb9dce4fde980a7c88d898844d85b1528203969e152276240e42f680d96a6b6b` |
| LoanSettlement | runtime | `0xc04df2eed7c843f16642cefb054289798f1bd739295a2151fafb8c7a1ca6108e` | `0xd61354af8a9ac724038f42f743cf38cf573b74d955a8111bd117f5b7f001c3c5` |

Tests added for Task 2:

- TypeScript: same terms give a different loan id under a different chain id and
  under a different verifying contract; the preimage layout is asserted word by
  word; malformed domain values throw; the vector file is version 2 with the TEST
  ONLY label.
- Confirmation: a v2 message contains the chain id and contract; a confirmation
  signed for another contract and one signed for another chain id are both refused;
  the earlier term-change and wrong-signer refusals still hold.
- Hardhat: the Solidity `commitmentOf` equals the TypeScript `commitmentOf` for the
  test deployment's own chain id and address, all ten fields change both, and two
  deployments with the same terms produce different ids. Vectors for chain 9800
  cannot be checked against a Hardhat deployment, so they anchor the TypeScript
  implementation and the runtime cross-check covers Solidity.

The frozen AAD encoding (ADR-0007) was not touched.

## Task 3: offer evaluator

`packages/agreement/src/offer-evaluator.ts`, exported as `evaluateOffer` and
`LocalOfferEvaluator`. Pure: no network, no randomness, no clock read. Twelve
checks, each with `id`, `pass`, `expected`, `actual` and a plain-language
explanation; a missing or malformed field adds a failing check and the offer is
ineligible.

The deadline checks were written from `LoanSettlement._validateTerms`, and a test
reads `LoanSettlement.sol` to confirm the 3600-second minimum and that the three
compared rules still exist in the contract. A test also asserts that no
secret or confidential wording appears in the footprint or evaluator data.

18 tests in `packages/agreement/test/offer-evaluator.test.ts`: each check passing
and failing (where the domain allows a single failure), the fully eligible offer,
several failures together, determinism and non-mutation, malformed input.

Two checks are coupled by the domain and the test says so: an expired offer also
breaks the funding-deadline check, and a claim deadline before the funding
deadline also breaks the claim window.

## Task 4: preflight library

`packages/preflight` with no hard-coded addresses. `preflight(plan, config, deps)`
takes an injected JSON-RPC function and returns `ready`, `blocked` or `unknown`
with per-check explanations, the token decimals, the gas estimate and the public
fields of the action from `@loanshark/privacy-footprint`.

Checks: chain id against the config and the plan; `eth_getCode` non-empty and,
when a hash is configured, equal to it, with a metadata-only difference reported
as a mismatch rather than accepted; the token in the contract's own
`allowedTokens()` and in the config; `decimals()`; the sender's balance; the
allowance, with an unlimited or zero approval rejected for `approve`; the loan
state and caller role from `stateOf` and `termsOf` (`propose` uses the planned
terms, because the loan does not exist yet); the repayment within `outstandingOf`;
an `eth_call` simulation with custom errors decoded through the contract ABI; and
`eth_estimateGas`.

Fail-closed: an RPC failure, timeout or malformed response makes that check
`unknown`, and any `unknown` makes the result `unknown`. A transport failure in
`eth_call` is `unknown`; only a revert is `fail`.

Results:

- `packages/preflight/test/preflight-unknown.test.ts`, 6 MOCK tests: every call
  failing, a hanging call past the timeout, malformed responses, a wrong chain, a
  wrong settlement address, and never `ready` while one check is `unknown`.
- `packages/contracts/test/preflight.test.ts`, 9 REAL tests on the in-process
  Hardhat network with `LoanSettlement` and `TestUSD`: ready/blocked per action,
  wrong caller, insufficient balance and allowance (on an isolated token and
  settlement, because the shared fixture pre-funds every account), wrong token,
  unlimited approval, wrong chain, no code at the address, and the preflight error
  ABI checked against the compiled artifact selectors.

Smoke script `scripts/preflight-smoke.mjs` (read-only, method allowlist
`eth_chainId` and `eth_call` only). Raw output on 2026-11-20:

```json
{
  "rpc": "https://evm-testnet.qore.host",
  "note": "Read-only. Two JSON-RPC calls only. No transaction was built, signed or sent.",
  "calls": [
    {
      "method": "eth_chainId",
      "params": [],
      "status": 200,
      "ms": 952,
      "text": "{\"jsonrpc\":\"2.0\",\"id\":1,\"result\":\"0x2648\"}\n"
    },
    {
      "method": "eth_call",
      "params": [
        { "to": "0x97143B771D34ddb9130b807b135Ae675A5a963CA", "data": "0x313ce567" },
        "latest"
      ],
      "status": 200,
      "ms": 182,
      "text": "{\"jsonrpc\":\"2.0\",\"id\":2,\"result\":\"0x0000000000000000000000000000000000000000000000000000000000000006\"}\n"
    }
  ]
}
```

Diana reports chain id `0x2648` (9800) and the fest fUSD reports 6 decimals. Only
those two calls were made; the script has no path that estimates gas, signs or
sends.

## Task 5: privacy footprint

`packages/privacy-footprint` holds the typed data; `docs/PRIVACY_FOOTPRINT.md` is
written from it. Twelve user actions, each with encrypted-off-chain, what the
relay sees, public-on-chain and not-private lists.

`packages/privacy-footprint/test/footprint.test.ts` (8 REAL tests) reads the
committed ABI from `docs/deployments/manifest.json` and fails when a function
parameter or event field is unclassified, when a classification is stale, or when
the data claims anonymity, private transfers or confidential computation. It also
proves nothing is classified as a conversation key.

The app's privacy boundary panel was not changed: rendering the per-action
table needs layout work in `apps/web/src/App.tsx`, so it is recorded as a Step 10
follow-up in `docs/PRIVACY_FOOTPRINT.md` and the README limitations.

## Task 6: fail-closed, replay and invariant coverage

Coverage map. Existing tests are named by file and title; new tests are marked.

| Requirement | Test |
|---|---|
| `verifyHybridMessage` refuses a client that fails | `packages/chain-client/test/verify-hybrid-message.test.ts` "reports a client failure instead of throwing" |
| ... and a malformed or wrong-length key | same file, "refuses a response that is not shaped like a signature", "refuses an on-chain key of the wrong length", "refuses to verify when the chain has no registered key" |
| A client timeout | NEW partial: `packages/relay-client/test/fail-closed.test.ts` "refuses a card when the registry throws" and "refuses an envelope when the account client throws". The verifiers await the injected client and have no timer of their own, so a hung client hangs the caller; that is a caller-side timeout, recorded below, not a library guarantee |
| Card verifier refuses on registry failure | NEW `packages/relay-client/test/fail-closed.test.ts` "refuses a card when the registry throws, and returns no data" |
| Card verifier refuses a missing KEM key | NEW same file, "refuses a card for an address with no registered KEM key"; also `packages/qoreseal-adapter/test/cards.test.ts` "refuses a card whose KEM hash does not match the registered key" |
| Card verifier refuses a card for another chain or account | NEW same file, "refuses a card issued for another chain"; `cards.test.ts` "refuses a card whose signature does not match the registered PQ key" |
| A recipient card that is expired or stale | There is no expiry field in the official recipient card (`@qorechain/qoreseal` 0.1.0). A stale card is caught by the chain/address/KEM-hash checks above. Recorded as a mismatch with the brief, not as a passing expiry test |
| Binding verifier refuses a failed account read | NEW `fail-closed.test.ts` "refuses a binding statement when the account client throws"; `packages/seal-account/test/binding.test.ts` "rejects when either account has no registered key" |
| Wrong chain, purpose or AAD on open | `packages/qoreseal-adapter/test/adapter.test.ts` "refuses an envelope opened for another chain or purpose"; `test/signed-envelope.test.ts` "C3: changing each context field individually fails to open and to verify"; `test/aad.test.ts` frozen vectors |
| Tampered ciphertext | `adapter.test.ts` "C1: the wrong recipient cannot open it"; `signed-envelope.test.ts` "C3: a flipped ciphertext byte fails to open" |
| Replayed confirmation for another loan, chain or contract | `packages/agreement/test/confirmation.test.ts` "refuses a confirmation signed for another contract", "... another chain id", "... when the terms changed after signing" |
| A replayed binding for another wallet | NEW `fail-closed.test.ts` "refuses a replayed binding statement for another wallet" |
| An offer envelope opened by a non-recipient | `adapter.test.ts` "C2: lender B cannot open lender A's offer"; "C2: two offers are two independent envelopes" |
| A request re-sealed by the recipient and presented as the borrower's | `signed-envelope.test.ts` "T6: a variant re-sealed for the second lender is rejected by the signature"; "T5: a signature by a different key for the stated borrower is rejected" |
| Relay stores ciphertext only | `apps/api/test/server.test.ts` |
| Contract: token balance equals Funded escrow plus withdrawable, per token | NEW `packages/contracts/test/invariants-named.test.ts` "token balance equals Funded escrow plus withdrawable, per token"; `test/invariants.test.ts` 200-run sequence |
| Contract: repaid never exceeds principal plus interest | NEW same file, "repaid never exceeds principal plus interest, and Repaid iff repaid equals the total" |
| Contract: Repaid if and only if repaid equals the total due | NEW same file, same test |
| Contract: disbursement at most once per loan | NEW same file, "disburses at most once per loan" |
| Contract: funds leave only through claim, refund and withdraw | NEW same file, "moves funds only through claim, refund and withdraw" |

No existing test was weakened or deleted. The only library behaviour change in
this task is that `RelayClient.getCard` now catches a throwing registry read and
returns a `card-invalid` refusal instead of propagating the error.

## Measured test counts

`pnpm test` at the end of Step 9b: vitest 284 passed, 1 skipped (`LIVE_CHAIN=1`),
32 files; Hardhat 53 passing. Against the Step 9 close (vitest 238 passed, Hardhat
38 passing), Step 9b added 46 vitest cases (38 in new files and 8 added to the
commitment and confirmation suites) and 15 Hardhat cases (13 in new files and 2
added to the cross-commitment suite). No test was removed or weakened.

| Kind | Step 9b files | Tests |
|---|---|---|
| REAL | `packages/agreement/test/offer-evaluator.test.ts` 18, `packages/privacy-footprint/test/footprint.test.ts` 8, `packages/contracts/test/preflight.test.ts` 9 (Hardhat), `packages/contracts/test/invariants-named.test.ts` 4 (Hardhat) | 39 |
| REAL (updated) | `packages/agreement/test/commitment.test.ts` 13, `packages/agreement/test/confirmation.test.ts` 10, Hardhat cross-commitment 4 | 27 |
| MOCK | `packages/preflight/test/preflight-unknown.test.ts` 6, `packages/relay-client/test/fail-closed.test.ts` 6 | 12 |

## Assumptions

- ASSUMPTION: the domain separator order is `chainId, verifyingContract, terms`,
  following EIP-712's ordering convention. Nothing on QoreChain specifies it.
- ASSUMPTION: the confirmation's chain id is the EVM chain id (9800), distinct
  from the native chain id QoreSign prefixes. Both are checked; the message binds
  the EVM one.
- ASSUMPTION: `MINIMUM_CLAIM_WINDOW` stays 3600; the evaluator test reads the
  contract, so a change there fails the test rather than silently diverging.
- ASSUMPTION: the preflight treats only a revert as `fail` for the simulation and
  every transport problem as `unknown`. The distinction is by error text and
  revert data, not by a typed JSON-RPC error code.
- ASSUMPTION: the smoke script's two calls are enough to prove reachability; it
  does not prove a settlement deployment exists (none does).

## Limitations recorded this phase

- Recipient cards have no expiry, so "expired card" cannot be tested; freshness
  is the chain, address and key-hash check.
- No verifier or client implements its own timeout. A hung injected client hangs
  the caller.
- The preflight reports the metadata-only difference as a mismatch. It cannot say
  whether the deployed code is otherwise the reviewed code.
- The vectors were regenerated once; any further rewrite needs an ADR.

## Commits

| Task | Commit | Subject |
|---|---|---|
| 1 | `5085464` | `docs(adr): record the confidential-compute provider evaluation` |
| 2 | `ec7563f` | `feat(contracts): domain-separate the loan id by chain and contract` |
| 2 | `51b376a` (manifest) | `chore(deploy): rebuild the manifest for the domain-separated commitment` |
| 2 | `10ff2e7` | `feat(agreement): take the settlement domain in the commitment and confirmation` |
| 2 | `160d270` | `test(agreement): refreeze the vectors for the domain-separated commitment` |
| 3 | `d62931c` | `feat(agreement): add the local, explainable offer evaluator` |
| 4 | `9811fa0` | `feat(preflight): add the read-only transaction preflight` |
| 5 | `63981fe` | `docs: write the privacy footprint from the typed data` |
| 6 | `6ea296c` | `test: close fail-closed and named invariant gaps` |
| fix | `e8d0d6e` | `fix: correct the pinned viem version and type the commitment read` (a comment that named viem 2.58.0 rather than the pinned 2.57.11, and a hex cast so the Hardhat preflight test typechecks against the view return type) |
| 7 | this commit | `docs: close the Step 9b milestone and record its evidence` |

## Confirmation

No secret was read, printed or stored by the agent in Step 9b. No environment
variable holding a phrase was read, no mnemonic appears in any command output or
file written here, and no transaction was built, signed or sent. The only network
calls were the provider documentation and registry reads recorded above and the
two read-only Diana JSON-RPC calls in the smoke run.
