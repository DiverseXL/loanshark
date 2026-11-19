// Verifying client for the LOANSHARK ephemeral relay server (ADR-0017).
//
// Every fetched envelope, recipient card, and binding statement is verified
// before being returned to the caller. A fetched object that fails verification
// is returned as a typed refusal, NEVER as trusted data.

import { contentAddressOf } from "@loanshark/api";
import type { EnvelopeContext, SignedEnvelope } from "@loanshark/qoreseal-adapter";
import { verifySignedEnvelope } from "@loanshark/qoreseal-adapter";
import type { BindingStatement } from "@loanshark/seal-account";
import { verifyBindingStatement } from "@loanshark/seal-account";
import type { RecipientCard } from "@qorechain/qoreseal";
import { verifyRecipientCard } from "@qorechain/qoreseal";
import type {
  BindingRecordInput,
  CardRecordInput,
  CardRegistryReader,
  CardVerificationKeys,
  EnvelopeRecordInput,
  GetBindingOptions,
  GetCardOptions,
  GetEnvelopeOptions,
  InboxItem,
  RelayResult,
  StoredBindingRecord,
  StoredCardRecord,
  StoredEnvelopeRecord,
} from "./types.js";

export interface RelayClientConfig {
  baseUrl: string;
  customHeaderValue?: string;
  fetchFn?: typeof fetch;
}

export class RelayClient {
  private readonly baseUrl: string;
  private readonly customHeaderValue: string;
  private readonly fetchFn: typeof fetch;

  constructor(config: RelayClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.customHeaderValue = config.customHeaderValue ?? "1";
    this.fetchFn = config.fetchFn ?? fetch;
  }

  private async requestJson<T>(
    path: string,
    options: {
      method?: string;
      body?: unknown;
      isWrite?: boolean;
    } = {},
  ): Promise<RelayResult<T>> {
    const method = options.method ?? "GET";
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (options.isWrite) {
      headers["X-Loanshark-Action"] = this.customHeaderValue;
    }
    let bodyStr: string | undefined;
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      bodyStr = JSON.stringify(options.body);
    }

