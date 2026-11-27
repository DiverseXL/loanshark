# ADR-0009: The wallet account's EVM identity

Status: Accepted, 2026-11-27, superseding the 2026-11-17 derivation. The earlier
ASSUMPTION is REFUTED; the identity rule below is confirmed by a runtime
observation and by decoding both addresses. The evidence is in
`docs/evidence/phase-11a-result.md`.

## Context

QoreChain accounts have two lanes. A QoreChain (coin 118) account is a native
account whose `qor1` address is the RIPEMD160(SHA256(compressed secp256k1 key))
form of its key. An Ethereum (coin 60) account is a native account whose key is
`ethsecp256k1` and whose 20-byte address is the one QoreX reports on the EVM
lane. Settlement contracts identify parties by an EVM `address`.

The earlier version of this ADR derived an address from the first test account's
compressed `ecdsa_pubkey` with the standard Ethereum rule and assumed that this
derived `0xd0a1453c7b8157aa0635076c33b3e24a50a923c5` was that account's EVM
address. That was an ASSUMPTION with a documented owner check; the check has now
been run, and it failed.

## What the runtime shows

Owner-supplied, 2026-11-27, recorded verbatim in the evidence file:

1. With the coin-118 account `qor1385wkhky3qkjwq47t8904xrd6s82lmkfjnxxsr`
   active, QoreX refused `eth_sendTransaction` with code 4100, saying an account
   using the QoreChain (coin 118) key cannot send on the EVM lane and that an
   Ethereum (coin 60) account must be added.
2. With the coin-60 account active, `eth_accounts` returned
   `0xBDbE07400e9E07B4E0BBf795bC7ecd4E6028882c`, and native `getKey` reported
   `algo` `ethsecp256k1`, `bech32Address`
   `qor1hklqwsqwncrmfc9m772mclkdfesz3zpv4eykrn` and `pubKeyHex`
   `03e0ac74935c9a1a3d2cde81dbd884d9e95d8e9a355db0188b39decb60657d646c`.
3. `eth_accounts` returned the same EVM account in both cases: QoreX reports ONE
   EVM account regardless of which native account is active.

Computed in this repository, using `@scure/base` 2.4.0 bech32 and
`@noble/hashes` 2.4.0:

| Address | Bech32 payload (20 bytes) | Provider `eth_accounts[0]` |
|---|---|---|
| `qor1hklqwsqwncrmfc9m772mclkdfesz3zpv4eykrn` (coin 60) | `0xbdbe07400e9e07b4e0bbf795bc7ecd4e6028882c` | `0xBDbE07400e9E07B4E0BBf795bC7ecd4E6028882c` (equal, case ignored) |
| `qor1385wkhky3qkjwq47t8904xrd6s82lmkfjnxxsr` (coin 118) | `0x89e8eb5ec4882d2702be59cafa986dd40eafeec9` | not that account's account |

The old derived address equals neither payload. It is the Ethereum form of the
coin-118 account's `ecdsa_pubkey` only; it is not an identity on this network.

Two derivations were checked with QoreSign's own `addressFromPublicKey`
(`qoresign` `packages/ts/src/keys.ts`, pinned 0.2.0), not by hand:

| Key | `secp256k1` form | `eth_secp256k1` form |
|---|---|---|
| coin-60 `03e0ac...646c` | `68e345b2...a68a` | `0xBDbE07400e9E07B4E0BBf795bC7ecd4E6028882c` |
| coin-118 `03d9ec...acea` | `89e8eb5e...eec9` (its own payload) | `0xd0a1453c7b8157aa0635076c33b3e24a50a923c5` (the old derived address) |

So both account rules are now explained by source-locked derivations: a coin-118
address is RIPEMD160(SHA256(compressed key)), and the coin-60 address is the
`eth_secp256k1` form, which equals both the bech32 payload and the provider's EVM
address. The earlier error was not the derivation itself but treating the
coin-118 account's Ethereum-form address as an identity on the EVM lane. The old
`0xd0a1...` is exactly what the key derives; it simply is not the reported EVM
account, because QoreX reports the coin-60 account's address regardless.

ASSUMPTION kept deliberately: the app compares the decoded payload with
`eth_accounts[0]` and does not derive an EVM address from a public key. The
derivation now agrees on this account, but a comparison of the two values the
wallet reports cannot silently drift if the derivation changes.

## Decision

The wallet account W is the account whose native key's bech32 address decodes to
the same 20 bytes as the EVM account the provider reports.

- A coin-118 account has no EVM identity under QoreX. Its decoded bytes differ
  from the reported EVM account, and QoreX refuses its EVM transactions.
- QoreX reports one EVM account whatever the active native account is, so the
  comparison must be made against the ACTIVE native account's address and not
  against any remembered or derived address.
- If they differ, the app state is `ACCOUNT_MISMATCH` and every signing and
  sending action is blocked with the plain explanation that QoreX reports one
  EVM account regardless of the active account and that the user must switch to
  the Ethereum (coin 60) account.

Implementation:

- `packages/chain-client/src/bech32.ts` `evmAddressOfBech32` decodes the
  payload. It is pure, requires the lowercase canonical `qor1` form, verifies
  the bech32 checksum and requires exactly 20 bytes. Tests:
  `packages/chain-client/test/bech32.test.ts`.
- `apps/web/src/wallet/identity.ts` `evaluateAccountIdentity` compares the
  decoded bytes with `eth_accounts[0]`. Tests: `apps/web/test/identity.test.ts`.
- `QorexMessageSigner` takes the guard and refuses to sign unless it is `match`;
  the deploy flow re-reads it before every estimate and send, and blocks the
  step otherwise. Tests: `apps/web/test/identity.test.ts` (signing, MOCK
  provider) and `apps/web/test/deploy.test.ts` (sending, MOCK provider).

A `match` proves that the active native account and the EVM lane address are the
same 20 bytes. It does not prove key control or ownership by a person; that is
what a signature check is for.

## Consequences

- The project form's testnet address moves to the coin-60 account,
  `qor1hklqwsqwncrmfc9m772mclkdfesz3zpv4eykrn` (`docs/SUBMISSION.md`). The
  earlier account remains the account of the Step 1 signature evidence and can
  still sign messages; it cannot send on the EVM lane.
- The old `0xd0a1...` address is removed as an identity wherever it was used for
  comparison or as a fallback. It survives only in historical evidence files and
  as the subject of this refutation.
- ADR-0014 step 4 is unaffected and now confirmed on a coin-60 account: the
  `eth_secp256k1` form of the account's key equals the EVM address QoreX
  reports, so the binding statement's `walletEvmAddress` can still be checked
  against W's signed classical key (Step 11a, Task 3). C14 remains PENDING for
  its original reason: no real countersigned statement exists.
- `Terms.borrower` and `Terms.lender` remain explicit EVM addresses supplied by
  the parties. The app fills them from the verified EVM account; nothing derives
  them from a `qor1` address.

## What this does not establish

- The owner's receipt, transaction hash and popup text are owner-supplied and
  were not independently verified by this repository (Step 11a made one
  read-only account GET and no transaction or receipt query).
- The claim that the authorisation window admits only the named recipient where
  the network supports it is the popup's wording, not a tested network rule.
- A comparison is not proof of key control. The verified `signArbitrary`
  signature is what ties the account to its classical and ML-DSA-87 keys
  (ADR-0003); this ADR only says which account may sign and send.
