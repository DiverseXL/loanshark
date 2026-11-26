// Borrower screen (ADR-0019): create and send a request, read verified offers,
// see the evaluator's checks, and accept only an eligible offer.
//
// No transaction and no money screen. The only signing is the agreement
// confirmation, on an explicit click, and only when the deployment config names
// a settlement contract.

import {
  canonicalAgreementText,
  agreementHashOf,
  confirmationFor,
  type EvaluationCheck,
  type Terms,
} from "@loanshark/agreement";
import type { InboxItem } from "@loanshark/relay-client";
import { canonicalJson, parseAmount, type RequestPayload } from "@loanshark/negotiation";
import { useState } from "react";
import type { DeploymentConfig, DeploymentToken } from "./deployment.js";
import { PrivacyNotice } from "./PrivacyNotice.js";
import {
  agreementPreview,
  createRequest,
  evaluateIncomingOffer,
  fetchConfirmations,
  listInbox,
  publishConfirmation,
  receiveOffer,
  sendRequest,
  signConfirmation,
  type NegotiationDeps,
  type OfferEvaluationView,
} from "./session.js";

interface BorrowerAreaProps {
  readonly deps: NegotiationDeps | null;
  readonly deployment: DeploymentConfig;
  readonly tokens: readonly DeploymentToken[];
  readonly walletAddress: string | null;
  readonly sentRequests: readonly RequestPayload[];
  readonly onRequestSent: (request: RequestPayload) => void;
}

interface OfferEntry {
  readonly item: InboxItem;
  readonly request: RequestPayload | null;
  readonly evaluation: OfferEvaluationView | null;
  readonly error: string | null;
}

const explain = (checks: readonly EvaluationCheck[]): string =>
  checks
    .filter((check) => !check.pass)
    .map((check) => `${check.id}: expected ${check.expected}, got ${check.actual}`)
    .join("; ");

