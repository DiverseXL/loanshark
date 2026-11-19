# Phase 8 source check: the seal-account path

Date: 2026-11-19. Status: **SOURCE CHECK ONLY. NO TRANSACTION WAS SENT OR SIGNED, AND NO MNEMONIC WAS USED.**

This file records what the official QoreChain repositories and the installed packages say about the
seal-account path. It is the evidence for Task 1 of Step 8. It does not prove that the path works on
Diana; only the owner-run checklist can show that.

## 1. Repository heads

Resolved on 2026-11-19 with `git ls-remote <repo> HEAD refs/heads/main`, then cloned at depth 1 into
`.tmp/` (ignored by Git) and read there.

| Repository | HEAD and `refs/heads/main` | Read at |
|---|---|---|
| `https://github.com/qorechain/qoreseal.git` | `bbd4dbbe8b987639be4f0b12084000e7da2272f4` | `examples/register-and-encrypt/index.mjs`, `docs/quickstart.md`, `packages/ts/src/{keys,card,registry,network}.ts` |
| `https://github.com/qorechain/qoresign.git` | `d146c7167a9afa5e94ee4a734bb44f842a2b4a0b` | `examples/register-and-send/index.mjs`, `packages/ts/src/{keys,registration,sign,network}.ts` |

Both heads equal the commits already recorded in `docs/research/source-lock.md` claims 17 and 22.
No file read below differs from the tagged source described there.

## 2. Installed versions

Read from `node_modules/.pnpm` and from each installed `package.json`:

| Package | Direct pin in this repository | Installed | Notes |
|---|---|---|---|
| `@qorechain/qoresign` | `0.2.0` | `0.2.0` | Direct dependency of `packages/chain-client`, `packages/qoreseal-adapter` and the new `packages/seal-account`. |
| `@qorechain/qoresign` (nested) | not ours | `0.1.0` | Installed because `@qorechain/qoreseal` 0.1.0 declares `@qorechain/qoresign: 0.1.0`. There are two copies. The card and registry code inside QoreSeal uses the 0.1.0 copy; this repository's direct signing and verification use 0.2.0. |
| `@qorechain/qoreseal` | `0.1.0` | `0.1.0` | The published Apache-2.0 release, source-lock claim 22. |
| `@qorechain/pqc` | transitive | `0.2.3` | Used by both QoreSign copies and by QoreSeal for ML-DSA-87 and ML-KEM-1024. |
| `@scure/bip39` | transitive before Step 8 | `2.4.0` | QoreSign uses `mnemonicToSeedSync` and `validateMnemonic`; it does not export a generator. Step 8 adds it as a direct dependency for `generateMnemonic`. |
| `@noble/hashes` | `2.4.0` | `2.4.0` | Already a direct dependency of the adapter; used for SHA3-256 key hashes. |

## 3. Named exports read from the installed packages

Command (run from `packages/qoreseal-adapter`, so the workspace resolution is the installed one):

```powershell
node --input-type=module -e "const s=await import('@qorechain/qoreseal'); ..."
```

Result: every requested name is a function. Each line below was printed by `typeof`.

| Name | Installed module path | Type |
|---|---|---|
| `deriveClassicalKey` | `@qorechain/qoresign` | function |
| `addressFromPublicKey` | `@qorechain/qoresign` | function |
| `deriveCanonicalPqKey` | `@qorechain/qoresign` | function |
| `signHybrid` | `@qorechain/qoresign` | function |
| `fetchPqKeyStatus` | `@qorechain/qoresign/network` | function |
| `simulateTx` | `@qorechain/qoresign/network` | function |
| `submitWithSignBytesFallback` | `@qorechain/qoresign/network` | function |
| `fetchAppliedPlanHeight` | `@qorechain/qoresign/network` | function |
| `deriveSealKeys` | `@qorechain/qoreseal` | function |
| `buildRegisterKemKeyMessage` | `@qorechain/qoreseal` | function |
| `describeKemRegistryError` | `@qorechain/qoreseal` | function |
| `signRecipientCard` | `@qorechain/qoreseal` | function |
| `sealToAddresses` | `@qorechain/qoreseal/network` | function |
| `fetchKemKey` | `@qorechain/qoreseal/network` | function |
| `open` | `@qorechain/qoreseal` | function |

The complete export lists printed by the same run:

