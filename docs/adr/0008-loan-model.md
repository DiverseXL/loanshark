# ADR-0008: Loan model, commitment and settlement state machine

Status: Accepted. Decisions 1 to 8 were proposed by the assistant and confirmed
by the owner in chat on 2026-11-17; decision 9 was confirmed the same day.
Nothing here is drawn from a QoreChain specification; it is this project's
model.

Context: The app needs an on-chain agreement whose identity is a hash of its
terms, so both parties can confirm the same document off-chain and the chain
can enforce the settlement rules. The brief requires no collateral, no
liquidation, no interest-rate math and no admin. All amounts are token base
units. This ADR fixes the model before any contract or TypeScript code exists.

## Decisions

1. One borrower and one lender per loan. (Owner confirmed in chat on
   2026-11-17.)
2. The borrower proposes terms with `proposeLoan`. The lender accepts by
   calling `fund`, which escrows the principal. The borrower then calls
   `claim`, which pays the principal out. An unfunded proposal can be closed by
   the borrower with `cancel`, or by anyone with `expire` after
   `fundingDeadline`. A funded but unclaimed loan is refundable to the lender
   with `refund` after `claimDeadline`. (Owner confirmed in chat on
   2026-11-17.)
3. Interest is a fixed absolute amount in token base units. There is no rate,
   APR, compounding or per-second math on-chain. (Owner confirmed in chat on
   2026-11-17.)
4. The borrower may repay partially at any time while the loan is `Active` or
   `Defaulted`. A repayment may not exceed the outstanding amount; an
   overpayment reverts. There is one `dueDate` and one `graceSeconds` value.
   (Owner confirmed in chat on 2026-11-17.)
5. After `dueDate + graceSeconds`, with a balance outstanding, anyone may call
   `markDefault`. There is no collateral, liquidation or penalty. Repayments
   remain accepted after default, and paying the outstanding amount in full
   moves the loan to `Repaid`. (Owner confirmed in chat on 2026-11-17.)
6. Repayments are credited to the lender and withdrawn by the lender, not
   pushed to the lender during repayment (pull payments). (Owner confirmed in
   chat on 2026-11-17.)
7. Tokens are an immutable allowlist fixed at deployment. There is no admin
   function to add or remove a token and no upgrade path. The production
   deployment is intended to contain only this project's labelled test token.
   The `Fest` tokens found on the test account are not used because their
   provenance is unverified. (Owner confirmed in chat on 2026-11-17.)
8. The commitment is `keccak256(abi.encode(terms))`, computed on-chain, and the
   loan id is the commitment. (Owner confirmed in chat on 2026-11-17.)
9. The claim window is at least 3600 seconds: `claimDeadline` must be at least
   `fundingDeadline + 3600`. (Owner confirmed N = 3600 in chat on 2026-11-17.)
   This is a project guard against a borrower being given no time to claim;
   it is not a QoreChain rule. The value is exposed as the public constant
   `MINIMUM_CLAIM_WINDOW`.

## Terms

```solidity
struct Terms {
    address borrower;       // proposes and repays
    address lender;         // funds and withdraws
    address token;          // must be on the immutable allowlist
    uint256 principal;      // base units, escrowed by fund and paid by claim
    uint256 interest;       // base units, fixed absolute amount
    uint64  dueDate;        // unix seconds
    uint64  graceSeconds;   // added to dueDate for the default boundary
    uint64  fundingDeadline;// last second at which fund is accepted
    uint64  claimDeadline;  // last second at which claim is accepted
    bytes32 salt;           // makes otherwise identical terms distinct
}
```

Field order is fixed and is part of the commitment. `abi.encode` is used, not
`abi.encodePacked`, so addresses are 32-byte words and cannot collide with
adjacent fields. `loanId = keccak256(abi.encode(...))`.

The same ten fields are mirrored in TypeScript in `packages/agreement`, with
`address` as a 20-byte hex string, `uint256` and `uint64` as `bigint`, and
`salt` as a 32-byte hex string. The Solidity view function `commitmentOf(Terms)`
and the TypeScript `commitmentOf(terms)` must produce identical bytes32 values;
that equality is tested against frozen vectors.

