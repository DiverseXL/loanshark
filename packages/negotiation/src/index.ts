// Package entry point. Pure and offline: no network, no chain call, no clock.
//
// It defines the request and offer payloads, canonical JSON, strict validation,
// exact amount conversion and the off-chain state machine (ADR-0019). It does
// not seal, sign, publish or evaluate; those belong to the adapter, the relay
// client, the app and `@loanshark/agreement` respectively.

export { formatAmount, parseAmount } from "./amounts.js";
export {
  canonicalByteLength,
  canonicalJson,
  encodeCanonical,
  MAX_PAYLOAD_BYTES,
} from "./canonical.js";
export type { ErrorCode, Result, ValidationError } from "./errors.js";
export { error, fail, ok } from "./errors.js";
export {
  BYTES32_PATTERN,
  DECIMAL_PATTERN,
  EVM_ADDRESS_PATTERN,
  HEX32_PATTERN,
  HEX64_PATTERN,
  MAX_NOTE_LENGTH,
  QOR1_PATTERN,
  TIMESTAMP_PATTERN,
} from "./fields.js";
export { ID_BYTES, randomId } from "./ids.js";
export type { OfferPayload, OfferTermsPayload } from "./offer.js";
export {
  buildOffer,
  checkOfferMatchesRequest,
  decodeOffer,
  encodeOffer,
  OFFER_SCHEMA_ID,
  toContractTerms,
  validateOffer,
  validateOfferTerms,
} from "./offer.js";
export type {
  NegotiationActor,
  NegotiationEvent,
  NegotiationState,
} from "./reducer.js";
export {
  INITIAL_STATE,
  NEGOTIATION_STATES,
  transition,
} from "./reducer.js";
export type { BuildRequestInput, RequestPayload } from "./request.js";
export {
  buildRequest,
  decodeRequest,
  encodeRequest,
  REQUEST_SCHEMA_ID,
  validateRequest,
} from "./request.js";
