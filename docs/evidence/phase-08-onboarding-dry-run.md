# Phase 8 evidence: owner-run onboarding dry run

Date: 2026-11-19, 10:58 UTC. Mode: `--dry-run`. Nothing was signed and nothing was sent.

The run used the public all-zero BIP-39 test phrase from
`packages/seal-account/test/fixtures.ts` (TEST ONLY, never funded as a project account, not a
secret). The command was:

```powershell
$env:LOANSHARK_SEAL_MNEMONIC='<TEST ONLY phrase>'
node scripts/onboard-seal-account.mjs --dry-run
Remove-Item Env:LOANSHARK_SEAL_MNEMONIC
```

The script wrote `fixtures-out/seal-onboarding-qor19rl4cm2hmr8afy4kldpxz3fka4jguq0agt672h-2026-11-19T10-58-20-452Z.json`
(ignored by git). Only public data and raw responses were written; the phrase is not in the file.

## 1. Derived public identity (offline)

| Field | Value |
|---|---|
| `qor1` address | `qor19rl4cm2hmr8afy4kldpxz3fka4jguq0agt672h` |
| address hex | `0x28Ff5c6d57D8cFD492B6FB42614536eD648E01Fd` |
| EVM form (informational) | `0x7C1B02B575545d4F24243C229bC9a5ef1649b346` |
| classical public key (hex) | `024f4e2ad99c34d60b9ba6283c9431a8418af8673212961f97a77b6377fcd05b62` |
| ML-DSA-87 SHA3-256 | `93eb467eb8d32944f646ef6dee8f1f14a1252a7fa4a8a870292dcfb932872c6b` |
| ML-KEM-1024 SHA3-256 | `889310e1d0d1ff95d9e2f63b433b0816021d92cf4c568101eab46d42c5b99838` |
| X25519 public key (hex) | `56a902e12bc30ffcb787f50c442d810d15fb1a6c9f97b6ec5743459d055cf434` |

These match the frozen values in `packages/seal-account/test/fixtures.ts` and the derivation in
ADR-0004.

## 2. Read-only preflight

Four `GET` requests, no request body, no signature:

### Account

`GET https://api-testnet.qore.host/cosmos/auth/v1beta1/account_info/qor19rl4cm2hmr8afy4kldpxz3fka4jguq0agt672h`
returned HTTP 200:

```json
{
  "info": {
    "address": "qor19rl4cm2hmr8afy4kldpxz3fka4jguq0agt672h",
    "pub_key": {
      "@type": "/cosmos.crypto.secp256k1.PubKey",
      "key": "Ak9OKtmcNNYLm6YoPJQxqEGK+GcyEpYfl6d7Y3f80Fti"
    },
    "account_number": "868",
    "sequence": "40"
  }
}
```

The base64 `pub_key.key` decodes to the derived classical public key above.

### Balance

`GET https://api-testnet.qore.host/cosmos/bank/v1beta1/balances/qor19rl4cm2hmr8afy4kldpxz3fka4jguq0agt672h`
returned HTTP 200:

```json
{
  "balances": [{ "denom": "uqor", "amount": "11800" }],
  "pagination": { "next_key": null, "total": "1" }
}
```

### ML-DSA-87 status

`GET https://api-testnet.qore.host/qorechain/pqc/v1/account/qor19rl4cm2hmr8afy4kldpxz3fka4jguq0agt672h`
returned HTTP 200. Fields other than the 2592-byte `public_key`:

```json
{
  "found": true,
  "account": {
    "address": "qor19rl4cm2hmr8afy4kldpxz3fka4jguq0agt672h",
    "public_key": "<2592-byte base64 ML-DSA-87 key>",
    "algorithm_id": 1,
    "algorithm_name": "dilithium5",
    "ecdsa_pubkey": "Ak9OKtmcNNYLm6YoPJQxqEGK+GcyEpYfl6d7Y3f80Fti",
    "key_type": "hybrid",
    "created_at_height": "438874",
    "migration_public_key": null,
    "migration_algorithm_id": 0,
    "classical_key_source": "auth_account",
    "possession_proven": false
  }
}
```

The registered `public_key` is 2592 bytes and its SHA3-256 is
`93eb467eb8d32944f646ef6dee8f1f14a1252a7fa4a8a870292dcfb932872c6b`, the canonical derived key.
The account's registered ML-DSA-87 key is therefore the key this mnemonic derives. The
`possession_proven: false` field is reported but not interpreted: this account was registered
outside this repository.

### ML-KEM status

`GET https://api-testnet.qore.host/qorechain/pqc/v1/kem/qor19rl4cm2hmr8afy4kldpxz3fka4jguq0agt672h`
returned HTTP 200:

```json
{ "found": false, "key": null }
```

No ML-KEM key is registered for this address.

## 3. What the dry run establishes

- The script derives the same public identity as the package tests, from the environment only.
- The four read-only routes answer on `qorechain-diana` and their raw bodies are recorded.
- The script correctly reads the account, the registered ML-DSA-87 key and the missing KEM key.
- The typed-confirmation path was not exercised; `--execute` was not run.
- The script made no transaction, signed nothing and wrote nothing outside `fixtures-out/`.

## 4. What it does not establish

- C13 and C14 remain PENDING. No fresh seal account was created, no key was registered by this
  repository, and no transaction hash exists.
- `--execute` (simulation, signing, broadcast, read-back) has not been exercised against the chain.
  Its transaction-building code is copied from the pinned official examples and is **untested live**.
- The `possession_proven` value and `created_at_height` are not evidence about how this account was
  registered.
- The all-zero test phrase must never be used for the owner's seal account. The owner checklist
  requires a freshly generated phrase and forbids reusing the QoreX mnemonic.

## 5. Reproduction check of the guard tests

`pnpm exec vitest run scripts/onboard-seal-account.test.mjs`: 13 tests passed. They cover argument
parsing, the chain and REST guards, the environment requirement, phrase redaction, the report-name
sanitisation and the exact typed confirmation. They do not contact the network.
