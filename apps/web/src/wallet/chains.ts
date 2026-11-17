// Chain guard.
//
// The guard has exactly three outcomes, and "wrong chain" is one of them rather
// than a generic error, because the page must be able to say which lane is
// wrong before it offers a signing button.
//
// EVM: the provider answers `eth_chainId`; anything other than 0x2648 is wrong.
// Native: QoreX exposes no chain-id getter in the source or the runtime record
// (source-lock claim 43), so the only signal is whether
// `enable('qorechain-diana')` resolves. That inference is an ASSUMPTION and the
// page labels it as one.

import { EVM_CHAIN_ID, NATIVE_CHAIN_ID } from "../constants.js";
import type { Eip1193Provider, QorexNativeProvider } from "./types.js";

export type ChainGuardState =
  | {
      readonly status: "ready";
      readonly nativeChainId: string;
      readonly evmChainId: string;
    }
  | {
      readonly status: "wrong-chain";
      readonly reason: "evm" | "native";
      readonly nativeChainId: string | null;
      readonly evmChainId: string | null;
      readonly message: string;
    }
  | {
      readonly status: "unavailable";
      readonly reason: "evm-unreadable";
      readonly message: string;
    };

export interface ChainReading {
  /** The chain id the native provider accepted, or null when enable failed. */
  readonly nativeChainId: string | null;
  /** The chain id the EVM provider reported, or null when the call failed. */
  readonly evmChainId: string | null;
  readonly nativeError: string | null;
  readonly evmError: string | null;
}

export interface ChainProbe {
  readonly native: QorexNativeProvider | null;
  readonly evm: Eip1193Provider | null;
}

const describe = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/**
 * Reads both chains without prompting anything except the native `enable`,
 * which is the documented connection call. It never throws.
 */
export async function readChains(probe: ChainProbe): Promise<ChainReading> {
  let evmChainId: string | null = null;
  let evmError: string | null = null;
  if (probe.evm === null) {
    evmError = "No EVM provider was found over EIP-6963.";
  } else {
    try {
      const answer = await probe.evm.request({ method: "eth_chainId" });
      if (typeof answer === "string" && /^0x[0-9a-fA-F]+$/.test(answer)) {
        evmChainId = answer.toLowerCase();
      } else {
        evmError = `eth_chainId returned ${JSON.stringify(answer)}, which is not a hex chain id.`;
      }
    } catch (err) {
      evmError = describe(err);
    }
  }

  let nativeChainId: string | null = null;
  let nativeError: string | null = null;
  if (probe.native === null) {
    nativeError = "window.qorex.native is absent.";
  } else {
    try {
      await probe.native.enable(NATIVE_CHAIN_ID);
      nativeChainId = NATIVE_CHAIN_ID;
    } catch (err) {
      nativeError = describe(err);
    }
  }

  return { nativeChainId, evmChainId, nativeError, evmError };
}

/** Turns a reading into the guard state the page renders and the signer checks. */
export function evaluateChainGuard(reading: ChainReading): ChainGuardState {
  if (reading.evmChainId === null) {
    return {
      status: "unavailable",
      reason: "evm-unreadable",
      message: reading.evmError ?? "The EVM chain id could not be read.",
    };
  }
  if (reading.evmChainId !== EVM_CHAIN_ID) {
    return {
      status: "wrong-chain",
      reason: "evm",
      nativeChainId: reading.nativeChainId,
      evmChainId: reading.evmChainId,
      message: `The EVM provider is on ${reading.evmChainId}; this page requires ${EVM_CHAIN_ID} (${Number.parseInt(EVM_CHAIN_ID, 16)}).`,
    };
  }
  if (reading.nativeChainId === null) {
    return {
      status: "wrong-chain",
      reason: "native",
      nativeChainId: null,
      evmChainId: reading.evmChainId,
      message: `The native wallet did not accept ${NATIVE_CHAIN_ID}: ${reading.nativeError ?? "no reason given"}. QoreX exposes no chain-id getter, so this is inferred from enable.`,
    };
  }
  return {
    status: "ready",
    nativeChainId: reading.nativeChainId,
    evmChainId: reading.evmChainId,
  };
}
