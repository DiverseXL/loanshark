# Phase 4 result: browser app foundation and QoreX read/sign-message layer

Date: 2026-11-17. Network named by the app: QoreChain Diana Testnet
(`qorechain-diana`, EVM `0x2648`). Nothing was deployed. No transaction was
sent. This agent asked no wallet to sign anything. The only signing request the
app can make is the fixed message `LOANSHARK test message, no funds`, and only
after the owner presses the button. No key, seed phrase, mnemonic or recovery
code is in the repository, the fixtures, the build output or browser storage.

## Task 0: baseline

Start commit:

```
23fca95113c5f7d7f38d3d8e2eae7d37fffc0071 feat: add the client-only diagnostics app foundation
```

`git status --porcelain` was not empty at the start. It listed two untracked
paths, `apps/web/src/constants.ts` and `apps/web/src/wallet/`, left by the
earlier part of this phase. They were reviewed and completed rather than
discarded; nothing tracked was overwritten. Apart from those paths the tree was
clean.

Baseline test counts, with `pnpm test`:

```
 Test Files  10 passed | 1 skipped (11)
      Tests  83 passed | 1 skipped (84)
33 passing (33 nodejs)
```

The skipped test is the live-chain verification test gated on `LIVE_CHAIN=1`.

ADR-0008 already recorded the owner's confirmation of decisions 1 to 8 in
commit `77b764a`, dated 2026-11-17. No edit was needed in this phase; the status
line and each decision still carry that confirmation.

## Task 1: wallet interface read from source

`git ls-remote https://github.com/qorechain/qorechain-wallet-adapter.git HEAD
refs/heads/main` returned `4ee2f45904ca92c187446c48c4eadb0738246576` for both on
2026-11-17. That is the commit the source lock was already based on, so no
claim moved.

`npm view @qorechain/wallet-adapter version license repository.url` returned
`0.6.0`, `Apache-2.0`, `git+https://github.com/qorechain/qorechain-wallet-adapter.git`.

Read at that commit:

- Entry point: `getQorexNative()` returns `globalThis.window?.qorex?.native`
  (`src/qorex.js`).
- Connection: `connectQorex({ chainId })` checks the
  `signAndBroadcast` capability, requires `chainId` to be `qorechain-vladi` or
  `qorechain-diana`, then calls `provider.enable(chainId)`. A dApp cannot switch
  the wallet's network.
- Sending: `qorexSignAndBroadcast({ chainId, messages, memo, gasLimit })`
  validates the request and calls `provider.signAndBroadcast(req)`, which
  resolves with `{ txHash, code, height?, shield }`.
- Refusal policy: 15 type URLs are refused directly, inside `authz` `MsgExec`
  to depth 8, and as `MsgGrant` `GenericAuthorization` messages. Bounds: 1 to
  32 messages, memo at most 256 bytes, gas 100000 to 5000000 or omitted.
- Not in the source: `getKey` and `signArbitrary`. The runtime record
  (`docs/evidence/phase-00-result.md`) is the only record of those members and
  of the hybrid signature shape. The runtime wins for what the page imports;
  source-lock claims 38 and 39 now state the difference explicitly.

The published adapter is not a dependency. Its only QoreX function is
`signAndBroadcast`, which this step forbids, and it has no `getKey`,
`signArbitrary`, chain read or EIP-6963 discovery. The licence was checked and
is not the reason. The app imports the existing `MessageSigner` type from
`@loanshark/qoreseal-adapter` as a type-only dependency, so no adapter code is
in the bundle.

## Task 2: apps/web

Vite 7.3.8, React 19.3.1, React DOM 19.3.1, `@vitejs/plugin-react` 5.2.0,
TypeScript 5.9.3, `@types/react` 19.3.0, `@types/react-dom` 19.3.0 and
`@types/node` 26.6.6, all exact. Client-side only; no SSR and no server plugin.
ASSUMPTION, recorded in ADR-0012: no SSR is needed because every operation is a
browser wallet call or a local signature check. The rejected alternative is
Next.js.

`index.html` carries the production policy:

```
default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:;
font-src 'self'; connect-src https://api-testnet.qore.host
https://evm-testnet.qore.host; object-src 'none'; base-uri 'none';
form-action 'none'
```

There is no analytics, no remote font and no third-party script. The built
`apps/web/dist/index.html` contains one external module script and one external
stylesheet, both from the same origin; it contains no inline script. The static
test checks the policy and the remote-origin rules.

A serve-only Vite plugin relaxes `script-src` and `style-src` with
`'unsafe-inline'` because the development server injects the React refresh
preamble and inline styles. The plugin has `apply: "serve"`; `vite build` does
not run it. `pnpm --filter @loanshark/web preview` serves the strict production
policy and is what the owner checklist uses for the CSP observation.

