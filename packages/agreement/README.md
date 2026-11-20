# @loanshark/agreement

Offline loan agreement logic: the terms, the on-chain commitment, the canonical
agreement text, the confirmation both parties sign, and the local offer
evaluator. Nothing in this package calls a chain, a relay or a network, and it
holds no key material.

## Commitment and domain

`commitmentOf(terms, domain)` is
`keccak256(abi.encode(chainId, verifyingContract, terms))`, matching
`LoanSettlement.commitmentOf` for the same chain id and contract address
(ADR-0008 decision 8). `domain` is `{ chainId: bigint, verifyingContract }`.

The chain id and contract address are part of the preimage so the same terms at
another deployment, or on another chain, produce a different loan id.

`fixtures/agreement-vectors.json` at the repository root freezes the output for
chain 9800 and the TEST ONLY address `0x000000000000000000000000000000000000c0de`.
No contract is deployed there. `scripts/gen-agreement-vectors.mjs` refuses to
rewrite the file without `--rewrite-frozen-vectors`; a rewrite needs an ADR.

## Confirmation message

Both parties sign exactly:

```
loanshark/v2/agreement|<evm chain id>|<0x verifying contract>|<0x loanId>|<0x agreementHash>
```

A confirmation signed for one contract or chain is refused for another. The
QoreSign `qorechain-msg-v1|<native chain id>|` prefix is separate and is also
checked (ADR-0010).

## Offer evaluation

`LocalOfferEvaluator.evaluate(request, offer, now)` returns
`{ eligible, checks }`. Each check has an `id`, `pass`, `expected`, `actual` and a
plain-language `explanation`. It is a pure function: no network, no randomness,
no clock read, no scoring and no ranking.

The checks follow the contract's own `_validateTerms` order for the deadline
rules, and add the borrower's limits, which the contract does not know:

| Check | Fails when |
|---|---|
| `parties-differ` | the lender is the borrower |
| `principal-nonzero` | the principal is zero |
| `token-matches-request` | the offer is in another token |
| `principal-matches-request` | the principal differs from the request |
| `no-arithmetic-overflow` | `principal + interest` exceeds `uint256` |
| `total-cost-within-maximum` | `principal + interest` exceeds the borrower's maximum |
| `funding-deadline-in-future` | `fundingDeadline <= now` |
| `deadline-order` | `claimDeadline < fundingDeadline` |
| `claim-window-minimum` | the window is under the contract's 3600 seconds |
| `due-date-after-claim` | `dueDate <= claimDeadline` |
| `due-date-not-later-than-requested` | `dueDate` exceeds the borrower's latest date |
| `offer-not-expired` | `now >= dueDate` |

Missing or malformed input produces failing checks with a reason and
`eligible: false`; the evaluator never throws for bad input.

### No confidential backend exists

`OfferEvaluator` is an interface so a future confidential backend could
implement the same shape without changing callers. No such backend exists in
this repository, no provider was adopted (ADR-0018), and the only implementation
is the local, offline one. Anything else would need its own evidence before the
UI could claim confidentiality.
