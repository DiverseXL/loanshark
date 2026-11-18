// LOANSHARK diagnostics surface.
//
// This is a technical validation page, not a product UI. It has six panels,
// each with a raw JSON toggle. Nothing here sends a transaction, stores key
// material or asks the wallet to sign anything except the fixed test message,
// and only after a button press.
//
// Read order matters: the wallet address and both chain ids are rendered in
// panels 2 and 3 and repeated above the signing button in panel 5, so a user
// sees what they are about to sign with before the button exists.

import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import {
  ACCOUNT_PATH,
  DERIVED_EVM_ADDRESS,
  EVM_CHAIN_ID,
  EVM_CHAIN_ID_DECIMAL,
  EVM_RPC_HOST,
  NATIVE_CHAIN_ID,
  REST_HOST,
  TEST_MESSAGE,
} from "./constants.js";
import { CLAIM_ROWS, ENCRYPTED_OFF_CHAIN, NO_ZK_CLAIM, PUBLIC_ON_CHAIN } from "./privacy.js";
import { safeJson, summariseProvider } from "./safe-json.js";
import type { AccountRecordOutcome } from "./wallet/account.js";
import { createRestAccountReader, fetchAccountRecord } from "./wallet/account.js";
import type { ChainGuardState, ChainReading } from "./wallet/chains.js";
import { evaluateChainGuard, readChains } from "./wallet/chains.js";
import type { NativeConnection } from "./wallet/connect.js";
import { connectNative } from "./wallet/connect.js";
import { detectQorex } from "./wallet/detect.js";
import { DeployPanel } from "./deploy/DeployPanel.js";
import { QorexMessageSigner } from "./wallet/signer.js";
import type { SignatureReport } from "./wallet/signing.js";
import { runSignatureChecks } from "./wallet/signing.js";
import type { DetectedWallets, WalletError } from "./wallet/types.js";

type SignState =
  | { readonly status: "idle" }
  | { readonly status: "running" }
  | { readonly status: "failed"; readonly code: string; readonly message: string }
  | {
      readonly status: "done";
      readonly report: SignatureReport;
      readonly rawSignature: unknown;
    };

const keysOf = (value: object | null | undefined): string[] => {
  if (value === null || value === undefined) return [];
  try {
    return Object.keys(value);
  } catch {
    return ["[ownKeys unavailable]"];
  }
};

const describe = (err: unknown): string => (err instanceof Error ? err.message : String(err));

interface PanelProps {
  readonly id: string;
  readonly title: string;
  readonly raw: unknown;
  readonly children: ReactNode;
}

function Panel({ id, title, raw, children }: PanelProps) {
  return (
    <section className="panel" aria-labelledby={id}>
      <div className="panel-head">
        <h2 id={id}>{title}</h2>
        <span className="badge">DIANA TESTNET</span>
      </div>
      {children}
      <details className="raw">
        <summary>Show raw JSON</summary>
        <pre>{safeJson(raw)}</pre>
      </details>
    </section>
  );
}

const guardBadge = (guard: ChainGuardState | null): { className: string; text: string } => {
  if (guard === null) return { className: "badge pending", text: "NOT CHECKED" };
  if (guard.status === "ready") return { className: "badge good", text: "READY: BOTH CHAINS" };
  if (guard.status === "wrong-chain") {
    return { className: "badge bad", text: `WRONG CHAIN: ${guard.reason.toUpperCase()}` };
  }
  return { className: "badge pending", text: "CHAIN UNAVAILABLE" };
};

