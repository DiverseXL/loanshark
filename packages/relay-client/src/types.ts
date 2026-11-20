// Types for @loanshark/relay-client (ADR-0017).

import type {
  BindingRecordInput,
  CardRecordInput,
  EnvelopeRecordInput,
  InboxItem,
  StoredBindingRecord,
  StoredCardRecord,
  StoredEnvelopeRecord,
} from "@loanshark/api";
import type { PqcAccountReader } from "@loanshark/chain-client";

export type {
  BindingRecordInput,
  CardRecordInput,
  EnvelopeRecordInput,
  InboxItem,
  StoredBindingRecord,
  StoredCardRecord,
  StoredEnvelopeRecord,
};

export type RelayRefusalCode =
  | "http-error"
  | "content-address-mismatch"
  | "aad-mismatch"
  | "envelope-signature-invalid"
  | "card-invalid"
  | "binding-invalid"
  | "address-mismatch"
  | "malformed-response";

export type RelayResult<T> =
  | { ok: true; value: T }
  | { ok: false; refusal: RelayRefusalCode; message: string; statusCode?: number };

export interface CardRegistryReader {
  getPqPublicKey(sealAddress: string): Promise<Uint8Array | null>;
  getMlkemPublicKey(sealAddress: string): Promise<Uint8Array | null>;
  chainId: string;
}

export type CardVerificationKeys =
  | CardRegistryReader
  | {
      chainId: string;
      pqPublicKey: Uint8Array;
      mlkemPublicKey: Uint8Array;
    };

export interface GetEnvelopeOptions {
  accountClient: PqcAccountReader;
  expectedBorrowerW?: string;
  expectedLenderW?: string;
  signerE?: string;
}

export interface GetCardOptions {
  registry: CardVerificationKeys;
}

export interface GetBindingOptions {
  walletAccountClient: PqcAccountReader;
  sealAccountClient: PqcAccountReader;
  now?: Date;
  requireEvmAddressMatch?: boolean;
}
