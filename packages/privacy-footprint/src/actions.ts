// Privacy footprint per user action.
//
// This is the single typed source for "what is private and what is not" on each
// action. docs/PRIVACY_FOOTPRINT.md is written from it, the preflight library
// lists the public fields of a planned action from it, and the test in
// test/footprint.test.ts checks the contract ABI against it.
//
// Nothing here is a claim of anonymity. QoreSeal protects content; addresses,
// amounts, timing and sizes are public or visible to the relay.

export type FootprintActionId =
  | "create-request"
  | "send-offer"
  | "publish-card"
  | "publish-binding"
  | "propose-loan"
  | "approve-token"
  | "fund"
  | "claim"
  | "repay"
  | "withdraw"
  | "cancel"
  | "refund";

export interface ActionFootprint {
  id: FootprintActionId;
  label: string;
  /** Held only on the user's device, or encrypted to a chosen recipient. */
  encryptedOffChain: string[];
  /** What the loopback relay server sees if the action uses it. */
  relaySees: string[];
  /** What is in calldata, events or public state on the settlement chain. */
  publicOnChain: string[];
  /** What this action does not hide, stated so it cannot be implied otherwise. */
  notPrivate: string[];
}

const NO_RELAY = ["nothing: this action does not use the relay"];

export const FOOTPRINTS: Record<FootprintActionId, ActionFootprint> = {
  "create-request": {
    id: "create-request",
    label: "Borrower creates a request",
    encryptedOffChain: [
      "the request document: amount, purpose, repayment plan and any narrative",
      "the borrower's selected documents, if any are attached",
    ],
    relaySees: [
      "sender and recipient qor1 addresses",
      "the loan reference string",
      "the envelope size in bytes",
      "the time the record was posted",
      "the client IP address of the poster",
    ],
    publicOnChain: [],
    notPrivate: [
      "that a request exists and between which two addresses, if it is sent through the relay",
      "the borrower's wallet balance and history",
    ],
  },
  "send-offer": {
    id: "send-offer",
    label: "Lender sends an offer",
    encryptedOffChain: [
      "the offer terms: principal, interest, due date, grace, deadlines",
      "any note the lender writes to the borrower",
    ],
    relaySees: [
      "sender and recipient qor1 addresses",
      "the loan reference string",
      "the envelope size in bytes",
      "the time the record was posted",
      "the client IP address of the poster",
    ],
    publicOnChain: [],
    notPrivate: [
      "that an offer was sent, by whom, to whom and when, if it goes through the relay",
      "the lender's wallet balance and history",
    ],
  },
  "publish-card": {
    id: "publish-card",
    label: "Party publishes a recipient card",
    encryptedOffChain: ["nothing: a recipient card is public by design"],
    relaySees: [
      "the seal account (E) qor1 address",
      "the card payload size",
      "the time the card was posted",
      "the client IP address of the poster",
    ],
    publicOnChain: ["nothing directly: the card is an off-chain record"],
    notPrivate: [
      "the seal account E's address, its ML-DSA-87 public key and the SHA3-256 of its ML-KEM-1024 key",
      "the link between E and the wallet W once a binding statement is published",
    ],
  },
  "publish-binding": {
    id: "publish-binding",
    label: "Party publishes the W/E binding statement",
    encryptedOffChain: ["nothing: the binding statement is public by design"],
    relaySees: [
      "the wallet (W) qor1 address",
      "the statement size",
      "the time the statement was posted",
      "the client IP address of the poster",
    ],
    publicOnChain: ["nothing directly: the statement is an off-chain record"],
    notPrivate: [
      "the W and E qor1 addresses and W's EVM address form",
      "the signature over the statement",
      "the validity window",
    ],
  },
  "propose-loan": {
    id: "propose-loan",
    label: "Borrower proposes the loan on chain",
    encryptedOffChain: ["nothing on this action: the terms become public"],
    relaySees: NO_RELAY,
    publicOnChain: [
      "loanId (keccak256 of chain id, contract address and terms)",
      "borrower, lender and token addresses",
      "principal and interest in base units",
      "due date, grace period, funding deadline and claim deadline",
      "the block timestamp and the transaction sender",
    ],
    notPrivate: [
      "the whole agreement's economic terms, because Terms is calldata and LoanProposed repeats them",
      "the link between the loan and the encrypted request and offer, if the same addresses were used",
    ],
  },
  "approve-token": {
    id: "approve-token",
    label: "Payer approves the settlement contract to move the token",
    encryptedOffChain: [],
    relaySees: NO_RELAY,
    publicOnChain: [
      "token owner, spender (the settlement contract) and approved amount",
      "the Approval event and the transaction sender",
    ],
    notPrivate: [
      "the approval amount, which is why an unlimited approval is flagged",
      "the owner's balance, visible to the token contract and on chain",
    ],
  },
  fund: {
    id: "fund",
    label: "Lender funds the loan",
    encryptedOffChain: [],
    relaySees: NO_RELAY,
    publicOnChain: [
      "loanId, lender address and principal amount",
      "the token Transfer event",
      "the block timestamp",
    ],
    notPrivate: ["that this lender funded this borrower for this amount at this time"],
  },
  claim: {
    id: "claim",
    label: "Borrower claims the principal",
    encryptedOffChain: [],
    relaySees: NO_RELAY,
    publicOnChain: [
      "loanId, borrower address and principal amount",
      "the token Transfer event",
      "the block timestamp",
    ],
    notPrivate: ["that the principal moved to this borrower at this time"],
  },
  repay: {
    id: "repay",
    label: "Borrower repays",
    encryptedOffChain: [],
    relaySees: NO_RELAY,
    publicOnChain: [
      "loanId, borrower address, amount and the outstanding amount after",
      "the token Transfer event",
      "the block timestamp",
    ],
    notPrivate: ["each repayment amount and how much remains outstanding"],
  },
  withdraw: {
    id: "withdraw",
    label: "Lender withdraws credited repayments",
    encryptedOffChain: [],
    relaySees: NO_RELAY,
    publicOnChain: ["loanId, lender address and amount", "the token Transfer event"],
    notPrivate: ["the withdrawal amount and when it happened"],
  },
  cancel: {
    id: "cancel",
    label: "Borrower cancels an unfunded proposal",
    encryptedOffChain: [],
    relaySees: NO_RELAY,
    publicOnChain: ["loanId, the transaction sender and the block timestamp"],
    notPrivate: ["that this loan was cancelled and by whom"],
  },
  refund: {
    id: "refund",
    label: "Lender reclaims the principal after the claim deadline",
    encryptedOffChain: [],
    relaySees: NO_RELAY,
    publicOnChain: ["loanId, lender address and principal amount", "the token Transfer event"],
    notPrivate: ["that the loan was never claimed and the principal returned"],
  },
};

export const FOOTPRINT_ACTIONS = Object.values(FOOTPRINTS);