Validation at `proposeLoan` (all are `ASSUMPTION`s unless listed as a
decision):

- `borrower != address(0)`, `lender != address(0)`, `borrower != lender`.
- `principal > 0`; `interest` may be zero.
- `token` is on the immutable allowlist.
- `fundingDeadline > block.timestamp`.
- `claimDeadline >= fundingDeadline + 3600` (`ClaimWindowTooShort` otherwise);
  the weaker `claimDeadline >= fundingDeadline` check remains and reports
  `InvalidTerms` first.
- `dueDate > claimDeadline`.
- `loanId` has never been proposed before.

The `dueDate > claimDeadline` rule is an `ASSUMPTION`: it keeps the lifecycle
ordered (fund, claim, then repay), but the owner may prefer to allow a due date
earlier than the claim deadline.

## States

| State | Meaning | Escrow held | Outstanding |
|---|---|---|---|
| `None` | No loan with this id | 0 | n/a |
| `Proposed` | Terms recorded, not funded | 0 | n/a |
| `Funded` | Principal escrowed | `principal` | n/a |
| `Active` | Principal paid to borrower | 0 | `principal + interest - repaid` |
| `Defaulted` | Past due + grace with a balance | 0 | `principal + interest - repaid` |
| `Repaid` | Fully repaid | 0 | 0 |
| `Cancelled` | Borrower closed an unfunded proposal | 0 | n/a |
| `Expired` | Anyone closed an unfunded proposal after the funding deadline | 0 | n/a |
| `Refunded` | Lender reclaimed principal after the claim deadline | 0 | n/a |

`Repaid`, `Cancelled`, `Expired` and `Refunded` are terminal.

## Transitions

Times are compared with `block.timestamp`. A deadline is inclusive for the
action it permits and exclusive for the action that closes it: `fund` and
`claim` are allowed while `now <= deadline`; `expire` and `refund` require
`now > deadline`. This is an `ASSUMPTION`; the alternative reading (deadline
exclusive for the permitted action) is a one-line change and would need the
boundary tests changed with it.

| From | Function | Caller | Checks | To | Event |
|---|---|---|---|---|---|
| `None` | `proposeLoan` | `terms.borrower` | validation above; id unused | `Proposed` | `LoanProposed` |
| `Proposed` | `fund` | `terms.lender` | `now <= fundingDeadline`; exact transfer of `principal` | `Funded` | `LoanFunded` |
| `Proposed` | `cancel` | `terms.borrower` | none beyond state | `Cancelled` | `LoanCancelled` |
| `Proposed` | `expire` | anyone | `now > fundingDeadline` | `Expired` | `LoanExpired` |
| `Funded` | `claim` | `terms.borrower` | `now <= claimDeadline`; exact transfer of `principal` | `Active` | `LoanClaimed` |
| `Funded` | `refund` | `terms.lender` | `now > claimDeadline`; exact transfer of `principal` | `Refunded` | `LoanRefunded` |
| `Active` | `repay` | `terms.borrower` | `0 < amount <= outstanding`; exact transfer | `Active` or `Repaid` | `RepaymentMade`, and `LoanRepaid` on the final payment |
| `Active` | `markDefault` | anyone | `now > dueDate + graceSeconds` | `Defaulted` | `LoanDefaulted` |
| `Defaulted` | `repay` | `terms.borrower` | `0 < amount <= outstanding`; exact transfer | `Defaulted` or `Repaid` | `RepaymentMade`, and `LoanRepaid` on the final payment |
| any with credit | `withdraw` | `terms.lender` | `withdrawable > 0`; exact transfer | unchanged | `LenderWithdrew` |

No other transition exists. In particular: no funding after the funding
deadline, no claim before funding, no second claim, no funding twice, no
repayment before `Active`, no repayment after `Repaid`, no refund before
`claimDeadline`, no default before `dueDate + graceSeconds`, no default of a
loan that is not `Active`, and no withdrawal by anyone but the lender.