```text
@qorechain/qoresign (70): ACCOUNT_PREFIX, ALGORITHM_ML_DSA_87, CANONICAL_DERIVATION_DOMAIN,
CLASSICAL_PATHS, HD_MASTER_KEY, LANE_SUPPORT, MESSAGE_PQ_DOMAIN, ML_DSA_87_PUBLIC_KEY_LENGTH,
ML_DSA_87_SECRET_KEY_LENGTH, ML_DSA_87_SEED_LENGTH, ML_DSA_87_SIGNATURE_LENGTH,
MSG_REGISTER_PQC_KEY_V2_TYPE_URL, PQC_HYBRID_TYPE_URL, PROOF_OF_POSSESSION_DOMAIN, QoreSignError,
RESERVED_PQ_DOMAINS, SIWQ_DEFAULT_MAX_AGE_SECONDS, SIWQ_PQ_DOMAIN, addressFromBytes,
addressFromPublicKey, adr36SignBytes, appendExtension, assertHybridLane, buildRegisterPqKeyMessage,
classicalKeyFromPrivate, classicalKeyTypeFor, classicalSign, classicalVerify, createSiwqMessage,
decideLane, decodeAny, decodePqcHybridSignature, decodeTxRaw, defaultHdPath, deriveCanonicalPqKey,
deriveClassicalKey, deriveHdPqKey, encodeAny, encodePqcHybridSignature, encodeSignDoc, encodeTxRaw,
evaluateLayerState, fromBase64, fromHex, hybridSignBytes, isDegeneratePqPublicKey, isQoreSignError,
messagePqSignBytes, parseAddress, parseSiwqMessage, parseSiwqTimestamp, pqKeyFromSeed, pqSign,
pqVerify, pqcLayers, proofOfPossessionMessage, signHybrid, signMessage, signPqLayer,
signProofOfPossession, signSiwq, siwqPqSignBytes, stripExtension, toBase64, toHex, verifyHybridTx,
verifyMessage, verifyPqLayer, verifyProofOfPossession, verifySiwq

@qorechain/qoresign/network (20): HYBRID_VERIFY_GAS, LEGACY_GAS_MULTIPLIER_PERCENT,
PROTOCOL_FEATURES_PATH, SIGN_BYTES_V2_FEATURE, assertPqLayerMatchesRegisteredKey, broadcastTx,
fetchAppliedPlanHeight, fetchCommittedExtensionTypeUrls, fetchEvmWindow, fetchPqKeyStatus,
fetchProtocolFeature, hasExactSimulation, inspectTransaction, isSignBytesRefusal,
resolveSignBytesVersion, simulateTx, submitWithSignBytesFallback, suggestGasLimit,
verifyMessageWithChain, verifySiwqWithChain

@qorechain/qoreseal (64): ALGORITHM_ML_KEM_1024, ENTRY_LENGTH, ENVELOPE_TEXT_PREFIX,
ENVELOPE_VERSION, EpochKeyManager, HYBRID_LABEL, KDF_INFO_PREFIX, KEM_REGISTRY_ERRORS,
MAX_RECIPIENTS, ML_KEM_1024_CIPHERTEXT_LENGTH, ML_KEM_1024_PUBLIC_KEY_LENGTH,
ML_KEM_1024_SECRET_KEY_LENGTH, MSG_REGISTER_KEM_KEY_TYPE_URL, MSG_REMOVE_KEM_KEY_TYPE_URL,
PrivateBatchCodec, QoreSealError, RECIPIENT_CARD_TITLE, RECIPIENT_CARD_VERSION, SEED_LENGTH,
X25519_KEY_LENGTH, assembleRecipientCard, batchPlaintextCommitment, batchSize,
buildRegisterKemKeyMessage, buildRemoveKemKeyMessage, decodeEpochKey, deriveKey, deriveSealKeys,
describeKemRegistryError, encodeEpochKey, envelopeFromText, envelopeSize, envelopeToText,
fromBase64Url, fromHex, generateSealKeys, hybridSharedSecret, isQoreSealError, kdfInfo,
mlkemDecapsulate, mlkemEncapsulate, open, openBatch, openEpochKey, parseBatchHeader, parseEnvelope,
recipientCardFields, recipientCardSignBytes, recipientCardText, recipientHint, recipientOf, seal,
sealBatch, sealEpochKey, sealKeysFromSeed, sealSeedFromMnemonic, signRecipientCard, toBase64Url,
toHex, validateMlkemPublicKey, validateX25519PublicKey, verifyRecipientCard, x25519Agree,
x25519PublicKey

@qorechain/qoreseal/network (4): fetchKemKey, fetchMlkemPublicKey, resolveRecipient, sealToAddresses
```

The counts printed were 70, 20, 64 and 4 respectively.

## 4. The official register-and-encrypt flow

From `examples/register-and-encrypt/index.mjs` at `bbd4dbbe8b98`:

1. `deriveClassicalKey({ mnemonic })`, then
   `addressFromPublicKey(classical.publicKey, "secp256k1").bech32`.
2. `deriveCanonicalPqKey({ mnemonic, address })` and `deriveSealKeys({ mnemonic })` (index 0).
3. `fetchPqKeyStatus({ rest, address })`; if not registered, stop with "register the account's
   ML-DSA-87 key first (QoreSign)".
4. `fetchKemKey({ rest, address })`; if registered and equal to `sealKeys.mlkemPublicKey`, skip.
   Otherwise `buildRegisterKemKeyMessage({ sender, mlkemPublicKey })`, encode it in a `TxBody`, sign
   with `signHybrid` in the default hybrid mode, `simulateTx`, then
   `submitWithSignBytesFallback`.
5. `signRecipientCard({ chainId, address, keys, classicalKey, pqKey })`.
6. `sealToAddresses({ rest, chainId, purpose, recipients: [{ address, card }], plaintext })`.
7. `open({ chainId, purpose, envelope, keys })`.

