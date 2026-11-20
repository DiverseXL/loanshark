// Every parameter and event field in the two deployed contracts, classified.
//
// test/footprint.test.ts reads the committed ABI from
// docs/deployments/manifest.json and fails when anything is unclassified, so a
// new field cannot ship without a decision about whether it is public.
//
// The honest answer for almost every field here is "public". That is the point:
// LOANSHARK settles on a transparent EVM.

export type FieldClass =
  | "public-calldata"
  | "public-event"
  | "public-view-result"
  | "conversation-key";

export interface FieldClassification {
  class: FieldClass;
  note: string;
}

const publicParty = (what: string): FieldClassification => ({
  class: "public-calldata",
  note: `${what} arrives in calldata and identifies a party or contract address.`,
});

const publicAmount = (what: string): FieldClassification => ({
  class: "public-calldata",
  note: `${what} arrives in calldata as an exact integer in base units.`,
});

const publicEvent = (what: string): FieldClassification => ({
  class: "public-event",
  note: `${what} is emitted and indexable.`,
});

const loanKey: FieldClassification = {
  class: "public-event",
  note: "The loan id is keccak256(chain id, contract, terms); it is a public identifier, not a secret.",
};

const termsFields: Record<string, FieldClassification> = {
  borrower: {
    class: "public-calldata",
    note: "The borrower's EVM address. Also emitted by LoanProposed.",
  },
  lender: {
    class: "public-calldata",
    note: "The lender's EVM address. Also emitted by LoanProposed.",
  },
  token: {
    class: "public-calldata",
    note: "The settlement token address, constrained to the immutable allowlist.",
  },
  principal: {
    class: "public-calldata",
    note: "The principal in base units. Emitted by LoanProposed and transferred by fund and claim.",
  },
  interest: {
    class: "public-calldata",
    note: "The fixed interest in base units. Emitted by LoanProposed.",
  },
  dueDate: {
    class: "public-calldata",
    note: "The unix-seconds due date. Emitted by LoanProposed.",
  },
  graceSeconds: {
    class: "public-calldata",
    note: "The grace period in seconds. Emitted by LoanProposed.",
  },
  fundingDeadline: {
    class: "public-calldata",
    note: "The last second at which fund is accepted. Emitted by LoanProposed.",
  },
  claimDeadline: {
    class: "public-calldata",
    note: "The last second at which claim is accepted. Emitted by LoanProposed.",
  },
  salt: {
    class: "public-calldata",
    note: "A 32-byte salt that only makes otherwise identical terms distinct; it is not a secret and carries no plaintext.",
  },
};

const termsComponents = (prefix: string): Record<string, FieldClassification> =>
  Object.fromEntries(
    Object.entries(termsFields).map(([name, value]) => [`${prefix}.${name}`, value]),
  );

const token: FieldClassification = publicParty("A token address");
const owner: FieldClassification = publicParty("A token holder address");
const spender: FieldClassification = publicParty("A spender address");
const amount: FieldClassification = publicAmount("An amount");
const value: FieldClassification = publicAmount("A token value");
const account: FieldClassification = publicParty("An account address");
const to: FieldClassification = publicParty("A recipient address");
const from: FieldClassification = publicParty("A sender address");

const loanId = loanKey;