The app is in the existing scripts: Biome includes `**/*.tsx`, root
`pnpm typecheck` and `pnpm build` reach it through `pnpm -r`, root `pnpm test`
builds `packages/chain-client` and `packages/qoreseal-adapter` first and Vitest
includes `apps/web/test/**/*.test.ts`. `apps/web` also has its own `test`
script.

Observed dev-server policy (HTTP read, not a browser result): while
`pnpm --filter @loanshark/web dev` was running, `Invoke-WebRequest
http://localhost:5173` returned HTTP 200 and the transformed page carried
`script-src 'self' 'unsafe-inline'` and `style-src 'self' 'unsafe-inline'`; the
build output above kept `script-src 'self'` and `style-src 'self'`. The server
was stopped after the read.

## Task 3: wallet layer

Files under `apps/web/src/wallet`:

- `detect.ts`: EIP-6963 listener before `eip6963:requestProvider`, a 600 ms
  window, deduplication by UUID, QoreX matched by rdns `network.qore.qorex` or
  `isQoreX`, plus `window.qorex.native`. The full announcement list is shown;
  the rdns is self-attested.
- `chains.ts`: EVM `eth_chainId` must be `0x2648`; native
  `enable('qorechain-diana')` must resolve. Outcomes are `ready`,
  `wrong-chain` (with `reason: "evm" | "native"`) and `unavailable`. Every
  wallet action in the signer re-runs the guard before reaching the provider.
  ASSUMPTION (source-lock claim 43): the native side is inferred from `enable`
  because neither source nor runtime exposes a chain-id getter.
- `connect.ts`: `connectNative(chainId)` returns the bech32 `getKey` address,
  the parsed key and the raw key for the panel. Missing `getKey` is reported,
  not guessed around.
- `signer.ts`: `QorexMessageSigner implements MessageSigner`. One promise queue
  serialises every call; a second call waits for the first to settle. A
  required `authorize(message)` callback gates the provider call. A refusal is
  returned as a typed `request-rejected`/`wallet-error` result and is not
  retried. `sign()` throws `QorexSignerError` (an `Error` with a stable code),
  never a string.
- `account.ts`: read-only `/qorechain/pqc/v1/account/{address}` fetch with the
  exact HTTP body or error text, and a CORS-shaped failure report. No proxy.
- `signing.ts`: `runSignatureChecks` verifies with `verifyHybridMessage`
  (post-quantum part mandatory, key from the on-chain record) and computes the
  four negative controls locally. `reportStatus` returns `verified` only when
  the positive check passed and all four controls were refused.

## Task 4: diagnostics page

One page, six panels, each with a `Show raw JSON` details/summary toggle:

1. QoreX detected and every EIP-6963 provider found, with its name, rdns and
   `isQoreX` flag.
2. Native and EVM chain IDs and the guard state, including the distinct
   wrong-chain reasons. The native-inference assumption is stated on the page.
3. Native `getKey` and `listAccounts`, EVM `eth_accounts` (no
   `eth_requestAccounts`), and a character comparison of `eth_accounts[0]`
   with `0xd0a1453c7b8157aa0635076c33b3e24a50a923c5` from ADR-0009. Match,
   mismatch and not-compared are separate states.
4. A read-only browser fetch of the account record. Success, HTTP error, or the
   exact network error; the page says a browser cannot distinguish a CORS
   refusal from a network failure, and records the run's outcome without a
   proxy.
5. The fixed-message signing button. The wallet address, both chain IDs and the
   guard state are repeated above the button. The button is disabled unless the
   guard is ready and an account is connected. The result shows local
   verification and the four negative controls, each with expected and actual
   reasons. A failed positive check or a control that unexpectedly verifies is
   never shown as success.
6. The README claims table copied verbatim, with the same "It does" and "It
   does not claim" rows, plus the no-zero-knowledge sentence. A test parses
   README.md and fails on any difference.

The testnet banner is present at the top of every render, each panel carries a
`DIANA TESTNET` badge, and the footer repeats it.

## Task 5: tests

`apps/web/test` contains 37 tests in 5 files:

| File | Tests | Kind |
|---|---:|---|
| `chains.test.ts` | 8 | MOCK EVM and native providers |
| `signer.test.ts` | 9 | MOCK provider; queue, rejection, guard and authorisation |
| `signing.test.ts` | 8 | 5 with the saved real QoreX response and saved on-chain key (fixed in-memory account reader, no network); 3 with synthetic verifier results |
| `hygiene.test.ts` | 9 | static scan of `apps/web/src`, `index.html` and CSS |
| `privacy.test.ts` | 3 | static comparison with the README claims table |

