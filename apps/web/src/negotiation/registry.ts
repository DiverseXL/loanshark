// The card registry reader for the browser (ADR-0014, ADR-0019).
//
// It reads the registered ML-DSA-87 key from the account endpoint and the
// ML-KEM-1024 key from the KEM endpoint recorded in source-lock claim 2. Both
// are read-only GET requests; nothing is sent to the server but the address.

import type { PqcAccountReader } from "@loanshark/chain-client";
import { ACCOUNT_PATH, NATIVE_CHAIN_ID, REST_HOST } from "../constants.js";
import { base64ToBytes } from "./codec.js";

export interface RegistryReader extends PqcAccountReader {
  getPqPublicKey(address: string): Promise<Uint8Array | null>;
  getMlkemPublicKey(address: string): Promise<Uint8Array | null>;
  readonly chainId: string;
}

const KEM_PATH = "/qorechain/pqc/v1/kem";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

async function readFound(
  fetchFn: typeof fetch,
  url: string,
): Promise<Record<string, unknown> | null> {
  const response = await fetchFn(url, { headers: { accept: "application/json" } });
  if (!response.ok) return null;
  const body: unknown = await response.json();
  if (!isRecord(body) || body["found"] !== true || !isRecord(body["account"])) return null;
  return body["account"];
}

export function createRegistryReader(
  options: { rest?: string; fetchFn?: typeof fetch; chainId?: string } = {},
): RegistryReader {
  const rest = options.rest ?? REST_HOST;
  const fetchFn = options.fetchFn ?? fetch;
  const chainId = options.chainId ?? NATIVE_CHAIN_ID;

  const readPq = async (address: string): Promise<Uint8Array | null> => {
    const account = await readFound(
      fetchFn,
      `${rest}${ACCOUNT_PATH}/${encodeURIComponent(address)}`,
    );
    const key = account?.["public_key"];
    return typeof key === "string" ? base64ToBytes(key) : null;
  };

  return {
    chainId,
    getPqPublicKey: readPq,
    async readAccount(address: string) {
      const key = await readPq(address);
      return key === null ? null : { address, publicKey: key, algorithmId: 1 };
    },
    async getMlkemPublicKey(address: string): Promise<Uint8Array | null> {
      const account = await readFound(fetchFn, `${rest}${KEM_PATH}/${encodeURIComponent(address)}`);
      const key = account?.["public_key"];
      return typeof key === "string" ? base64ToBytes(key) : null;
    },
  };
}
