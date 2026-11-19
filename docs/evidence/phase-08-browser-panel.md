# Phase 8 evidence: browser seal-account panel

Date: 2026-11-19. The production page was built and checked; it was **not** opened in a real
browser by the assistant. No wallet, chain or registration was involved.

## 1. What the panel does

`apps/web/src/seal/SealPanel.tsx` is panel 6 on the diagnostics page. It:

- calls `generateSealAccount({ chainId: "qorechain-diana" })`;
- shows the 24-word phrase once, in a bordered block, with a warning;
- requires the owner to press `I have saved it: hide the phrase` before it signs a recipient card;
- on confirmation, replaces the state object with one whose `phrase` is `""`, signs the card with
  the in-memory identity, and shows only public data and the card JSON;
- offers `Forget the seal identity in this page`, which drops the page's reference;
- makes no network call, no storage call, no log call and no transaction.

The panel does not import existing seal accounts in Step 8. Persistence is deferred in ADR-0005.
Reloading the page loses the account; the owner-run script is the path for an existing phrase.

## 2. Static checks

`pnpm --filter @loanshark/web test`: 6 files, 54 tests passed.

The hygiene test now allows the word `mnemonic` in `src/seal/SealPanel.tsx` only. It asserts:

- `src/seal/SealPanel.tsx` is the only file under `src/seal/`;
- no `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, `console`, `window.location`, timer or
  `useEffect` in the panel;
- the panel imports no `@qorechain/*` package directly, only `@loanshark/seal-account`;
- the phrase is cleared (`phrase: ""`), the confirmation button and the forget button exist, and
  the card is signed with `recipientCard()`;
- storage APIs, `document.cookie`, private/secret key names and analytics remain banned everywhere;
- the production CSP in `index.html` still has `script-src 'self'`, no `unsafe-inline`, no
  `unsafe-eval`, `object-src 'none'` and `connect-src` limited to the REST and EVM hosts;
- no remote script, stylesheet or font is referenced.

## 3. Production build

`pnpm --filter @loanshark/web build` succeeded: 95 modules transformed, no source map.

| Asset | Bytes | Gzip |
|---|---|---|
| `assets/index-CLiDXDNr.js` | 480180 | 151.59 kB |
| `assets/index-DXxmmsKi.css` | 2341 | 0.92 kB |
| `index.html` | 1117 | 0.62 kB |

The only build message is a Rollup note that a `/* @__PURE__ */` comment inside
`@scure/base/index.js` is positioned where Rollup cannot interpret it and was removed. It is a
third-party comment, not a code change; the build succeeds.

The JavaScript grew from the pre-Step-8 bundle because ML-DSA-87, ML-KEM-1024 and the hybrid
signing code are now bundled for the browser. That is expected: the panel needs the identity and
card offline. Nothing is fetched at runtime.

## 4. Bundle policy check

`pnpm --filter @loanshark/web check:bundle` (script `scripts/check-web-bundle.mjs`) passed:

```text
index-CLiDXDNr.js: 480180 bytes
index-DXxmmsKi.css: 2341 bytes
index.html: 1117 bytes
budgets: js 614400, css 20480, html 4096
bundle check passed
```

The script fails on a JavaScript total over 600 KiB, a CSS total over 20 KiB, an HTML size over
4 KiB, a remote script or stylesheet, an inline event handler, or a relaxed CSP. The budget is a
project choice (ASSUMPTION), not a browser or QoreChain limit.

## 5. What this establishes

- The seal-account code bundles and type-checks for the browser target.
- The production policy still blocks inline script, eval, remote assets and storage-free operation
  is visible in the built page.
- The panel's source has no network, storage, logging or timer path.
- The bundle stays under a declared budget.

## 6. What it does not establish

- No browser was driven through generate, confirm, card signing or forget. The React state
  transitions are read statically, not executed.
- `crypto.getRandomValues` availability and the exact CSP behaviour in each browser are not
  exercised. The build target is `es2022`; no compatibility matrix was run.
- JavaScript cannot prove the phrase was erased from memory. The UI says so. XSS, a malicious
  dependency or an extension can read it while the page is open (T29).
- The card is not published and no key is registered. C13 and C14 remain PENDING.
- The panel does not run the owner-run registration, and the owner-run script does not use the
  panel's identity; both derive from the same phrase and are separate processes.
