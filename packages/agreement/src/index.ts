// Package entry point. Offline only: no chain call, no network import and no
// key material. The on-chain contract mirrors these definitions in ADR-0008.

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

export type { Terms } from "./terms.js";
export { assertTermsShape, MAX_UINT64 } from "./terms.js";
export type { Address, Bytes32 } from "./terms.js";

export { commitmentOf, encodeTerms, loanIdOf, TERMS_ABI_PARAMETERS } from "./commitment.js";

export {
  AGREEMENT_TEXT_VERSION,
  agreementHashOf,
  canonicalAgreementBytes,
  canonicalAgreementText,
} from "./text.js";
