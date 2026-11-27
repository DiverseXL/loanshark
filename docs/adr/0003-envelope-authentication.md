# ADR-0003: Envelope authentication and context binding

Status: Proposed, with the offline slice implemented in Phase 2
Context: QoreSeal envelopes are not signed, and any recipient of a multi-recipient envelope can produce a different envelope for the other recipients (QoreSeal spec). Offers need attributable senders; the multi-lender request needs protection against a lender altering it for others.
Decision: Bind each envelope to its context through the QoreSeal `aad` input (canonical bytes of protocol label, chain ID, request ID, offer ID, borrower, lender, version). The sender signs a domain-tagged hash of the envelope plus context with QoreX `signArbitrary`. The verifier requires the post-quantum part and checks it against the sender's on-chain ML-DSA key. It ignores the top-level classical `pub_key` and `signature` fields and any public key carried in the response. The borrower signs the request; each lender verifies it.
The bytes are confirmed from the specification and the implementation (source-lock claim 18): the ML-DSA-87 part signs `"qorechain-msg-v1|" + chainId + "|" + data` with an empty context, and the classical part is ADR-36 over the amino `MsgSignData` document with an empty `chain_id`, zero fee and zero sequence.

Resolved empirically (M0-3): a real QoreX `signArbitrary` response for `qorechain-diana`, saved as `fixtures/qorex-signarbitrary.json`, verifies against the ML-DSA-87 key in the on-chain account record with the post-quantum part required. The response was accepted unchanged, including its top-level `pub_key` and `signature` fields, and removing those two fields makes no difference. Four tampering controls were refused: PQ part removed (`PQ_LAYER_MISSING`), message changed by one character (`CLASSICAL_SIGNATURE_INVALID`), wrong chain ID (`PQ_SIGNATURE_INVALID`), different signer (`ADDRESS_MISMATCH`). Commands and unedited output are in `docs/evidence/phase-01-result.md`.

Step 11a repeated the check for the Ethereum (coin 60) account, whose response has `classical.keyType` `eth_secp256k1` rather than `secp256k1`. It verifies against that account's on-chain ML-DSA-87 key with the post-quantum part required, and the same four controls are refused with the same codes. What `eth_secp256k1` means for verification, from the pinned QoreSign 0.2.0 source: `classicalKeyTypeFor` derives BOTH the `secp256k1` (RIPEMD160(SHA256)) and the `eth_secp256k1` (KECCAK-256) address of the response's public key, requires one of them to equal the signer's 20 bytes, and requires the matched type to equal the response's `classical.keyType`; the classical digest is KECCAK-256 for this type. The classical check is therefore neither skipped nor unsupported, so "hybrid verified" for this response means the KECCAK-256 classical signature verified over the ADR-36 document AND the ML-DSA-87 signature verified against the on-chain key. The on-chain key is still taken only from the account record, never from the response. Evidence: `docs/evidence/phase-11a-result.md`; source-lock claims 66 and 69.

Implementation: `packages/chain-client/src/verify-hybrid-message.ts` exports `verifyHybridMessage`. It always sets `requirePq` and offers no way to relax it; it rebuilds the signature object from `classical.keyType`, `classical.publicKey`, `classical.signature`, `pq.algorithmId` and `pq.signature` only, so any other field on the response, including a key inside `pq`, cannot reach the verifier; and it takes the public key from that object's injected account client, never from the response. Failures come back as a discriminated result with a typed reason, not as exceptions. Unit tests are `packages/chain-client/test/verify-hybrid-message.test.ts` with a mocked client; `packages/chain-client/test/verify-hybrid-message.live.test.ts` reads the live account record and is skipped unless `LIVE_CHAIN=1`.

Remaining limitation: the message text is the string the user reported asking QoreX to sign. The verification passing against both signature parts is consistent with that but is not an independent capture of the bytes QoreX was given. This applies to both the coin-118 and the coin-60 fixture.

A second limitation for the coin-60 fixture: the classical `keyType` is part of the signed response, and QoreSign chooses the digest from it. A response that named `secp256k1` for an `eth_secp256k1` account would fail `classicalKeyTypeFor`, so the field is not a free choice, but it is still a field of the untrusted input. The post-quantum part, which is what makes the claim resistant to a classical-only forgery, is checked against the on-chain key regardless.

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