The fee in the example is `(gas + 9n) / 10n` uqor, that is 0.1 uqor per gas. The submitted gas limit
comes from `simulateTx(...).suggestedGasLimit`; the 600000 used for the simulation probe is not the
submitted limit.

`docs/quickstart.md` at the same commit states the same prerequisites: Node.js 20 or later, a
`qorechain-diana` account with a little testnet QOR and a registered ML-DSA-87 key.

## 5. How a brand-new account registers its ML-DSA-87 key

Read from `examples/register-and-send/index.mjs` at `d146c716`. This is the example the
register-and-encrypt header refers to. **Not BLOCKED.**

1. The account must already exist on chain with a little testnet QOR. The example calls
   `GET /cosmos/auth/v1beta1/account_info/{address}` and throws
   `account not found: fund it from the testnet faucet first` when `info` is absent.
2. `buildRegisterPqKeyMessage({ chainId, account, pqKey, classicalPublicKey })` builds
   `/qorechain.pqc.v1.MsgRegisterPQCKeyV2` with a proof of possession over
   `qorechain-pqc-pop-v1|<chain-id>|<algorithm-id>|<qor1 account>|<hex public key>`.
3. The transaction carrying that message is signed with `signHybrid(..., mode: "classicalOnly")`
   and submitted after `simulateTx`. The source comment states that this bootstrap message is signed
   classically only.
4. After registration the example sends a normal `MsgSend` with `mode: "hybrid"`.

`packages/ts/src/registration.ts` at `d146c716` confirms that `buildRegisterPqKeyMessage` checks that
the supplied classical public key controls the account and refuses a degenerate ML-DSA-87 key.

## 6. What the support reply claims, checked against source

The reply is `docs/research/qorechain-support-reply-2026-11-17.md`. It is a lead, not evidence.

| Reply claim | Source result | Status |
|---|---|---|
| QoreX refuses `MsgRegisterKEMKey` and `MsgRemoveKEMKey` from a web page, including in `MsgExec` and authz | Wallet-adapter source at `4ee2f45904ca` lists both type URLs in `QOREX_REFUSED_TYPE_URLS` (source-lock claims 10 and 40). QoreX itself was not exercised. | CONFIRMED BY WALLET-ADAPTER SOURCE, NOT BY RUNTIME |
| QoreX has no screen for registering a KEM key today | No source found for the QoreX screen inventory. | NOT CONFIRMED |
| The supported path is QoreSeal together with QoreSign | Both examples and both package export lists above. | CONFIRMED |
| `deriveSealKeys({ mnemonic })` derives the ML-KEM-1024 and X25519 keys from the account mnemonic, so the mnemonic is their backup | `packages/ts/src/keys.ts` at `bbd4dbbe8b98` lines 66-80. | CONFIRMED |
| `buildRegisterKemKeyMessage(...)` builds the message and `signHybrid` signs it with secp256k1 plus ML-DSA-87 | `registry.ts` and the example. The chain's acceptance rule is stated in source comments and the example, not tested here. | CONFIRMED AS SOURCE AND EXAMPLE; CHAIN RULE UNTESTED |
| `signRecipientCard(...)` signs a card bound to the key on chain; `sealToAddresses` reads the key and checks the card | `card.ts` and `network.ts`; `verifyRecipientCard` compares the card's SHA3-256 with the registered ML-KEM key and verifies the message signature with `requirePq: true`. | CONFIRMED |
| The encryption identity is a separate account whose seed the app controls, not the QoreX account; register it during onboarding or with a one-time script | This is design advice. The source supports a separate mnemonic account; nothing requires it to differ from the QoreX mnemonic. | CONSISTENT, NOT A CHAIN RULE |
| A dApp sends `eth_sendTransaction`, a deploy or `eth_signTypedData_v4`, and QoreX opens an EVM window scoped to the transaction when needed | Nothing in the two repositories read here implements or documents that behaviour. The wallet-adapter source refuses `MsgOpenEVMWindow` from dApps (claim 40), which is consistent with the reply but does not prove the described window prompt. `@qorechain/qoresign` has only the read-only `fetchEvmWindow`/`inspectTransaction` helpers. | **NOT CONFIRMED** |

The EVM-window behaviour is **NOT CONFIRMED BY SOURCE**. This step does not rely on it: the seal
account onboarding uses native-lane REST transactions, and no EVM window is opened.

## 7. Consequences recorded in the source lock

- Claims 57 to 65 are added to `docs/research/source-lock.md` for this check.
- `deriveSealKeys` is address-independent: it takes only the mnemonic, passphrase and index, while
  `deriveCanonicalPqKey` is bound to the account address. Both are derived from the same mnemonic,
  which is why one backup phrase covers the seal account.
- The official packages export no mnemonic generator. Step 8 uses `@scure/bip39` 2.4.0, already
  installed transitively by QoreSign, pinned directly.
- `signHybrid` signs transaction bytes and requires an account number, body bytes and auth-info
  bytes. It cannot sign a free-standing statement. The message-signing counterpart is
  `signMessage`, which produces the hybrid `MessageSignature` that `verifyHybridMessage` checks.
