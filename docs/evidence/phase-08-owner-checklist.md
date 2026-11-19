# Phase 8 owner checklist: seal-account onboarding

Prepared 2026-11-19. This checklist is for the owner. The assistant has not created a seal
account, has not funded one, has not signed anything and has not sent a transaction. Every result
cell below is blank and marked OWNER-SUPPLIED. Never fill a cell with an expected value; paste only
what the panel, the script and the explorer return.

Two parties are needed: a borrower and a lender. Each party has a wallet account **W** (QoreX, EVM)
and a seal account **E** (app-held, QoreSign/QoreSeal). One borrower W/E pair and one lender W/E
pair exist per loan (ADR-0004, ADR-0014).

## What must never be sent to the assistant

- Any word of a real seal-account phrase, in any order, in any form.
- The value of `LOANSHARK_SEAL_MNEMONIC`, a screenshot of it, or a terminal scrollback containing it.
- QoreX's recovery phrase or private key, or any wallet seed or keystore file.
- `.env` files, shell history files, or clipboard dumps.
- A screenshot of the browser panel while the phrase is visible.

Safe to send: `qor1` addresses, `0x` addresses, public keys, key hashes, transaction hashes, block
heights, HTTP response bodies that contain no phrase, and the public recipient-card JSON. The
script's report file contains public data and raw responses only; still open it and check before
pasting.

If a phrase is exposed, treat the seal account as burned. Do not register it, do not fund it, and
start again with a new phrase. Do not send the exposed phrase anywhere.

## Before starting

- [ ] Repository is at the commit that contains this checklist: OWNER-SUPPLIED (`git rev-parse HEAD`).
- [ ] `pnpm install` succeeded.
- [ ] `pnpm --filter @loanshark/seal-account build` succeeded.
- [ ] Node is 22 or newer: OWNER-SUPPLIED (`node --version`).
- [ ] QoreX is on QoreChain Diana: native `qorechain-diana`, EVM `0x2648` (9800). No mainnet.
- [ ] The two wallet accounts W already exist and their `qor1` and `0x` addresses are known.
- [ ] Each E account will get a **fresh** 24-word phrase. Do not reuse QoreX's mnemonic and do not
      reuse the all-zero test phrase from the evidence files.
- [ ] `scripts/gen-test-mnemonic.mjs` is a throwaway test helper printed to the terminal. Do **not**
      use it for an owner account. Generate owner phrases only through the browser panel, which
      shows the phrase once and clears it.

## Part A: generate each seal account (per party)

Use the production build so the CSP applies:

```powershell
Set-Location C:\path\to\loanshark
pnpm --filter @loanshark/web build
pnpm --filter @loanshark/web preview
```

Open the printed URL (default `http://localhost:4173`), go to panel 6.

For the borrower:

- [ ] Press the generate button once.
- [ ] Write the 24 words on paper, offline, in order. Do not photograph them.
- [ ] Press `I have saved it: hide the phrase` and confirm the phrase is gone from the page.
- [ ] Record the borrower E address: OWNER-SUPPLIED.
- [ ] Record the borrower E EVM form: OWNER-SUPPLIED.
- [ ] Copy the recipient-card JSON to a file for later comparison: OWNER-SUPPLIED (paste public JSON).
- [ ] Press `Forget the seal identity in this page`, close the tab, and clear the clipboard.

For the lender, repeat the same steps in a new tab and record:

- [ ] Lender E address: OWNER-SUPPLIED.
- [ ] Lender E EVM form: OWNER-SUPPLIED.
- [ ] Lender recipient-card JSON: OWNER-SUPPLIED (paste public JSON).

The panel does not import an existing phrase in Step 8. The phrase written on paper is the only copy;
the owner-run script reads it from the environment.

## Part B: fund each E account

Each E account must exist on chain with a little test QOR before registration, because registration
is a transaction sent by E.

- [ ] Borrower E funded from the testnet faucet. Faucet response or explorer link: OWNER-SUPPLIED.
- [ ] Lender E funded from the testnet faucet. Faucet response or explorer link: OWNER-SUPPLIED.

