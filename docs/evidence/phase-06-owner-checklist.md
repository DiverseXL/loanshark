# Phase 6 owner checklist: Diana deployment

Date prepared: 2026-11-18. This is a checklist for the owner. The assistant has not deployed anything, has not sent a transaction and has not signed anything. Every result field below is blank and marked OWNER-SUPPLIED. Do not fill any field with an expected value; paste only what the wallet, the panel and the verifier return.

Contract decision: ADR-0013 Option A. `LoanSettlement` allows exactly two tokens: the `TestUSD` deployed in step 3 and the fest fUSD at `0x97143B771D34ddb9130b807b135Ae675A5a963CA`.

## Before starting

- [ ] QoreX is installed or the page is opened in the QoreX app browser.
- [ ] The wallet is on QoreChain Diana: native `qorechain-diana`, EVM `0x2648` (9800).
- [ ] The EVM account has enough test QOR for gas. The exact gas cost is not known before the estimate; the panel shows `eth_estimateGas` first.
- [ ] The repository is at the commit that contains this checklist: OWNER-SUPPLIED (`git rev-parse HEAD`).
- [ ] No mainnet network is selected in the wallet.

## Start the app (PowerShell)

```powershell
Set-Location C:\path\to\loanshark
pnpm install
pnpm --filter @loanshark/web build
pnpm --filter @loanshark/web preview
```

Open the URL printed by `vite preview` (default `http://localhost:4173`). The production build is used so the meta-tag CSP applies.

## Step 1: open the panel

- [ ] Read the visible "TESTNET DEPLOYMENT WARNING".
- [ ] Press "I understand the warning: open the testnet deployment panel".
- [ ] Confirm the chain guard shows READY for `qorechain-diana` and `0x2648`.
- [ ] Record the connected EVM account shown above the buttons: OWNER-SUPPLIED.

If the guard is not READY, stop. The buttons stay disabled and no deployment can start.

## Step 2: EVM lane check (do this first)

- [ ] Press exactly one button: **"EVM lane check: send 0 value to my own address"**.
- [ ] Confirm the wallet shows: value 0, recipient = the connected EVM account.
- [ ] Record the result:

| Field | OWNER-SUPPLIED result |
|---|---|
| `eth_estimateGas` shown by the panel | OWNER-SUPPLIED |
| Transaction hash | OWNER-SUPPLIED |
| Block number | OWNER-SUPPLIED |
| Receipt status (must be 0x1) | OWNER-SUPPLIED |
| Exact wallet message (success text or rejection text) | OWNER-SUPPLIED |

**STOP RULE: if button 1 is rejected, STOP. Do not press any deployment button. Copy the exact error text from the panel (including any message about an authorization window) and send it to the assistant before attempting anything else.** A rejection is not retried automatically. Do not interpret, shorten or reword it.

If the panel shows UNCONFIRMED - TIMEOUT, the transaction may still be mined. Do not press the button again. Find the hash on the explorer and report the exact state.

## Step 3: deploy TestUSD

Only enabled after step 2 is CONFIRMED.

- [ ] Press exactly one button: **"Deploy TestUSD"**.
- [ ] Confirm the constructor argument shown is the connected EVM account (the owner).
- [ ] Record:

| Field | OWNER-SUPPLIED result |
|---|---|
| `eth_estimateGas` | OWNER-SUPPLIED |
| Transaction hash | OWNER-SUPPLIED |
| Deployed TestUSD address | OWNER-SUPPLIED |
| Block number | OWNER-SUPPLIED |
| Receipt status (must be 0x1) | OWNER-SUPPLIED |
| Exact error, if any | OWNER-SUPPLIED |

## Step 4: deploy LoanSettlement

Only enabled after step 3 is CONFIRMED and a TestUSD address is shown.

- [ ] Press exactly one button: **"Deploy LoanSettlement"**.
- [ ] Confirm the panel shows the two constructor arguments in this order: TestUSD = the address from step 3, fUSD = `0x97143B771D34ddb9130b807b135Ae675A5a963CA`.
- [ ] Record:

| Field | OWNER-SUPPLIED result |
|---|---|
| `eth_estimateGas` | OWNER-SUPPLIED |
| Transaction hash | OWNER-SUPPLIED |
| Deployed LoanSettlement address | OWNER-SUPPLIED |
| Block number | OWNER-SUPPLIED |
| Receipt status (must be 0x1) | OWNER-SUPPLIED |
| Exact error, if any | OWNER-SUPPLIED |

## Step 5: mint 1000 tUSD (optional, owner-only)

Only enabled after step 4 is CONFIRMED and `owner()` of TestUSD equals the connected account.

- [ ] Confirm the panel shows amount 1000 tUSD (1,000,000,000 base units, 6 decimals) and recipient = the connected account.
- [ ] Press exactly one button: **"Mint 1000 tUSD to my account"**.
- [ ] Record:

| Field | OWNER-SUPPLIED result |
|---|---|
| `eth_estimateGas` | OWNER-SUPPLIED |
| Transaction hash | OWNER-SUPPLIED |
| Block number | OWNER-SUPPLIED |
| Receipt status (must be 0x1) | OWNER-SUPPLIED |
| Exact error, if any | OWNER-SUPPLIED |

## Step 6: copy the evidence JSON block

- [ ] Press **"Copy JSON block"**.
- [ ] Paste the block unedited into `docs/evidence/phase-06-owner-deploy.md` under "Owner-pasted JSON block".
- [ ] Do not type values by hand. If the block is missing a field, leave it as `null` and say so.

The JSON block contains the chain IDs, account, transaction hashes, deployed addresses, block numbers and receipt statuses. The panel writes it nowhere except the screen and the clipboard.

## Step 7: run the read-only verifier

Replace the three addresses with the values copied above. The verifier sends no transaction and asks for no key.

```powershell
Set-Location C:\path\to\loanshark
node scripts/verify-deployment.mjs `
  --testusd <TestUSD address from step 3> `
  --settlement <LoanSettlement address from step 4> `
  --owner <connected EVM account>
```

- [ ] Exit code and summary: OWNER-SUPPLIED.
- [ ] `docs/evidence/phase-06-verify.md` written by the script: OWNER-SUPPLIED (paste or commit the file the script produced).
- [ ] If the bytecode check reports a mismatch, copy the exact report line. Do not edit the script or weaken the check.

## Step 8: check on the explorer

The explorer is recorded from the organiser's start page as `https://explore.qore.network` (source-lock claim 54; docs only, not loaded in a browser by this project).

- [ ] Open `https://explore.qore.network`.
- [ ] Search each transaction hash from the JSON block.
- [ ] Confirm the status shown matches the receipt status in the block.
- [ ] Search each deployed address and record what the explorer calls it: OWNER-SUPPLIED.

## Final record

| Item | OWNER-SUPPLIED |
|---|---|
| Commit used for the run | OWNER-SUPPLIED |
| Browser and wallet version | OWNER-SUPPLIED |
| Date and time (UTC) | OWNER-SUPPLIED |
| Step 1 outcome | OWNER-SUPPLIED |
| TestUSD address | OWNER-SUPPLIED |
| LoanSettlement address | OWNER-SUPPLIED |
| Verifier result | OWNER-SUPPLIED |
| Explorer result | OWNER-SUPPLIED |

No deployment result is claimed anywhere in this repository until this checklist and the verifier output are filled in by the owner.
