import type { WalletErrorCode } from "./types.js";

/**
 * QoreX rejects a declined prompt with text rather than a structured code, so
 * the distinction between "the user declined" and "the wallet failed" is made
 * on the message. The patterns are the ones the published adapter checks
 * (`isQorexRejection`, source-lock claim 37 area) plus the "already waiting"
 * text reported for a concurrent request (claim 44, unconfirmed).
 */
const REJECTION = /signature rejected|user rejected|request rejected|already waiting/i;

export const describeError = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
};

/** Maps a provider failure to a code. Never retries; the caller decides nothing. */
export const classifyProviderError = (err: unknown): WalletErrorCode =>
  REJECTION.test(describeError(err)) ? "request-rejected" : "wallet-error";
