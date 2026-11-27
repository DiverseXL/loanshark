# Phase 11a: coin-60 account, the account guard and the coin-60 signature

Date: 2026-11-27. Step 11a. No transaction was sent by this repository and no live signature was
produced by it. The only network call is the single read-only GET recorded in Task 1.

## Contract followed for this step

- No transaction sent and nothing signed live by the agent.
- No real mnemonic or private key was read, printed, stored or requested.
- Read-only REST allowed, with the raw response saved unedited.
- Every non-evidence decision is marked ASSUMPTION.
- External facts are in `docs/research/source-lock.md`; owner statements are labelled
  OWNER-SUPPLIED and unverified until checked.

## Task 0: baseline

| Item | Value |
|---|---|
| Start commit | `b8b6ace004b85ed46a0093a0f706217b5d8efc00` |
| Working tree before any change | clean except the owner-placed `fixtures/qorex-signarbitrary-coin60.json` |
| `pnpm test` (vitest) | 340 passed, 1 skipped |
| `pnpm test` (Hardhat) | 53 passing |

Read for this baseline: `CLAUDE.md`, `docs/ACCEPTANCE_MATRIX.md`, ADR-0009, ADR-0014, ADR-0019,
ADR-0003, `docs/research/source-lock.md`, `docs/THREAT_MODEL.md`, `docs/EVIDENCE.md`,
`docs/evidence/phase-10-result.md`, and the wallet code in `apps/web/src/wallet`,
`apps/web/src/deploy`, `apps/web/src/constants.ts`, `packages/chain-client/src`.

## Task 1: owner-supplied observations and the bech32 decode

### OWNER-SUPPLIED observations

The four observations below are the owner's, recorded from the owner's browser console on
2026-11-27 (Chrome, QoreX on Testnet). They are OWNER-SUPPLIED and, until this file checks them,
UNVERIFIED. Nothing in this repository produced them, and no tool in this repository can reproduce a
wallet popup or a transaction.

**(1) The original account cannot send on the EVM lane.** With the original account
(`qor1385wkhky3qkjwq47t8904xrd6s82lmkfjnxxsr`, native key algorithm secp256k1) active,
`eth_sendTransaction` was refused by QoreX with error code 4100 and a message stating that an account
using the QoreChain (coin 118) key cannot send on the EVM lane and that an Ethereum account (coin 60)
must be added. `eth_accounts` returned `['0xBDbE07400e9E07B4E0BBf795bC7ecd4E6028882c']` and
`eth_chainId` returned `0x2648`.

**(2) The Ethereum account's native key is ethsecp256k1.** With the Ethereum account active, native
`getKey` returned `algo` `ethsecp256k1` and `bech32Address`
`qor1hklqwsqwncrmfc9m772mclkdfesz3zpv4eykrn`, `pubKeyHex`
`03e0ac74935c9a1a3d2cde81dbd884d9e95d8e9a355db0188b39decb60657d646c`; `eth_accounts` again returned
`0xBDbE07400e9E07B4E0BBf795bC7ecd4E6028882c`.

**(3) `signArbitrary` from that account returns a hybrid signature.** It returned `signatureType`
`ml-dsa-87-hybrid`, `classical.keyType` `eth_secp256k1`, `pq.algorithmId` 1, and a `pq` signature
string of length 6172.

**(4) The EVM send approval popup and the receipt.** The popup stated: simulation shows no balance
change apart from the fee; maximum network fee 0.005985 QOR; QoreChain admits an EVM transaction only
inside an authorisation window; approving also opens one, signed with the hybrid ML-DSA-87 key, for
1 transaction, up to the fee amount, for about 10 minutes; where the network supports it the window
admits only this recipient. The console then printed transaction hash
`0xe328a419eeffe435edd776a2e45533850f3e8056a05c00a9bc720d95585a8cae`. The receipt query returned
status `0x1`, block `0xa518bc` (10819772), `from` and `to`
`0xbdbe07400e9e07b4e0bbf795bc7ecd4e6028882c`, `gasUsed` `0x5208`. The account query for
`qor1hklq...` returned `found:true`, `key_type` hybrid, algorithm `dilithium5`, `possession_proven`
true, `created_at_height` 10819768.

### What this file could check

- The on-chain account record for `qor1hklq...` was fetched read-only and saved; its `key_type`,
  `algorithm_name`, `possession_proven`, `created_at_height` and `ecdsa_pubkey` match observations
  (2) and (4). See "On-chain read" below.
- The bech32 decode below is computed here, not copied from the owner.
- The transaction hash and the receipt are OWNER-SUPPLIED and NOT INDEPENDENTLY VERIFIED: this step
  makes exactly one chain call, the account GET, and does not query a transaction or a receipt.

