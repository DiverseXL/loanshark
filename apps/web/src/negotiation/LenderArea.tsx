// Lender screen (ADR-0019): open verified requests, compose and send an offer,
// then confirm the same agreement once the borrower has confirmed.
//
// No transaction and no money screen. The only signing is the agreement
// confirmation, on an explicit click, and only when the deployment config names
// a settlement contract.

import { agreementHashOf, canonicalAgreementText, commitmentOf } from "@loanshark/agreement";
import type { InboxItem } from "@loanshark/relay-client";
import {
  canonicalJson,
  parseAmount,
  toContractTerms,
  type OfferTermsPayload,
  type RequestPayload,
} from "@loanshark/negotiation";
import { useState } from "react";
import type { DeploymentConfig, DeploymentToken } from "./deployment.js";
import { PrivacyNotice } from "./PrivacyNotice.js";
import {
  fetchConfirmations,
  listInbox,
  publishConfirmation,
  randomSalt,
  receiveRequest,
  resolveCounterparty,
  sendOffer,
  signConfirmation,
  type Counterparty,
  type NegotiationDeps,
} from "./session.js";

interface LenderAreaProps {
  readonly deps: NegotiationDeps | null;
  readonly deployment: DeploymentConfig;
  readonly tokens: readonly DeploymentToken[];
  readonly walletAddress: string | null;
  readonly walletEvm: `0x${string}` | null;
}

interface OpenedRequest {
  readonly item: InboxItem;
  readonly request: RequestPayload;
  readonly borrower: Counterparty;
}

const toTerms = (args: {
  borrowerEvm: string;
  lenderEvm: string;
  token: string;
  principal: string;
  interest: string;
  dueDate: string;
  graceSeconds: string;
  fundingDeadline: string;
  claimDeadline: string;
  salt: string;
}): OfferTermsPayload => ({
  borrower: args.borrowerEvm,
  lender: args.lenderEvm,
  token: args.token,
  principal: args.principal,
  interest: args.interest,
  dueDate: args.dueDate,
  graceSeconds: args.graceSeconds,
  fundingDeadline: args.fundingDeadline,
  claimDeadline: args.claimDeadline,
  salt: args.salt,
});

