// Native connection. `enable(chainId)` is the documented call (source-lock
// claim 37); `getKey` is runtime-only (claim 39), so its absence is reported
// rather than guessed around.

import { classifyProviderError, describeError } from "./errors.js";
import type { QorexKey, QorexNativeProvider, Result } from "./types.js";
import { fail, isRecord, ok } from "./types.js";

export interface NativeConnection {
  readonly chainId: string;
  readonly address: string;
  readonly key: QorexKey | null;
  /** The unmodified `getKey` answer, for the panel's raw JSON. */
  readonly rawKey: unknown;
}

const readText = (value: Record<string, unknown>, key: string): string | null => {
  const field = value[key];
  return typeof field === "string" && field.length > 0 ? field : null;
};

/** Reads the fields recorded at runtime, and nothing else. */
export const parseQorexKey = (value: unknown): QorexKey | null => {
  if (!isRecord(value)) return null;
  const address = readText(value, "address");
  const bech32Address = readText(value, "bech32Address");
  if (address === null && bech32Address === null) return null;
  return {
    name: readText(value, "name") ?? "",
    algo: readText(value, "algo") ?? "",
    pubKey: readText(value, "pubKey") ?? "",
    address: address ?? "",
    bech32Address: bech32Address ?? address ?? "",
    pubKeyHex: readText(value, "pubKeyHex") ?? "",
    isNanoLedger: value["isNanoLedger"] === true,
  };
};

/**
 * Connects the page to QoreX on `chainId` and returns the bech32 address.
 *
 * A rejected `enable` is reported as `wrong-chain` by the guard, not here: this
 * function reports the provider failure and the caller reads the guard state.
 */
export async function connectNative(
  native: QorexNativeProvider | null,
  chainId: string,
): Promise<Result<NativeConnection>> {
  if (native === null) {
    return fail(
      "no-wallet",
      "window.qorex.native is absent. Install QoreX or open this page in it.",
    );
  }
  try {
    await native.enable(chainId);
  } catch (err) {
    return fail(classifyProviderError(err), `enable(${chainId}) failed: ${describeError(err)}`);
  }
  if (native.getKey === undefined) {
    return fail(
      "not-connected",
      "This QoreX build exposes no getKey, so the address cannot be read.",
    );
  }
  let raw: unknown;
  try {
    raw = await native.getKey(chainId);
  } catch (err) {
    return fail("not-connected", `getKey(${chainId}) failed: ${describeError(err)}`);
  }
  const key = parseQorexKey(raw);
  if (key === null || key.bech32Address.length === 0) {
    return fail("malformed-response", "getKey returned no bech32 address.");
  }
  return ok({ chainId, address: key.bech32Address, key, rawKey: raw });
}
