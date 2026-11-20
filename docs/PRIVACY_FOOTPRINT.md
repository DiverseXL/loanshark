# Privacy footprint

What is private, what the relay sees and what is public on chain, per user
action. The typed source is `packages/privacy-footprint`; this document is
written from it and
`packages/privacy-footprint/test/footprint.test.ts` fails when the committed
contract ABI contains a function parameter or event field that is not classified.

This is a description, not a marketing claim. LOANSHARK has no anonymity, no
private transfers, no private matching and no confidential computation
(ADR-0018). Addresses, amounts, timing and sizes are public.

## Summary

| Layer | Sees |
|---|---|
| The user's browser | plaintext request, offer and agreement document; the seal account phrase while unlocked; the vault ciphertext otherwise |
| The relay server, when an action uses it | sender and recipient `qor1` addresses, `loanRef`, envelope or record size, record time, the client IP |
| The settlement chain | every calldata field, every event field, addresses, amounts and block timestamps for every settlement action |
| Nobody in this design | a compute provider, an enclave operator or a matching engine, because none is used |

## Per action

### Create request

- Encrypted off-chain: the request document (amount, purpose, repayment plan,
  narrative) and any attached document, sealed to the lender's card.
- Relay sees: sender and recipient `qor1` addresses, the loan reference, the
  envelope size, the time, the client IP.
- Public on chain: nothing at this step.
- Not private: that a request exists between those two addresses, and the
  borrower's balance and history.

### Send offer

- Encrypted off-chain: the offer terms and any note, sealed to the borrower's
  card.
- Relay sees: sender and recipient `qor1` addresses, the loan reference, the
  envelope size, the time, the client IP.
- Public on chain: nothing at this step.
- Not private: that an offer was sent, by whom, to whom and when.

### Publish recipient card

- Encrypted off-chain: nothing; a card is public by design.
- Relay sees: the seal account (E) address, the payload size, the time, the
  client IP.
- Public on chain: nothing directly.
- Not private: E's address, its ML-DSA-87 public key and the SHA3-256 of its
  ML-KEM-1024 key, and the W/E link once a binding statement is published.

### Publish binding statement

- Encrypted off-chain: nothing; the statement is public by design.
- Relay sees: the wallet (W) address, the statement size, the time, the client
  IP.
- Public on chain: nothing directly.
- Not private: W and E addresses, W's EVM address form, both signatures and the
  validity window.

### Propose loan

- Encrypted off-chain: nothing on this action; the terms become public.
- Relay sees: nothing.
- Public on chain: `loanId` (the commitment over chain id, contract address and
  terms), borrower, lender and token addresses, principal, interest, due date,
  grace, funding and claim deadlines, the block timestamp and the sender.
- Not private: the whole economic agreement, because `Terms` is calldata and
  `LoanProposed` repeats it.

### Approve token

- Encrypted off-chain: nothing.
- Relay sees: nothing.
- Public on chain: owner, spender (the settlement contract) and the approved
  amount; the `Approval` event.
- Not private: the approval amount, which is why the preflight flags an unlimited
  approval.

### Fund, claim, repay, withdraw, cancel, refund

- Encrypted off-chain: nothing.
- Relay sees: nothing.
- Public on chain: `loanId`, the acting address, the amount where one moves, the
  matching ERC-20 `Transfer` event, and the block timestamp. `RepaymentMade` also
  publishes the remaining outstanding amount.
- Not private: who paid whom how much and when, and how much is still owed.

## Contract fields

Every function parameter and event field of `TestUSD` and `LoanSettlement` is
classified in `packages/privacy-footprint/src/contract-fields.ts` as
`public-calldata`, `public-event` or `public-view-result`. There is no
conversation-key field and no field classified as secret. The test reads the ABI
from `docs/deployments/manifest.json` and fails on an unclassified field or a
stale classification.

## What the preflight shows

`preflight(plan, config, deps)` returns, among its checks, the `publicFields`
list for the planned action, taken from this footprint. A caller can show the
user what the transaction will publish before they sign it.

## What is not claimed

- No anonymity, unlinkability or private transfers.
- No private matching: a loan has one borrower and one lender (ADR-0008
  decision 1).
- No confidential computation, FHE, MPC or zero-knowledge proof (ADR-0018).
- No hiding of amounts, addresses or timing from the chain.
- No claim that the relay cannot be observed or that its operator is trusted; it
  is trusted for delivery only, and every record is verified by the client.

## App panel follow-up

The privacy boundary panel in `apps/web` still renders the README claim table. It
does not yet render this per-action footprint. Wiring the typed data into that
panel is left for Step 10 and is recorded in the README limitations, because it
needs layout work in `App.tsx`, not a data import alone.