`withdraw` is available in `Active`, `Defaulted`, `Repaid` and `Refunded`; it
only moves amounts already credited, so it does not change the state. A
`Refunded` loan's `withdrawable` is normally zero, because no repayment was
possible before it was refunded.

## Reversibility

There is none. A terminal state cannot be left, a loan id cannot be reused, and
no admin, owner or upgrade function exists in `LoanSettlement`. `TestUSD` has an
owner only for minting the test token; that owner has no power over any loan.

## Accounting and rounding

- `outstanding = principal + interest - repaid`, in base units.
- Repayments are credited to `withdrawable[loanId]`, not transferred to the
  lender during `repay`.
- The contract's balance of a token must equal the sum of escrow for `Funded`
  loans plus `withdrawable` for all loans of that token, after every operation.
- Rounding: none. There is no division and no rate math. `interest` is an
  absolute amount, so every value is an exact integer in base units.
- A repayment is applied to the outstanding total only; the contract does not
  track a principal/interest split, because there is no per-period accrual to
  allocate.

## Invariants

1. `loanId == keccak256(abi.encode(terms))` for every stored loan, and the
   stored terms never change.
2. A loan id is proposed at most once, ever, including after a terminal state.
3. State changes only along the transition table above.
4. Only the borrower can `proposeLoan`, `claim` and `repay`; only the lender
   can `fund`, `refund` and `withdraw`.
5. `repaid <= principal + interest`, always.
6. `outstanding == 0` if and only if the state is `Repaid`, for a loan that
   reached `Active`.
7. Every token movement uses `SafeERC20`; every incoming and outgoing amount is
   checked against the actual balance change and must equal the requested
   amount exactly. A fee-on-transfer or false-returning token causes a revert,
   never a silent shortfall.
8. The contract holds no funds for `Proposed`, `Cancelled`, `Expired`,
   `Active`, `Defaulted` or `Repaid` loans; only `Funded` loans contribute
   escrow, and escrow equals `principal`.
9. `withdrawable` is credited only by `repay` and zeroed before the transfer in
   `withdraw`.
10. The allowlist is set in the constructor and has no mutator.
11. `LoanSettlement` has no `delegatecall`, no arbitrary external call and no
    selfdestruct.
12. No event carries ciphertext, plaintext, a signature, a key or a document.

## Events

All indexed fields are marked; no event carries private content.

```solidity
event LoanProposed(bytes32 indexed loanId, address indexed borrower, address indexed lender,
    address token, uint256 principal, uint256 interest, uint64 dueDate, uint64 graceSeconds,
    uint64 fundingDeadline, uint64 claimDeadline);
event LoanFunded(bytes32 indexed loanId, address indexed lender, uint256 amount);
event LoanClaimed(bytes32 indexed loanId, address indexed borrower, uint256 amount);
event RepaymentMade(bytes32 indexed loanId, address indexed borrower, uint256 amount,
    uint256 outstandingAfter);
event LenderWithdrew(bytes32 indexed loanId, address indexed lender, uint256 amount);
event LoanDefaulted(bytes32 indexed loanId);
event LoanRepaid(bytes32 indexed loanId);
event LoanCancelled(bytes32 indexed loanId);
event LoanExpired(bytes32 indexed loanId);
event LoanRefunded(bytes32 indexed loanId, address indexed lender, uint256 amount);
```

## Consequences

- The loan id is the commitment, so the off-chain agreement document hash and
  the on-chain id are linked by a signed confirmation, not by storing the
  document.
- A lender who never claims cannot recover the principal until `claimDeadline`;
  that is the cost of giving the borrower a claim window.
- Repayments after default are accepted, so a defaulted loan can still become
  `Repaid`; there is no penalty and no liquidation.
- The immutable allowlist means supporting another token requires a new
  deployment. That is deliberate: no admin key exists to compromise.

Test required: C5, C6, C7; T9, T10, T11. The cross-implementation commitment
test is required for C5.
