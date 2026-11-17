// Read-only access to the on-chain account record.
//
// URL and response shape from source-lock claims 2 and 20: `public_key` is the
// base64 ML-DSA-87 key (2592 bytes), `ecdsa_pubkey` the compressed secp256k1
// key, `algorithm_id` 1 is dilithium5. Nothing is sent to the server beyond the
// address being read.
//
// The page reports whether a failure looks like a CORS block rather than hiding
// it. A browser gives the page no way to tell a CORS refusal from a network
// failure: both surface as a TypeError with no response, so the outcome says
// exactly that and no proxy is added in this phase.

import type { OnChainPqcAccount, PqcAccountReader } from "@loanshark/chain-client";
import { ACCOUNT_PATH, REST_HOST } from "../constants.js";
import { describeError } from "./errors.js";
import type { WalletError } from "./types.js";
import { isRecord } from "./types.js";

export interface FetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string> },
) => Promise<FetchResponseLike>;

export type AccountRecordOutcome =
  | {
      readonly status: "ok";
      readonly httpStatus: number;
      readonly body: unknown;
      /** Null when the chain reports no registered key for the address. */
      readonly account: OnChainPqcAccount | null;
      readonly found: boolean;
    }
  | { readonly status: "http-error"; readonly httpStatus: number; readonly body: string }
  | {
      readonly status: "network-error";
      readonly message: string;
      /** A TypeError with no response: a CORS refusal or a network failure. */
      readonly looksLikeCors: boolean;
    };

const defaultFetch = (): FetchLike | undefined =>
  typeof fetch === "function" ? (fetch as unknown as FetchLike) : undefined;

/** Base64 to bytes. Throws on input the browser decoder rejects. */
export const decodeBase64 = (value: string): Uint8Array => {
  const binary = globalThis.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

/**
 * Fetches `/qorechain/pqc/v1/account/{address}`. Never throws: every outcome is
 * returned, including the exact HTTP body or error text.
 */
export async function fetchAccountRecord(input: {
  address: string;
  rest?: string;
  fetchLike?: FetchLike;
}): Promise<AccountRecordOutcome> {
  const rest = input.rest ?? REST_HOST;
  const doFetch = input.fetchLike ?? defaultFetch();
  if (doFetch === undefined) {
    return {
      status: "network-error",
      message: "No fetch implementation is available.",
      looksLikeCors: false,
    };
  }
  const url = `${rest}${ACCOUNT_PATH}/${encodeURIComponent(input.address)}`;

  let response: FetchResponseLike;
  try {
    response = await doFetch(url, { method: "GET", headers: { accept: "application/json" } });
  } catch (err) {
    return {
      status: "network-error",
      message: describeError(err),
      looksLikeCors: err instanceof TypeError,
    };
  }

  if (!response.ok) {
    let body = "";
    try {
      body = await response.text();
    } catch (err) {
      body = `the error body could not be read: ${describeError(err)}`;
    }
    return { status: "http-error", httpStatus: response.status, body };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (err) {
    return {
      status: "http-error",
      httpStatus: response.status,
      body: `the response was not JSON: ${describeError(err)}`,
    };
  }

  const found = isRecord(body) && body["found"] === true;
  const raw = isRecord(body) ? body["account"] : undefined;
  let account: OnChainPqcAccount | null = null;
  if (found && isRecord(raw)) {
    const address = raw["address"];
    const publicKey = raw["public_key"];
    const algorithmId = raw["algorithm_id"];
    if (
      typeof address === "string" &&
      typeof publicKey === "string" &&
      typeof algorithmId === "number"
    ) {
      try {
        account = { address, publicKey: decodeBase64(publicKey), algorithmId };
      } catch {
        account = null;
      }
    }
  }
  return { status: "ok", httpStatus: response.status, body, account, found };
}

/**
 * The `PqcAccountReader` the verifier needs. It throws on a transport failure
 * (which `verifyHybridMessage` maps to `account-unavailable`) and returns null
 * when the chain has no key for the address.
 */
export function createRestAccountReader(
  options: { rest?: string; fetchLike?: FetchLike } = {},
): PqcAccountReader {
  return {
    async readAccount(address: string): Promise<OnChainPqcAccount | null> {
      const outcome = await fetchAccountRecord({
        address,
        ...(options.rest === undefined ? {} : { rest: options.rest }),
        ...(options.fetchLike === undefined ? {} : { fetchLike: options.fetchLike }),
      });
      if (outcome.status === "network-error") {
        throw new Error(`network error reading ${address}: ${outcome.message}`);
      }
      if (outcome.status === "http-error") {
        throw new Error(`HTTP ${outcome.httpStatus} reading ${address}: ${outcome.body}`);
      }
      return outcome.account;
    },
  };
}

/** Convenience for panel 4: a one-line description of a failed read. */
export const describeAccountFailure = (outcome: AccountRecordOutcome): WalletError | null => {
  if (outcome.status === "network-error") {
    return {
      ok: false,
      code: "account-unavailable",
      message: outcome.looksLikeCors
        ? `No response was readable (${outcome.message}). This is the shape of a CORS refusal or a network failure; a browser page cannot tell them apart.`
        : `The request failed before a response: ${outcome.message}`,
    };
  }
  if (outcome.status === "http-error") {
    return {
      ok: false,
      code: "account-unavailable",
      message: `HTTP ${outcome.httpStatus}: ${outcome.body}`,
    };
  }
  return null;
};
