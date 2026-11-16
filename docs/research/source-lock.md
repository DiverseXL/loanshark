# Source lock

Every external technical claim, where it came from, and how it was confirmed. "Runtime" means observed on a running system. "Source" means read in a repository at the named commit. "Docs only" means stated but not yet checked against a running system. Last updated 2026-11-16.

| # | Claim | Source | Confirmed by |
|---|---|---|---|
| 1 | Diana chain ID is `qorechain-diana` | qorechain-sdk `17292973f865`; QoreSeal docs `bbd4dbbe8b98` | Source; consistent with the QoreX signing popup, which named it (runtime) |
| 2 | REST endpoint `https://api-testnet.qore.host` serves `/qorechain/pqc/v1/account/{addr}`, `/qorechain/pqc/v1/kem/{addr}` and `/cosmos/bank/v1beta1/balances/{addr}` | qorechain-sdk | Runtime, 2026-11-16 |
| 3 | EVM chain ID is 9800 (0x2648); mainnet 9801 | ethereum-lists/chains PR 8935 | Docs only. Not yet runtime-checked (M0-4) |
| 4 | EVM JSON-RPC `evm-testnet.qore.host`, consensus RPC `rpc-testnet.qore.host` | qorechain-sdk | Docs only |
| 5 | QoreX announces over EIP-6963 as `network.qore.qorex` | n/a | Runtime |
| 6 | QoreX `native.signArbitrary` returns `signatureType: ml-dsa-87-hybrid` with a secp256k1 part and a `pq` part | n/a | Runtime |
| 7 | The `pq` object carries no public key; the response also repeats classical-only `pub_key` and `signature` fields | n/a | Runtime |
| 8 | ML-DSA key registration is `MsgRegisterPQCKeyV2`, a classical-exempt bootstrap message; a second registration is refused after the fee is charged; one key per account | qorechain-sdk docs `17292973f865` | Source |
| 9 | QoreX registers the account's PQC key on the account's first transaction | wallet-adapter README `4ee2f45904ca` | Source; the account was unregistered, then registered after the user's first QoreX transaction (runtime, `evidence/phase-00-result.md`) |
| 10 | QoreX refuses `MsgRegisterPQCKey(V2)`, `MsgRegisterKEMKey`, `MsgRemoveKEMKey`, `MsgOpenEVMWindow` and related account-authority messages from dApps | wallet-adapter source `4ee2f45904ca` | Source. Not tested against QoreX itself |
| 11 | QoreSeal 0.1.0: hybrid default, mlkem explicit; envelopes not signed; `aad` is an input and is not stored; a multi-recipient envelope's recipient can craft a variant for the others | QoreSeal README and spec `bbd4dbbe8b98` | Source |
| 12 | A recipient card is verified against the account's on-chain ML-DSA key and the SHA3-256 of its on-chain KEM key | QoreSeal `crates/qoreseal/src/card.rs` | Source |
| 13 | The QoreSeal TypeScript package is not on npm yet; build from `packages/ts` | QoreSeal README | Docs only |
| 14 | The QoreSeal Rust crate is offline only; network helpers exist for TypeScript and Go; no WASM target in the repository | QoreSeal README and Cargo manifests | Source |
| 15 | QoreSeal key registry (`MsgRegisterKEMKey`) is available on testnet | QoreSeal README | Docs only. The account's KEM lookup returned `found:false` (runtime) |
| 16 | Hackathon rules, deadline, required licence | n/a | NOT CONFIRMED. Link needed |
| 17 | The official TypeScript verifier is `@qorechain/qoresign` 0.2.0 (repository `qorechain/qoresign`, package directory `packages/ts`, published on npm with integrity `sha512-bOhFn/Xb5SQbDrOccYa0sKsh7Ds07qyeUd3JrqjqqRyx8sUOgu8HeOYV2tWR+7hVeHKhWaTY6oGEnEax+JeVcQ==`). Its message entry point is `verifyMessage(args: { chainId: string; signer: string; data: Uint8Array \| string; signature: MessageSignature; pqPublicKey?: Uint8Array; requirePq?: boolean }): void`. It returns nothing and throws `QoreSignError` with a stable `code` on failure. | npm tarball of `@qorechain/qoresign@0.2.0`; repository tag `v0.2.0` | Source: read `packages/ts/src/message.ts` and its generated `.d.ts` at commit `d146c7167a9afa5e94ee4a734bb44f842a2b4a0b`, the commit the `v0.2.0` tag points at. The package is on npm, so this project depends on `0.2.0` exactly rather than on a git dependency. |
| 18 | Message signing v1: the ML-DSA-87 part signs `UTF-8("qorechain-msg-v1|" + chain_id + "|") \|\| data`, where `data` is the raw message bytes and the ML-DSA context is empty. The classical part is ADR-36 over the amino document `{"account_number":"0","chain_id":"","fee":{"amount":[],"gas":"0"},"memo":"","msgs":[{"type":"sign/MsgSignData","value":{"data":"<base64 data>","signer":"<qor1 signer>"}}],"sequence":"0"}`, as 64 bytes `r \|\| s` low-S, over a SHA-256 digest for `secp256k1` accounts and KECCAK-256 for `eth_secp256k1` accounts. | `spec/message-signing-v1.md` and `packages/ts/src/siwq.ts` at `d146c7167a9afa5e94ee4a734bb44f842a2b4a0b` | Source. The prompt's summary of the bytes was checked against the spec and the implementation rather than taken on trust. |
| 19 | `verifyMessage` refuses a signature with no `pq` part unless `requirePq` is explicitly false (`PQ_LAYER_MISSING`), refuses to run without `pqPublicKey` (`KEY_NOT_REGISTERED`), derives the signer from `signature.classical.publicKey` and requires its `classical.keyType` to match, and reads no top-level `pub_key` or `signature` field. Extra fields on the response object are ignored. | `packages/ts/src/message.ts` at `d146c7167a9afa5e94ee4a734bb44f842a2b4a0b` | Source. |
| 20 | The on-chain account record's `public_key` is the base64 ML-DSA-87 public key (decodes to 2592 bytes) and `ecdsa_pubkey` is the base64 compressed secp256k1 key (decodes to 33 bytes). `algorithm_id` 1 is named `dilithium5` on chain. | Runtime, `fixtures/onchain-account-qor1385.json` | Runtime, 2026-11-16, block height 10194644. Lengths decoded from the saved fixture. |

## Mismatches and discarded material

- A pasted third-party summary said a web app can have the wallet register the ML-DSA key and sign `MsgRegisterPQCKey`. It cites no primary source and contradicts claim 10. Discarded.
