// Package entry point. Offline and browser-safe: no Node built-in, no network
// module, no console and no storage. The identity holds its secrets in private
// fields and exposes only public data, signatures, envelopes and plaintext.

export type {
  BindingStatement,
  BindingStatementFailureCode,
  BindingStatementFields,
  BindingVerification,
} from "./binding.js";
export {
  BINDING_CLOCK_SKEW_MINUTES,
  BINDING_STATEMENT_DOMAIN,
  BINDING_STATEMENT_VERSION,
  bindingStatementBytes,
  bindingStatementText,
  createBindingStatementFields,
  DEFAULT_BINDING_LIFETIME_DAYS,
  formatTimestamp,
  MAX_BINDING_LIFETIME_DAYS,
  signBindingStatement,
  verifyBindingStatement,
} from "./binding.js";
export type {
  GeneratedSealAccount,
  SealAccountInput,
  SealAccountJson,
  SealAccountPublicData,
} from "./identity.js";
export {
  generateSealAccount,
  ML_DSA_87_ALGORITHM_ID,
  ML_KEM_1024_ALGORITHM_ID,
  normalizeMnemonic,
  SEAL_ACCOUNT_REDACTION,
  SealAccountIdentity,
} from "./identity.js";

export { REDACTION_MARKER, SecretBytes, SecretString } from "./secret.js";