Split by kind: 5 real-fixture, 17 MOCK-provider, 3 synthetic-result, 12 static.
No test opens a socket.

What the queue test does: two concurrent `requestSignature` calls, a MOCK
provider that records each call and returns a pending promise for the first.
The test waits for every microtask, asserts the provider has been called once
with the first message only, then resolves the first and asserts the second
arrives. A second test resolves the two gates out of order and asserts the
results still follow request order.

The unverified path: `reportStatus` is tested with a failed verification and
with a verified positive plus one control that verified. It returns
`not-verified` and `control-failed` respectively, never `verified`.

Static checks: no `localStorage`, `sessionStorage`, IndexedDB, Cache Storage or
`document.cookie`; no mnemonic, seed-phrase or private/secret-key text in
`apps/web/src`; no `eth_sendTransaction`, `eth_sendRawTransaction`,
`eth_signTransaction`, `signAndBroadcast`, `eth_requestAccounts` or wallet send
call; `signArbitrary` appears only in the type and the signer; only
`TextEncoder().encode(TEST_MESSAGE)` is used for signing; the production CSP
blocks inline script and eval and limits `connect-src` to the two hosts; no
remote script, stylesheet or font; no inline event handler or dangerous HTML
sink.

Production build, measured in this phase:

```
dist/index.html                   1.12 kB │ gzip:   0.63 kB
dist/assets/index-BMxtqMR9.css    2.07 kB │ gzip:   0.87 kB
dist/assets/index-CG_UUf91.js   334.23 kB │ gzip: 109.99 kB
vite build: Done
```

The Rollup warning about a `@__PURE__` comment inside `@scure/base` is a
dependency comment-position warning; the build exits 0. The bundle is large
mainly because the post-quantum verifier is included client-side, which is the
point of the design.

## Local checks

Commands run on 2026-11-17 from the repository root:

```
pnpm verify-env        exit 0, toolchain matches
pnpm format:check      exit 0, Checked 71 files, no fixes
pnpm lint              exit 0, 58 warnings, 39 infos, no errors
pnpm typecheck         exit 0
pnpm test              exit 0
pnpm build             exit 0
```

Final test totals:

```
 Test Files  15 passed | 1 skipped (16)
      Tests  120 passed | 1 skipped (121)
33 passing (33 nodejs)
```

That is 83 pre-existing Vitest tests plus 37 new `apps/web` tests. The one
skipped Vitest test is the live-chain account read. The 33 Hardhat tests are
unchanged from Phase 3b.

## What is BLOCKED

The owner-run browser observations are BLOCKED on the owner. No agent run can
produce them: this environment has no QoreX extension and no browser session
for the owner's account. `docs/evidence/phase-04-owner-checklist.md` lists the
steps and leaves every result field blank and marked OWNER-SUPPLIED. Until it
is filled in:

- C8 (wrong chain rejected by the app) stays PENDING even though the guard
  tests pass.
- C10 (no key material or plaintext reaches the server) stays PENDING; no
  server exists and the static checks pass, but the owner-run observation is
  missing.
- No CORS outcome for `api-testnet.qore.host` is claimed.
- No fresh QoreX signature or verification result is claimed.
- No claim is made that the page renders correctly in a browser.

## Assumptions

- ASSUMPTION (SSR): no server rendering is needed; all operations are wallet
  calls or client-side verification. ADR-0012 decision 1.
- ASSUMPTION (native chain): `enable('qorechain-diana')` resolving is the
  native-chain signal; no getter exists in source or runtime. ADR-0012
  decision 5.
- ASSUMPTION (one request at a time): QoreX refuses a concurrent signing
  request. This is the owner's report (source-lock claim 44), not reproduced;
  the queue is therefore defensive.
- ASSUMPTION (arguments): the source and the probe do not record the parameter
  lists for `getKey`, `signArbitrary` or `listAccounts`. The wrapper calls
  `getKey(chainId)`, `signArbitrary(chainId, address, text)` and
  `listAccounts(chainId)` following the Keplr-like native API. A wrong argument
  list would surface as a wallet error, not as a silent success.
- ASSUMPTION (CORS): a browser `TypeError` with no response may be a CORS
  refusal or a network failure; the page reports both possibilities.
- ASSUMPTION (control 4): relabelling the fetched on-chain record with the
  synthetic control address is a local harness so the verifier reaches the
  key/address check. No key is invented for that address and no chain lookup
  is made for it.
- ASSUMPTION (identity): the ADR-0009 derived address is compared, not
  trusted. The qor1-to-0x link remains unconfirmed.

## Not done in this phase

No Step 6 work was started. No deployment, no transaction, no EVM window, no
`signAndBroadcast`, no API, no storage or seal-key custody, no analytics, no
proxy and no product UI.
