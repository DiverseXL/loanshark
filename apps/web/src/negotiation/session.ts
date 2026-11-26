// The borrower and lender negotiation orchestration (ADR-0019).
//
// Everything is injected: the relay client, the seal identity, the on-chain
// account reader, the registry, the wallet signer and the clock. Tests supply a
// real in-process relay and real seal-account keys with a MOCK account client
// and MOCK QoreX signer. The app supplies the browser adapters.
//
// Every fetch is verified before use. A missing binding or card is
// CounterpartyNotOnboarded and nothing is sent. A transport failure is
// RelayUnavailable. No function here sends a transaction.

import {
  canonicalAgreementText,
  agreementHashOf,
  confirmationFor,
  evaluateOffer,
  signAgreementConfirmation,
  type AgreementConfirmation,
  type CommitmentDomain,
  type EvaluationCheck,
  type Terms,
} from "@loanshark/agreement";
import type { EnvelopeContext, MessageSigner, SignedEnvelope } from "@loanshark/qoreseal-adapter";
import { encodeAad, sealMlkemToRecipient, signEnvelope } from "@loanshark/qoreseal-adapter";
import {
  createBindingStatementFields,
  bindingStatementBytes,
  signBindingStatement,
  type SealAccountIdentity,
} from "@loanshark/seal-account";
import type { PqcAccountReader } from "@loanshark/chain-client";
import type {
  BindingRecordInput,
  CardRecordInput,
  ConfirmationRecordInput,
  EnvelopeRecordInput,
  InboxItem,
  StoredBindingRecord,
  StoredCardRecord,
  StoredConfirmationRecord,
  StoredEnvelopeRecord,
  VerifiedConfirmation,
} from "@loanshark/relay-client";
import type { GetEnvelopeOptions, RelayResult } from "@loanshark/relay-client";
import {
  buildOffer,
  buildRequest,
  decodeOffer,
  toContractTerms,
  decodeRequest,
  encodeOffer,
  encodeRequest,
  validateOfferTerms,
  type BuildRequestInput,
  type OfferPayload,
  type OfferTermsPayload,
  type RequestPayload,
  type ValidationError,
} from "@loanshark/negotiation";
import { bytesToBase64, base64ToBytes } from "./codec.js";

const REQUEST_PURPOSE = "loanshark/request";
const OFFER_PURPOSE = "loanshark/offer";

export interface RelayLike {
  postEnvelope(input: EnvelopeRecordInput): Promise<RelayResult<StoredEnvelopeRecord>>;
  getEnvelope(id: string, options: GetEnvelopeOptions): Promise<RelayResult<StoredEnvelopeRecord>>;
  getInbox(walletAddress: string): Promise<RelayResult<InboxItem[]>>;
  postCard(input: CardRecordInput): Promise<RelayResult<StoredCardRecord>>;
  getCard(
    sealAddress: string,
    options: { registry: NegotiationRegistry },
  ): Promise<RelayResult<StoredCardRecord>>;
  postBinding(input: BindingRecordInput): Promise<RelayResult<StoredBindingRecord>>;
  getBinding(
    walletAddress: string,
    options: { walletAccountClient: PqcAccountReader; sealAccountClient: PqcAccountReader },
  ): Promise<RelayResult<StoredBindingRecord>>;
  postConfirmation(input: ConfirmationRecordInput): Promise<RelayResult<StoredConfirmationRecord>>;
  getConfirmations(
    loanId: string,
    options: {
      accountClient: PqcAccountReader;
      expectedDomain?: { chainId: bigint; verifyingContract: string };
      expectedSignerW?: string;
      expectedRole?: "borrower" | "lender";
    },
  ): Promise<RelayResult<VerifiedConfirmation[]>>;
}

export interface NegotiationRegistry {
  readonly chainId: string;
  getPqPublicKey(address: string): Promise<Uint8Array | null>;
  getMlkemPublicKey(address: string): Promise<Uint8Array | null>;
}

export interface NegotiationDeps {
  relay: RelayLike;
  identity: SealAccountIdentity;
  accountClient: PqcAccountReader;
  registry: NegotiationRegistry;
  nativeChainId: string;
  /** The local party's wallet qor1 address. */
  localW: string;
  /** The local party's wallet EVM address. */
  localWEvm: `0x${string}`;
  /** QoreX through `QorexMessageSigner`, or a TEST ONLY signer. */
  walletSigner: MessageSigner;
  now: () => number;
}