## Part C: dry run for each party

The script defaults to a dry run, which makes four read-only requests and sends nothing. Put the
phrase in the environment for one command, then remove it.

```powershell
$env:LOANSHARK_SEAL_MNEMONIC='<BORROWER E PHRASE>'
node scripts/onboard-seal-account.mjs --dry-run
Remove-Item Env:LOANSHARK_SEAL_MNEMONIC
```

- [ ] The printed `qor1` address equals the paper/panel address, and the printed EVM form equals the
      address recorded in Part A. Mismatch means stop: the phrase was written down wrong.
- [ ] The printed recipient card is stable across two runs except `issuedAt`.
- [ ] `fixtures-out/` contains one report file named after the address.

Record the borrower dry-run result:

| Field | OWNER-SUPPLIED result |
|---|---|
| Account exists on chain | OWNER-SUPPLIED |
| ML-DSA-87 already registered (and with which key) | OWNER-SUPPLIED |
| ML-KEM-1024 already registered | OWNER-SUPPLIED |
| Report file name | OWNER-SUPPLIED |
| Any error text, exact | OWNER-SUPPLIED |

Repeat with the lender phrase and record:

| Field | OWNER-SUPPLIED result |
|---|---|
| Account exists on chain | OWNER-SUPPLIED |
| ML-DSA-87 already registered (and with which key) | OWNER-SUPPLIED |
| ML-KEM-1024 already registered | OWNER-SUPPLIED |
| Report file name | OWNER-SUPPLIED |
| Any error text, exact | OWNER-SUPPLIED |

**STOP RULE: if a dry run reports a different key already registered for the address, stop.** Do not
run `--execute`. A different key means the phrase does not belong to that account. Report the exact
message.

## Part D: register each seal account

`--execute` needs an interactive terminal. It prints the address and asks for the exact confirmation
`REGISTER <qor1 address>`. It refuses any chain other than `qorechain-diana` and any REST endpoint
other than `https://api-testnet.qore.host`.

```powershell
$env:LOANSHARK_SEAL_MNEMONIC='<BORROWER E PHRASE>'
node scripts/onboard-seal-account.mjs --execute
Remove-Item Env:LOANSHARK_SEAL_MNEMONIC
```

Only type the confirmation after checking the printed address against the paper address, character by
character.

Borrower:

| Field | OWNER-SUPPLIED result |
|---|---|
| ML-DSA-87 transaction hash | OWNER-SUPPLIED |
| ML-DSA-87 block height | OWNER-SUPPLIED |
| ML-KEM-1024 transaction hash | OWNER-SUPPLIED |
| ML-KEM-1024 block height | OWNER-SUPPLIED |
| Script printed `read-back check passed for both keys` | OWNER-SUPPLIED |
| Exact error text, if any (including a KEM registry error) | OWNER-SUPPLIED |

Lender:

| Field | OWNER-SUPPLIED result |
|---|---|
| ML-DSA-87 transaction hash | OWNER-SUPPLIED |
| ML-DSA-87 block height | OWNER-SUPPLIED |
| ML-KEM-1024 transaction hash | OWNER-SUPPLIED |
| ML-KEM-1024 block height | OWNER-SUPPLIED |
| Script printed `read-back check passed for both keys` | OWNER-SUPPLIED |
| Exact error text, if any (including a KEM registry error) | OWNER-SUPPLIED |

If a transaction hash is printed but the read-back fails, stop and report the hash. Do not re-run
`--execute` on the same phrase until the cause is known.

## Part E: independent read-back

Do not rely on the script's own read-back. Read the chain again:

```powershell
$address = '<E qor1 address>'
Invoke-RestMethod "https://api-testnet.qore.host/qorechain/pqc/v1/account/$address"
Invoke-RestMethod "https://api-testnet.qore.host/qorechain/pqc/v1/kem/$address"
```

Borrower:

