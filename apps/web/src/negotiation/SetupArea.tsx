// Setup (ADR-0019): wallet, seal account, public card, binding statement and
// read-only registration status. The seal account panel is the existing one;
// it reports the identity upward so the borrower and lender screens can use it.

import type { SealAccountIdentity } from "@loanshark/seal-account";
import { useState } from "react";
import { SealPanel } from "../seal/SealPanel.js";
import { PrivacyNotice } from "./PrivacyNotice.js";
import { publishBinding, publishCard, type NegotiationDeps } from "./session.js";

interface SetupAreaProps {
  readonly deps: NegotiationDeps | null;
  readonly identity: SealAccountIdentity | null;
  readonly onIdentityChange: (identity: SealAccountIdentity | null) => void;
  readonly walletAddress: string | null;
  readonly walletEvm: string | null;
  readonly guardReady: boolean;
  readonly relayUrl: string;
}

export function SetupArea({
  deps,
  identity,
  onIdentityChange,
  walletAddress,
  walletEvm,
  guardReady,
  relayUrl,
}: SetupAreaProps) {
  const [cardState, setCardState] = useState<string | null>(null);
  const [bindingState, setBindingState] = useState<string | null>(null);
  const [registration, setRegistration] = useState<string | null>(null);

  const publishCardNow = async (): Promise<void> => {
    if (deps === null) {
      setCardState("Create or unlock a seal account first.");
      return;
    }
    const result = await publishCard(deps);
    setCardState(
      result.ok ? "Recipient card published to the relay." : `${result.state}: ${result.message}`,
    );
  };

  const publishBindingNow = async (): Promise<void> => {
    if (deps === null) {
      setBindingState("Create or unlock a seal account first.");
      return;
    }
    try {
      const result = await publishBinding(deps);
      setBindingState(
        result.ok
          ? "W/E binding statement published to the relay."
          : `${result.state}: ${result.message}`,
      );
    } catch (err) {
      setBindingState(
        `The wallet signature failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  const checkRegistration = async (): Promise<void> => {
    if (deps === null) {
      setRegistration("Create or unlock a seal account first.");
      return;
    }
    try {
      const pq = await deps.accountClient.readAccount(deps.identity.address);
      const kem = await deps.registry.getMlkemPublicKey(deps.identity.address);
      setRegistration(
        `ML-DSA-87: ${pq === null ? "not registered" : `${pq.publicKey.length} bytes on chain`}. ` +
          `ML-KEM-1024: ${kem === null ? "not registered" : `${kem.length} bytes on chain`}. ` +
          (pq === null || kem === null
            ? "Run the owner onboarding script before a counterparty can seal to this account."
            : "Both keys are registered."),
      );
    } catch (err) {
      setRegistration(`The read failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <section className="panel" aria-labelledby="setup-heading">
      <div className="panel-head">
        <h2 id="setup-heading">Setup</h2>
        <span className="badge">DIANA TESTNET</span>
      </div>
      <div className="testnet-banner">
        TESTNET ONLY - test tokens only, no monetary value. Nothing here sends a transaction.
      </div>

      <h3>1. Wallet (W) and chain</h3>
      <table>
        <tbody>
          <tr>
            <th>QoreX wallet</th>
            <td className="address">{walletAddress ?? "not connected"}</td>
          </tr>
          <tr>
            <th>EVM account</th>
            <td className="address">{walletEvm ?? "not readable"}</td>
          </tr>
          <tr>
            <th>Chain guard</th>
            <td>
              <span className={guardReady ? "badge good" : "badge bad"}>
                {guardReady ? "BOTH CHAINS" : "NOT READY"}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      {!guardReady && (
        <p className="notice bad-notice">
          The chain guard must pass before signing. Use the Diagnostics tab to read both chains.
        </p>
      )}

      <h3>2. Seal account (E)</h3>
      <SealPanel onIdentityChange={onIdentityChange} />

      <h3>3. Publish public records</h3>
      <div className="row">
        <button type="button" onClick={() => void publishCardNow()} disabled={identity === null}>
          Publish recipient card
        </button>
        <button
          type="button"
          onClick={() => void publishBindingNow()}
          disabled={
            identity === null || walletAddress === null || walletEvm === null || !guardReady
          }
        >
          Sign and publish the W/E binding statement
        </button>
      </div>
      <p className="muted">
        The relay URL is {relayUrl}. The relay stores ciphertext and public records only.
      </p>
      {cardState !== null && <p className="notice">{cardState}</p>}
      {bindingState !== null && <p className="notice">{bindingState}</p>}
      <PrivacyNotice action="publish-card" />
      <PrivacyNotice action="publish-binding" />

      <h3>4. On-chain registration (read-only)</h3>
      <div className="row">
        <button type="button" onClick={() => void checkRegistration()} disabled={identity === null}>
          Check ML-DSA-87 and ML-KEM registration
        </button>
      </div>
      <p className="muted">
        If a key is missing, run <code>scripts/onboard-seal-account.mjs --execute</code> yourself
        and read the transaction hash back. This page registers nothing.
      </p>
      {registration !== null && <p className="notice">{registration}</p>}

      <h3>5. Checklist</h3>
      <ul className="result-list">
        {[
          { done: walletAddress !== null, text: "QoreX wallet connected" },
          { done: walletEvm !== null, text: "EVM account readable" },
          { done: guardReady, text: "Both chain IDs pass the guard" },
          { done: identity !== null, text: "Seal account created or unlocked in memory" },
          {
            done: cardState !== null && !cardState.startsWith("Counterparty"),
            text: "Recipient card published",
          },
          {
            done: bindingState !== null && !bindingState.startsWith("Counterparty"),
            text: "Binding statement published",
          },
        ].map((item) => (
          <li key={item.text}>
            {item.done ? "DONE" : "TODO"}: {item.text}
          </li>
        ))}
      </ul>
    </section>
  );
}
