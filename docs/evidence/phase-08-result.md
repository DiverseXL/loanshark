# Phase 8 result: seal account and W/E binding

Date: 2026-11-19. Step 8 is **local and dry-run only**. No seal account was created, no key was
registered, no transaction was signed or sent, and no real mnemonic was seen by the assistant.
C13 and C14 are PENDING.

## 1. What the step adds

Each party to a loan now has two accounts (ADR-0004, ADR-0014):

- **W**, the wallet account controlled by QoreX, which holds tokens and sends every EVM
  transaction; and
- **E**, an app-held seal account derived from its own 24-word phrase, which publishes the
  ML-KEM-1024 key, signs the recipient card and envelopes, and countersigns the W/E statement.

| Piece | Where | What it does |
|---|---|---|
| Seal identity | `packages/seal-account/src/identity.ts` | Derives secp256k1, ML-DSA-87, ML-KEM-1024 and X25519 keys from a BIP-39 phrase; redacts secrets; signs the official recipient card; seals to itself |
| Binding statement | `packages/seal-account/src/binding.ts` | Fixed seven-line text, field validation, E countersignature, verifier with expiry, both post-quantum parts and W's derived EVM address |
| Owner onboarding | `scripts/onboard-seal-account.mjs` | Dry run by default; `--execute` registers missing keys, waits for commit, reads both keys back |
| Browser panel | `apps/web/src/seal/SealPanel.tsx` | Generate in memory, show the phrase once, clear it, sign the card, forget the identity |
| Bundle check | `scripts/check-web-bundle.mjs` | Project budgets for JS, CSS, HTML, no remote assets, CSP shape |

Frozen material was not changed: ADR-0007's AAD bytes, ADR-0010's agreement text and confirmation,
and every existing test vector. Whether the AAD `borrower`/`lender` fields should name W or E is an
open Step 9 item.

## 2. Measured checks

Run on 2026-11-19 on Windows, Node 26.13.0, pnpm 12.21.0:

| Command | Result |
|---|---|
| `pnpm test` | Vitest 206 passed, 1 skipped (24 files) plus Hardhat 38 passing: 244 passed, 1 skipped |
| `pnpm typecheck` | Passed for every package and the app |
| `pnpm format:check` | Passed, 100 files |
| `pnpm lint` | Exits 0 with pre-existing warnings and infos; the new files add two `useLiteralKeys` infos, the same rule the surrounding code already reports |
| `pnpm --filter @loanshark/web build` | 95 modules; `index-CLiDXDNr.js` 480180 bytes, CSS 2341, HTML 1117 |
| `pnpm --filter @loanshark/web check:bundle` | Passed: JS 480180 of 614400, CSS 2341 of 20480, HTML 1117 of 4096 |

The new tests are 52 in `packages/seal-account`, 13 in `scripts/onboard-seal-account.test.mjs` and
4 in `scripts/gen-test-mnemonic.test.mjs`, plus the narrowed and extended static checks in
`apps/web/test/hygiene.test.ts`. The seal package's own tests cover the frozen derivation values,
redaction, card signing, seal/open, envelope signing and the binding statement's failure modes.

## 3. Source verification

`docs/evidence/phase-08-source-check.md` records the pins and the installed exports:

- QoreSeal `bbd4dbbe8b987639be4f0b12084000e7da2272f4`, QoreSign
  `d146c7167a9afa5e94ee4a734bb44f842a2b4a0b`.
- Fifteen exports used by this repository, checked in the installed packages.
- The path for a new account: fund E, then QoreSign `register-and-send` builds the ML-DSA-87 message
  and signs it with `signHybrid(mode: "classicalOnly")`, then QoreSeal registers the KEM key with a
  hybrid signature. That is a source path, not a live result (source-lock claims 57 to 65).
- Correction: E signs binding statements with `signMessage`, because `signHybrid` signs transaction
  bytes. The resulting `MessageSignature` is what `verifyHybridMessage` checks.

## 4. Dry run

`docs/evidence/phase-08-onboarding-dry-run.md` records a read-only run at 2026-11-19T10:58:20Z with
the public all-zero test phrase:

- Derived `qor19rl4cm2hmr8afy4kldpxz3fka4jguq0agt672h`, the frozen test vector value.
- Four GET requests returned the account (number 868, sequence 40, 11800 uqor), an ML-DSA-87 key
  registered as `hybrid` whose SHA3-256 equals the canonical derivation, and no ML-KEM key.
- Nothing was signed or sent. The report file holds public data and raw responses only, and is
  ignored by git.

`--execute` has not run. The typed confirmation, simulation, signing, broadcast, KEM error mapping
and read-back are tested only as argument and guard logic, not against Diana.

## 5. Browser panel

`docs/evidence/phase-08-browser-panel.md` records the build, the static checks and the bundle result.
The panel was not opened in a real browser. Its source has no network, storage, logging, timer or
`useEffect` path; the phrase is cleared on confirmation and a forget button drops the identity. The
production CSP still forbids inline script, eval and remote assets. JavaScript cannot prove the
phrase left memory (T29).

The bundle grew by roughly 480 KB of JavaScript because ML-DSA-87, ML-KEM-1024 and hybrid signing
are now available to the page. It stays under the declared 600 KiB project budget, which is an
ASSUMPTION, not a platform limit.

## 6. ASSUMPTIONS

- The binding text is fixed lines, not JSON; safe only because every field is validated and cannot
  contain a newline (ADR-0014).
- Binding lifetime defaults to 30 days and may not exceed 90 days; clock skew up to 5 minutes is
  tolerated. These are project choices.
- W signs first and E countersigns.
- One statement exists per W/E pair, not per loan.
- The 600 KiB JS, 20 KiB CSS and 4 KiB HTML budgets are project choices.
- The owner generates the real phrases through the panel, not through the TEST ONLY
  `scripts/gen-test-mnemonic.mjs`.
- The EVM address in the statement is the `0x` form of W's verified secp256k1 key. That does not
  prove QoreX's EVM lane uses the same key for transactions (ADR-0009).

## 7. What is still not established

- C13: no fresh E was registered; there is no transaction hash and no live read-back.
- C14: no real QoreX signature has been combined with a real E countersignature, and no owner-run
  command produces or verifies a statement.
- `--execute` may fail on Diana. Its transaction code is copied from the pinned official examples
  and is untested live.
- Two QoreSign versions are installed: 0.2.0 directly and 0.1.0 nested under QoreSeal. Card signing
  runs on 0.1.0; compatibility is tested on the used paths only.
- The panel is not persisted and was not browser-tested; reloading loses the identity.
- No phrase is persisted by design. Phrase handling remains the largest residual risk (T29, T32).
- `docs/evidence/phase-08-owner-checklist.md` remains blank and OWNER-SUPPLIED.

## 8. Next

Step 9 is not started. It must decide the AAD W-versus-E question, wire the product envelope flow to
E, and decide whether a per-loan binding statement and a persistence design are needed before any
owner-run registration is treated as evidence.
