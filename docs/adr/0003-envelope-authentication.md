# ADR-0003: Envelope authentication and context binding

Status: Proposed, with the offline slice implemented in Phase 2
Context: QoreSeal envelopes are not signed, and any recipient of a multi-recipient envelope can produce a different envelope for the other recipients (QoreSeal spec). Offers need attributable senders; the multi-lender request needs protection against a lender altering it for others.
Decision: Bind each envelope to its context through the QoreSeal `aad` input (canonical bytes of protocol label, chain ID, request ID, offer ID, borrower, lender, version). The sender signs a domain-tagged hash of the envelope plus context with QoreX `signArbitrary`. The verifier requires the post-quantum part and checks it against the sender's on-chain ML-DSA key. It ignores the top-level classical `pub_key` and `signature` fields and any public key carried in the response. The borrower signs the request; each lender verifies it.
The bytes are confirmed from the specification and the implementation (source-lock claim 18): the ML-DSA-87 part signs `"qorechain-msg-v1|" + chainId + "|" + data` with an empty context, and the classical part is ADR-36 over the amino `MsgSignData` document with an empty `chain_id`, zero fee and zero sequence.

Resolved empirically (M0-3): a real QoreX `signArbitrary` response for `qorechain-diana`, saved as `fixtures/qorex-signarbitrary.json`, verifies against the ML-DSA-87 key in the on-chain account record with the post-quantum part required. The response was accepted unchanged, including its top-level `pub_key` and `signature` fields, and removing those two fields makes no difference. Four tampering controls were refused: PQ part removed (`PQ_LAYER_MISSING`), message changed by one character (`CLASSICAL_SIGNATURE_INVALID`), wrong chain ID (`PQ_SIGNATURE_INVALID`), different signer (`ADDRESS_MISMATCH`). Commands and unedited output are in `docs/evidence/phase-01-result.md`.

Implementation: `packages/chain-client/src/verify-hybrid-message.ts` exports `verifyHybridMessage`. It always sets `requirePq` and offers no way to relax it; it rebuilds the signature object from `classical.keyType`, `classical.publicKey`, `classical.signature`, `pq.algorithmId` and `pq.signature` only, so any other field on the response, including a key inside `pq`, cannot reach the verifier; and it takes the public key from that object's injected account client, never from the response. Failures come back as a discriminated result with a typed reason, not as exceptions. Unit tests are `packages/chain-client/test/verify-hybrid-message.test.ts` with a mocked client; `packages/chain-client/test/verify-hybrid-message.live.test.ts` reads the live account record and is skipped unless `LIVE_CHAIN=1`.

Remaining limitation: the message text is the string the user reported asking QoreX to sign. The verification passing against both signature parts is consistent with that but is not an independent capture of the bytes QoreX was given.

## Signed envelope (Phase 2)

Implementation: `packages/qoreseal-adapter/src/envelope.ts`.

A `SignedEnvelope` is the envelope bytes, the `EnvelopeContext` that produced its AAD, and the raw hybrid signature object. The signed message is the UTF-8 of:

```
loanshark/v1/envelope|<sha256-hex(aad bytes)>|<sha256-hex(envelope bytes)>
```

The domain tag starts with the protocol label from ADR-0007, so a signature cannot be replayed into another protocol that shares the chain and keys. The two hashes are fixed at 64 lowercase hex characters, so the separators are unambiguous.

ASSUMPTION (hash): SHA-256 is used rather than SHA3-256 or the QoreSeal card's SHA3-256. QoreSign already depends on SHA-256 for its ADR-36 document and on `@noble/hashes`, which supplies `sha256` without adding a new dependency. The choice is not a QoreChain rule and can be changed only with a new domain tag and new fixtures.

ASSUMPTION (string format): the digest is written as lowercase hex, not base64, because hex has a fixed length per field and no padding or alphabet variants. The tag is exactly `loanshark/v1/envelope`, not the QoreSign prefix: QoreSign adds `qorechain-msg-v1|<chain-id>|` itself when it signs.

The signer is fixed by the context: the borrower signs a request and the lender signs an offer (`expectedSigner`). Verification recomputes the message from the stored context and envelope, then calls `verifyHybridMessage` with `requirePq` always on and the ML-DSA-87 key from the injected account client. A changed context, a substituted envelope or a signature from another key therefore fails verification; it never falls back to a classical-only check.

The real QoreX signer is deferred to the browser step. Tests use a TEST-ONLY `MessageSigner` built on the official QoreSign 0.2.0 `signMessage` with a freshly generated throwaway classical and ML-DSA-87 key, and a MOCK account client that returns that public key. Those tests prove the module's wiring and its refusal paths, not that a key is registered on QoreChain.

Consequences: Sign requests are queued, because QoreX handles one at a time.
Test required: C3, C4 and T5 to T7 in the threat model. Tests exist for C3 and T5 to T7; C4 remains pending.
