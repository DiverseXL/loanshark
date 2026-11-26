// Types for @loanshark/relay-client (ADR-0017).

import type {
  BindingRecordInput,
  CardRecordInput,
  ConfirmationRecordInput,
  ConfirmationRole,
  EnvelopeRecordInput,
  InboxItem,
  StoredBindingRecord,
  StoredCardRecord,
  StoredConfirmationRecord,
  StoredEnvelopeRecord,
} from "@loanshark/api";
import type { PqcAccountReader } from "@loanshark/chain-client";

export type {
  BindingRecordInput,
  CardRecordInput,
  ConfirmationRecordInput,
  ConfirmationRole,
  EnvelopeRecordInput,
  InboxItem,
  StoredBindingRecord,
  StoredCardRecord,
  StoredConfirmationRecord,
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
  | "malformed-response"
  | "confirmation-invalid";

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

export interface GetConfirmationsOptions {
  /** Reads the signer's registered ML-DSA-87 key. */
  accountClient: PqcAccountReader;
  /** Native chain id used in the QoreSign prefix; defaults to Diana. */
  nativeChainId?: string;
  /** When supplied, a confirmation for another chain or contract is refused. */
  expectedDomain?: { chainId: bigint; verifyingContract: string };
  expectedSignerW?: string;
  expectedRole?: ConfirmationRole;
}

export interface VerifiedConfirmation {
  record: StoredConfirmationRecord;
  signerW: string;
  role: ConfirmationRole;
  loanId: string;
}

export interface GetBindingOptions {
  walletAccountClient: PqcAccountReader;
  sealAccountClient: PqcAccountReader;
  now?: Date;
  requireEvmAddressMatch?: boolean;
}
