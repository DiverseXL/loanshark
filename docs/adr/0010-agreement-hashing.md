# ADR-0010: Agreement hashing, canonical text and confirmation message

Status: Proposed; the viem choice and every format below are ASSUMPTIONs, not
QoreChain standards.

Context: ADR-0008 fixes the terms and the on-chain commitment. The app also
needs a human-readable agreement document to encrypt off-chain, a hash of that
document to record alongside the terms, and one message both parties can sign
with QoreX to confirm the same agreement. Three clients (browser, tests, and the
Solidity contract) must agree byte-for-byte on the commitment.

## ABI encoding and keccak: viem 2.57.11

Decision: `packages/agreement` depends on `viem` 2.57.11, pinned exactly. It uses
`encodeAbiParameters` and `keccak256` from viem; nothing is hand-rolled.

ASSUMPTION: 2.57.11 rather than the newest 2.58.0, because 2.58.0 was published
hours before this change and falls inside the repository's pnpm minimum release
age. Pinning a version that passes the policy avoids adding a supply-chain
exception; both versions produced the same frozen vectors.

The parameter list, in order, is:

```
address borrower, address lender, address token,
uint256 principal, uint256 interest,
uint64 dueDate, uint64 graceSeconds, uint64 fundingDeadline, uint64 claimDeadline,
bytes32 salt
```

`abi.encode` is used, not `abi.encodePacked`. Every value is a 32-byte word, so
no two field boundaries can collide. `commitmentOf(terms)` returns
`keccak256(encodeAbiParameters(...))`; the contract's `commitmentOf(Terms)`
computes the same expression from the same field order.

Why viem rather than a hand-written encoder: it is a well-known, pinned library
that already provides ABI encoding and keccak, and it is the library the app
will use for EVM reads and writes later. `@noble/hashes`, already present,
would supply keccak but not the ABI encoding, and writing the encoder here is
unnecessary risk.

ASSUMPTION: viem is acceptable as a dependency and its ABI encoder matches
Solidity `abi.encode` for these ten static types. The cross-implementation test
against the compiled contract is the check, not this sentence.

## Canonical agreement text

The off-chain document is UTF-8, versioned and deliberately simple:

```
LOANSHARK AGREEMENT v1
borrower: <lowercase 0x address>
lender: <lowercase 0x address>
token: <lowercase 0x address>
principal: <decimal base units>
interest: <decimal base units>
dueDate: <decimal unix seconds>
graceSeconds: <decimal seconds>
fundingDeadline: <decimal unix seconds>
claimDeadline: <decimal unix seconds>
salt: <lowercase 0x 32-byte value>
```

Lines are joined with LF and there is no trailing newline. Every value is an
address, a fixed-length hex value or an unsigned decimal integer, so no value
can contain a newline or a colon that changes the parse. `AGREEMENT_TEXT_VERSION`
is the first line; a future format must change it.

`agreementHashOf(terms)` is SHA-256 of those UTF-8 bytes. It is recorded with the
terms and encrypted with the document. It is not the loan id: the loan id is the
keccak commitment, and the two are independent hashes of related data.

ASSUMPTION: SHA-256, lowercase hex and this label layout are this project's
choice. No QoreChain rule requires them.

## Confirmation message

Both parties sign exactly:

```
loanshark/v1/agreement|<0x loanId>|<0x agreementHash>
```

The loan id and agreement hash are lowercase, `0x`-prefixed, 32-byte hex. The
chain id is not in the string because QoreSign prefixes the signed bytes with
`qorechain-msg-v1|<chainId>|` (source-lock claim 18); a confirmation for one
chain does not verify for another. The domain tag prevents replay into another
protocol.

`signAgreementConfirmation({ terms, signer })` derives both hashes from the same
terms, builds the message and calls the caller's `MessageSigner`. It does not
build a QoreX signer. `verifyAgreementConfirmation({ terms, chainId, signer,
signature, accountClient })` recomputes the message and delegates to
`verifyHybridMessage`, which requires the ML-DSA-87 part and reads the key from
the injected account client. Tests use throwaway QoreSign keys and a mock
account client, and are labelled MOCK.

ASSUMPTION: both parties sign the same message, and the caller supplies which
account is expected (borrower or lender). The message does not name a role, so
the expected signer is an input to verification, not a field in the bytes.

## Consequences

- Changing any of the ten fields, the label layout, the hash choice, the domain
  tag or the hex formatting changes a hash or a signature. Frozen vectors in
  `fixtures/agreement-vectors.json` make such a change visible.
- The contract and the TypeScript package must keep the same field order. A
  mismatch is caught only by the cross-implementation test, which is why C5
  requires it.
- `viem` is a runtime dependency of the agreement package and will be shared
  with the app.