| Field | OWNER-SUPPLIED result |
|---|---|
| `found` (ML-DSA-87) | OWNER-SUPPLIED |
| `key_type` | OWNER-SUPPLIED |
| `possession_proven` | OWNER-SUPPLIED |
| `created_at_height` | OWNER-SUPPLIED |
| `found` (ML-KEM) | OWNER-SUPPLIED |
| `algorithm_name` (ML-KEM) | OWNER-SUPPLIED |
| `registered_height` (ML-KEM) | OWNER-SUPPLIED |

Lender:

| Field | OWNER-SUPPLIED result |
|---|---|
| `found` (ML-DSA-87) | OWNER-SUPPLIED |
| `key_type` | OWNER-SUPPLIED |
| `possession_proven` | OWNER-SUPPLIED |
| `created_at_height` | OWNER-SUPPLIED |
| `found` (ML-KEM) | OWNER-SUPPLIED |
| `algorithm_name` (ML-KEM) | OWNER-SUPPLIED |
| `registered_height` (ML-KEM) | OWNER-SUPPLIED |

Do not interpret `possession_proven` or `created_at_height` beyond recording them. They are read-only
observations, not evidence about how the key was produced.

## Part F: recipient card

Record the final public card for each party. It must name the same address, chain and key hashes as
the dry run, with a new `issuedAt` if it was regenerated.

| Field | Borrower OWNER-SUPPLIED | Lender OWNER-SUPPLIED |
|---|---|---|
| Card `issuedAt` | OWNER-SUPPLIED | OWNER-SUPPLIED |
| Card signature verifies | OWNER-SUPPLIED | OWNER-SUPPLIED |
| Where the card is stored (not published) | OWNER-SUPPLIED | OWNER-SUPPLIED |

The card is not published and no registry entry is created in Step 8.

## Part G: W/E binding statement

A binding statement names one wallet W and one seal E. The fixed seven-line text is:

```text
LOANSHARK account binding v1
Chain ID: qorechain-diana
Wallet account: <W qor1>
Seal account: <E qor1>
Wallet EVM address: <W 0x>
Issued at: <YYYY-MM-DDTHH:MM:SSZ>
Expires at: <YYYY-MM-DDTHH:MM:SSZ>
```

Step 8 ships the statement text builder, E's countersignature and the verifier as library code, but
no owner-run command that produces or verifies a statement. Do not invent one and do not sign a
statement by hand.

- [ ] W signs the exact text with QoreX `signArbitrary`, after the fields are produced by the library
      and checked. Record the raw response: OWNER-SUPPLIED.
- [ ] E countersigns with QoreSign `signMessage` through the library. This requires a tool that does
      not exist yet, so it remains **NOT PRODUCED** in Step 8. OWNER-SUPPLIED if later produced.
- [ ] The verifier reports `ok: true`. **NOT RUN** in Step 8.

Record one row per party pair:

| Field | Borrower W/E OWNER-SUPPLIED | Lender W/E OWNER-SUPPLIED |
|---|---|---|
| W `qor1` address | OWNER-SUPPLIED | OWNER-SUPPLIED |
| W EVM `0x` address | OWNER-SUPPLIED | OWNER-SUPPLIED |
| E `qor1` address | OWNER-SUPPLIED | OWNER-SUPPLIED |
| Statement `issuedAt` | OWNER-SUPPLIED | OWNER-SUPPLIED |
| Statement `expiresAt` | OWNER-SUPPLIED | OWNER-SUPPLIED |
| W `signArbitrary` raw response | OWNER-SUPPLIED | OWNER-SUPPLIED |
| E countersignature | NOT PRODUCED | NOT PRODUCED |
| Verifier result | NOT RUN | NOT RUN |

The AAD and agreement encodings are frozen and unchanged (ADR-0007, ADR-0010). Whether envelopes
carry W or E addresses is a Step 9 item; do not change any envelope field now.

## Part H: hand-off back to the assistant

- [ ] All OWNER-SUPPLIED cells above are filled or marked NOT RUN / NOT PRODUCED.
- [ ] No phrase, seed, private key or `.env` content is in the pasted material.
- [ ] Report files, card JSON and explorer links are attached or pasted.
- [ ] The repository commit is recorded.

Keep the paper phrases offline. Do not store them in the repository, a cloud note or a screenshot.