### Bech32 decode

Library: `@scure/base` 2.4.0, pinned exactly as a dependency of `@loanshark/chain-client` in this
step (MIT; already present in the lockfile as a transitive dependency of other packages). It
implements bech32 (BIP-173) with checksum verification; `decodeToBytes` also converts the 5-bit
payload back to bytes and refuses non-canonical padding. It is not a QoreChain library and no
QoreChain code is involved in the decode. ASSUMPTION: a QoreChain `qor1` account address is bech32
(not bech32m) with prefix `qor` and a 20-byte payload, which is what the two addresses below decode
to and what the provider's EVM address matches.

Command (run in `packages/chain-client`, so the import resolves to the pinned dependency):

```bash
node --input-type=module -e "
import { bech32 } from '@scure/base';
for (const address of [
  'qor1hklqwsqwncrmfc9m772mclkdfesz3zpv4eykrn',
  'qor1385wkhky3qkjwq47t8904xrd6s82lmkfjnxxsr',
]) {
  const d = bech32.decodeToBytes(address);
  console.log(address, '| prefix', d.prefix, '| bytes', d.bytes.length, '|', '0x' + Buffer.from(d.bytes).toString('hex'));
}
"
```

Output, unedited:

```text
qor1hklqwsqwncrmfc9m772mclkdfesz3zpv4eykrn | prefix qor | bytes 20 | 0xbdbe07400e9e07b4e0bbf795bc7ecd4e6028882c
qor1385wkhky3qkjwq47t8904xrd6s82lmkfjnxxsr | prefix qor | bytes 20 | 0x89e8eb5ec4882d2702be59cafa986dd40eafeec9
```

| Address | Decoded 20 bytes | Provider `eth_accounts[0]` | Equal |
|---|---|---|---|
| `qor1hklqwsqwncrmfc9m772mclkdfesz3zpv4eykrn` (coin 60, `ethsecp256k1`) | `0xbdbe07400e9e07b4e0bbf795bc7ecd4e6028882c` | `0xBDbE07400e9E07B4E0BBf795bC7ecd4E6028882c` | YES (case-insensitive; EIP-55 checksummed form) |
| `qor1385wkhky3qkjwq47t8904xrd6s82lmkfjnxxsr` (coin 118, `secp256k1`) | `0x89e8eb5ec4882d2702be59cafa986dd40eafeec9` | n/a (not the account the provider reports) | NO |

The expected result is confirmed: the coin-60 account's bech32 payload is exactly the 20 bytes of
the EVM account QoreX reports. The earlier ADR-0009 derivation for the first account,
`0xd0a1453c7b8157aa0635076c33b3e24a50a923c5`, is therefore refuted as an identity: it is the
Ethereum form of that account's `ecdsa_pubkey`, and it equals neither the account's own bech32
payload (`0x89e8...eec9`) nor the EVM account the provider reports. See Task 2.

### On-chain read

```
GET https://api-testnet.qore.host/qorechain/pqc/v1/account/qor1hklqwsqwncrmfc9m772mclkdfesz3zpv4eykrn
HTTP/1.1 200 OK
Date: Fri, 27 Nov 2026 01:20:50 GMT
Content-Type: application/json
x-cosmos-block-height: 10820862
```

The body is saved unedited as `fixtures/onchain-account-qor1hklq.json`, with the sidecar
`fixtures/onchain-account-qor1hklq.meta.json` recording the URL, the date, the status, the block
height and the SHA-256. SHA-256 of the stored bytes:
`17435910f700838237de3f6cfc8238b526be3362ef5156d59f15fb304b6de966`.

Fields read from the saved file (a reading aid; the file is the record):

```text
address              qor1hklqwsqwncrmfc9m772mclkdfesz3zpv4eykrn
algorithm_id         1
algorithm_name       dilithium5
key_type             hybrid
created_at_height    10819768
possession_proven    true
ecdsa_pubkey (hex)   03e0ac74935c9a1a3d2cde81dbd884d9e95d8e9a355db0188b39decb60657d646c
public_key length    2592 bytes
```

This matches the owner-supplied (2) and (4): `ecdsa_pubkey` equals the reported `pubKeyHex`, and
`created_at_height` 10819768 is two blocks before the reported transaction block 10819772. This is
consistent with the account having been created, and its hybrid key registered, by that transaction.
Consistency is not proof: no transaction or receipt was queried by this repository.

Limit: the owner's `algorithm dilithium5` and this file's `algorithm_name` agree; ADR-0009's
reading that `public_key` is the ML-DSA-87 key is unchanged.
