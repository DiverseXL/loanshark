// The deployment flow state machine.
//
// Nothing in this module runs on import. A transaction is requested only when
// runStep() is called, and the panel calls runStep() only from a button's click
// handler. Every send is preceded by the chain guard and by eth_estimateGas,
// and no request is retried. A transaction is "confirmed" only when
// eth_getTransactionReceipt returns status 0x1; a missing receipt is shown as
// pending and then as a visible timeout, never as success.
//
// This module never signs, never stores keys and never writes to storage.

import type { ChainGuardState } from "../wallet/chains.js";
import type { Eip1193Provider } from "../wallet/types.js";
import {
  addressFromWord,
  MINT_AMOUNT_BASE_UNITS,
  mintData,
  OWNER_SELECTOR,
  settlementDeployData,
  testUsdDeployData,
} from "./encoding.js";
import { FUSD_ADDRESS } from "./manifest.js";

export type StepId = "lane" | "testusd" | "settlement" | "mint";

export type StepStatus =
  | "idle"
  | "running"
  | "submitted"
  | "confirmed"
  | "reverted"
  | "failed"
  | "blocked"
  | "timeout";

export interface StepRecord {
  readonly status: StepStatus;
  readonly account: string | null;
  readonly estimateGas: string | null;
  readonly txHash: string | null;
  readonly blockNumber: string | null;
  readonly receiptStatus: string | null;
  readonly contractAddress: string | null;
  readonly error: string | null;
  readonly note: string | null;
  readonly pollAttempts: number;
}

export interface DeployState {
  readonly guard: ChainGuardState | null;
  readonly account: string | null;
  readonly accountError: string | null;
  readonly owner: string | null;
  readonly ownerMatches: boolean | null;
  readonly ownerError: string | null;
  readonly steps: Readonly<Record<StepId, StepRecord>>;
}

export const STEP_LABELS: Readonly<Record<StepId, string>> = {
  lane: "EVM lane check: send 0 value to my own address",
  testusd: "Deploy TestUSD",
  settlement: "Deploy LoanSettlement",
  mint: "Mint 1000 tUSD to my account",
};

const emptyStep = (): StepRecord => ({
  status: "idle",
  account: null,
  estimateGas: null,
  txHash: null,
  blockNumber: null,
  receiptStatus: null,
  contractAddress: null,
  error: null,
  note: null,
  pollAttempts: 0,
});

