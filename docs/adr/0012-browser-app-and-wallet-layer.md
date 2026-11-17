# ADR-0012: Browser app foundation and the QoreX wallet layer

Status: Accepted for the Phase 4 diagnostics surface. No deployment, no
transaction and no product UI is part of this decision.

## Context

Phase 4 needs a browser page that can detect the QoreX wallet, read the two
chain IDs, show accounts, read the on-chain account record, sign one fixed test
message and verify the returned hybrid signature locally. Everything in that
list is either a wallet call or a client-side cryptographic check, so the page
must run where the wallet is injected: the user's browser.

The alternatives were a server-rendered app (Next.js) and using the published
`@qorechain/wallet-adapter` as the wallet layer. Both were considered and
rejected for this phase.

## Decisions

1. **Client-side only, no SSR.** `apps/web` is Vite 7.3.8 with React 19.3.1 and
   TypeScript 5.9.3. `vite build` produces static files.
   ASSUMPTION: no server-side rendering is needed, because every operation in
   this phase is a browser wallet call or a local signature check, and because
   CLAUDE.md rule 6 keeps all cryptography on the client. The rejected
   alternative is Next.js: it adds a Node server runtime and a server-side
   surface for no feature this phase uses, and that surface would tempt placing
   key handling behind an API. The cost accepted is no SSR, no SEO and no API
   routes; a future backend must be a separate package with its own review.
2. **A thin typed wrapper, not the published adapter.** `@qorechain/wallet-adapter`
   is published at 0.6.0 under Apache-2.0 (source-lock claim 42), so the licence
   is not the reason to avoid it. It is not used because its QoreX surface is
   only `enable` and `signAndBroadcast` (claim 38): it has no `getKey`, no
   `signArbitrary`, no chain read and no EIP-6963 discovery, and it would pull
   `cosmjs-types` and three `@cosmjs/*` packages for functions this page does not
   call. `apps/web/src/wallet` is written against `window.qorex.native` (claim
   36) and EIP-6963 announcements (claim 41) with local types.
3. **Exact pins.** React 19.3.1, React DOM 19.3.1, Vite 7.3.8,
   `@vitejs/plugin-react` 5.2.0, `@types/react` 19.3.0, `@types/react-dom`
   19.3.0, `@types/node` 26.6.6, TypeScript 5.9.3. TypeScript keeps the
   workspace's strict flags (`strict`, `noUncheckedIndexedAccess`,
   `exactOptionalPropertyTypes`, `noImplicitReturns`,
   `noPropertyAccessFromIndexSignature`).
4. **Content security policy in a meta tag**: `default-src 'self'`,
   `script-src 'self'`, `style-src 'self'`, `img-src 'self' data:`,
   `font-src 'self'`, `connect-src` limited to `https://api-testnet.qore.host`
   and `https://evm-testnet.qore.host`, `object-src 'none'`, `base-uri 'none'`,
   `form-action 'none'`. No analytics, no remote fonts, no third-party script.
   Limitations: a meta tag cannot enforce `frame-ancestors`, so clickjacking
   protection needs a response header at whatever host serves the build; Vite's
   development server injects the React refresh preamble as an inline script,
   so the strict policy is verified against the production build, not `dev`. The
   built `dist/index.html` contains only external `script`/`link` tags
   (`docs/evidence/phase-04-result.md`).
5. **Chain guard state is explicit.** Every wallet action is refused unless the
   EVM provider answers `eth_chainId` with `0x2648` and the native side accepts
   `enable('qorechain-diana')`. Wrong EVM chain and unaccepted native chain are
   distinct states, and the page shows the state before any signing button.
   ASSUMPTION (source-lock claim 43): QoreX exposes no native chain-id getter in
   either the source or the runtime record, so the native side is inferred from
   `enable` resolving. If a getter is confirmed, the guard should read it and
   this decision should change.
6. **Signing is serialised and explicit.** QoreX is reported to handle one
   request at a time (claim 44, owner report, not reproduced here), so the
   signer holds a promise queue: a second call waits for the first to settle and
   never reaches the provider early. A rejected request is returned as a typed
   failure and never retried. `sign()` requires a per-call authorisation
   callback, so no code path reaches the provider without a user action.
7. **No storage and no transaction methods.** The app writes nothing to
   `localStorage`, `sessionStorage` or IndexedDB, and calls no
   `eth_sendTransaction`, `eth_sendRawTransaction` or `signAndBroadcast`. A
   static test asserts both (Task 5). The only signing request is the fixed
   message `LOANSHARK test message, no funds`.
8. **Success requires local verification.** Every returned signature is checked
   with `verifyHybridMessage` from `@loanshark/chain-client` with the
   post-quantum part required, against the ML-DSA-87 key read from
   `/qorechain/pqc/v1/account/{address}`. A signature that cannot be verified is
   never shown as success; the four negative controls are computed locally on
   the returned object.

## Consequences

- The page cannot work without a wallet extension or the QoreX app browser, and
  it cannot switch the wallet's network; the user does so in QoreX.
- The CORS behaviour of `api-testnet.qore.host` is unknown until the owner opens
  the page. The page reports the exact failure instead of hiding it, and no
  proxy is added in this phase.
- A build-time dependency on the `@loanshark/chain-client` `dist` output exists,
  so `dev`, `build` and `typecheck` build that package first.
- Nothing here is deployed, and no real wallet result is claimed until the
  owner-run checklist in `docs/evidence/phase-04-owner-checklist.md` is filled
  in.
