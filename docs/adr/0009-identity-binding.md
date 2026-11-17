# ADR-0009: Binding the qor1 account to an EVM address

Status: Proposed, with one ASSUMPTION that the owner must confirm.

Context: The account record for `qor1385wkhky3qkjwq47t8904xrd6s82lmkfjnxxsr`
contains an ML-DSA-87 public key and a compressed secp256k1 `ecdsa_pubkey`
(source-lock claim 20). QoreX signs messages for the `qor1` account with a
hybrid signature. EVM transactions are sent from a 20-byte `0x` address, and the
settlement contracts identify parties by `address`.

From the fixture's compressed key, the standard Ethereum derivation gives:

```
uncompressed: 04d9ec2c76c3c28f0439c550b3dfbfb6a0d32878a5f9093699ae392b46be05acea37912359cf3c78956a65d3b4d4ba03f6f8e98c5f8c0449b1ac621478f8b8bbab
keccak256(uncompressed[1..]): b2ec35dcfec754dc65bb88edd0a1453c7b8157aa0635076c33b3e24a50a923c5
address (last 20 bytes):       0xd0a1453c7b8157aa0635076c33b3e24a50a923c5
```

Method and unedited output: `docs/evidence/phase-03-result.md`. The derivation
used Node's `createECDH("secp256k1")` only to decompress the point and
`@noble/hashes` 2.4.0 `keccak_256`; it made no chain or wallet call.

ASSUMPTION: the `qor1` account and the `0x` account used for EVM transactions
are the same key. The derivation is consistent with that, but it does not prove
that QoreX, the EVM execution layer or the account mapping use this address.

Owner verification step (not performed, and no substitute is built):

1. In QoreX, select the QoreChain EVM testnet provider for this account and copy
   the `0x` address it reports (the address shown for EVM transactions, or the
   result of `eth_accounts` for the injected provider).
2. Compare it, character for character, with
   `0xd0a1453c7b8157aa0635076c33b3e24a50a923c5`.
3. Record the result in this ADR. If it matches, the ASSUMPTION is confirmed for
   this account on this network. If the owner has more than one account, repeat
   for each account the app will use.

Fallback if they differ: do not derive one from the other and do not guess a
mapping. Design a signed binding message in which the `qor1` account signs a
statement containing the EVM address (and the reverse, if the EVM key can sign),
and verify both before treating them as one party. That design is not built in
this step. Until it exists or the check above passes, the app must treat the two
as separate identifiers.

Constraint on the agreement and contract code: neither may assume binding
beyond this ADR. `Terms.borrower` and `Terms.lender` are explicit EVM addresses
supplied by the parties; nothing derives them from a `qor1` address, and no
lookup or silent mapping is performed. The off-chain confirmation message uses
the account's QoreX signer and is verified against that account's on-chain
ML-DSA key; it does not by itself prove control of the EVM address. A future
binding must be added explicitly, with its own tests.

Consequences: a loan can be proposed and funded by EVM addresses with no proven
link to the QoreX accounts that signed the agreement. The app must surface that
limitation until the owner check passes. The contract's access control remains
correct either way, because it authorises the EVM addresses in the terms; the
open question is only whether those addresses belong to the intended people.

Test required: none in this step; the check is manual and its result belongs in
this ADR. Contract tests use explicit addresses and do not depend on binding.
