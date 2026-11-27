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

Two further checks, which are negative results and are recorded as such:

- The standard Ethereum address of the coin-60 account's registered
  `ecdsa_pubkey` is `0x3Ec33bD018D66aEcA1A594EE302051494Ca717BB`, not the
  provider's `0xBDbE...882c`. So the EVM address is NOT the Ethereum-derived
  address of the measured native key.
- RIPEMD160(SHA256(compressed key)) for the coin-60 account is
  `68e345b2971d124bec00c92cf868b9039432a68a`, also not the payload. The
  coin-118 account's payload does equal RIPEMD160(SHA256(compressed key)), which
  is the expected coin-118 rule.

**BLOCKED:** how QoreChain derives a coin-60 account's address from its keys is
NOT established. No rule is invented here. The app does not derive an EVM
address from a public key anywhere.

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
- **ADR-0014 step 4 is now known not to hold for a coin-60 account.** It required
  W's signed classical key to derive to `walletEvmAddress` with
  `addressFromPublicKey(publicKey, "eth_secp256k1")`. On the measured coin-60
  account that derivation gives `0x3Ec3...`, not the EVM address, so the
  step as written would reject the real account. It must be re-specified against
  this ADR's rule (decode `walletAddress` with `evmAddressOfBech32` and compare
  with `walletEvmAddress`). That change is NOT made in Step 11a: it changes a
  verification rule and needs its own tests and evidence, so C14 stays PENDING
  and the mismatch is recorded here and in the README limitations.
- `Terms.borrower` and `Terms.lender` remain explicit EVM addresses supplied by
  the parties. The app now fills them from the verified EVM account; nothing
  derives them from a `qor1` address.

## What this does not establish

- The owner's receipt, transaction hash and popup text are owner-supplied and
  were not independently verified by this repository (Step 11a made one
  read-only account GET and no transaction or receipt query).
- The claim that the authorisation window admits only the named recipient where
  the network supports it is the popup's wording, not a tested network rule.
- Why the coin-60 native key and the EVM address do not relate by the standard
  derivation is unknown. Do not build on that relationship.
