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

export interface ApiErrorResponse {
  error: string;
  message: string;
}
