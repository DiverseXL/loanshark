# @loanshark/qoreseal-adapter

A typed, offline wrapper around the official `@qorechain/qoreseal` package (pinned
`0.1.0`) plus this project's context binding and signed envelopes.

No cryptography is implemented here. Sealing, opening, key derivation and
signature primitives come from the pinned official packages
(`@qorechain/qoreseal`, `@qorechain/qoresign`, `@noble/hashes`).

## Offline only

- The main entry (`@loanshark/qoreseal-adapter`) imports no network module.
  QoreSeal's REST helpers live at `@qorechain/qoreseal/network` and are not
  re-exported or imported by the runtime modules.
- Nothing here reads or writes files, environment variables or a database.
- No function logs plaintext, keys, seeds or signatures.
- Keys and plaintext exist in memory only. The caller owns their lifetime.

A static test checks the import graph and a runtime test checks that operations
produce no console output. See `test/hygiene.test.ts`.

## Why `mlkem` mode only

`sealMlkemToRecipient` always passes `mode: "mlkem"`. Hybrid mode needs a
recipient card verified against an ML-KEM key registered on chain, and the path
for a web-app user to register one is BLOCKED: QoreX refuses
`MsgRegisterKEMKey` from dApps, and the account's KEM lookup returns
`found: false`. See `docs/adr/0004-key-binding-and-mode.md` and source-lock
claims 10 and 15. Hybrid mode is not exposed until that path exists.

## Surface

- `sealMlkemToRecipient(input)` seals to exactly one recipient in explicit
  mlkem mode. Accepts the recipient's ML-KEM-1024 public key, the plaintext and
  the AAD bytes. Returns the binary envelope and its text form, or a typed
  failure.
- `openEnvelope(input)` opens with a `SealKeyPair` and the same AAD. Returns
  the plaintext or a typed failure (`not-a-recipient`, `decryption-failed`,
  `malformed-envelope`, `invalid-input`, `qoreseal-error`).
- `encodeAad(context)` and `aadHex(context)` produce the canonical context
  bytes defined in `docs/adr/0007-aad-encoding.md`.
- `signEnvelope`, `verifySignedEnvelope`, `signedEnvelopeMessage` implement the
  domain-tagged signed envelope of `docs/adr/0003-envelope-authentication.md`.
  Verification delegates to `verifyHybridMessage` with the post-quantum part
  required and the key read from an injected account client.

## Test-only module

`@loanshark/qoreseal-adapter/testing` is TEST ONLY. It generates a throwaway
identity from the OS CSPRNG, exposes a signer built on the official QoreSign
`signMessage`, a classical-only signer for a negative control, and a MOCK
account client. It returns secret key material by design, which is why it is a
separate entry point and is not exported from the main entry. Nothing in it
may be used by the app or the API.

## Tests

```powershell
pnpm test
pnpm -C packages/qoreseal-adapter typecheck
```

The suite includes the upstream QoreSeal vectors from
`fixtures/qoreseal-vectors-v1.json`, all offline. Tests that use a mocked
account client or mocked registry are labelled MOCK in the file and in their
names.