const initialState = (): DeployState => ({
  guard: null,
  account: null,
  accountError: null,
  owner: null,
  ownerMatches: null,
  ownerError: null,
  steps: {
    lane: emptyStep(),
    testusd: emptyStep(),
    settlement: emptyStep(),
    mint: emptyStep(),
  },
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Serialises an error without paraphrasing it. The message is kept verbatim and
 * the enumerable/own fields (code, data, and any wallet-specific fields such as
 * an authorisation-window message) are included.
 */
export function rawError(error: unknown): string {
  if (error instanceof Error) {
    const own: Record<string, unknown> = { name: error.name, message: error.message };
    for (const key of Object.getOwnPropertyNames(error)) {
      if (key === "name" || key === "message" || key === "stack") continue;
      own[key] = (error as unknown as Record<string, unknown>)[key];
    }
    try {
      return JSON.stringify(own, null, 2);
    } catch {
      return error.message;
    }
  }
  if (isRecord(error)) {
    try {
      return JSON.stringify(error, null, 2);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

const isHash = (value: unknown): value is `0x${string}` =>
  typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);

const isIdleish = (status: StepStatus): boolean =>
  status === "idle" || status === "failed" || status === "blocked" || status === "reverted";

/**
 * Whether the panel may enable a step's button. This mirrors the dependency
 * rule: each deployment needs the previous step confirmed. A timeout is never
 * treated as confirmed, so it does not unlock the next step.
 */
export function canRunStep(state: DeployState, id: StepId): boolean {
  if (state.guard?.status !== "ready") return false;
  const { lane, testusd, settlement, mint } = state.steps;
  switch (id) {
    case "lane":
      return isIdleish(lane.status);
    case "testusd":
      return lane.status === "confirmed" && isIdleish(testusd.status);
    case "settlement":
      return testusd.status === "confirmed" && isIdleish(settlement.status);
    case "mint":
      return (
        settlement.status === "confirmed" && isIdleish(mint.status) && state.ownerMatches === true
      );
  }
}

export interface DeployFlowOptions {
  readonly provider: Eip1193Provider;
  readonly guard: () => Promise<ChainGuardState>;
  /** Default 60. The number of receipt polls before a visible timeout. */
  readonly pollAttempts?: number;
  /** Default 2000 ms. */
  readonly pollIntervalMs?: number;
  /** Injection point for tests. */
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface DeployFlow {
  getState(): DeployState;
  subscribe(listener: (state: DeployState) => void): () => void;
  /** Read-only: chain guard plus eth_accounts. Never sends a transaction. */
  refresh(): Promise<void>;
  /** Read-only: owner() of the deployed TestUSD, for the mint button. */
  refreshOwner(): Promise<void>;
  /** The only path that can request a transaction. Called from a click handler. */
  runStep(id: StepId): Promise<void>;
}

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export function createDeployFlow(options: DeployFlowOptions): DeployFlow {
  const { provider, guard } = options;
  const pollAttempts = options.pollAttempts ?? 60;
  const pollIntervalMs = options.pollIntervalMs ?? 2000;
  const sleep = options.sleep ?? wait;

  let state = initialState();
  const listeners = new Set<(state: DeployState) => void>();

  const emit = (): void => {
    for (const listener of listeners) listener(state);
  };

  const setState = (next: DeployState): void => {
    state = next;
    emit();
  };

  const patch = (partial: Partial<DeployState>): void => {
    setState({ ...state, ...partial });
  };

  const patchStep = (id: StepId, partial: Partial<StepRecord>): void => {
    setState({
      ...state,
      steps: { ...state.steps, [id]: { ...state.steps[id], ...partial } },
    });
  };

  const readAccount = async (): Promise<string | null> => {
    try {
      const answer = await provider.request({ method: "eth_accounts" });
      if (!Array.isArray(answer) || answer.length === 0 || typeof answer[0] !== "string") {
        patch({
          account: null,
          accountError: `eth_accounts returned ${JSON.stringify(answer)}, not a non-empty array of addresses.`,
        });
        return null;
      }
      const account = answer[0];
      patch({ account, accountError: null });
      return account;
    } catch (error) {
      patch({ account: null, accountError: rawError(error) });
      return null;
    }
  };

  const refresh = async (): Promise<void> => {
    try {
      patch({ guard: await guard() });
    } catch (error) {
      patch({
        guard: {
          status: "unavailable",
          reason: "evm-unreadable",
          message: rawError(error),
        },
      });
    }
    await readAccount();
  };

  const refreshOwner = async (): Promise<void> => {
    const testUsd = state.steps.testusd.contractAddress;
    if (testUsd === null) {
      patch({ owner: null, ownerMatches: null, ownerError: "TestUSD is not deployed yet." });
      return;
    }
    try {
      const result = await provider.request({
        method: "eth_call",
        params: [{ to: testUsd, data: OWNER_SELECTOR }, "latest"],
      });
      const owner = addressFromWord(result);
      if (owner === null) {
        patch({
          owner: null,
          ownerMatches: null,
          ownerError: `owner() returned ${JSON.stringify(result)}, which is not an address word.`,
        });
        return;
      }
      patch({
        owner,
        ownerMatches: state.account !== null && owner === state.account.toLowerCase(),
        ownerError: null,
      });
    } catch (error) {
      patch({ owner: null, ownerMatches: null, ownerError: rawError(error) });
    }
  };

  const runStep = async (id: StepId): Promise<void> => {
    if (state.steps[id].status === "running" || state.steps[id].status === "submitted") return;
    if (state.steps[id].status === "confirmed" || state.steps[id].status === "timeout") return;

    // The chain guard runs before anything else on every send. A wrong chain
    // stops here, with no estimate and no transaction request.
    let guardState: ChainGuardState;
    try {
      guardState = await guard();
    } catch (error) {
      patchStep(id, { status: "blocked", error: rawError(error), note: "The guard threw." });
      return;
    }
    patch({ guard: guardState });
    if (guardState.status !== "ready") {
      patchStep(id, {
        status: "blocked",
        error: guardState.message,
        note: "Chain guard did not pass. No estimate and no transaction were requested.",
      });
      return;
    }

    if (id === "testusd" && state.steps.lane.status !== "confirmed") {
      patchStep(id, {
        status: "blocked",
        error: "The EVM lane check is not confirmed.",
        note: "No estimate and no transaction were requested.",
      });
      return;
    }
    if (id === "settlement" && state.steps.testusd.status !== "confirmed") {
      patchStep(id, {
        status: "blocked",
        error: "TestUSD is not confirmed.",
        note: "No estimate and no transaction were requested.",
      });
      return;
    }
    if (id === "settlement" && state.steps.testusd.contractAddress === null) {
      patchStep(id, {
        status: "blocked",
        error: "The TestUSD receipt has no contractAddress.",
        note: "No estimate and no transaction were requested.",
      });
      return;
    }
    if (id === "mint") {
      if (state.steps.settlement.status !== "confirmed") {
        patchStep(id, {
          status: "blocked",
          error: "LoanSettlement is not confirmed.",
          note: "No estimate and no transaction were requested.",
        });
        return;
      }
      if (state.ownerMatches === null) await refreshOwner();
      if (state.ownerMatches !== true) {
        patchStep(id, {
          status: "blocked",
          error:
            state.ownerError ??
            `The connected account is not the TestUSD owner (owner: ${state.owner ?? "unknown"}).`,
          note: "The mint is owner-only. No estimate and no transaction were requested.",
        });
        return;
      }
    }

    const account = await readAccount();
    if (account === null) {
      patchStep(id, {
        status: "failed",
        error: state.accountError ?? "No EVM account was readable.",
        note: "No estimate and no transaction were requested.",
      });
      return;
    }

    let to: string | null = null;
    let value: string | null = null;
    let data: string | null = null;
    try {
      switch (id) {
        case "lane":
          to = account;
          value = "0x0";
          break;
        case "testusd":
          data = testUsdDeployData(account);
          break;
        case "settlement": {
          const testUsd = state.steps.testusd.contractAddress;
          if (testUsd === null) throw new Error("TestUSD address is missing");
          data = settlementDeployData(testUsd, FUSD_ADDRESS);
          break;
        }
        case "mint": {
          const testUsd = state.steps.testusd.contractAddress;
          if (testUsd === null) throw new Error("TestUSD address is missing");
          to = testUsd;
          data = mintData(account, MINT_AMOUNT_BASE_UNITS);
          break;
        }
      }
    } catch (error) {
      patchStep(id, {
        status: "failed",
        error: rawError(error),
        note: "Transaction data was not built.",
      });
      return;
    }

    if (data !== null && !/^0x[0-9a-fA-F]+$/.test(data)) {
      patchStep(id, { status: "failed", error: "Transaction data is not hex.", note: "No send." });
      return;
    }

    patchStep(id, {
      status: "running",
      account,
      estimateGas: null,
      txHash: null,
      blockNumber: null,
      receiptStatus: null,
      contractAddress: null,
      error: null,
      note: "Requesting eth_estimateGas.",
      pollAttempts: 0,
    });

    const txRequest: Record<string, string> = { from: account };
    if (to !== null) txRequest["to"] = to;
    if (value !== null) txRequest["value"] = value;
    if (data !== null) txRequest["data"] = data;

    let gas: unknown;
    try {
      gas = await provider.request({ method: "eth_estimateGas", params: [txRequest] });
    } catch (error) {
      patchStep(id, {
        status: "failed",
        error: rawError(error),
        note: "The estimate failed, so no transaction was sent. Not retried.",
      });
      return;
    }
    const gasText = typeof gas === "string" ? gas : JSON.stringify(gas);
    patchStep(id, {
      estimateGas: gasText,
      note: "Estimate returned; requesting eth_sendTransaction.",
    });

    let hash: unknown;
    try {
      hash = await provider.request({ method: "eth_sendTransaction", params: [txRequest] });
    } catch (error) {
      // The exact error is kept. A rejection is never retried.
      patchStep(id, {
        status: "failed",
        error: rawError(error),
        note: "The wallet request failed. The exact error is shown unchanged and was not retried.",
      });
      return;
    }

    if (!isHash(hash)) {
      patchStep(id, {
        status: "failed",
        error: `eth_sendTransaction returned ${JSON.stringify(hash)}, which is not a 32-byte transaction hash.`,
        note: "No receipt can be polled. Not retried.",
      });
      return;
    }

    patchStep(id, {
      status: "submitted",
      txHash: hash,
      note: `Submitted. Polling eth_getTransactionReceipt up to ${pollAttempts} times. This is not final.`,
    });

    for (let attempt = 1; attempt <= pollAttempts; attempt++) {
      patchStep(id, { pollAttempts: attempt });
      let receipt: unknown;
      try {
        receipt = await provider.request({
          method: "eth_getTransactionReceipt",
          params: [hash],
        });
      } catch (error) {
        patchStep(id, {
          status: "timeout",
          error: rawError(error),
          note: "Receipt polling failed. The transaction state is unknown, not confirmed.",
        });
        return;
      }

      if (receipt !== null && receipt !== undefined) {
        if (!isRecord(receipt)) {
          patchStep(id, {
            status: "timeout",
            error: `Receipt was ${JSON.stringify(receipt)}, not an object.`,
            note: "The transaction state is unknown, not confirmed.",
          });
          return;
        }
        const status = typeof receipt["status"] === "string" ? receipt["status"] : null;
        const blockNumber =
          typeof receipt["blockNumber"] === "string" ? receipt["blockNumber"] : null;
        const contractAddress =
          typeof receipt["contractAddress"] === "string" ? receipt["contractAddress"] : null;
        if (status === "0x1") {
          patchStep(id, {
            status: "confirmed",
            receiptStatus: status,
            blockNumber,
            contractAddress,
            note: "Confirmed in a receipt with status 0x1.",
          });
          return;
        }
        if (status === "0x0") {
          patchStep(id, {
            status: "reverted",
            receiptStatus: status,
            blockNumber,
            contractAddress,
            note: "The receipt status is 0x0: the transaction reverted. It is not a success.",
          });
          return;
        }
        patchStep(id, {
          status: "timeout",
          receiptStatus: status,
          blockNumber,
          contractAddress,
          error: `Receipt has status ${JSON.stringify(status)}.`,
          note: "A receipt without status 0x1 or 0x0 is not treated as final.",
        });
        return;
      }

      if (attempt < pollAttempts) await sleep(pollIntervalMs);
    }

    patchStep(id, {
      status: "timeout",
      note: `No receipt after ${pollAttempts} polls. The transaction may still be mined; it is NOT confirmed. Check the hash on the explorer before doing anything else.`,
    });
  };

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    refresh,
    refreshOwner,
    runStep,
  };
}

export interface EvidenceJson {
  readonly chainIds: { readonly native: string | null; readonly evm: string | null };
  readonly account: string | null;
  readonly transactions: readonly {
    readonly step: StepId;
    readonly label: string;
    readonly txHash: string | null;
    readonly blockNumber: string | null;
    readonly receiptStatus: string | null;
    readonly status: StepStatus;
  }[];
  readonly deployed: { readonly testUsd: string | null; readonly loanSettlement: string | null };
  readonly fusd: string;
}

/** The copyable evidence block. It contains no key material. */
export function evidenceJson(state: DeployState): EvidenceJson {
  return {
    chainIds: {
      native: state.guard?.status === "ready" ? state.guard.nativeChainId : null,
      evm: state.guard?.status === "ready" ? state.guard.evmChainId : null,
    },
    account: state.account,
    transactions: (["lane", "testusd", "settlement", "mint"] as const).map((step) => ({
      step,
      label: STEP_LABELS[step],
      txHash: state.steps[step].txHash,
      blockNumber: state.steps[step].blockNumber,
      receiptStatus: state.steps[step].receiptStatus,
      status: state.steps[step].status,
    })),
    deployed: {
      testUsd: state.steps.testusd.contractAddress,
      loanSettlement: state.steps.settlement.contractAddress,
    },
    fusd: FUSD_ADDRESS,
  };
}
