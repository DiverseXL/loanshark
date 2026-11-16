# ADR-0003: Envelope authentication and context binding

Status: Proposed
Context: QoreSeal envelopes are not signed, and any recipient of a multi-recipient envelope can produce a different envelope for the other recipients (QoreSeal spec). Offers need attributable senders; the multi-lender request needs protection against a lender altering it for others.
Decision: Bind each envelope to its context through the QoreSeal `aad` input (canonical bytes of protocol label, chain ID, request ID, offer ID, borrower, lender, version). The sender signs a domain-tagged hash of the envelope plus context with QoreX `signArbitrary`. The verifier requires the post-quantum part and checks it against the sender's on-chain ML-DSA key. It ignores the top-level classical `pub_key` and `signature` fields and any public key carried in the response. The borrower signs the request; each lender verifies it.
Open: exactly which bytes `signArbitrary` signs, and whether QoreSign's verifier accepts the returned object unchanged. Resolved only by the verification spike (M0-3).
Consequences: Sign requests are queued, because QoreX handles one at a time.
Test required: C3, C4 and T5 to T7 in the threat model.
