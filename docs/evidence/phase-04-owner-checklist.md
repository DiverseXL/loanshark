# Phase 4 owner checklist: browser run

Everything labelled OWNER-SUPPLIED below is blank on purpose. An agent cannot
produce it: this environment has no browser session for the owner's account and
no QoreX extension. Copy exact text from the page and the browser console. Do
not fill a field from memory, and do not paste a seed phrase, private key,
recovery code or any key material into this file or into chat.

Expected page: `LOANSHARK diagnostics`. Expected network: QoreChain Diana
Testnet only. Expected signing message: `LOANSHARK test message, no funds`.

## 1. Start the app (PowerShell)

Use the production preview so the strict CSP in `index.html` is the one the
browser enforces. `pnpm dev` also works but its serve-only plugin relaxes inline
script and style for Vite's refresh preamble; do not use dev for the CSP
observation.

```powershell
Set-Location C:\path\to\loanshark
pnpm install --frozen-lockfile
pnpm verify-env
pnpm --filter @loanshark/web build
pnpm --filter @loanshark/web preview
```

Open <http://localhost:4173> in Chrome with QoreX installed, or in the QoreX app
browser.

Optional development loop (relaxed inline policy, do not record CSP here):

```powershell
pnpm --filter @loanshark/web dev
```

Open <http://localhost:5173>.

Owner environment:

- Date and time (UTC): OWNER-SUPPLIED
- Operating system and browser version: OWNER-SUPPLIED
- QoreX version (from its own screen): OWNER-SUPPLIED
- URL used (4173 preview or 5173 dev): OWNER-SUPPLIED
- Wallet address selected in QoreX (bech32, public): OWNER-SUPPLIED

## 2. Panel 1: QoreX detected

Action: read the panel and open `Show raw JSON`.

- Providers announced (name, rdns, isQoreX flag): OWNER-SUPPLIED
- `window.qorex.native`: found / not found: OWNER-SUPPLIED
- QoreX EVM provider: found / not found: OWNER-SUPPLIED
- Notes printed by the page: OWNER-SUPPLIED
- Raw JSON toggle opened and showed JSON: OWNER-SUPPLIED

## 3. Panel 2: chain guard

Action: read the two rows and the guard badge. Do not press the signing button
in this section.

- Native `qorechain-diana`: accepted / not accepted: OWNER-SUPPLIED
- Native `enable` error text, if any: OWNER-SUPPLIED
- EVM chain ID observed (expected `0x2648`): OWNER-SUPPLIED
- `eth_chainId` error text, if any: OWNER-SUPPLIED
- Guard badge (READY / WRONG CHAIN / CHAIN UNAVAILABLE): OWNER-SUPPLIED
- Raw JSON toggle opened and showed JSON: OWNER-SUPPLIED

Negative control for C8, done in QoreX, not on the page:

1. In QoreX, switch the active network away from Diana (if the build allows
   it).
2. Return to the page and press `Re-detect wallets and re-read chains`.

- Guard badge after the switch: OWNER-SUPPLIED
- Exact error text shown: OWNER-SUPPLIED
- Signing button disabled while the chain is wrong: OWNER-SUPPLIED
- Switch back to Diana, press re-detect, and record the badge: OWNER-SUPPLIED

## 4. Panel 3: accounts

Action: read both account rows and compare the characters.

- Native bech32 address from `getKey`: OWNER-SUPPLIED
- `getKey` address field (`address`): OWNER-SUPPLIED
- `getKey` algorithm: OWNER-SUPPLIED
- `listAccounts` result (read, error, or not exposed): OWNER-SUPPLIED
- `eth_accounts[0]`: OWNER-SUPPLIED
- ADR-0009 address shown by the page: OWNER-SUPPLIED
- Comparison badge (MATCH / MISMATCH): OWNER-SUPPLIED
- Raw JSON toggle opened and showed JSON: OWNER-SUPPLIED

Do not conclude that a match proves control. Record the badge only.

## 5. Panel 4: on-chain account record

Action: press `Read account record` once. This is a read-only browser fetch. No
proxy is used.

- HTTP status or exact error text: OWNER-SUPPLIED
- `found` value: OWNER-SUPPLIED
- ML-DSA-87 key bytes, if found (expected 2592): OWNER-SUPPLIED
- Algorithm id, if found (expected 1 = dilithium5): OWNER-SUPPLIED
- Page's CORS outcome line, verbatim: OWNER-SUPPLIED
- Browser console error for the request, verbatim: OWNER-SUPPLIED
- Raw JSON toggle opened and showed the body or exact error: OWNER-SUPPLIED

