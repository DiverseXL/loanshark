// Types for the two wallet lanes. There are no thrown strings: every operation
// that can fail returns a discriminated result with a stable code.
//
// The shapes come from source-lock claims 36 to 41. `window.qorex.native` is
// the injected native provider (runtime, claim 39); EIP-6963 is the standard
// EVM discovery mechanism (claim 41). The optional members are optional because
// neither the source nor the runtime record promises them on every build.

/** Stable failure codes. Each one is a distinct outcome the page can show. */
export type WalletErrorCode =
  /** No window object, no QoreX provider, or no method on it. */
  | "no-wallet"
  /** The EVM or native chain is not Diana. A distinct state, not an error. */
  | "wrong-chain"
  /** The chain ID could not be read at all (provider threw or answered oddly). */
  | "chain-unreadable"
  /** The native account could not be read after enable. */
  | "not-connected"
  /** The user or the app did not authorise this signature. */
  | "not-authorized"
  /** The wallet rejected the request. Never retried. */
  | "request-rejected"
  /** The provider failed for a reason that is not a user rejection. */
  | "wallet-error"
  /** The wallet answered with something that is not a signature object. */
  | "malformed-response"
  /** The on-chain account record could not be read or decoded. */
  | "account-unavailable"
  /** The active native account is not the account behind the EVM address QoreX
   * reports (ADR-0009). Nothing is signed or sent in this state. */
  | "account-mismatch";

export interface WalletError {
  readonly ok: false;
  readonly code: WalletErrorCode;
  readonly message: string;
}

export type Result<T> = { readonly ok: true; readonly value: T } | WalletError;

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });

export const fail = (code: WalletErrorCode, message: string): WalletError => ({
  ok: false,
  code,
  message,
});

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** EIP-1193 request surface, as much of it as this page uses. */
export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  readonly isQoreX?: boolean;
}

/** EIP-6963 provider info, claim 41. */
export interface Eip6963ProviderInfo {
  readonly uuid: string;
  readonly name: string;
  readonly icon: string;
  readonly rdns: string;
}

export interface Eip6963ProviderDetail {
  readonly info: Eip6963ProviderInfo;
  readonly provider: Eip1193Provider;
}

/** The `getKey` result recorded at runtime, claim 39. */
export interface QorexKey {
  readonly name: string;
  readonly algo: string;
  readonly pubKey: string;
  readonly address: string;
  readonly bech32Address: string;
  readonly pubKeyHex: string;
  readonly isNanoLedger: boolean;
}

/**
 * The native provider. Only `enable` is documented by the published adapter
 * (claim 37); `getKey` and `signArbitrary` are runtime members (claim 39), so
 * they are optional here and every call site checks them.
 */
export interface QorexNativeProvider {
  readonly capabilities?: readonly string[];
  enable(chainId: string): Promise<void>;
  getKey?(chainId: string): Promise<unknown>;
  signArbitrary?(chainId: string, address: string, data: string): Promise<unknown>;
  listAccounts?(chainId: string): Promise<unknown>;
}

/** The parts of `window` this module needs, so tests can supply a stub. */
export interface DetectionRoot {
  readonly qorex?: { readonly native?: QorexNativeProvider };
  addEventListener(type: string, listener: (event: Event) => void): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
  dispatchEvent(event: Event): boolean;
}

export interface DetectedWallets {
  /** Every EIP-6963 announcement seen during the discovery window. */
  readonly evm: readonly Eip6963ProviderDetail[];
  /** The announcement whose rdns is `network.qore.qorex`, or isQoreX. */
  readonly qorexEvm: Eip6963ProviderDetail | null;
  /** `window.qorex.native`, when present. */
  readonly qorexNative: QorexNativeProvider | null;
  /** What was and was not found, for panel 1. */
  readonly notes: readonly string[];
}