export function BorrowerArea({
  deps,
  deployment,
  tokens,
  walletAddress,
  sentRequests,
  onRequestSent,
}: BorrowerAreaProps) {
  const [lenderW, setLenderW] = useState("");
  const [tokenIndex, setTokenIndex] = useState(0);
  const [principalText, setPrincipalText] = useState("");
  const [maxText, setMaxText] = useState("");
  const [latestDue, setLatestDue] = useState("");
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<RequestPayload | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [offers, setOffers] = useState<OfferEntry[]>([]);
  const [confirmationState, setConfirmationState] = useState<string | null>(null);
  const [confirmedLoanId, setConfirmedLoanId] = useState<string | null>(null);

  const token = tokens[tokenIndex] ?? null;

  const buildPreview = (): void => {
    if (walletAddress === null || token === null) {
      setMessage("A connected wallet and a configured token are required.");
      return;
    }
    const principal = parseAmount(principalText, token.decimals);
    if (!principal.ok) {
      setMessage(principal.errors.map((item) => item.message).join("; "));
      return;
    }
    const max = parseAmount(maxText, token.decimals);
    if (!max.ok) {
      setMessage(max.errors.map((item) => item.message).join("; "));
      return;
    }
    const built = createRequest({
      borrowerW: walletAddress,
      lenderW,
      token: token.address,
      principal: principal.value.toString(10),
      maxTotalCost: max.value.toString(10),
      latestDueDate: latestDue.trim(),
      note,
    });
    if (!built.ok) {
      setMessage(
        built.errors === undefined
          ? built.message
          : built.errors.map((item) => `${item.field}: ${item.message}`).join("; "),
      );
      return;
    }
    setPreview(built.value);
    setMessage(null);
  };

  const send = async (): Promise<void> => {
    if (deps === null || preview === null || sending) return;
    setSending(true);
    try {
      setMessage("Sealing and sending...");
      const result = await sendRequest(deps, preview);
      if (!result.ok) {
        setMessage(`${result.state}: ${result.message}`);
        return;
      }
      onRequestSent(preview);
      setMessage(`Request sent to the relay. Envelope ${result.value.envelopeId}.`);
    } finally {
      setSending(false);
    }
  };

  const refresh = async (): Promise<void> => {
    if (deps === null) {
      setMessage("Connect a wallet and create or unlock a seal account first.");
      return;
    }
    const inbox = await listInbox(deps);
    if (!inbox.ok) {
      setMessage(`${inbox.state}: ${inbox.message}`);
      return;
    }
    const entries: OfferEntry[] = [];
    for (const item of inbox.value.filter((entry) => entry.kind === "offer")) {
      const opened = await receiveOffer(deps, item);
      if (!opened.ok) {
        entries.push({ item, request: null, evaluation: null, error: opened.message });
        continue;
      }
      const request =
        sentRequests.find((entry) => entry.requestId === opened.value.requestId) ?? null;
      if (request === null) {
        entries.push({
          item,
          request: null,
          evaluation: null,
          error: "This browser does not hold the request this offer answers.",
        });
        continue;
      }
      const evaluation = evaluateIncomingOffer(deps, request, opened.value);
      if (!evaluation.ok) {
        entries.push({ item, request, evaluation: null, error: evaluation.message });
        continue;
      }
      entries.push({ item, request, evaluation: evaluation.value, error: null });
    }
    setOffers(entries);
    setMessage(null);
  };

  const accept = async (entry: OfferEntry): Promise<void> => {
    if (deps === null || entry.evaluation === null || deployment.settlement === null) return;
    const terms: Terms = entry.evaluation.terms;
    const domain = {
      chainId: BigInt(deployment.chainId),
      verifyingContract: deployment.settlement as `0x${string}`,
    };
    setMessage("Signing the borrower confirmation...");
    const signed = await signConfirmation(deps, terms, domain);
    if (!signed.ok) {
      setMessage(`${signed.state}: ${signed.message}`);
      return;
    }
    const published = await publishConfirmation(deps, {
      loanId: signed.value.confirmation.loanId,
      agreementHash: signed.value.confirmation.agreementHash,
      chainId: signed.value.confirmation.chainId,
      verifyingContract: signed.value.confirmation.verifyingContract,
      role: "borrower",
      signature: signed.value.signature,
    });
    if (!published.ok) {
      setMessage(`${published.state}: ${published.message}`);
      return;
    }
    setConfirmedLoanId(signed.value.confirmation.loanId);
    const verified = await fetchConfirmations(deps, signed.value.confirmation.loanId, domain);
    setConfirmationState(
      verified.ok
        ? `${verified.value.length} confirmation(s) verified for ${signed.value.confirmation.loanId}.`
        : `${verified.state}: ${verified.message}`,
    );
    setMessage(null);
  };

  const previewText =
    preview === null
      ? null
      : {
          payload: canonicalJson(preview),
          principalBase: preview.principal,
          maxBase: preview.maxTotalCost,
        };

  return (
    <section className="panel" aria-labelledby="borrower-heading">
      <div className="panel-head">
        <h2 id="borrower-heading">Borrower</h2>
        <span className="badge">DIANA TESTNET</span>
      </div>
      <p className="muted">
        One borrower, one lender. The request is sealed to the lender&apos;s seal account. The relay
        sees the two wallet addresses, the request reference, the envelope size and the time.
      </p>

      <h3>1. New request</h3>
      <div className="row">
        <label>
          Lender wallet (qor1)
          <input value={lenderW} onChange={(event) => setLenderW(event.target.value)} />
        </label>
      </div>
      <div className="row">
        <label>
          Token
          <select
            value={tokenIndex}
            onChange={(event) => setTokenIndex(Number(event.target.value))}
          >
            {tokens.length === 0 ? (
              <option value={0}>no token configured</option>
            ) : (
              tokens.map((entry, index) => (
                <option key={entry.address} value={index}>
                  {entry.label} ({entry.decimals} decimals)
                </option>
              ))
            )}
          </select>
        </label>
      </div>
      <div className="row">
        <label>
          Principal (human units)
          <input value={principalText} onChange={(event) => setPrincipalText(event.target.value)} />
        </label>
        <label>
          Maximum total cost (human units)
          <input value={maxText} onChange={(event) => setMaxText(event.target.value)} />
        </label>
      </div>
      <div className="row">
        <label>
          Latest due date (unix seconds)
          <input value={latestDue} onChange={(event) => setLatestDue(event.target.value)} />
        </label>
        <label>
          Note (max 400 characters)
          <input value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
      </div>
      <div className="row">
        <button type="button" onClick={buildPreview} disabled={token === null}>
          Preview the exact payload
        </button>
        <button
          type="button"
          onClick={() => void send()}
          disabled={deps === null || preview === null || sending}
        >
          Seal, sign and send the request
        </button>
      </div>
      {previewText !== null && (
        <>
          <p className="muted">
            Base units: principal {previewText.principalBase}, maximum total {previewText.maxBase}.
          </p>
          <pre>{previewText.payload}</pre>
        </>
      )}
      <PrivacyNotice action="create-request" />
      {deployment.settlement === null && (
        <p className="muted">
          Not deployed: the confirmation needs a settlement address. The request can still be sent.
        </p>
      )}

      <h3>2. Offers received</h3>
      <div className="row">
        <button type="button" onClick={() => void refresh()} disabled={deps === null}>
          Refresh offers
        </button>
      </div>
      {offers.length === 0 ? (
        <p className="muted">No offer has been opened in this page yet.</p>
      ) : (
        offers.map((entry) => (
          <div key={entry.item.id} className="notice">
            <p>
              Offer envelope <code>{entry.item.id.slice(0, 16)}...</code> from{" "}
              <code>{entry.item.senderW}</code>
            </p>
            {entry.error !== null ? (
              <p className="badge bad">REFUSED: {entry.error}</p>
            ) : (
              entry.evaluation !== null && (
                <>
                  <p>
                    Evaluation:{" "}
                    <span className={entry.evaluation.eligible ? "badge good" : "badge bad"}>
                      {entry.evaluation.eligible ? "ELIGIBLE" : "NOT ELIGIBLE"}
                    </span>
                  </p>
                  <table>
                    <thead>
                      <tr>
                        <th>Check</th>
                        <th>Expected</th>
                        <th>Actual</th>
                        <th>Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entry.evaluation.checks.map((check) => (
                        <tr key={check.id}>
                          <td>{check.id}</td>
                          <td>{check.expected}</td>
                          <td>{check.actual}</td>
                          <td>
                            <span className={check.pass ? "badge good" : "badge bad"}>
                              {check.pass ? "PASS" : "FAIL"}
                            </span>
                            <div className="muted">{check.explanation}</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="muted">
                    The agreement text, hash and loan id are computed locally from these terms. Loan
                    id:{" "}
                    <code>
                      {
                        confirmationFor(entry.evaluation.terms, {
                          chainId: BigInt(deployment.chainId),
                          verifyingContract: (deployment.settlement ??
                            "0x0000000000000000000000000000000000000000") as `0x${string}`,
                        }).loanId
                      }
                    </code>
                  </p>
                  <pre>{canonicalAgreementText(entry.evaluation.terms)}</pre>
                  <p className="muted">
                    Agreement hash: <code>{agreementHashOf(entry.evaluation.terms)}</code>
                  </p>
                  <div className="row">
                    <button
                      type="button"
                      onClick={() => void accept(entry)}
                      disabled={
                        !entry.evaluation.eligible ||
                        deps === null ||
                        deployment.settlement === null
                      }
                    >
                      Accept and sign the borrower confirmation
                    </button>
                    {deployment.settlement === null && (
                      <span className="muted">
                        Not deployed: the confirmation needs a settlement address.
                      </span>
                    )}
                    {!entry.evaluation.eligible && (
                      <span className="muted">
                        Disabled: {explain(entry.evaluation.checks) || "the offer is not eligible"}.
                      </span>
                    )}
                  </div>
                  <PrivacyNotice action="send-offer" />
                </>
              )
            )}
          </div>
        ))
      )}

      {confirmedLoanId !== null && (
        <>
          <h3>3. Agreement</h3>
          <p className="muted">
            Loan id <code>{confirmedLoanId}</code>
          </p>
          <p>{confirmationState}</p>
        </>
      )}

      {message !== null && <p className="notice">{message}</p>}
      {walletAddress === null && (
        <p className="muted">Connect QoreX in Setup and read a native account first.</p>
      )}
    </section>
  );
}
