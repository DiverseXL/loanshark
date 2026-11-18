// Testnet deployment panel.
//
// Every transaction button calls flow.runStep() from its own onClick handler.
// There is no timer, no effect and no code path that sends without a click. The
// panel never stores keys and never writes the addresses anywhere except the
// screen and the Copy button's clipboard value.

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChainGuardState } from "../wallet/chains.js";
import type { Eip1193Provider } from "../wallet/types.js";
import {
  canRunStep,
  createDeployFlow,
  evidenceJson,
  rawError,
  STEP_LABELS,
  type DeployFlow,
  type DeployState,
  type StepId,
  type StepRecord,
} from "./flow.js";
import { MINT_AMOUNT_BASE_UNITS, TESTUSD_DECIMALS } from "./encoding.js";
import { FUSD_ADDRESS, manifest } from "./manifest.js";

interface DeployPanelProps {
  readonly provider: Eip1193Provider;
  readonly guard: () => Promise<ChainGuardState>;
}

const stepBadge = (record: StepRecord): { className: string; text: string } => {
  switch (record.status) {
    case "confirmed":
      return { className: "badge good", text: "CONFIRMED" };
    case "reverted":
      return { className: "badge bad", text: "REVERTED - FAILED" };
    case "failed":
      return { className: "badge bad", text: "FAILED - NOT SENT OR REJECTED" };
    case "blocked":
      return { className: "badge bad", text: "BLOCKED" };
    case "running":
      return { className: "badge pending", text: "RUNNING" };
    case "submitted":
      return { className: "badge pending", text: "SUBMITTED - PENDING RECEIPT" };
    case "timeout":
      return { className: "badge pending", text: "UNCONFIRMED - TIMEOUT" };
    case "idle":
      return { className: "badge pending", text: "NOT STARTED" };
  }
};

const short = (value: string | null): string => value ?? "not available";

