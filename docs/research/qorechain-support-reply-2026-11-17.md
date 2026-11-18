# QoreChain team reply (Discord support ticket) - UNVERIFIED LEAD

Source: QoreChain Discord support, in answer to the owner's question of 2026-11-17 about registering an ML-KEM key and opening an EVM window from a web app. The date the reply arrived was not recorded; the file is named for the date of the question. This is staff advice, not primary evidence: every claim must be checked against source before it is relied on. Saved exactly as received.

---

Good questions. Both refusals are on purpose, and each one has a supported path.

1) Registering the ML-KEM key

QoreX refuses MsgRegisterKEMKey and MsgRemoveKEMKey from any web page, even inside MsgExec or an authz grant. Whoever replaces an account's ML-KEM key can read everything encrypted to that account from then on, so a page must never be able to swap it. QoreX has no screen for registering a KEM key today.

The supported path is QoreSeal (@qorechain/qoreseal) together with QoreSign (@qorechain/qoresign):
- deriveSealKeys({ mnemonic }) derives the ML-KEM-1024 and X25519 keys from the account's mnemonic, so the mnemonic is also their backup
- buildRegisterKemKeyMessage(...) builds the message, and you sign it with signHybrid (secp256k1 + ML-DSA-87). The chain accepts it only with a valid hybrid signature, which gives you the ML-DSA binding
- signRecipientCard(...) signs a card with the X25519 key, bound to the key on chain. Senders use sealToAddresses, which reads the key from the chain and checks the card before encrypting

For a web app, this means the user's encryption identity is an account whose seed your app (or the user's own tooling) controls on the client side. It is not the QoreX account. Register it during your app's onboarding or with a small one-time script. The seed never leaves the user's device.

Quickstart (register, encrypt, decrypt in about 10 minutes):
https://github.com/qorechain/qoreseal/blob/main/docs/quickstart.md
Runnable example: examples/register-and-encrypt in the same repo

2) Opening an EVM window from a dApp

Your dApp never sends MsgOpenEVMWindow. It sends the EVM transaction as usual (eth_sendTransaction, a deploy, or a permit through eth_signTypedData_v4), and QoreX handles the window:
- if the account's live window already covers the transaction, QoreX signs it
- if not, the approval screen says so and offers to open a small window scoped to that transaction (recipient, value, number of txs). The user approves both in one step
- users can also open or close a window themselves from the EVM window card in QoreX

If your users bring their own keys (scripts, Foundry, a backend), they open the window themselves with the SDK, signed with both keys. That is what "pnpm window:scoped" does in our Workshop 2 example:
https://github.com/qorechain/build-before-qday/tree/main/workshop-2/01-qday-vault

The rule behind both answers: anything that changes who can spend from an account, or who can read what is sent to it, is signed only from the wallet's own screens or with the user's own keys, never by a web page.
