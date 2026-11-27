# ADR-0014: Two-account identity, wallet account W and seal account E

Status: Accepted, 2026-11-19, **pending owner-run evidence**. The binding statement is implemented
and tested offline only. No real QoreX signature has been combined with a real seal-account signature
yet; C14 is PENDING.

**Step 11a, 2026-11-27:** verification step 4 below is known NOT to hold for the measured coin-60
account, and must be re-specified. QoreX's EVM account is not the `eth_secp256k1`-derived address of
the native key; it is the 20 bytes the account's own bech32 address carries. ADR-0009 now owns the
identity rule, and step 4 must be replaced by a `evmAddressOfBech32(walletAddress)` comparison in a
later step. Nothing in this ADR was made live in Step 11a, and the code in `apps/web` blocks
signing and sending on an account mismatch (ADR-0009).

Context: QoreChain accounts have one ML-DSA-87 key and at most one registered ML-KEM key. This
project needs two different authorities:

- a **wallet account W**, controlled by QoreX, whose EVM address holds and moves test tokens and
  sends every EVM transaction; and
- an **app-held seal account E**, whose mnemonic the client controls, which publishes the ML-KEM key,
  signs the recipient card, decrypts envelopes and signs request/offer envelopes (ADR-0003,
  ADR-0004, ADR-0005).

QoreX refuses the key-management messages from dApps, so W cannot publish E's KEM key. Using W's
mnemonic inside the page would put the spending key in the browser and would still need a separate
registration path. E is therefore a separate account with its own mnemonic. One borrower and one
lender per loan means one W/E pair per party; a loan has two pairs.

## Binding statement

A pair is only useful if the two accounts can be shown to belong to the same party. The binding is a
statement signed by both accounts:

| Field | Meaning |
|---|---|
| domain tag | `LOANSHARK account binding v1` (the first line of the signed text) |
| chain ID | `qorechain-diana` for this project |
| `walletAddress` | W's `qor1` address |
| `sealAddress` | E's `qor1` address |
| `walletEvmAddress` | W's `0x` EVM address |
| `issuedAt` | UTC timestamp, `YYYY-MM-DDTHH:MM:SSZ` |
| `expiry` | UTC timestamp, same format, later than `issuedAt` |

The exact signed bytes are the UTF-8 of these seven lines, in this order, each terminated by `\n`
except the last:

```text
LOANSHARK account binding v1
Chain ID: <chainId>
Wallet account: <walletAddress>
Seal account: <sealAddress>
Wallet EVM address: <walletEvmAddress>
Issued at: <issuedAt>
Expires at: <expiry>
```

All fields are validated before the text is built. Addresses must parse as QoreChain addresses and
must round-trip to the canonical `qor1` form; the EVM address must be `0x` plus 40 hex characters and
is normalised to its EIP-55 form; timestamps must match the exact second-resolution pattern with no
fractional seconds. Therefore no field can contain a newline and the line layout cannot be shifted.

W signs the text with QoreX `signArbitrary`. E countersigns the same text with QoreSign `signMessage`
(the hybrid message-signing entry point). The task brief says "E signs with signHybrid"; source-lock
claim 63 records that `signHybrid` signs transaction bytes and cannot sign a statement, so E uses
`signMessage`, which produces the same hybrid `MessageSignature` shape that `verifyHybridMessage`
checks. This is a source correction, not a design shortcut.

Verification, in order:

1. Rebuild the text from the fields and reject an unknown domain or chain, a malformed field, a
   timestamp in the future, or `now >= expiry`.
2. Verify W's signature with `verifyHybridMessage` for `walletAddress`, with the post-quantum part
   mandatory and the key read from W's on-chain account record.
3. Verify E's signature with `verifyHybridMessage` for `sealAddress`, with the post-quantum part
   mandatory and the key read from E's on-chain account record.
4. Decode the classical public key from W's verified signature, derive its Ethereum-form address with
   `addressFromPublicKey(publicKey, "eth_secp256k1").hex`, and require it to equal
   `walletEvmAddress`.

Step 4 was written as a proof that the recorded EVM address is the `0x` form of the same secp256k1
key that W used to sign the statement. Step 11a refuted that for a coin-60 account: the standard
derivation of the coin-60 account's registered key gives `0x3Ec33bD018D66aEcA1A594EE302051494Ca717BB`
while QoreX reports `0xBDbE07400e9E07B4E0BBf795bC7ecd4E6028882c`, which is the payload of the
account's own bech32 address. Step 4 would therefore reject the real account. It is NOT changed in
Step 11a; see ADR-0009 and the README limitations. A separate `eth_signTypedData_v4` or
`personal_sign` proof from the EVM account would be stronger and is deferred.

## ASSUMPTIONS and alternatives

1. ASSUMPTION (format): fixed-line text, mirroring the QoreSeal recipient card, rather than JSON.
   Alternatives: canonical JSON (RFC 8785) with a length-prefixed or sorted-key encoding; a
   length-prefixed binary encoding like ADR-0007. JSON adds a canonicalisation dependency and a
   second escaping rule; a binary encoding is harder for a wallet to display. The fixed lines are
   safe only because every field is validated and no field can contain a newline. If a future field
   is free text, the format must change and the domain tag must change with it.