export function App() {
  const [detection, setDetection] = useState<DetectedWallets | null>(null);
  const [reading, setReading] = useState<ChainReading | null>(null);
  const [guard, setGuard] = useState<ChainGuardState | null>(null);
  const [connection, setConnection] = useState<NativeConnection | null>(null);
  const [connectFailure, setConnectFailure] = useState<WalletError | null>(null);
  const [nativeAccountsRaw, setNativeAccountsRaw] = useState<unknown>(null);
  const [nativeAccountsError, setNativeAccountsError] = useState<string | null>(null);
  const [evmAccounts, setEvmAccounts] = useState<readonly string[] | null>(null);
  const [evmAccountsError, setEvmAccountsError] = useState<string | null>(null);
  const [recordOutcome, setRecordOutcome] = useState<AccountRecordOutcome | null>(null);
  const [recordBusy, setRecordBusy] = useState(false);
  const [signState, setSignState] = useState<SignState>({ status: "idle" });
  const [refreshKey, setRefreshKey] = useState(0);
  const [showDeployPanel, setShowDeployPanel] = useState(false);

  const address = connection?.address ?? null;

  useEffect(() => {
    let cancelled = false;
    // refreshKey is the explicit restart trigger; this read keeps the
    // dependency meaningful to the hook linter.
    void refreshKey;
    // A result from the previous wallet or chain must not survive a re-detect.
    setSignState({ status: "idle" });
    setRecordOutcome(null);

    const start = async (): Promise<void> => {
      const detected = await detectQorex({ timeoutMs: 600 });
      if (cancelled) return;
      setDetection(detected);

      const probe = {
        native: detected.qorexNative,
        evm: detected.qorexEvm?.provider ?? null,
      };
      const chainReading = await readChains(probe);
      if (cancelled) return;
      setReading(chainReading);
      setGuard(evaluateChainGuard(chainReading));

      const connected = await connectNative(detected.qorexNative, NATIVE_CHAIN_ID);
      if (cancelled) return;
      if (connected.ok) {
        setConnection(connected.value);
        setConnectFailure(null);
      } else {
        setConnection(null);
        setConnectFailure(connected);
      }

      const native = detected.qorexNative;
      if (native?.listAccounts === undefined) {
        setNativeAccountsRaw(null);
        setNativeAccountsError("This QoreX build exposes no listAccounts.");
      } else {
        try {
          setNativeAccountsRaw(await native.listAccounts(NATIVE_CHAIN_ID));
          setNativeAccountsError(null);
        } catch (err) {
          setNativeAccountsRaw(null);
          setNativeAccountsError(describe(err));
        }
      }

      const evm = detected.qorexEvm?.provider ?? null;
      if (evm === null) {
        setEvmAccounts(null);
        setEvmAccountsError("No QoreX EVM provider was found over EIP-6963.");
      } else {
        try {
          const answer = await evm.request({ method: "eth_accounts" });
          if (Array.isArray(answer) && answer.every((item) => typeof item === "string")) {
            setEvmAccounts(answer);
            setEvmAccountsError(null);
          } else {
            setEvmAccounts(null);
            setEvmAccountsError(
              `eth_accounts returned ${safeJson(answer)}, not an array of addresses.`,
            );
          }
        } catch (err) {
          setEvmAccounts(null);
          setEvmAccountsError(describe(err));
        }
      }
    };

    void start();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const guardNow = useCallback(async (): Promise<ChainGuardState> => {
    if (detection === null) {
      return {
        status: "unavailable",
        reason: "evm-unreadable",
        message: "Wallet detection has not completed.",
      };
    }
    return evaluateChainGuard(
      await readChains({
        native: detection.qorexNative,
        evm: detection.qorexEvm?.provider ?? null,
      }),
    );
  }, [detection]);

  const evmAccount = evmAccounts?.[0] ?? null;
  const deployProvider = detection?.qorexEvm?.provider ?? null;
  const addressMatch =
    evmAccount === null
      ? "not-compared"
      : evmAccount.toLowerCase() === DERIVED_EVM_ADDRESS.toLowerCase()
        ? "match"
        : "mismatch";

  const readRecord = async (): Promise<void> => {
    if (address === null) return;
    setRecordBusy(true);
    try {
      setRecordOutcome(await fetchAccountRecord({ address }));
    } finally {
      setRecordBusy(false);
    }
  };

  const signFixedMessage = async (): Promise<void> => {
    if (address === null || detection?.qorexNative === null || detection === null) return;
    const native = detection.qorexNative;
    if (native === null) return;

    setSignState({ status: "running" });
    const signer = new QorexMessageSigner({
      native,
      address,
      nativeChainId: NATIVE_CHAIN_ID,
      guard: guardNow,
      // This callback runs only from the button handler below. It also refuses
      // any message other than the fixed one, so no other content can be sent
      // even if a future caller reached this signer.
      authorize: async (message: string) => message === TEST_MESSAGE,
    });

    const result = await signer.requestSignature(new TextEncoder().encode(TEST_MESSAGE));
    if (!result.ok) {
      setSignState({ status: "failed", code: result.code, message: result.message });
      return;
    }

    const report = await runSignatureChecks({
      response: result.value,
      signer: address,
      message: TEST_MESSAGE,
      accountClient: createRestAccountReader(),
    });
    setSignState({ status: "done", report, rawSignature: result.value });
  };

  const panel1Raw =
    detection === null
      ? null
      : {
          announced: detection.evm.map((entry) => summariseProvider(entry)),
          qorexEvm: detection.qorexEvm === null ? null : summariseProvider(detection.qorexEvm),
          qorexNativeMembers: keysOf(detection.qorexNative),
          notes: detection.notes,
        };

  const panel2Raw = {
    reading,
    guard,
    required: { native: NATIVE_CHAIN_ID, evm: EVM_CHAIN_ID, evmDecimal: EVM_CHAIN_ID_DECIMAL },
    assumption:
      "QoreX exposes no native chain-id getter in the source or runtime record; a resolved enable(qorechain-diana) is the native-chain signal.",
  };

  const panel3Raw = {
    native: {
      connection,
      listAccounts: nativeAccountsRaw,
      listAccountsError: nativeAccountsError,
      connectError: connectFailure,
    },
    evm: { accounts: evmAccounts, error: evmAccountsError },
    adr0009DerivedAddress: DERIVED_EVM_ADDRESS,
    comparison: addressMatch,
  };

  const panel5Raw = {
    message: TEST_MESSAGE,
    chainId: NATIVE_CHAIN_ID,
    state: signState,
  };

  const badge = guardBadge(guard);
  const canSign = guard?.status === "ready" && address !== null && signState.status !== "running";

  return (
    <>
      <div className="testnet-banner">
        TESTNET ONLY - QoreChain Diana - test tokens only, no monetary value
      </div>
      <div className="page">
        <h1>LOANSHARK diagnostics</h1>
        <p className="muted">
          Browser-only technical validation surface. The only signing request is the fixed message{" "}
          <code>{TEST_MESSAGE}</code>, and only after a button press. No transaction is sent unless
          the owner opens the testnet deployment panel and clicks a deployment button. Testnet only:
          Diana.
        </p>
        <div className="row">
          <button type="button" onClick={() => setRefreshKey((value) => value + 1)}>
            Re-detect wallets and re-read chains
          </button>
        </div>

        <Panel id="panel-1" title="1. QoreX detection" raw={panel1Raw}>
          {detection === null ? (
            <p className="muted">Detecting wallets through EIP-6963 and window.qorex...</p>
          ) : (
            <>
              <p>
                QoreX native provider:{" "}
                <strong>{detection.qorexNative === null ? "not found" : "found"}</strong>. QoreX EVM
                provider: <strong>{detection.qorexEvm === null ? "not found" : "found"}</strong>.
              </p>
              <table>
                <thead>
                  <tr>
                    <th>EIP-6963 name</th>
                    <th>rdns</th>
                    <th>isQoreX flag</th>
                  </tr>
                </thead>
                <tbody>
                  {detection.evm.length === 0 ? (
                    <tr>
                      <td colSpan={3}>No provider announced itself in the discovery window.</td>
                    </tr>
                  ) : (
                    detection.evm.map((entry) => (
                      <tr key={entry.info.uuid}>
                        <td>{entry.info.name}</td>
                        <td>
                          <code>{entry.info.rdns}</code>
                        </td>
                        <td>{entry.provider.isQoreX === true ? "true" : "false or absent"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              <p className="muted">
                Discovery listens before it dispatches <code>eip6963:requestProvider</code>. An rdns
                is self-attested; the full list is shown rather than silently trusting one entry.
              </p>
              {detection.notes.length > 0 && (
                <ul className="result-list">
                  {detection.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Panel>

        <Panel id="panel-2" title="2. Chain guard" raw={panel2Raw}>
          <p>
            Guard state: <span className={badge.className}>{badge.text}</span>
          </p>
          <table>
            <thead>
              <tr>
                <th>Lane</th>
                <th>Required</th>
                <th>Observed</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Native (Cosmos)</td>
                <td>
                  <code>{NATIVE_CHAIN_ID}</code>
                </td>
                <td>
                  {reading?.nativeChainId === null || reading === null ? (
                    <strong>not accepted</strong>
                  ) : (
                    <strong>{reading.nativeChainId}</strong>
                  )}
                  {reading?.nativeError !== null && reading !== null && (
                    <div className="muted">enable error: {reading.nativeError}</div>
                  )}
                </td>
              </tr>
              <tr>
                <td>EVM</td>
                <td>
                  <code>
                    {EVM_CHAIN_ID} ({EVM_CHAIN_ID_DECIMAL})
                  </code>
                </td>
                <td>
                  {reading?.evmChainId === null || reading === null ? (
                    <strong>not readable</strong>
                  ) : (
                    <strong>{reading.evmChainId}</strong>
                  )}
                  {reading?.evmError !== null && reading !== null && (
                    <div className="muted">eth_chainId error: {reading.evmError}</div>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
          {guard?.status === "wrong-chain" && <p className="notice bad-notice">{guard.message}</p>}
          {guard?.status === "unavailable" && <p className="notice">{guard.message}</p>}
          <p className="muted">
            ASSUMPTION: the source and the runtime record expose no native chain-id getter, so a
            resolved <code>enable(qorechain-diana)</code> is treated as the native-chain signal. A
            failure there is a distinct wrong-chain state, not a generic error.
          </p>
        </Panel>

        <Panel id="panel-3" title="3. Accounts" raw={panel3Raw}>
          <h3>Native account</h3>
          {connection === null ? (
            <p className="muted">
              No native account was read.{" "}
              {connectFailure === null ? "" : `${connectFailure.code}: ${connectFailure.message}`}
            </p>
          ) : (
            <table>
              <tbody>
                <tr>
                  <th>bech32 address</th>
                  <td className="address">{connection.address}</td>
                </tr>
                <tr>
                  <th>getKey address</th>
                  <td className="address">{connection.key?.address ?? "not reported"}</td>
                </tr>
                <tr>
                  <th>algorithm</th>
                  <td>{connection.key?.algo ?? "not reported"}</td>
                </tr>
                <tr>
                  <th>listAccounts</th>
                  <td>
                    {nativeAccountsError !== null
                      ? nativeAccountsError
                      : nativeAccountsRaw === null
                        ? "not read"
                        : "read; see raw JSON"}
                  </td>
                </tr>
              </tbody>
            </table>
          )}

          <h3>EVM account</h3>
          {evmAccountsError !== null ? (
            <p className="muted">{evmAccountsError}</p>
          ) : evmAccounts === null ? (
            <p className="muted">Not read.</p>
          ) : evmAccount === null ? (
            <p className="muted">
              eth_accounts returned an empty list, so no comparison is possible.
            </p>
          ) : (
            <>
              <table>
                <tbody>
                  <tr>
                    <th>eth_accounts[0]</th>
                    <td className="address">{evmAccount}</td>
                  </tr>
                  <tr>
                    <th>ADR-0009 derived address</th>
                    <td className="address">{DERIVED_EVM_ADDRESS}</td>
                  </tr>
                  <tr>
                    <th>comparison</th>
                    <td>
                      <span className={addressMatch === "match" ? "badge good" : "badge bad"}>
                        {addressMatch.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
              <p className="muted">
                This is a character comparison, not proof. The qor1-to-0x link is an ASSUMPTION in
                ADR-0009; a match does not prove control and a mismatch does not identify the key.
              </p>
            </>
          )}
          <p className="muted">
            Only <code>eth_accounts</code> is called. No account-request prompt is raised by this
            page.
          </p>
        </Panel>

        <Panel
          id="panel-4"
          title="4. On-chain account record (read-only fetch)"
          raw={recordOutcome}
        >
          <p>
            Read <code>{`${REST_HOST}${ACCOUNT_PATH}/{address}`}</code> with the browser fetch API.
            No proxy is added in this step.
          </p>
          <div className="row">
            <button
              type="button"
              onClick={() => void readRecord()}
              disabled={address === null || recordBusy}
            >
              {recordBusy ? "Reading..." : "Read account record"}
            </button>
            {address === null && <span className="muted">A native account is required first.</span>}
          </div>
          {recordOutcome === null ? (
            <p className="muted">Not requested yet.</p>
          ) : recordOutcome.status === "ok" ? (
            <>
              <p>
                <span className="badge good">HTTP {recordOutcome.httpStatus}</span> found:{" "}
                <strong>{recordOutcome.found ? "true" : "false"}</strong>
                {recordOutcome.account !== null && (
                  <>
                    {" "}
                    ML-DSA-87 key bytes: <strong>{recordOutcome.account.publicKey.length}</strong>,
                    algorithm id: <strong>{recordOutcome.account.algorithmId}</strong>
                  </>
                )}
              </p>
              {!recordOutcome.found && (
                <p className="muted">
                  The chain reports no registered PQC key for this address. Verification in panel 5
                  cannot succeed.
                </p>
              )}
            </>
          ) : recordOutcome.status === "http-error" ? (
            <p className="notice bad-notice">
              HTTP {recordOutcome.httpStatus}. Exact body: {recordOutcome.body}
            </p>
          ) : (
            <p className="notice bad-notice">
              {recordOutcome.message}
              <br />
              <strong>
                {recordOutcome.looksLikeCors
                  ? "This has the shape of a CORS refusal or a network failure. A browser page cannot distinguish the two."
                  : "The request failed before a response."}
              </strong>
            </p>
          )}
          <p className="muted">
            CORS outcome for this run:{" "}
            <strong>
              {recordOutcome === null
                ? "not observed"
                : recordOutcome.status === "network-error" && recordOutcome.looksLikeCors
                  ? "likely blocked (or a network failure); exact error above"
                  : recordOutcome.status === "ok" || recordOutcome.status === "http-error"
                    ? "not blocked (a response was readable)"
                    : "request failed before a response"}
            </strong>
            . Only the owner's run can confirm this host's behaviour.
          </p>
        </Panel>

        <Panel id="panel-5" title="5. Sign the fixed test message" raw={panel5Raw}>
          <div className="sign-summary">
            <strong>Before you sign:</strong>
            <table>
              <tbody>
                <tr>
                  <th>Wallet address (native bech32)</th>
                  <td className="address">{address ?? "not connected"}</td>
                </tr>
                <tr>
                  <th>Native chain</th>
                  <td>
                    <code>{NATIVE_CHAIN_ID}</code>{" "}
                    {reading?.nativeChainId === null || reading === null
                      ? "(not accepted)"
                      : "(accepted)"}
                  </td>
                </tr>
                <tr>
                  <th>EVM chain</th>
                  <td>
                    <code>{EVM_CHAIN_ID}</code>{" "}
                    {reading?.evmChainId === null || reading === null
                      ? "(not readable)"
                      : `(reported ${reading.evmChainId})`}
                  </td>
                </tr>
                <tr>
                  <th>Guard</th>
                  <td>
                    <span className={badge.className}>{badge.text}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            Message: <code>{TEST_MESSAGE}</code>
          </p>
          <div className="row">
            <button type="button" onClick={() => void signFixedMessage()} disabled={!canSign}>
              {signState.status === "running"
                ? "Waiting for QoreX..."
                : "Sign the fixed test message"}
            </button>
            {!canSign && signState.status !== "running" && (
              <span className="muted">
                Disabled until a native account is read and both chain checks pass.
              </span>
            )}
          </div>
          {signState.status === "failed" && (
            <p className="notice bad-notice">
              The wallet request failed ({signState.code}): {signState.message}. It was not retried.
            </p>
          )}
          {signState.status === "done" && (
            <>
              <p>
                Local verification:{" "}
                <span
                  className={signState.report.status === "verified" ? "badge good" : "badge bad"}
                >
                  {signState.report.status === "verified"
                    ? "VERIFIED"
                    : signState.report.status.toUpperCase()}
                </span>
              </p>
              {signState.report.verification.verified ? (
                <p>
                  The ML-DSA-87 part verified against the on-chain key (
                  {signState.report.accountKeyBytes ?? "unknown"} bytes) with the post-quantum part
                  required.
                </p>
              ) : (
                <p className="notice bad-notice">
                  NOT VERIFIED: {signState.report.verification.reason}.{" "}
                  {signState.report.verification.message}. A signature that does not verify is never
                  shown as success.
                </p>
              )}
              <h3>Four negative controls, computed locally on the returned object</h3>
              <p className="muted">
                These call no wallet. Control 4 relabels the fetched on-chain record with the
                synthetic control address so the verifier reaches the key/address check; no key is
                invented for that address. Expected: every control is refused.
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Control</th>
                    <th>Expected</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {signState.report.controls.map((control) => (
                    <tr key={control.id}>
                      <td>{control.label}</td>
                      <td>{control.expectedReason}</td>
                      <td>
                        <span className={control.result.verified ? "badge bad" : "badge good"}>
                          {control.result.verified ? "UNEXPECTEDLY VERIFIED" : "REJECTED"}
                        </span>
                        {!control.result.verified && (
                          <div className="muted">
                            {control.result.reason}
                            {control.result.verifierCode === undefined
                              ? ""
                              : ` (${control.result.verifierCode})`}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {signState.report.status === "control-failed" && (
                <p className="notice bad-notice">
                  A negative control verified. This run is not a success even though the positive
                  check passed.
                </p>
              )}
            </>
          )}
        </Panel>

        <Panel
          id="panel-6"
          title="6. Privacy boundary"
          raw={{
            claimRows: CLAIM_ROWS,
            noZeroKnowledge: NO_ZK_CLAIM,
            encryptedOffChain: ENCRYPTED_OFF_CHAIN,
            publicOnChain: PUBLIC_ON_CHAIN,
          }}
        >
          <p className="muted">
            Copied verbatim from the README claims table. A test compares this file with README.md
            so the panel cannot claim more than the repository does.
          </p>
          <table>
            <thead>
              <tr>
                <th>It does</th>
                <th>It does not claim</th>
              </tr>
            </thead>
            <tbody>
              {CLAIM_ROWS.map((row) => (
                <tr key={row.does}>
                  <td>{row.does}</td>
                  <td>{row.doesNotClaim}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3>Encrypted off-chain</h3>
          <ul className="result-list">
            {ENCRYPTED_OFF_CHAIN.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <h3>Public on-chain</h3>
          <ul className="result-list">
            {PUBLIC_ON_CHAIN.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p>{NO_ZK_CLAIM}</p>
        </Panel>

        <section className="panel" aria-labelledby="deploy-heading">
          <div className="panel-head">
            <h2 id="deploy-heading">7. Testnet deployment (owner-run)</h2>
            <span className="badge bad">OWNER-RUN</span>
          </div>
          <div className="notice bad-notice">
            <strong>TESTNET DEPLOYMENT WARNING.</strong> The panel behind this warning can ask your
            wallet to send real transactions on QoreChain Diana. The assistant sends nothing and
            signs nothing. Every send happens only inside a click handler for a button labelled with
            exactly what it does, after the chain guard passes. Test tokens only; no monetary value.
            If the lane check is rejected, stop and read the exact error before doing anything else.
          </div>
          {!showDeployPanel ? (
            <div className="row">
              <button type="button" onClick={() => setShowDeployPanel(true)}>
                I understand the warning: open the testnet deployment panel
              </button>
            </div>
          ) : deployProvider === null ? (
            <p className="notice bad-notice">
              No QoreX EVM provider was found over EIP-6963, so the deployment panel cannot run. No
              transaction was sent.
            </p>
          ) : (
            <DeployPanel provider={deployProvider} guard={guardNow} />
          )}
        </section>

        <footer>
          <p>
            Diana testnet only. The repository and the assistant deploy nothing. The optional
            testnet deployment panel sends only after the owner clicks a button, and only with test
            tokens. The page reads <code>{REST_HOST}</code> and uses the EVM provider at{" "}
            <code>{EVM_RPC_HOST}</code>. No recovery material is requested or stored.
          </p>
        </footer>
      </div>
    </>
  );
}
