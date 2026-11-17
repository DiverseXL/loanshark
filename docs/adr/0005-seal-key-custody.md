# ADR-0005: Where decryption keys live

Status: Proposed
Context: QoreX exposes no seal-key derivation or decrypt method (probe, Phase 0). The brief forbids server-side keys and asking users for seed phrases.
Decision: The app generates a dedicated seal seed in the browser, stores it encrypted locally, shows a backup phrase once, and never transmits it. This is the "separate mnemonic" case in QoreSeal's key-backup guide. QoreX signs; the app encrypts and decrypts.
Consequences: The key lives in the browser, which is weaker than wallet custody. Loss of the key loses the data. Both are stated in the UI and the README.
Phase 2 note: the offline adapter stores nothing. Tests generate throwaway identities in memory from the OS CSPRNG and discard them; they are not a custody design and are never persisted. The browser flow above remains the plan and is not implemented.
Test required: T8, T13.
