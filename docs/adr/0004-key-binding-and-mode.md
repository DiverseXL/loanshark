# ADR-0004: Key binding, encryption mode and KEM key registration

Status: Accepted, 2026-11-19, **pending owner-run evidence**. This supersedes the BLOCKED status of
the Phase 2 version. No live registration has been performed by this repository or the assistant.

Context: "ML-DSA key binding" is the recipient card: the account signs its X25519 key and the
SHA3-256 of its registered ML-KEM key with its ML-DSA-87 key. `verify_recipient_card` checks both
against the chain. Hybrid mode needs the card; mlkem mode needs only the on-chain KEM key.

The wallet-adapter source says QoreX refuses `MsgRegisterKEMKey`, `MsgRegisterPQCKey(V2)` and
related account-authority messages from dApps (source-lock claims 10 and 40). The QoreChain support
reply of 2026-11-17 says the supported path is a separate account whose mnemonic the client controls,
with QoreSign and QoreSeal (source-lock claims 57 to 62). The source confirms every named call and
the order of use. It does not confirm the reply's claim that QoreX has no KEM screen, and it does not
confirm the EVM-window behaviour; neither is relied on here.

Decision: **hybrid mode with card verification stays the default.** The encryption identity is a
separate **seal account E**, not the QoreX wallet account W. E is a full QoreChain account derived
from its own BIP-39 mnemonic:

1. `deriveClassicalKey({ mnemonic })` and `addressFromPublicKey(..., "secp256k1").bech32` give E's
   `qor1` address.
2. `deriveCanonicalPqKey({ mnemonic, address })` gives E's ML-DSA-87 key.
3. `deriveSealKeys({ mnemonic })` gives E's ML-KEM-1024 and X25519 keys (index 0).
4. If E has no registered ML-DSA-87 key, the owner-run onboarding registers it with
   `buildRegisterPqKeyMessage` signed `classicalOnly`, after funding E with a small testnet QOR
   balance (source-lock claim 58).
5. `buildRegisterKemKeyMessage` is signed with `signHybrid` and submitted after simulation
   (source-lock claims 57 and 61).
6. `signRecipientCard` signs the card; senders use `sealToAddresses`, which reads both keys from the
   chain and verifies the card (source-lock claim 62).

`mlkem` mode remains an explicit fallback for a recipient with a registered KEM key but no card. It
is not the default and it does not carry the ML-DSA binding.

Why a separate account rather than the QoreX account:

- QoreX refuses the key-management messages, so the QoreX account cannot publish a KEM key through
  the app. The supported path needs a key the client can sign with, and that key must not be the
  wallet's spending key on a page.
- A separate account keeps the wallet's spending authority out of the browser's encryption path. A
  compromise of the seal mnemonic can decrypt envelopes and spend the small fee balance on E; it
  cannot move W's funds.
- The seal account is still a **full account**, not a key-only identity: its mnemonic controls
  classical and ML-DSA-87 keys that can sign native transactions. It must hold only the testnet QOR
  needed for its own registration and should not be funded beyond that. This is a consequence, not a
  claim that the account is harmless if leaked.

The binding between W and E is a signed statement, recorded in ADR-0014. It is not implied by
sharing a mnemonic; the owner checklist generates a fresh mnemonic and explicitly forbids reusing the
QoreX mnemonic.

What is still not proven:

- No seal account has been created on Diana by this repository. C13 and C14 are PENDING until the
  owner supplies evidence.
- The chain rule that `MsgRegisterKEMKey` is accepted only with a valid hybrid signature is stated in
  source comments and the official example, but was not exercised here (source-lock claim 61).
- The support reply's statement that a second registration replaces the key is a source comment, not
  a live test.
- QoreSeal 0.1.0 installs its own `@qorechain/qoresign` 0.1.0, so card signing runs on 0.1.0 while
  this repository's direct signing and verification run on 0.2.0 (source-lock claim 59). The shapes
  are compatible in the tested paths; that is a version-coupling risk, not a proof of equivalence.

Consequences: `packages/seal-account` builds the offline identity and card. The existing
`packages/qoreseal-adapter` keeps its mlkem-only surface until Step 9 rewires the product flow; this
step does not silently widen it. The owner-run script and the browser panel are the two paths to the
same derivation.

Test required: C13 and C14 in `docs/ACCEPTANCE_MATRIX.md`; T3 and T29 to T32 in the threat model.