export function DeployPanel({ provider, guard }: DeployPanelProps) {
  const guardRef = useRef(guard);
  guardRef.current = guard;

  const flow = useMemo<DeployFlow>(
    () => createDeployFlow({ provider, guard: () => guardRef.current() }),
    [provider],
  );
  const [state, setState] = useState<DeployState>(() => flow.getState());
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = flow.subscribe(setState);
    return () => {
      unsubscribe();
    };
  }, [flow]);
  useEffect(() => {
    void flow.refresh();
  }, [flow]);
  useEffect(() => {
    if (state.steps.settlement.status === "confirmed") void flow.refreshOwner();
  }, [flow, state.steps.settlement.status]);

  const copyEvidence = async (): Promise<void> => {
    const text = JSON.stringify(evidenceJson(state), null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus("Copied to the clipboard.");
    } catch (error) {
      setCopyStatus(`Copy failed: ${rawError(error)}`);
    }
  };

  const accountLine = (
    <p>
      Connected EVM account for this button:{" "}
      <strong className="address">{short(state.account)}</strong>
      {state.accountError !== null && <span className="muted"> ({state.accountError})</span>}
    </p>
  );

  const stepBlock = (id: StepId, extra?: ReactNode) => {
    const record = state.steps[id];
    const badge = stepBadge(record);
    const enabled = canRunStep(state, id) && record.status !== "running";
    return (
      <div className="deploy-step">
        <h3>{STEP_LABELS[id]}</h3>
        <p>
          State: <span className={badge.className}>{badge.text}</span>
        </p>
        {accountLine}
        {extra}
        <div className="row">
          <button
            type="button"
            onClick={() => {
              void flow.runStep(id);
            }}
            disabled={!enabled}
          >
            {STEP_LABELS[id]}
          </button>
          {!enabled && record.status !== "running" && (
            <span className="muted">
              Disabled until the chain guard passes and the previous step is confirmed.
            </span>
          )}
        </div>
        <table>
          <tbody>
            <tr>
              <th>eth_estimateGas</th>
              <td>{short(record.estimateGas)}</td>
            </tr>
            <tr>
              <th>transaction hash</th>
              <td className="address">{short(record.txHash)}</td>
            </tr>
            <tr>
              <th>block number</th>
              <td>{short(record.blockNumber)}</td>
            </tr>
            <tr>
              <th>receipt status</th>
              <td>{short(record.receiptStatus)}</td>
            </tr>
            <tr>
              <th>deployed address</th>
              <td className="address">{short(record.contractAddress)}</td>
            </tr>
            <tr>
              <th>receipt polls</th>
              <td>{record.pollAttempts}</td>
            </tr>
          </tbody>
        </table>
        {record.note !== null && <p className="muted">{record.note}</p>}
        {record.error !== null && (
          <div className="notice bad-notice">
            <strong>Raw error or reason, unchanged:</strong>
            <pre>{record.error}</pre>
          </div>
        )}
      </div>
    );
  };

  const guardText =
    state.guard === null
      ? "not read yet"
      : state.guard.status === "ready"
        ? `ready: ${state.guard.nativeChainId} and ${state.guard.evmChainId}`
        : state.guard.status === "wrong-chain"
          ? `wrong chain (${state.guard.reason}): ${state.guard.message}`
          : `unavailable: ${state.guard.message}`;

  return (
    <div>
      <div className="notice bad-notice">
        <strong>TESTNET DEPLOYMENT - OWNER-RUN.</strong> This panel can ask your wallet to send
        transactions on QoreChain Diana. The assistant has not sent, signed or approved any
        transaction. Every send starts from a click on the button with that exact label. There is no
        automatic retry and no batching. The chain guard must pass first. Values are test tokens
        only; they have no monetary value.
      </div>

      <p>
        Chain guard: <strong>{guardText}</strong>
      </p>
      <div className="row">
        <button
          type="button"
          onClick={() => {
            void flow.refresh();
          }}
        >
          Re-read chain guard and account (read only)
        </button>
      </div>

      <p className="muted">
        Manifest source commit <code>{manifest.sourceCommit}</code>, solc{" "}
        <code>{manifest.compiler.version}</code>, EVM target{" "}
        <code>{manifest.compiler.evmVersion}</code>, optimizer{" "}
        <code>{manifest.compiler.optimizer.runs} runs</code>. TestUSD runtime SHA-256{" "}
        <code>{manifest.contracts.TestUSD.runtimeBytecodeSha256}</code>. LoanSettlement runtime
        SHA-256 <code>{manifest.contracts.LoanSettlement.runtimeBytecodeSha256}</code>.
      </p>

      {stepBlock("lane", <p className="muted">Value: 0. Recipient: the connected account above.</p>)}

      {stepBlock(
        "testusd",
        <p className="muted">
          Constructor: <code>{manifest.contracts.TestUSD.constructor.signature}</code> with the
          connected account as owner.
        </p>,
      )}

      {stepBlock(
        "settlement",
        <p className="muted">
          Constructor: <code>{manifest.contracts.LoanSettlement.constructor.signature}</code> with
          TestUSD <code>{short(state.steps.testusd.contractAddress)}</code> and fUSD{" "}
          <code>{FUSD_ADDRESS}</code>.
        </p>,
      )}

      {stepBlock(
        "mint",
        <>
          <p className="muted">
            Amount: <strong>1000 tUSD</strong> ({MINT_AMOUNT_BASE_UNITS.toString()} base units,{" "}
            {TESTUSD_DECIMALS} decimals). Recipient: the connected account above. TestUSD exposes an
            owner-only <code>mint(address,uint256)</code>; the button is enabled only when{" "}
            <code>owner()</code> equals the connected account.
          </p>
          <p className="muted">
            owner(): {short(state.owner)}. Match:{" "}
            {state.ownerMatches === null ? "not checked" : state.ownerMatches ? "yes" : "no"}.
            {state.ownerError !== null ? ` ${state.ownerError}` : ""}
          </p>
        </>,
      )}

      <h3>Evidence JSON block</h3>
      <p className="muted">
        Copy this block into <code>docs/evidence/phase-06-owner-deploy.md</code>. It is shown only
        on screen and placed on the clipboard by the button; the panel writes it nowhere else.
      </p>
      <pre>{JSON.stringify(evidenceJson(state), null, 2)}</pre>
      <div className="row">
        <button
          type="button"
          onClick={() => {
            void copyEvidence();
          }}
        >
          Copy JSON block
        </button>
        {copyStatus !== null && <span className="muted">{copyStatus}</span>}
      </div>
    </div>
  );
}
