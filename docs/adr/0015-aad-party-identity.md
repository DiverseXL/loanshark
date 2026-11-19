# ADR-0015: AAD party fields and two-account binding

Status: Accepted, 2026-11-19

## Context

In ADR-0007, the canonical AAD encoding was defined and frozen as eight length-prefixed fields:
`protocol label`, `chain id`, `kind`, `request id`, `offer id`, `borrower`, `lender`, and `version`.
In ADR-0014, the two-account identity model was introduced:
- **Wallet account W** (managed by QoreX): holds test tokens, executes EVM transactions, and signs the agreement confirmation.
- **Seal account E** (app-held): publishes the ML-KEM-1024 encryption key, signs recipient cards, decrypts incoming envelopes, and signs envelope messages.

ADR-0014 noted as an open item for Step 9:
"Whether the AAD fields should carry W or E addresses, or both, is an open item for Step 9."

## Decision

The `borrower` and `lender` fields in the frozen AAD encoding carry the **WALLET (W)** `qor1` addresses.

1. **Party identity across the lifecycle**: W is the identity recognized by the agreement text (ADR-0010), the commitment hash (ADR-0010), and the on-chain settlement contract `LoanSettlement.sol` (ADR-0008, ADR-0013). Carrying W in the AAD ensures that the confidential request and offer envelopes cryptographically bind to the exact party identities that will fund, claim, and repay the loan.
2. **Envelopes are sealed to and signed by E**:
   - Envelopes are sealed to the counterparty's seal account E (specifically, to E's registered ML-KEM key identified by E's recipient card).
   - Envelopes are signed by the sender's seal account E using `signMessage` over the domain-tagged envelope and AAD digest (`loanshark/v1/envelope|<sha256(aad)>|<sha256(envelope)>`).
3. **Cryptographic link via ADR-0014 binding**:
   - E is linked to W through a dual-signed ADR-0014 binding statement.
   - When a client receives an envelope, it verifies:
     a. The envelope AAD context contains the expected wallet address W.
     b. The sender has a valid, non-expired ADR-0014 binding statement connecting W to seal account E.
     c. The envelope signature verifies against E's on-chain ML-DSA-87 key with the post-quantum part mandatory.

## Alternative considered and rejected

**Carrying E's `qor1` address in the AAD `borrower` and `lender` fields.**

Rejected because:
1. It separates the confidential negotiation layer from the on-chain settlement identity. The settlement contract only knows W (in its EVM address form), and the agreement confirmation is signed by W. If AAD carried E, an envelope could not be directly verified against the expected loan terms without an additional layer of indirection.
2. It would invalidate the existing frozen AAD vectors in `fixtures/aad-vectors.json` (ADR-0007), which were constructed using the primary party addresses.
3. If an adversary attempts to substitute E into the AAD fields of an envelope intended for W, the resulting AAD digest differs and decryption or verification against the expected context fails.

## Verifier requirement and test

The envelope verifier requires that the AAD contains the wallet account W. If an envelope's AAD context names the seal account E instead of W, verification against the expected context fails with a signature or AAD mismatch.

Test: `packages/qoreseal-adapter/test/signed-envelope.test.ts` includes an explicit test asserting that an envelope whose AAD names E instead of W is refused by the verifier.
