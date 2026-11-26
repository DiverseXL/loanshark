// Shared types for the LOANSHARK ephemeral ciphertext relay server (ADR-0017).

export type EnvelopeKind = "request" | "offer";

export interface EnvelopeRecordInput {
  kind: EnvelopeKind;
  loanRef: string;
  senderW: string;
  recipientW: string;
  ciphertext: string; // base64
  signature: Record<string, unknown>;
  aad: Record<string, unknown>;
  createdAt: string; // ISO-8601 UTC
}

export interface StoredEnvelopeRecord extends EnvelopeRecordInput {
  id: string; // 64-char lowercase hex content address
}

export interface InboxItem {
  id: string;
  kind: EnvelopeKind;
  loanRef: string;
  senderW: string;
  recipientW: string;
  createdAt: string;
}

export interface CardRecordInput {
  sealAddress: string;
  card: Record<string, unknown>;
}

export interface StoredCardRecord {
  sealAddress: string;
  card: Record<string, unknown>;
  updatedAt: string;
}

export interface BindingRecordInput {
  walletAddress: string;
  statement: Record<string, unknown>;
}

export interface StoredBindingRecord {
  walletAddress: string;
  statement: Record<string, unknown>;
  updatedAt: string;
}

export type ConfirmationRole = "borrower" | "lender";

export interface ConfirmationRecordInput {
  /** 0x plus 64 hex characters: the domain-separated loan id. */
  loanId: string;
  /** EVM chain id, as a decimal string. */
  chainId: string;
  /** 0x plus 40 hex characters. */
  verifyingContract: string;
  /** 0x plus 64 hex characters: SHA-256 of the canonical agreement text. */
  agreementHash: string;
  /** The qor1 wallet account that signed. */
  signerW: string;
  role: ConfirmationRole;
  /** Raw QoreX signature object; the server does not inspect it. */
  signature: Record<string, unknown>;
  createdAt: string;
}

export interface StoredConfirmationRecord extends ConfirmationRecordInput {
  id: string; // 64-char lowercase hex content address
}

export interface ApiErrorResponse {
  error: string;
  message: string;
}