export type SessionFailureState =
  | "CounterpartyNotOnboarded"
  | "RelayUnavailable"
  | "VerificationRefused"
  | "ValidationFailed"
  | "LocalFailure";

export type SessionResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      state: SessionFailureState;
      message: string;
      errors?: readonly ValidationError[];
    };

const sessionOk = <T>(value: T): SessionResult<T> => ({ ok: true, value });
const sessionFail = <T>(
  state: SessionFailureState,
  message: string,
  errors?: readonly ValidationError[],
): SessionResult<T> =>
  errors === undefined ? { ok: false, state, message } : { ok: false, state, message, errors };

const refusalState = (result: { refusal: string; statusCode?: number }): SessionFailureState => {
  if (result.refusal === "http-error") {
    return result.statusCode === 404 ? "CounterpartyNotOnboarded" : "RelayUnavailable";
  }
  if (result.refusal === "content-address-mismatch" || result.refusal === "aad-mismatch") {
    return "VerificationRefused";
  }
  if (result.refusal === "malformed-response") return "RelayUnavailable";
  return "CounterpartyNotOnboarded";
};

export interface Counterparty {
  walletW: string;
  sealAddress: string;
  walletEvmAddress: string;
  recipientMlkemKey: Uint8Array;
}

/** Binding first, then card, then the ML-KEM key. Any failure stops the send. */
export async function resolveCounterparty(
  deps: NegotiationDeps,
  walletW: string,
): Promise<SessionResult<Counterparty>> {
  const binding = await deps.relay.getBinding(walletW, {
    walletAccountClient: deps.accountClient,
    sealAccountClient: deps.accountClient,
  });
  if (!binding.ok) {
    return sessionFail(refusalState(binding), `binding refused: ${binding.message}`);
  }
  const fields = (
    binding.value.statement as unknown as {
      fields?: { sealAddress?: unknown; walletEvmAddress?: unknown };
    }
  ).fields;
  const sealAddress = fields?.sealAddress;
  const walletEvmAddress = fields?.walletEvmAddress;
  if (typeof sealAddress !== "string" || typeof walletEvmAddress !== "string") {
    return sessionFail("CounterpartyNotOnboarded", "the binding names no seal address");
  }

  const card = await deps.relay.getCard(sealAddress, { registry: deps.registry });
  if (!card.ok) {
    return sessionFail(refusalState(card), `card refused: ${card.message}`);
  }

  let recipientMlkemKey: Uint8Array | null;
  try {
    recipientMlkemKey = await deps.registry.getMlkemPublicKey(sealAddress);
  } catch (err) {
    return sessionFail(
      "RelayUnavailable",
      `the registry read failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (recipientMlkemKey === null) {
    return sessionFail("CounterpartyNotOnboarded", "the seal account has no registered ML-KEM key");
  }
  return sessionOk({ walletW, sealAddress, walletEvmAddress, recipientMlkemKey });
}

const senderSigner = (deps: NegotiationDeps): MessageSigner => ({
  sign: async (message) => deps.identity.signMessage(message),
});

async function sealAndSign(args: {
  deps: NegotiationDeps;
  purpose: string;
  plaintext: Uint8Array;
  context: EnvelopeContext;
  recipientMlkemKey: Uint8Array;
}): Promise<SessionResult<{ envelope: Uint8Array; signature: SignedEnvelope["signature"] }>> {
  let aad: Uint8Array;
  try {
    aad = encodeAad(args.context);
  } catch (err) {
    return sessionFail("LocalFailure", `the AAD is invalid: ${String(err)}`);
  }
  const sealed = sealMlkemToRecipient({
    chainId: args.context.chainId,
    purpose: args.purpose,
    recipient: { mlkemPublicKey: args.recipientMlkemKey },
    // A fresh copy keeps the array in this realm. A test runner or an iframe
    // can hand back a Uint8Array from another realm, which fails `instanceof`.
    plaintext: Uint8Array.from(args.plaintext),
    aad,
  });
  if (!sealed.ok) {
    return sessionFail("LocalFailure", `sealing failed: ${sealed.code} (${sealed.message})`);
  }
  const signed = await signEnvelope({
    envelope: sealed.value.envelope,
    context: args.context,
    signer: senderSigner(args.deps),
  });
  if (!signed.ok) {
    return sessionFail("LocalFailure", `signing failed: ${signed.code} (${signed.message})`);
  }
  return sessionOk({ envelope: signed.value.envelope, signature: signed.value.signature });
}

/** Seals, signs and posts a request to the lender. */
export async function sendRequest(
  deps: NegotiationDeps,
  payload: RequestPayload,
): Promise<SessionResult<{ envelopeId: string; counterparty: Counterparty }>> {
  const encoded = encodeRequest(payload);
  if (!encoded.ok) return sessionFail("ValidationFailed", "the request is invalid", encoded.errors);

  const counterparty = await resolveCounterparty(deps, payload.lenderW);
  if (!counterparty.ok) return counterparty;

  const context: EnvelopeContext = {
    kind: "request",
    chainId: deps.nativeChainId,
    requestId: payload.requestId,
    borrower: payload.borrowerW,
    version: "1",
  };
  const sealed = await sealAndSign({
    deps,
    purpose: REQUEST_PURPOSE,
    plaintext: encoded.value,
    context,
    recipientMlkemKey: counterparty.value.recipientMlkemKey,
  });
  if (!sealed.ok) return sealed;

  const posted = await deps.relay.postEnvelope({
    kind: "request",
    loanRef: payload.requestId,
    senderW: payload.borrowerW,
    recipientW: payload.lenderW,
    ciphertext: bytesToBase64(sealed.value.envelope),
    signature: sealed.value.signature as unknown as Record<string, unknown>,
    aad: context as unknown as Record<string, unknown>,
    createdAt: new Date(payload.createdAt).toISOString(),
  });
  if (!posted.ok)
    return sessionFail(refusalState(posted), `the relay refused the request: ${posted.message}`);
  return sessionOk({ envelopeId: posted.value.id, counterparty: counterparty.value });
}

/** Seals, signs and posts an offer to the borrower. */
export async function sendOffer(
  deps: NegotiationDeps,
  request: RequestPayload,
  terms: OfferTermsPayload,
  offerExpiresAt: string,
  note = "",
): Promise<SessionResult<{ envelopeId: string }>> {
  const checked = validateOfferTerms(terms);
  if (!checked.ok)
    return sessionFail("ValidationFailed", "the offer terms are invalid", checked.errors);

  const built = buildOffer({
    requestId: request.requestId,
    borrowerW: request.borrowerW,
    lenderW: request.lenderW,
    terms: checked.value,
    offerExpiresAt,
    note,
  });
  if (!built.ok) return sessionFail("ValidationFailed", "the offer is invalid", built.errors);

  const encoded = encodeOffer(built.value);
  if (!encoded.ok) return sessionFail("ValidationFailed", "the offer is invalid", encoded.errors);

  const counterparty = await resolveCounterparty(deps, request.borrowerW);
  if (!counterparty.ok) return counterparty;

  const context: EnvelopeContext = {
    kind: "offer",
    chainId: deps.nativeChainId,
    requestId: built.value.requestId,
    offerId: built.value.offerId,
    borrower: built.value.borrowerW,
    lender: built.value.lenderW,
    version: "1",
  };
  const sealed = await sealAndSign({
    deps,
    purpose: OFFER_PURPOSE,
    plaintext: encoded.value,
    context,
    recipientMlkemKey: counterparty.value.recipientMlkemKey,
  });
  if (!sealed.ok) return sealed;

  const posted = await deps.relay.postEnvelope({
    kind: "offer",
    loanRef: built.value.requestId,
    senderW: built.value.lenderW,
    recipientW: built.value.borrowerW,
    ciphertext: bytesToBase64(sealed.value.envelope),
    signature: sealed.value.signature as unknown as Record<string, unknown>,
    aad: context as unknown as Record<string, unknown>,
    createdAt: new Date(deps.now() * 1000).toISOString(),
  });
  if (!posted.ok)
    return sessionFail(refusalState(posted), `the relay refused the offer: ${posted.message}`);
  return sessionOk({ envelopeId: posted.value.id });
}

export async function listInbox(deps: NegotiationDeps): Promise<SessionResult<InboxItem[]>> {
  const inbox = await deps.relay.getInbox(deps.localW);
  if (!inbox.ok)
    return sessionFail(refusalState(inbox), `the relay inbox failed: ${inbox.message}`);
  return sessionOk(inbox.value);
}

/**
 * Fetches, verifies and opens an envelope. The sender's seal address comes from
 * a verified binding, never from the envelope itself.
 */
type PayloadDecoder = (
  bytes: Uint8Array,
) =>
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly errors: readonly ValidationError[] };

async function openItem<T>(
  deps: NegotiationDeps,
  item: InboxItem,
  decode: PayloadDecoder,
  expectedKind: "request" | "offer",
): Promise<SessionResult<T>> {
  if (item.kind !== expectedKind) {
    return sessionFail("VerificationRefused", `the item is a ${item.kind}, not a ${expectedKind}`);
  }
  const counterparty = await resolveCounterparty(deps, item.senderW);
  if (!counterparty.ok) return counterparty;
  if (item.recipientW !== deps.localW) {
    return sessionFail("VerificationRefused", "the envelope is addressed to another wallet");
  }

  const record = await deps.relay.getEnvelope(item.id, {
    accountClient: deps.accountClient,
    expectedBorrowerW: expectedKind === "request" ? item.senderW : deps.localW,
    expectedLenderW: expectedKind === "request" ? deps.localW : item.senderW,
    signerE: counterparty.value.sealAddress,
  });
  if (!record.ok) {
    return sessionFail(refusalState(record), `envelope refused: ${record.message}`);
  }

  const context = record.value.aad as unknown as EnvelopeContext;
  let plaintext: Uint8Array;
  try {
    plaintext = deps.identity.openEnvelope({
      purpose: expectedKind === "request" ? REQUEST_PURPOSE : OFFER_PURPOSE,
      envelope: base64ToBytes(record.value.ciphertext),
      aad: encodeAad(context),
    });
  } catch (err) {
    return sessionFail(
      "VerificationRefused",
      `the envelope did not open: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const decoded = decode(plaintext);
  if (!decoded.ok)
    return sessionFail("VerificationRefused", "the payload failed validation", decoded.errors);
  return sessionOk(decoded.value as unknown as T);
}

export const receiveRequest = (deps: NegotiationDeps, item: InboxItem) =>
  openItem<RequestPayload>(deps, item, decodeRequest, "request");

export const receiveOffer = (deps: NegotiationDeps, item: InboxItem) =>
  openItem<OfferPayload>(deps, item, decodeOffer, "offer");

export interface OfferEvaluationView {
  eligible: boolean;
  checks: EvaluationCheck[];
  terms: Terms;
}

/** Runs the local evaluator on a verified offer against the original request. */
export function evaluateIncomingOffer(
  deps: NegotiationDeps,
  request: RequestPayload,
  offer: OfferPayload,
  now = deps.now(),
): SessionResult<OfferEvaluationView> {
  if (offer.requestId !== request.requestId) {
    return sessionFail("VerificationRefused", "the offer answers a different request");
  }
  const terms = toContractTerms(offer.terms);
  const evaluation = evaluateOffer(
    {
      borrower: deps.localWEvm,
      token: request.token,
      principal: BigInt(request.principal),
      maxTotalCost: BigInt(request.maxTotalCost),
      latestDueDate: BigInt(request.latestDueDate),
    },
    {
      lender: terms.lender,
      token: terms.token,
      principal: terms.principal,
      interest: terms.interest,
      dueDate: terms.dueDate,
      graceSeconds: terms.graceSeconds,
      fundingDeadline: terms.fundingDeadline,
      claimDeadline: terms.claimDeadline,
    },
    BigInt(now),
  );
  return sessionOk({ eligible: evaluation.eligible, checks: evaluation.checks, terms });
}

/** Signs the borrower or lender confirmation with W (QoreX or a TEST signer). */
export async function signConfirmation(
  deps: NegotiationDeps,
  terms: Terms,
  domain: CommitmentDomain,
): Promise<
  SessionResult<{ confirmation: AgreementConfirmation; signature: unknown; message: Uint8Array }>
> {
  const signed = await signAgreementConfirmation({ terms, domain, signer: deps.walletSigner });
  if (!signed.ok) return sessionFail("LocalFailure", `signing failed: ${signed.message}`);
  return sessionOk({
    confirmation: {
      chainId: signed.value.chainId,
      verifyingContract: signed.value.verifyingContract,
      loanId: signed.value.loanId,
      agreementHash: signed.value.agreementHash,
    },
    signature: signed.value.signature,
    message: signed.value.message,
  });
}

export async function publishConfirmation(
  deps: NegotiationDeps,
  args: {
    loanId: string;
    agreementHash: string;
    chainId: bigint;
    verifyingContract: string;
    role: "borrower" | "lender";
    signature: unknown;
  },
): Promise<SessionResult<StoredConfirmationRecord>> {
  const posted = await deps.relay.postConfirmation({
    loanId: args.loanId,
    chainId: args.chainId.toString(10),
    verifyingContract: args.verifyingContract,
    agreementHash: args.agreementHash,
    signerW: deps.localW,
    role: args.role,
    signature: args.signature as Record<string, unknown>,
    createdAt: new Date(deps.now() * 1000).toISOString(),
  });
  if (!posted.ok)
    return sessionFail(
      refusalState(posted),
      `the relay refused the confirmation: ${posted.message}`,
    );
  return sessionOk(posted.value);
}

export async function fetchConfirmations(
  deps: NegotiationDeps,
  loanId: string,
  domain: CommitmentDomain,
): Promise<SessionResult<VerifiedConfirmation[]>> {
  const list = await deps.relay.getConfirmations(loanId, {
    accountClient: deps.accountClient,
    expectedDomain: { chainId: domain.chainId, verifyingContract: domain.verifyingContract },
  });
  if (!list.ok) return sessionFail(refusalState(list), `confirmations refused: ${list.message}`);
  return sessionOk(list.value);
}

/** Publishes this seal account's recipient card. */
export async function publishCard(deps: NegotiationDeps): Promise<SessionResult<StoredCardRecord>> {
  const card = deps.identity.recipientCard();
  const posted = await deps.relay.postCard({
    sealAddress: deps.identity.address,
    card: card as unknown as Record<string, unknown>,
  });
  if (!posted.ok)
    return sessionFail(refusalState(posted), `the relay refused the card: ${posted.message}`);
  return sessionOk(posted.value);
}

/** W signs the binding statement, E countersigns it, and it is published. */
export async function publishBinding(
  deps: NegotiationDeps,
): Promise<SessionResult<StoredBindingRecord>> {
  const fields = createBindingStatementFields({
    chainId: deps.nativeChainId,
    walletAddress: deps.localW,
    sealAddress: deps.identity.address,
    walletEvmAddress: deps.localWEvm,
    issuedAt: new Date(deps.now() * 1000),
  });
  const walletSignature = await deps.walletSigner.sign(bindingStatementBytes(fields));
  let statement;
  try {
    statement = signBindingStatement({
      fields,
      walletSignature,
      sealIdentity: deps.identity,
    });
  } catch (err) {
    return sessionFail("LocalFailure", `the binding could not be signed: ${String(err)}`);
  }
  const posted = await deps.relay.postBinding({
    walletAddress: deps.localW,
    statement: statement as unknown as Record<string, unknown>,
  });
  if (!posted.ok)
    return sessionFail(refusalState(posted), `the relay refused the binding: ${posted.message}`);
  return sessionOk(posted.value);
}

/** The canonical text, hashes and loan id both parties see before confirming. */
export function agreementPreview(terms: Terms, domain: CommitmentDomain) {
  const confirmation = confirmationFor(terms, domain);
  return {
    text: canonicalAgreementText(terms),
    agreementHash: agreementHashOf(terms),
    loanId: confirmation.loanId,
    message: new TextDecoder().decode(confirmation.message),
  };
}

/** 32 CSPRNG bytes as 0x-prefixed hex: the offer salt. */
export function randomSalt(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  let out = "0x";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}

/** A request form's input, converted and validated with a deterministic id. */
export function createRequest(
  input: Omit<BuildRequestInput, "requestId"> & { requestId?: string },
): SessionResult<RequestPayload> {
  const built = buildRequest(input);
  if (!built.ok) return sessionFail("ValidationFailed", "the request is invalid", built.errors);
  return sessionOk(built.value);
}