Outcome classification to record, one of: readable response / HTTP error /
likely CORS or network failure. Do not guess which if the page says the browser
cannot distinguish them.

- Classification: OWNER-SUPPLIED

## 6. Panel 5: sign the fixed message

Before pressing anything, confirm the summary above the button shows the same
address and both chain IDs as panels 2 and 3.

- Wallet address shown above the button: OWNER-SUPPLIED
- Native chain shown above the button: OWNER-SUPPLIED
- EVM chain shown above the button: OWNER-SUPPLIED
- Guard badge shown above the button: OWNER-SUPPLIED

Action: press `Sign the fixed test message` once. In the QoreX popup, confirm
the message is exactly `LOANSHARK test message, no funds` and that it says no
funds move. Approve once. Do not approve anything else.

- QoreX popup text, verbatim (no key material): OWNER-SUPPLIED
- Wallet error, if the request was refused (exact code and text): OWNER-SUPPLIED
- Local verification badge (VERIFIED / NOT-VERIFIED / CONTROL-FAILED): OWNER-SUPPLIED
- Verification reason, if not verified: OWNER-SUPPLIED
- On-chain key bytes used: OWNER-SUPPLIED
- Raw signature object captured in `Show raw JSON` (public data only): OWNER-SUPPLIED

Four negative controls shown by the page. Record the result and actual reason
for each; expected is every control refused.

| Control | Result (REJECTED / UNEXPECTEDLY VERIFIED) | Actual reason | OWNER-SUPPLIED notes |
|---|---|---|---|
| 1. pq part removed | OWNER-SUPPLIED | OWNER-SUPPLIED | OWNER-SUPPLIED |
| 2. message changed by one character | OWNER-SUPPLIED | OWNER-SUPPLIED | OWNER-SUPPLIED |
| 3. chain id `qorechain-vladi` | OWNER-SUPPLIED | OWNER-SUPPLIED | OWNER-SUPPLIED |
| 4. synthetic control signer | OWNER-SUPPLIED | OWNER-SUPPLIED | OWNER-SUPPLIED |

Do not press the signing button a second time for this checklist. An extra
request is not needed and the signer never retries on its own.

## 7. Panel 6: privacy boundary

Action: read the table and compare it with the README section "What LOANSHARK
is, and is not".

- Rows shown match the README character for character (yes/no): OWNER-SUPPLIED
- Any difference, verbatim: OWNER-SUPPLIED
- Zero-knowledge/FHE sentence present (yes/no): OWNER-SUPPLIED

## 8. C10 observation: no key material in browser storage

Action: open DevTools, Application tab, and inspect this origin only. Do not
copy any values.

- Local Storage keys for the app origin: OWNER-SUPPLIED
- Session Storage keys for the app origin: OWNER-SUPPLIED
- IndexedDB databases for the app origin: OWNER-SUPPLIED
- Cookies for the app origin: OWNER-SUPPLIED

Action: Network tab, reload the page, then read panels 1 to 4. Record every
remote host contacted and every method used.

- Remote hosts contacted (expected only the two QoreChain hosts and any wallet
  internal traffic; the page itself calls no other origin): OWNER-SUPPLIED
- Any `eth_sendTransaction`, `eth_sendRawTransaction`, `eth_signTransaction` or
  `signAndBroadcast` observed (yes/no): OWNER-SUPPLIED
- Any request carrying a seed phrase, private key or recovery code (yes/no): OWNER-SUPPLIED

## 9. Content security policy

Action: in the production preview (port 4173), open DevTools Console and
reload. Record every CSP message verbatim.

- CSP violation count: OWNER-SUPPLIED
- CSP messages: OWNER-SUPPLIED
- Production page loaded with styling and no blocked module script (yes/no): OWNER-SUPPLIED

## 10. Sign-off

- Every result above is copied from a real run, not from memory (yes/no): OWNER-SUPPLIED
- C8 owner evidence present (yes/no): OWNER-SUPPLIED
- C10 owner evidence present (yes/no): OWNER-SUPPLIED
- Name or identifier of the person who ran this checklist: OWNER-SUPPLIED
- Date and time the run finished (UTC): OWNER-SUPPLIED

After this file is filled in, update `docs/ACCEPTANCE_MATRIX.md` C8 and C10 and
the README limitations only from the recorded values. Until then both stay
PENDING and no browser result is claimed.
