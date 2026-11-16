# Phase 0 result: QoreX probe and account state

Date: 2026-11-16. Network: QoreChain Diana Testnet. Browser: Chrome with QoreX installed, page `https://qorechain.io`. These are observations copied from the owner's console and terminal. Long values are truncated with `...`. Nothing here was produced by a script in this repository.

## EIP-6963 providers announced
MetaMask (`io.metamask`), Phantom (`app.phantom`), QoreX (`network.qore.qorex`), Nightly (`app.nightly`).

## QoreX surface
- EVM provider members: `isQoreX`, `request`, `on`, `removeListener`.
- `window.qorex` sub-objects: `evm`, `native`, `svm`.
- `native` members read from the console: `capabilities`, `connectProof`, `enable`, `executeRequest`, `experimentalSuggestChain`, `getKey`, `getOfflineSigner`, `getOfflineSignerAuto`, `getOfflineSignerOnlyAmino`, `getOfflineSignerOnlyDirect`, `isQoreX`, `listAccounts`, `signAmino`, `signAndBroadcast`, `signArbitrary`, `signDirect`, `verifyArbitrary`. The console reported a count of 18; one name may not have been legible in the screenshot.
- `svm` members: `connect`, `isQoreX`, `signAndSendTransaction`, `signMessage`.
- `native.capabilities`: `listAccounts`, `connectProofPicksAccount`, `executeRequest`, `signAndBroadcast`, `signDirectAddsPqcLayer`, `signArbitrary`.
- `getKey` fields: `name`, `algo`, `pubKey`, `address`, `bech32Address`, `pubKeyHex`, `isNanoLedger`.

## signArbitrary on qorechain-diana
Signer `qor1385wkhky3qkjwq47t8904xrd6s82lmkfjnxxsr`, message "LOANSHARK test message, no funds". The QoreX popup stated that signing moves no funds. Result:
- `signatureType`: `ml-dsa-87-hybrid`
- `classical`: `keyType` secp256k1, `publicKey` `A9nsLHbDwo8E...`, `signature` `gn6FvzA5TjiQ...`
- `pq`: `algorithmId` 1, `signature` `AXjB7UOB9lSo...` (about 4.6 KB, truncated)
- top-level `pub_key` and `signature`: the classical values repeated.
- Not yet verified: that the signature is valid, and which exact bytes were signed.

## On-chain state (REST, `api-testnet.qore.host`)
Before the owner's first QoreX transaction: `/pqc/v1/account` `found:false`; `/pqc/v1/kem` `found:false`.
Balances: 99,850,000 `uqor` and three `erc20:0x...` denominations (`0x0229...1c28`, `0x4604...451A`, `0x9714...63CA`), unidentified.
After: `/pqc/v1/account` `found:true`, `algorithm_id` 1, `algorithm_name` dilithium5, `key_type` hybrid, `created_at_height` 10193327, `possession_proven` true, `classical_key_source` auth_account, and an `ecdsa_pubkey` equal to the classical `publicKey` above. `/pqc/v1/kem` still `found:false`.

## Conclusion
M0-1 and M0-2 are DONE. M0-3 (verify the signature against the on-chain key), M0-4, M0-5, M0-6 and M0-7 remain open in `ACCEPTANCE_MATRIX.md`.
