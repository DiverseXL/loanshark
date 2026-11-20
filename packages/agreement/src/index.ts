// Package entry point. Offline only: no chain call, no network import and no
// key material. The on-chain contract mirrors these definitions in ADR-0008.

export type { CommitmentDomain } from "./commitment.js";
export {
  COMMITMENT_ABI_PARAMETERS,
  commitmentOf,
  encodeCommitment,
  encodeTerms,
  loanIdOf,
  TERMS_ABI_PARAMETERS,
} from "./commitment.js";
export type {
  AgreementConfirmation,
  SignConfirmationFailureCode,
  SignConfirmationResult,
  VerifyConfirmationInput,
} from "./confirmation.js";
export {
  CONFIRMATION_DOMAIN,
  confirmationFor,
  confirmationMessage,
  confirmationMessageText,
  signAgreementConfirmation,
  verifyAgreementConfirmation,
} from "./confirmation.js";
export {
  DIANA_EVM_CHAIN_ID,
  TEST_ONLY_DOMAIN,
  TEST_ONLY_VERIFYING_CONTRACT,
} from "./domain.js";
export type {
  EvaluationCheck,
  Offer,
  OfferEvaluation,
  OfferEvaluator,
  OfferRequest,
} from "./offer-evaluator.js";
export {
  evaluateOffer,
  LocalOfferEvaluator,
  MAX_UINT256,
  MINIMUM_CLAIM_WINDOW,
  offerToTerms,
} from "./offer-evaluator.js";
export type { Address, Bytes32, Terms } from "./terms.js";
export { assertTermsShape, MAX_UINT64 } from "./terms.js";

export {
  AGREEMENT_TEXT_VERSION,
  agreementHashOf,
  canonicalAgreementBytes,
  canonicalAgreementText,
} from "./text.js";