export function LenderArea({
  deps,
  deployment,
  tokens,
  walletAddress,
  walletEvm,
}: LenderAreaProps) {
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [opened, setOpened] = useState<OpenedRequest | null>(null);
  const [interestText, setInterestText] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [graceSeconds, setGraceSeconds] = useState("3600");
  const [fundingDeadline, setFundingDeadline] = useState("");
  const [claimDeadline, setClaimDeadline] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [note, setNote] = useState("");
  const [terms, setTerms] = useState<OfferTermsPayload | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [loanId, setLoanId] = useState<string | null>(null);
  const [confirmationState, setConfirmationState] = useState<string | null>(null);

  const refresh = async (): Promise<void> => {
    if (deps === null) {
      setMessage("Connect a wallet and create or unlock a seal account first.");
      return;
    }
    const result = await listInbox(deps);
    if (!result.ok) {
      setMessage(`${result.state}: ${result.message}`);
      return;
    }
    setInbox(result.value.filter((item) => item.kind === "request"));
    setMessage(null);
  };

  const open = async (item: InboxItem): Promise<void> => {
    if (deps === null) return;
    setMessage("Verifying and opening the request...");
    const request = await receiveRequest(deps, item);
    if (!request.ok) {
      setMessage(`${request.state}: ${request.message}`);
      return;
    }
    const borrower = await resolveCounterparty(deps, request.value.borrowerW);
    if (!borrower.ok) {
      setMessage(`${borrower.state}: ${borrower.message}`);
      return;
    }
    setOpened({ item, request: request.value, borrower: borrower.value });
    setTerms(null);
    setLoanId(null);
    setMessage(null);
  };

  const tokenDecimals = (address: string): number | null =>
    tokens.find((token) => token.address.toLowerCase() === address.toLowerCase())?.decimals ?? null;

  const buildOffer = (): OfferTermsPayload | null => {
    if (opened === null || walletEvm === null) {
      setMessage("Open a request and read an EVM account first.");
      return null;
    }
    const decimals = tokenDecimals(opened.request.token);
    if (decimals === null) {
      setMessage("The request token is not in the deployment config, so its decimals are unknown.");
      return null;
    }
    const interest = parseAmount(interestText, decimals);
    if (!interest.ok) {
      setMessage(interest.errors.map((item) => item.message).join("; "));
      return null;
    }
    const built = toTerms({
      borrowerEvm: opened.borrower.walletEvmAddress,
      lenderEvm: walletEvm,
      token: opened.request.token,
      principal: opened.request.principal,
      interest: interest.value.toString(10),
      dueDate: dueDate.trim(),
      graceSeconds: graceSeconds.trim(),
      fundingDeadline: fundingDeadline.trim(),
      claimDeadline: claimDeadline.trim(),
      salt: randomSalt(),
    });
    setTerms(built);
    setMessage(null);
    return built;
  };

  const send = async (): Promise<void> => {
    if (deps === null || opened === null || sending) return;
    const built = buildOffer();
    if (built === null) return;
    if (BigInt(built.claimDeadline) < BigInt(built.fundingDeadline) + 3600n) {
      setMessage("The claim deadline must be at least 3600 seconds after the funding deadline.");
      return;
    }
    setSending(true);
    try {
      setMessage("Sealing and sending the offer...");
      const result = await sendOffer(deps, opened.request, built, expiresAt.trim(), note);
      if (!result.ok) {
        setMessage(`${result.state}: ${result.message}`);
        return;
      }
      if (deployment.settlement === null) {
        setLoanId(null);
        setMessage("Offer sent. The agreement is not deployed, so no loan id is shown.");
      } else {
        const domain = {
          chainId: BigInt(deployment.chainId),
          verifyingContract: deployment.settlement as `0x${string}`,
        };
        setLoanId(commitmentOf(toContractTerms(built), domain));
        setMessage(`Offer sent to the relay. Envelope ${result.value.envelopeId}.`);
      }
    } finally {
      setSending(false);
    }
  };

  const checkConfirmations = async (): Promise<void> => {
    if (deps === null || loanId === null || deployment.settlement === null) return;
    const domain = {
      chainId: BigInt(deployment.chainId),
      verifyingContract: deployment.settlement as `0x${string}`,
    };
    const result = await fetchConfirmations(deps, loanId, domain);
    if (!result.ok) {
      setConfirmationState(`${result.state}: ${result.message}`);
      return;
    }
    setConfirmationState(
      result.value.length === 0
        ? "No confirmation has been published yet."
        : result.value.map((entry) => `${entry.role} verified (${entry.signerW})`).join("; "),
    );
  };

  const confirm = async (): Promise<void> => {
    if (deps === null || terms === null || deployment.settlement === null) return;
    const domain = {
      chainId: BigInt(deployment.chainId),
      verifyingContract: deployment.settlement as `0x${string}`,
    };
    setMessage("Signing the lender confirmation...");
    const signed = await signConfirmation(deps, toContractTerms(terms), domain);
    if (!signed.ok) {
      setMessage(`${signed.state}: ${signed.message}`);
      return;
    }
    const published = await publishConfirmation(deps, {
      loanId: signed.value.confirmation.loanId,
      agreementHash: signed.value.confirmation.agreementHash,
      chainId: signed.value.confirmation.chainId,
      verifyingContract: signed.value.confirmation.verifyingContract,
      role: "lender",
      signature: signed.value.signature,
    });
    if (!published.ok) {
      setMessage(`${published.state}: ${published.message}`);
      return;
    }
    setMessage("Lender confirmation published. Both confirmations can now be verified.");
  };

  return (
    <section className="panel" aria-labelledby="lender-heading">
      <div className="panel-head">
        <h2 id="lender-heading">Lender</h2>
        <span className="badge">DIANA TESTNET</span>
      </div>
      <p className="muted">
        Requests are sealed to this seal account. Nothing is shown until its signature and the
        sender&apos;s binding and card verify.
      </p>

      <h3>1. Inbox</h3>
      <div className="row">
        <button type="button" onClick={() => void refresh()} disabled={deps === null}>
          Refresh requests
        </button>
      </div>
      {inbox.length === 0 ? (
        <p className="muted">No request has been listed in this page yet.</p>
      ) : (
        <ul className="result-list">
          {inbox.map((item) => (
            <li key={item.id}>
              <code>{item.id.slice(0, 16)}...</code> from <code>{item.senderW}</code>{" "}
              <button type="button" onClick={() => void open(item)}>
                Verify and open
              </button>
            </li>
          ))}
        </ul>
      )}

      {opened !== null && (
        <>
          <h3>2. Request</h3>
          <p className="muted">
            Borrower wallet <code>{opened.request.borrowerW}</code>. EVM address from the verified
            binding: <code>{opened.borrower.walletEvmAddress}</code>.
          </p>
          <pre>{canonicalJson(opened.request)}</pre>

          <h3>3. Offer</h3>
          <div className="row">
            <label>
              Interest (human units)
              <input
                value={interestText}
                onChange={(event) => setInterestText(event.target.value)}
              />
            </label>
            <label>
              Due date (unix seconds)
              <input value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
            </label>
            <label>
              Grace seconds
              <input
                value={graceSeconds}
                onChange={(event) => setGraceSeconds(event.target.value)}
              />
            </label>
          </div>
          <div className="row">
            <label>
              Funding deadline (unix seconds)
              <input
                value={fundingDeadline}
                onChange={(event) => setFundingDeadline(event.target.value)}
              />
            </label>
            <label>
              Claim deadline (unix seconds, at least funding + 3600)
              <input
                value={claimDeadline}
                onChange={(event) => setClaimDeadline(event.target.value)}
              />
            </label>
            <label>
              Offer expires at (unix seconds)
              <input value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
            </label>
          </div>
          <div className="row">
            <label>
              Note (max 400 characters)
              <input value={note} onChange={(event) => setNote(event.target.value)} />
            </label>
          </div>
          <div className="row">
            <button type="button" onClick={buildOffer}>
              Preview the exact offer payload
            </button>
            <button type="button" onClick={() => void send()} disabled={deps === null || sending}>
              Seal, sign and send the offer
            </button>
          </div>
          {terms !== null && <pre>{canonicalJson(terms)}</pre>}
          <PrivacyNotice action="send-offer" />
        </>
      )}

      {loanId !== null && terms !== null && (
        <>
          <h3>4. Agreement</h3>
          <p className="muted">
            Loan id <code>{loanId}</code>. Agreement hash{" "}
            <code>{agreementHashOf(toContractTerms(terms))}</code>.
          </p>
          <pre>{canonicalAgreementText(toContractTerms(terms))}</pre>
          <div className="row">
            <button type="button" onClick={() => void checkConfirmations()}>
              Check confirmations
            </button>
            <button type="button" onClick={() => void confirm()} disabled={deps === null}>
              Sign and publish the lender confirmation
            </button>
          </div>
          {confirmationState !== null && <p className="notice">{confirmationState}</p>}
          <PrivacyNotice action="propose-loan" />
        </>
      )}

      {deployment.settlement === null && (
        <p className="muted">
          Not deployed: the agreement and confirmation steps need a settlement address.
        </p>
      )}
      {walletAddress === null && (
        <p className="muted">Connect QoreX in Setup and read a native account first.</p>
      )}
      {walletEvm === null && <p className="muted">No EVM account was readable.</p>}
      {message !== null && <p className="notice">{message}</p>}
    </section>
  );
}
