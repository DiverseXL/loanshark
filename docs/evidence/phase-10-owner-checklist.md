# Step 10 owner checklist: live two-party negotiation

Status: NOT RUN. Every result field is OWNER-SUPPLIED and blank. The assistant
has not produced a live wallet signature, documented a real account, or recorded
a result. Nothing here sends a transaction.

This checklist exercises Setup, Borrower, Lender and the public confirmations on
one machine with two Chrome profiles. It needs two QoreX accounts, one per
profile, and both seal accounts registered on Diana by the owner-run onboarding
script.

## 0. Preconditions

| Item | Owner confirms |
|---|---|
| Step 10 committed and `git status` clean | OWNER-SUPPLIED |
| Node and pnpm versions follow `pnpm verify-env` | OWNER-SUPPLIED |
| Two QoreX accounts exist, one for the borrower and one for the lender | OWNER-SUPPLIED |
| Each has a `qor1` address and an EVM address readable by QoreX | OWNER-SUPPLIED |
| Each seal account E has ML-DSA-87 and ML-KEM-1024 registered on Diana | OWNER-SUPPLIED |
| The relay is reachable at `http://127.0.0.1:8787` | OWNER-SUPPLIED |

## 1. Start the local services

Run these in two terminals from the repository root. Build first so the relay
script and the app use the current packages.

```powershell
pnpm install --frozen-lockfile
pnpm build
pnpm relay
```

Expected relay output (do not edit it):

```text
LOANSHARK relay listening on http://127.0.0.1:8787
storage: in memory
stores ciphertext and public records only; verifies nothing; no transaction path
```

In the second terminal:

```powershell
pnpm --filter @loanshark/web dev
```

Open `http://127.0.0.1:5173` in each Chrome profile. The page is testnet only and
a banner says so.

## 2. Two Chrome profiles

1. Create profile A and profile B in Chrome (each has its own extensions and
   storage). Install or enable QoreX in both.
2. In profile A, sign in to the borrower QoreX account. In profile B, sign in to
   the lender QoreX account.
3. Keep a written note of which profile is which. A seal account generated in
   one profile is not available in the other.

## 3. Setup, in both profiles

Do this in profile A (borrower) first, then profile B (lender).

| Step | Borrower | Lender |
|---|---|---|
| Open Diagnostics and confirm both chain checks pass | OWNER-SUPPLIED | OWNER-SUPPLIED |
| Open Setup; confirm the wallet `qor1` and EVM addresses | OWNER-SUPPLIED | OWNER-SUPPLIED |
| Generate a 24-word seal account and write the phrase down offline | OWNER-SUPPLIED | OWNER-SUPPLIED |
| Optionally save the seal account to the encrypted vault | OWNER-SUPPLIED | OWNER-SUPPLIED |
| Click "Check ML-DSA-87 and ML-KEM registration"; both must be registered | OWNER-SUPPLIED | OWNER-SUPPLIED |
| Click "Publish recipient card"; record the relay `updatedAt` | OWNER-SUPPLIED | OWNER-SUPPLIED |
| Click "Sign and publish the W/E binding statement"; approve the QoreX prompt | OWNER-SUPPLIED | OWNER-SUPPLIED |
| Record the binding `issuedAt` and `expiry` | OWNER-SUPPLIED | OWNER-SUPPLIED |

If a key is not registered, stop. Run the owner onboarding script yourself, read
the transaction hash back, and only then continue. The app registers nothing.

## 4. Borrower: create and send the request

In profile A, Borrower tab.

1. Enter the lender's `qor1` wallet address from profile B.
2. Choose fUSD. Type a principal and a maximum total cost in human units; the
   preview shows base units.
3. Enter a latest due date in unix seconds, and a short note.
4. Click "Preview the exact payload". Record the full JSON.
5. Click "Seal, sign and send the request". Approve the QoreX prompt.
6. Record the envelope id the page shows and the relay log line's status.

| Field | Result |
|---|---|
| Request JSON (unedited) | OWNER-SUPPLIED |
| requestId | OWNER-SUPPLIED |
| Envelope id | OWNER-SUPPLIED |
| Relay log line | OWNER-SUPPLIED |
| QoreX prompt exact text | OWNER-SUPPLIED |

## 5. Lender: open the request and send an offer

In profile B, Lender tab.

1. Click "Refresh requests". Record the inbox item.
2. Click "Verify and open". If verification fails, record the REFUSED text and
   stop; do not send an offer.
3. Record the request JSON and the borrower EVM address from the verified
   binding.
4. Fill interest, due date, grace seconds, funding deadline, claim deadline and
   offer expiry. The claim deadline must be at least 3600 seconds after the
   funding deadline.
5. Click "Preview the exact offer payload", then "Seal, sign and send the offer".
   Approve the QoreX prompt.
6. Record the offer JSON, the salt, and the envelope id.

| Field | Result |
|---|---|
| Request opened and verified | OWNER-SUPPLIED |
| Borrower EVM address from the binding | OWNER-SUPPLIED |
| Offer JSON (unedited) | OWNER-SUPPLIED |
| salt | OWNER-SUPPLIED |
| Envelope id | OWNER-SUPPLIED |
| Evaluator result in the borrower profile | OWNER-SUPPLIED |

## 6. Borrower: evaluate and accept

In profile A, Borrower tab.

1. Click "Refresh offers". The page verifies the envelope; a failure shows
   REFUSED and must not be accepted.
2. Record every evaluator check with expected, actual and pass/fail.
3. If the offer is eligible and a settlement address is configured, click
   "Accept and sign the borrower confirmation" and approve the QoreX prompt.
   If the config says "not deployed", stop here and record that.
4. Record the canonical agreement text, agreement hash, loan id and the
   confirmation message.

| Field | Result |
|---|---|
| Evaluator checks (all rows) | OWNER-SUPPLIED |
| Canonical agreement text | OWNER-SUPPLIED |
| agreementHash | OWNER-SUPPLIED |
| loanId | OWNER-SUPPLIED |
| Confirmation message | OWNER-SUPPLIED |
| Published confirmation id | OWNER-SUPPLIED |

## 7. Lender: confirm

In profile B, Lender tab, after the offer was sent.

1. Click "Check confirmations". Record the borrower confirmation status.
2. Click "Sign and publish the lender confirmation". Approve the QoreX prompt.
3. Click "Check confirmations" again and record both roles verified.

| Field | Result |
|---|---|
| Borrower confirmation verified | OWNER-SUPPLIED |
| Lender confirmation id | OWNER-SUPPLIED |
| Both confirmations verified for the same loanId | OWNER-SUPPLIED |

## 8. Negative checks the owner can run locally

| Check | Expected | Result |
|---|---|---|
| Stop the relay, then click Refresh | `RelayUnavailable`, no data | OWNER-SUPPLIED |
| Point the borrower at a wallet with no binding | `CounterpartyNotOnboarded`, nothing sent | OWNER-SUPPLIED |
| Edit a relay record's ciphertext on disk and re-open | REFUSED, not displayed | OWNER-SUPPLIED |
| Try Accept on an offer over the maximum total cost | button disabled, reasons shown | OWNER-SUPPLIED |

## What this checklist does not prove

- It does not prove QoreX's EVM lane uses the key behind the recorded EVM
  address (ADR-0009 assumption).
- It does not prove the relay is unavailable to a network attacker; it binds to
  loopback and has no TLS.
- A two-profile run on one machine is not a claim that the parties are different
  people.
