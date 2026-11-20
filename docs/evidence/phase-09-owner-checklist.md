# Phase 9 owner checklist: a real W/E binding statement

Prepared 2026-11-20. Every result cell below is BLANK and marked OWNER-SUPPLIED.
The assistant has not created a seal account, has not signed anything and has not
sent a transaction.

Status: NOT PRODUCED. Step 9 shipped the binding producer and verifier as library
code (`packages/relay-client/src/binding-flow.ts`), not as a command. There is no
owner-runnable script and no panel button that asks QoreX for the W signature and
the seal account for the E countersignature, publishes the statement, fetches it
back and verifies it. Until that tool exists, C17 stays PENDING and no real
binding may be claimed anywhere in this repository.

## What must never be sent to the assistant

- Any word of a real phrase, in any order, in any form, for W or for E.
- The value of `LOANSHARK_SEAL_MNEMONIC` or a screenshot of it.
- QoreX's recovery phrase or private key, `.env` files, shell history, clipboard
  dumps, or a screenshot taken while the phrase is visible.

Safe to send: `qor1` and `0x` addresses, public keys and their hashes, the
statement JSON, the relay record id, and HTTP responses that contain no phrase.

## What the tool must do before this checklist can be run

The owner-run tool does not exist yet. When it is built (Step 10 or later), it
must run in the browser, not in the assistant's shell, so that no phrase leaves
the owner's machine and the QoreX prompt is the owner's own:

- [ ] Build the ADR-0014 statement fields for W and E.
- [ ] Ask QoreX for W's `signArbitrary` signature over the statement bytes
      (queued, one prompt, the exact text shown).
- [ ] Ask the unlocked seal account for E's countersignature.
- [ ] Publish through the relay client and show the content-addressed record id.
- [ ] Fetch it back and verify both post-quantum signatures against the on-chain
      ML-DSA-87 keys before showing "verified".

## Run record

| Field | Result |
|---|---|
| Date and time (UTC) | OWNER-SUPPLIED |
| Repository commit (`git rev-parse HEAD`) | OWNER-SUPPLIED |
| W `qor1` address | OWNER-SUPPLIED |
| W `0x` address shown by QoreX | OWNER-SUPPLIED |
| E `qor1` address | OWNER-SUPPLIED |
| Statement text as shown in the QoreX prompt | OWNER-SUPPLIED |
| QoreX prompt: one prompt, exact text, no retry | OWNER-SUPPLIED |
| Test relay base URL (loopback) | OWNER-SUPPLIED |
| Relay record id (content address) | OWNER-SUPPLIED |
| Fetch-back verification result | OWNER-SUPPLIED |
| Expired statement refused (re-run with a past expiry) | OWNER-SUPPLIED |
| Statement with E's address substituted refused | OWNER-SUPPLIED |
| Anything that surprised you | OWNER-SUPPLIED |

A blank cell is evidence of a missing step, not of a passing one. Do not fill a
cell with an expected value; paste only what the tool and QoreX returned.
