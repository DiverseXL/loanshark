# ADR-0005: Where decryption keys live

Status: Accepted in principle, 2026-11-19, **pending owner-run evidence**. Persistence is **deferred**
and is not implemented in Step 8.

Context: QoreX exposes no seal-key derivation or decrypt method (probe, Phase 0). The brief forbids
server-side keys and asking users for seed phrases. ADR-0004 now makes the encryption identity a
separate mnemonic-backed seal account E.

Decision for Step 8: the app generates E's BIP-39 mnemonic in the browser with the pinned
`@scure/bip39` 2.4.0 generator, shows it exactly once for backup, and keeps it in memory only for the
life of the page. It is never sent to a server, never written to storage, never placed in a URL, and
never logged. The same rule applies to the derived classical, ML-DSA-87 and seal key material. The
public data (address, public keys, key hashes, signed card) may be shown and copied.

The browser panel requires an explicit "I have saved it" confirmation before it uses the identity.
After confirmation the mnemonic display is cleared; the identity object keeps the secret in private
fields for signing and opening in the same page session. Reloading the page loses it. The owner-run
script takes the mnemonic from `LOANSHARK_SEAL_MNEMONIC` and never writes it to disk, logs, errors or
output.

**Deferred: persistence with encryption at rest.** This step stores nothing. A later step must design
and review local persistence before any product use. The options to evaluate, with the threat each
leaves open:

1. An encrypted record in IndexedDB, keyed by a user passphrase (PBKDF2, scrypt or Argon2id), with an
   explicit unlock screen. Leaves open offline guessing against the stored record and XSS while
   unlocked.
2. A non-extractable key in the Web Crypto API wrapping the seed, with the wrapped blob in
   IndexedDB. Leaves open XSS that asks the browser to unwrap and use the key while the page is open.
3. An OS or hardware keystore (passkey, secure enclave, hardware wallet). Not available from a web
   page on every target browser and not specified for QoreChain here.
4. No persistence: re-enter the mnemonic each session. Strongest against silent theft, weakest for
   usability and for backup discipline.

The deferred decision must also say how a lost key is detected and how the user rotates to a new seal
account, and must keep the rule that the server never holds the mnemonic or an unwrapped key.

Consequences: the key lives in browser memory in this step, which is weaker than wallet custody.
Loss of the mnemonic loses every envelope encrypted to that seal account; there is no recovery path
in this step. A compromised page, a malicious dependency or an XSS can read the mnemonic while it is
in memory. Both are stated in the UI and the README. The owner checklist warns that the seal mnemonic
must be newly generated and must never be the QoreX mnemonic.

Test required: T8, T13 and T29 in the threat model. Step 8 tests the memory-only behaviour with
static checks and a redaction test; they do not prove a browser is free of XSS.