export const CONTRACT_FIELD_CLASSIFICATION: Record<string, FieldClassification> = {
  // TestUSD, the labelled test token.
  "TestUSD.event.Approval.owner": publicEvent("The owner address"),
  "TestUSD.event.Approval.spender": publicEvent("The spender address"),
  "TestUSD.event.Approval.value": publicEvent("The approved amount"),
  "TestUSD.event.OwnershipTransferred.previousOwner": publicEvent("The previous owner"),
  "TestUSD.event.OwnershipTransferred.newOwner": publicEvent("The new owner"),
  "TestUSD.event.Transfer.from": publicEvent("The sender"),
  "TestUSD.event.Transfer.to": publicEvent("The recipient"),
  "TestUSD.event.Transfer.value": publicEvent("The amount"),
  "TestUSD.function.allowance.owner": owner,
  "TestUSD.function.allowance.spender": spender,
  "TestUSD.function.approve.spender": spender,
  "TestUSD.function.approve.value": value,
  "TestUSD.function.balanceOf.account": account,
  "TestUSD.function.mint.to": to,
  "TestUSD.function.mint.amount": amount,
  "TestUSD.function.transfer.to": to,
  "TestUSD.function.transfer.value": value,
  "TestUSD.function.transferFrom.from": from,
  "TestUSD.function.transferFrom.to": to,
  "TestUSD.function.transferFrom.value": value,
  "TestUSD.function.transferOwnership.newOwner": publicParty("The new owner address"),

  // LoanSettlement: lifecycle functions.
  "LoanSettlement.function.proposeLoan.terms": {
    class: "public-calldata",
    note: "The full ten-field terms tuple, public in calldata and repeated in LoanProposed.",
  },
  ...termsComponents("LoanSettlement.function.proposeLoan.terms"),
  "LoanSettlement.function.commitmentOf.terms": {
    class: "public-calldata",
    note: "The terms tuple passed to the view function; a read-only query, not a settlement action.",
  },
  ...termsComponents("LoanSettlement.function.commitmentOf.terms"),
  "LoanSettlement.function.fund.loanId": loanId,
  "LoanSettlement.function.cancel.loanId": loanId,
  "LoanSettlement.function.expire.loanId": loanId,
  "LoanSettlement.function.claim.loanId": loanId,
  "LoanSettlement.function.refund.loanId": loanId,
  "LoanSettlement.function.repay.loanId": loanId,
  "LoanSettlement.function.repay.amount": publicAmount("The repayment amount"),
  "LoanSettlement.function.markDefault.loanId": loanId,
  "LoanSettlement.function.withdraw.loanId": loanId,
  "LoanSettlement.function.stateOf.loanId": loanId,
  "LoanSettlement.function.termsOf.loanId": loanId,
  "LoanSettlement.function.repaidOf.loanId": loanId,
  "LoanSettlement.function.withdrawableOf.loanId": loanId,
  "LoanSettlement.function.outstandingOf.loanId": loanId,
  "LoanSettlement.function.isAllowedToken.token": token,

  // LoanSettlement: events.
  "LoanSettlement.event.LoanProposed.loanId": loanId,
  "LoanSettlement.event.LoanProposed.borrower": publicEvent("The borrower address"),
  "LoanSettlement.event.LoanProposed.lender": publicEvent("The lender address"),
  "LoanSettlement.event.LoanProposed.token": publicEvent("The token address"),
  "LoanSettlement.event.LoanProposed.principal": publicEvent("The principal"),
  "LoanSettlement.event.LoanProposed.interest": publicEvent("The interest"),
  "LoanSettlement.event.LoanProposed.dueDate": publicEvent("The due date"),
  "LoanSettlement.event.LoanProposed.graceSeconds": publicEvent("The grace period"),
  "LoanSettlement.event.LoanProposed.fundingDeadline": publicEvent("The funding deadline"),
  "LoanSettlement.event.LoanProposed.claimDeadline": publicEvent("The claim deadline"),
  "LoanSettlement.event.LoanFunded.loanId": loanId,
  "LoanSettlement.event.LoanFunded.lender": publicEvent("The lender address"),
  "LoanSettlement.event.LoanFunded.amount": publicEvent("The funded amount"),
  "LoanSettlement.event.LoanClaimed.loanId": loanId,
  "LoanSettlement.event.LoanClaimed.borrower": publicEvent("The borrower address"),
  "LoanSettlement.event.LoanClaimed.amount": publicEvent("The claimed amount"),
  "LoanSettlement.event.RepaymentMade.loanId": loanId,
  "LoanSettlement.event.RepaymentMade.borrower": publicEvent("The borrower address"),
  "LoanSettlement.event.RepaymentMade.amount": publicEvent("The repayment amount"),
  "LoanSettlement.event.RepaymentMade.outstandingAfter": publicEvent("The remaining balance"),
  "LoanSettlement.event.LenderWithdrew.loanId": loanId,
  "LoanSettlement.event.LenderWithdrew.lender": publicEvent("The lender address"),
  "LoanSettlement.event.LenderWithdrew.amount": publicEvent("The withdrawn amount"),
  "LoanSettlement.event.LoanDefaulted.loanId": loanId,
  "LoanSettlement.event.LoanRepaid.loanId": loanId,
  "LoanSettlement.event.LoanCancelled.loanId": loanId,
  "LoanSettlement.event.LoanExpired.loanId": loanId,
  "LoanSettlement.event.LoanRefunded.loanId": loanId,
  "LoanSettlement.event.LoanRefunded.lender": publicEvent("The lender address"),
  "LoanSettlement.event.LoanRefunded.amount": publicEvent("The refunded amount"),
};

/** True when the field is called a conversation key: none exist today. */
export const CONVERSATION_KEY_FIELDS = Object.entries(CONTRACT_FIELD_CLASSIFICATION)
  .filter(([, value]) => value.class === "conversation-key")
  .map(([key]) => key);
