# ADR-0016: Encrypted local storage for seal account (browser vault)

Status: Accepted, 2026-11-19

## Context

In Step 8 (ADR-0005), seal account E was generated and kept purely in browser memory. Reloading the page or closing the tab discarded the key material, requiring re-entry of the 24-word BIP-39 mnemonic. ADR-0005 deferred persistence with encryption at rest to Step 9.

The brief requires that:
- Secret keys and mnemonics are never sent to any server.
- Secret keys and mnemonics are never stored unencrypted.
- Any local persistence must be encrypted at rest behind a user-chosen passphrase.

## Decision

Persist the seal account in browser storage (IndexedDB or localStorage) encrypted at rest using native Web Crypto APIs:

1. **Key derivation function**:
   - `PBKDF2-HMAC-SHA256` via `crypto.subtle.deriveKey`.
   - Iteration count: 600,000 iterations (ASSUMPTION: chosen to meet the current OWASP recommendation for PBKDF2-HMAC-SHA256, providing substantial work factor against offline brute-force attacks while executing in acceptable time on consumer devices).
   - Salt: 32 cryptographically secure random bytes generated per write using `crypto.getRandomValues`.

2. **Rejected alternative: Argon2id via third-party library or WASM binary.**
   - Rejected because `crypto.subtle` (Web Crypto API) is natively supported by modern browsers without external dependencies.
   - Introducing a third-party Argon2 WASM/JS package increases bundle size, complicates CSP policies (e.g. `wasm-unsafe-eval`), introduces supply-chain dependencies, and requires licence review. Web Crypto PBKDF2 provides strong authenticated derivation entirely within browser-native primitives.

3. **Encryption scheme**:
   - `AES-256-GCM` authenticated encryption (`crypto.subtle.encrypt` / `decrypt`).
   - Initialization vector (nonce): 12 cryptographically secure random bytes per write using `crypto.getRandomValues`. Nonce reuse is prevented by generating a fresh nonce on every save.
   - Additional Authenticated Data (AAD): The vault format version and iteration count are authenticated as AAD to prevent parameter tampering.

4. **Stored record format**:
   The stored record contains only public parameters and ciphertext:
   ```json
   {
     "version": 1,
     "algorithm": "AES-GCM-256-PBKDF2-SHA256",
     "iterations": 600000,
     "salt": "<hex>",
     "iv": "<hex>",
     "ciphertext": "<hex>",
     "address": "<qor1...>",
     "updatedAt": "<ISO8601>"
   }
   ```
   No plaintext mnemonic words, secret keys, or passphrases ever appear in the stored record.

5. **Memory hygiene and lifecycle**:
   - The passphrase and decrypted mnemonic are never written to any persistent storage API.
   - **Inactivity auto-lock**: An inactivity timer (default 15 minutes of inactivity or explicit user lock) zeroes/drops in-memory decrypted keys and returns the vault to a locked state.
   - **Forget account action**: An explicit "Forget account" button deletes the encrypted record from browser storage and clears all in-memory keys.
   - **Explicit opt-in**: Nothing is persisted unless the user explicitly enters a passphrase and clicks "Save to encrypted vault".

## What this DOES NOT protect against (limitations)

Stated plainly:
1. **Compromised browser or operating system**: A keylogger, malicious extension, or malware running on the host machine can observe the passphrase or read memory while the vault is unlocked.
2. **Cross-Site Scripting (XSS)**: If an attacker executes arbitrary JavaScript in the application origin, they can access the Web Crypto API, extract in-memory keys while the vault is unlocked, or intercept the passphrase upon entry.
3. **Weak passphrase**: An attacker who obtains the encrypted blob from storage can perform offline dictionary or brute-force attacks. While 600,000 PBKDF2 iterations increase the cost, a short or predictable passphrase can still be cracked.
4. **Loss of passphrase and backup**: If the user forgets their passphrase and has not saved their 24-word mnemonic phrase offline, the seal account is permanently irrecoverable. There is no escrow, password reset, or backdoor.
