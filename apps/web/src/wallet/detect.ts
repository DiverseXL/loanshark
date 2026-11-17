// Wallet discovery.
//
// Two independent lanes, both recorded in the source lock:
//   - EVM: EIP-6963 announcements (claim 41), with QoreX identified by the rdns
//     `network.qore.qorex` observed at runtime (claim 5). The rdns is
//     self-attested, so the page also accepts a provider that says `isQoreX`,
//     and it shows the whole list rather than silently trusting one entry.
//   - Native: `window.qorex.native` (claim 36).
//
// Discovery must listen before it dispatches `eip6963:requestProvider`, because
// either side can run first (claim 41). The timeout is a wait for late
// announcements, not a retry.

import type { DetectedWallets, DetectionRoot, Eip6963ProviderDetail } from "./types.js";
import { isRecord } from "./types.js";

/** The rdns QoreX announced at runtime (source-lock claim 5). */
export const QOREX_RDNS = "network.qore.qorex";

const ANNOUNCE_EVENT = "eip6963:announceProvider";
const REQUEST_EVENT = "eip6963:requestProvider";

export interface DetectOptions {
  /** Injection point for tests. Defaults to the global window. */
  readonly root?: DetectionRoot;
  /** How long to wait for announcements. Zero disables the wait. */
  readonly timeoutMs?: number;
}

const isProviderInfo = (
  value: unknown,
): value is { uuid: string; name: string; icon: string; rdns: string } => {
  if (!isRecord(value)) return false;
  return (
    typeof value["uuid"] === "string" &&
    typeof value["name"] === "string" &&
    typeof value["icon"] === "string" &&
    typeof value["rdns"] === "string"
  );
};

/** Reads an announcement, rejecting anything that does not match EIP-6963. */
const readAnnouncement = (event: Event): Eip6963ProviderDetail | null => {
  const detail: unknown = (event as CustomEvent<unknown>).detail;
  if (!isRecord(detail)) return null;
  const info = detail["info"];
  const provider = detail["provider"];
  if (!isProviderInfo(info)) return null;
  if (!isRecord(provider) || typeof provider["request"] !== "function") return null;
  return {
    info: {
      uuid: info.uuid,
      name: info.name,
      icon: info.icon,
      rdns: info.rdns,
    },
    provider: provider as unknown as Eip6963ProviderDetail["provider"],
  };
};

/** Resolves after `ms`; only used for the discovery window. */
const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const defaultRoot = (): DetectionRoot | undefined =>
  typeof window === "undefined" ? undefined : (window as unknown as DetectionRoot);

/**
 * Detects the EVM providers announced over EIP-6963 and the native QoreX
 * provider. Never throws: an absent window is reported in `notes`.
 */
export async function detectQorex(options: DetectOptions = {}): Promise<DetectedWallets> {
  const root = options.root ?? defaultRoot();
  const timeoutMs = options.timeoutMs ?? 250;
  const notes: string[] = [];
  const found: Eip6963ProviderDetail[] = [];

  if (root === undefined) {
    return {
      evm: [],
      qorexEvm: null,
      qorexNative: null,
      notes: ["No window object: this page must run in a browser."],
    };
  }

  let listener: ((event: Event) => void) | null = null;
  try {
    listener = (event: Event) => {
      const detail = readAnnouncement(event);
      if (detail === null) {
        notes.push("An eip6963:announceProvider event had an unrecognised shape and was ignored.");
        return;
      }
      if (!found.some((entry) => entry.info.uuid === detail.info.uuid)) found.push(detail);
    };
    root.addEventListener(ANNOUNCE_EVENT, listener);
    root.dispatchEvent(new CustomEvent(REQUEST_EVENT));
    if (timeoutMs > 0) await wait(timeoutMs);
  } catch (err) {
    notes.push(`EIP-6963 discovery failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    if (listener !== null) {
      try {
        root.removeEventListener(ANNOUNCE_EVENT, listener);
      } catch {
        notes.push("Could not remove the EIP-6963 listener.");
      }
    }
  }

  const native = root.qorex?.native ?? null;
  if (native === null) notes.push("window.qorex.native is absent.");
  if (found.length === 0) notes.push("No EIP-6963 provider announced itself within the window.");

  const byRdns = found.find((entry) => entry.info.rdns === QOREX_RDNS) ?? null;
  const byFlag = found.find((entry) => entry.provider.isQoreX === true) ?? null;
  const qorexEvm = byRdns ?? byFlag;
  if (qorexEvm === null && found.length > 0) {
    notes.push(`No announcement matched rdns ${QOREX_RDNS} or the isQoreX flag.`);
  }

  return { evm: found, qorexEvm, qorexNative: native, notes };
}
