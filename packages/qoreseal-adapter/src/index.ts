// Package entry point. Offline only: nothing here imports the network
// helpers, and nothing here reads, writes or logs key material.
//
// The test-only helpers live in `@loanshark/qoreseal-adapter/testing` and are
// deliberately not reachable from this entry point.

export type {
  AdapterFailure,
  AdapterFailureCode,
  AdapterResult,
  MlkemRecipient,
  OpenEnvelopeInput,
  SealedEnvelope,
  SealMlkemInput,
} from "./adapter.js";
export { openEnvelope, sealMlkemToRecipient } from "./adapter.js";

export type {
  EnvelopeContext,
  EnvelopeKind,
  OfferContext,
  RequestContext,
} from "./aad.js";
export {
  AAD_VERSION,
  PROTOCOL_LABEL,
  aadFields,
  aadHex,
  encodeAad,
  expectedSigner,
} from "./aad.js";

export type {
  HybridSignature,
  MessageSigner,
  SignEnvelopeFailureCode,
  SignEnvelopeResult,
  SignedEnvelope,
  VerifySignedEnvelopeFailureCode,
  VerifySignedEnvelopeResult,
} from "./envelope.js";
export {
  aadDigest,
  envelopeDigest,
  signEnvelope,
  signedEnvelopeMessage,
  signedEnvelopeMessageText,
  verifySignedEnvelope,
} from "./envelope.js";