    let res: Response;
    try {
      const init: RequestInit = {
        method,
        headers,
      };
      if (bodyStr !== undefined) {
        init.body = bodyStr;
      }
      res = await this.fetchFn(`${this.baseUrl}${path}`, init);
    } catch (err) {
      return {
        ok: false,
        refusal: "http-error",
        message: `network error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      return {
        ok: false,
        refusal: "malformed-response",
        message: `server returned non-JSON response with HTTP status ${res.status}`,
        statusCode: res.status,
      };
    }

    if (!res.ok) {
      const msg =
        typeof json === "object" && json !== null && "message" in json
          ? String((json as Record<string, unknown>)["message"])
          : `request failed with HTTP ${res.status}`;
      return {
        ok: false,
        refusal: "http-error",
        message: msg,
        statusCode: res.status,
      };
    }

    return { ok: true, value: json as T };
  }

  /** Posts an envelope to the relay server. */
  async postEnvelope(input: EnvelopeRecordInput): Promise<RelayResult<StoredEnvelopeRecord>> {
    const res = await this.requestJson<{ envelope: StoredEnvelopeRecord }>("/v1/envelopes", {
      method: "POST",
      body: input,
      isWrite: true,
    });
    if (!res.ok) return res;
    return { ok: true, value: res.value.envelope };
  }

  /**
   * Fetches an envelope and verifies its content address and hybrid signature.
   * Checks post-quantum layer against on-chain key of sender.
   * If verification fails, returns a typed refusal and NEVER the untrusted data.
   */
  async getEnvelope(
    id: string,
    options: GetEnvelopeOptions,
  ): Promise<RelayResult<StoredEnvelopeRecord>> {
    const res = await this.requestJson<{ envelope: StoredEnvelopeRecord }>(`/v1/envelopes/${id}`);
    if (!res.ok) return res;

    const record = res.value.envelope;

    // 1. Content address verification: SHA-256 of canonical fields must match id
    const inputFields: EnvelopeRecordInput = {
      kind: record.kind,
      loanRef: record.loanRef,
      senderW: record.senderW,
      recipientW: record.recipientW,
      ciphertext: record.ciphertext,
      signature: record.signature,
      aad: record.aad,
      createdAt: record.createdAt,
    };
    const expectedId = contentAddressOf(inputFields);
    if (expectedId !== id || record.id !== id) {
      return {
        ok: false,
        refusal: "content-address-mismatch",
        message: `envelope id '${record.id}' does not match computed content address '${expectedId}'`,
      };
    }

    // 2. AAD party verification
    const aadObj = record.aad as Record<string, unknown>;
    if (options.expectedBorrowerW && aadObj["borrower"] !== options.expectedBorrowerW) {
      return {
        ok: false,
        refusal: "aad-mismatch",
        message: `envelope AAD borrower '${aadObj["borrower"]}' does not match expected '${options.expectedBorrowerW}'`,
      };
    }
    if (
      options.expectedLenderW &&
      record.kind === "offer" &&
      aadObj["lender"] !== options.expectedLenderW
    ) {
      return {
        ok: false,
        refusal: "aad-mismatch",
        message: `envelope AAD lender '${aadObj["lender"]}' does not match expected '${options.expectedLenderW}'`,
      };
    }

    // 3. Cryptographic signature verification (post-quantum part mandatory)
    let envelopeBytes: Uint8Array;
    try {
      envelopeBytes = Buffer.from(record.ciphertext, "base64");
    } catch (err) {
      return {
        ok: false,
        refusal: "envelope-signature-invalid",
        message: `could not decode base64 ciphertext: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    const signedEnvelope: SignedEnvelope = {
      envelope: envelopeBytes,
      context: record.aad as unknown as EnvelopeContext,
      signature: record.signature as unknown as SignedEnvelope["signature"],
    };

    const verified = await verifySignedEnvelope({
      signed: signedEnvelope,
      accountClient: options.accountClient,
      ...(options.signerE ? { signer: options.signerE } : {}),
    });

    if (!verified.ok) {
      return {
        ok: false,
        refusal: "envelope-signature-invalid",
        message: `envelope signature verification refused: ${verified.code} (${verified.message})`,
      };
    }

    return { ok: true, value: record };
  }

  /** Fetches metadata of envelopes addressed to the given wallet address. */
  async getInbox(walletAddress: string): Promise<RelayResult<InboxItem[]>> {
    const res = await this.requestJson<{ items: InboxItem[] }>(`/v1/inbox/${walletAddress}`);
    if (!res.ok) return res;
    return { ok: true, value: res.value.items };
  }

  /** Posts a public recipient card to the relay. */
  async postCard(input: CardRecordInput): Promise<RelayResult<StoredCardRecord>> {
    const res = await this.requestJson<{ card: StoredCardRecord }>("/v1/cards", {
      method: "POST",
      body: input,
      isWrite: true,
    });
    if (!res.ok) return res;
    return { ok: true, value: res.value.card };
  }

  /**
   * Fetches a recipient card and verifies it against the injected registry keys.
   * If verification fails, returns a typed refusal and NEVER the untrusted card.
   */
  async getCard(
    sealAddress: string,
    options: GetCardOptions,
  ): Promise<RelayResult<StoredCardRecord>> {
    const res = await this.requestJson<{ card: StoredCardRecord }>(`/v1/cards/${sealAddress}`);
    if (!res.ok) return res;

    const record = res.value.card;
    if (record.sealAddress !== sealAddress) {
      return {
        ok: false,
        refusal: "address-mismatch",
        message: `card sealAddress '${record.sealAddress}' does not match requested '${sealAddress}'`,
      };
    }

    let chainId: string;
    let pqPublicKey: Uint8Array;
    let mlkemPublicKey: Uint8Array;

    const reg = options.registry;
    if ("getPqPublicKey" in reg) {
      const reader = reg as CardRegistryReader;
      chainId = reader.chainId;
      const pq = await reader.getPqPublicKey(sealAddress);
      const kem = await reader.getMlkemPublicKey(sealAddress);
      if (!pq || !kem) {
        return {
          ok: false,
          refusal: "card-invalid",
          message: `registry has no registered keys for seal account '${sealAddress}'`,
        };
      }
      pqPublicKey = pq;
      mlkemPublicKey = kem;
    } else {
      chainId = reg.chainId;
      pqPublicKey = reg.pqPublicKey;
      mlkemPublicKey = reg.mlkemPublicKey;
    }

    try {
      verifyRecipientCard({
        card: record.card as unknown as RecipientCard,
        chainId,
        address: sealAddress,
        pqPublicKey,
        mlkemPublicKey,
      });
    } catch (err) {
      return {
        ok: false,
        refusal: "card-invalid",
        message: `recipient card verification failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    return { ok: true, value: record };
  }

  /** Posts a public binding statement to the relay. */
  async postBinding(input: BindingRecordInput): Promise<RelayResult<StoredBindingRecord>> {
    const res = await this.requestJson<{ binding: StoredBindingRecord }>("/v1/bindings", {
      method: "POST",
      body: input,
      isWrite: true,
    });
    if (!res.ok) return res;
    return { ok: true, value: res.value.binding };
  }

  /**
   * Fetches a binding statement and verifies both signatures (W and E) against on-chain records.
   * If verification fails, returns a typed refusal and NEVER the untrusted statement.
   */
  async getBinding(
    walletAddress: string,
    options: GetBindingOptions,
  ): Promise<RelayResult<StoredBindingRecord>> {
    const res = await this.requestJson<{ binding: StoredBindingRecord }>(
      `/v1/bindings/${walletAddress}`,
    );
    if (!res.ok) return res;

    const record = res.value.binding;
    if (record.walletAddress !== walletAddress) {
      return {
        ok: false,
        refusal: "address-mismatch",
        message: `binding walletAddress '${record.walletAddress}' does not match requested '${walletAddress}'`,
      };
    }

    const statement = record.statement as unknown as BindingStatement;
    if (statement.fields?.walletAddress !== walletAddress) {
      return {
        ok: false,
        refusal: "address-mismatch",
        message: `statement field walletAddress '${statement.fields?.walletAddress}' does not match '${walletAddress}'`,
      };
    }

    const verification = await verifyBindingStatement({
      statement,
      walletAccountClient: options.walletAccountClient,
      sealAccountClient: options.sealAccountClient,
      ...(options.now ? { now: options.now } : {}),
      ...(options.requireEvmAddressMatch !== undefined
        ? { requireEvmAddressMatch: options.requireEvmAddressMatch }
        : {}),
    });

    if (!verification.ok) {
      return {
        ok: false,
        refusal: "binding-invalid",
        message: `binding statement verification failed: ${verification.code} (${verification.message})`,
      };
    }

    return { ok: true, value: record };
  }
}