2. ASSUMPTION (expiry): the default lifetime is 30 days from `issuedAt`; the verifier accepts a
   lifetime of at most 90 days and rejects a statement at or after `expiry`. Alternatives: no expiry
   plus an on-chain or off-chain revocation list; a 24-hour statement re-signed per session; a
   per-loan statement with an expiry equal to the loan deadline. The 30/90-day numbers are project
   choices, not QoreChain parameters. Clock skew between the browser and the chain is not corrected;
   the statement is rejected as not yet valid if `issuedAt` is more than 5 minutes in the future.
3. ASSUMPTION (signing order): W signs first and E countersigns. E's signature is an explicit consent
   by the party that will decrypt and sign envelopes. The reverse order is equivalent cryptographically
   but gives a worse UI: E would sign a statement naming a W that has not yet agreed.
4. ASSUMPTION (scope): one statement per W/E pair, not per loan. A loan has two statements, one for
   each party. Nothing in this step binds a statement to a particular counterparty or loan; that is a
   Step 9 design item if a per-loan statement is wanted.

## Which account signs and sends what

| Action | Account | Method |
|---|---|---|
| Sign a request envelope | E | `signMessage` over the ADR-0003 domain-tagged bytes |
| Sign a lender offer envelope | E | `signMessage` over the ADR-0003 domain-tagged bytes |
| Decrypt an envelope addressed to the party | E | QoreSeal `open` with E's seal keys |
| Sign the recipient card | E | `signRecipientCard` |
| Register the ML-DSA-87 and ML-KEM keys | E | native-lane transactions signed by E (owner-run) |
| Sign the agreement confirmation | W | QoreX `signArbitrary`; verified against W's ML-DSA-87 key |
| Send an EVM transaction (approve, fund, claim, repay, deploy) | W | QoreX EVM provider; owner-run panel |
| Sign the binding statement | W and E | W with `signArbitrary`; E with `signMessage` |

The frozen encodings do **not** change in this step:

- ADR-0007's AAD has `borrower` and `lender` fields and `expectedSigner` returns one of them.
  Resolved in Step 9 by ADR-0015: the AAD `borrower` and `lender` fields carry the WALLET (W) `qor1`
  addresses because W is the party identity across the agreement and settlement contract. Envelopes
  are sealed to and signed by seal account E, linked to W by this ADR's binding statement. The frozen
  AAD vectors (ADR-0007) are preserved unchanged.
- ADR-0010's agreement text and confirmation encoding are unchanged. W's confirmation still speaks
  for the EVM address in the terms; the binding statement is a separate artefact.
- `Terms.borrower` and `Terms.lender` remain explicit EVM addresses supplied by the parties
  (ADR-0009). Nothing derives them from E.

## Threats this closes

- A web page swapping a KEM key on the wallet account: E's key registration is a native-lane
  transaction signed by E, not a QoreX message, and QoreX never exposes W's key-management path.
- A classical-only impersonation of the party: both binding signatures require the post-quantum part
  against each account's on-chain ML-DSA-87 key.
- Confusing the account that holds funds with the account that decrypts: the roles are separate and
  the statement names both.
- A stolen KEM key silently replacing E's: the card is bound by SHA3-256 to the key on chain, and the
  card signature is checked with `requirePq: true`.

## Threats this opens

- **The mnemonic lives in browser memory** (ADR-0005). XSS, a malicious dependency, a compromised
  browser extension or a shared machine can read it while the page is open. Step 8 stores nothing and
  shows it once, but it cannot prove the page is free of XSS.
- **Binding forgery by the counterparty.** A party controls both its W and its E, so it can always
  produce a true statement for its own pair. The statement does not prove the party is who they claim
  off-chain, and it does not prevent a party from binding a W it controls to an E it also controls
  while presenting a different name. Identity attestation is out of scope.
- **The EVM-address link is a runtime comparison, not a key derivation.** QoreX reports one EVM
  account regardless of the active native account (ADR-0009, Step 11a). The app compares that account
  with the active native account's bech32 payload and blocks signing and sending on a mismatch. The
  ADR-0014 step-4 derivation is known to fail on the measured coin-60 account and is not used by the
  app.
- **Replay inside the expiry window.** A valid statement can be presented to any counterparty until
  it expires. It is not bound to a loan, a counterparty or a nonce. Per-loan binding is deferred.
- **Two mnemonics per party.** The owner must back up W's wallet recovery material and E's mnemonic
  separately. Reusing the QoreX mnemonic for E is forbidden by the owner checklist because it would
  put the wallet key in the browser.
- **E is a full account.** E's mnemonic can sign native transactions and spend any QOR sent to E. E
  should hold only the small fee balance needed for registration.

Test required: C13 and C14 in `docs/ACCEPTANCE_MATRIX.md`; T29 to T32 in `docs/THREAT_MODEL.md`.
The offline tests are in `packages/seal-account/test/`; the real end-to-end check is owner-run.
