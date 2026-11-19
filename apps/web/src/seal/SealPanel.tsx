// Browser panel for the app-held seal account E (ADR-0004, ADR-0005, ADR-0014).
//
// The phrase is generated in the browser, displayed once, and discarded from
// React state when the owner confirms they saved it. The identity object keeps
// its own copy in private fields for the life of the page; nothing is written to
// storage, a URL, a log or the network. Reloading the page loses the account.
//
// This panel does no chain call and no transaction. Registration is the
// owner-run script's job (`scripts/onboard-seal-account.mjs`).

import {
  generateSealAccount,
  SEAL_ACCOUNT_REDACTION,
  type SealAccountIdentity,
} from "@loanshark/seal-account";
import { useState } from "react";
import { NATIVE_CHAIN_ID } from "../constants.js";
import { safeJson } from "../safe-json.js";

type RecipientCard = ReturnType<SealAccountIdentity["recipientCard"]>;

interface Generated {
  readonly identity: SealAccountIdentity;
  /** Cleared as soon as the owner confirms the backup. */
  readonly phrase: string;
}

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export function SealPanel() {
  const [generated, setGenerated] = useState<Generated | null>(null);
  const [saved, setSaved] = useState(false);
  const [card, setCard] = useState<RecipientCard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = (): void => {
    try {
      const result = generateSealAccount({ chainId: NATIVE_CHAIN_ID });
      const phrase = result.mnemonic.use((value) => value);
      setGenerated({ identity: result.identity, phrase });
      setSaved(false);
      setCard(null);
      setError(null);
    } catch (err) {
      setGenerated(null);
      setSaved(false);
      setCard(null);
      setError(describe(err));
    }
  };

  const confirmSaved = (): void => {
    if (generated === null) return;
    try {
      setCard(generated.identity.recipientCard());
      setGenerated({ identity: generated.identity, phrase: "" });
      setSaved(true);
      setError(null);
    } catch (err) {
      setError(describe(err));
    }
  };

  const forget = (): void => {
    setGenerated(null);
    setCard(null);
    setSaved(false);
    setError(null);
  };

  const publicJson =
    generated === null
      ? null
      : {
          chainId: NATIVE_CHAIN_ID,
          address: generated.identity.address,
          publicData: generated.identity.toJSON(),
          card,
          note: "Public data only. The phrase is never part of this object.",
        };

  return (
    <section className="panel" aria-labelledby="panel-seal">
      <div className="panel-head">
        <h2 id="panel-seal">6. Seal account (app-held, memory only)</h2>
        <span className="badge pending">IN MEMORY ONLY</span>
      </div>

      <div className="notice bad-notice">
        <strong>NOT A WALLET AND NOT PERSISTED.</strong> This account decrypts envelopes and signs
        request and offer envelopes. Its phrase is generated in this page and shown once. It is
        never written to storage, a URL, a log or a server, and reloading the page loses it.
        Screenshots, clipboard history and browser extensions can capture it while it is on screen.
        Generate a fresh phrase: never paste the QoreX wallet phrase here. The seal account is a
        full QoreChain account; fund it only with the small testnet balance its registration needs.
      </div>

      {generated === null ? (
        <div className="row">
          <button type="button" onClick={generate}>
            Generate a new seal account (24 words)
          </button>
        </div>
      ) : (
        <>
          {!saved && (
            <>
              <p>
                Write these 24 words down, in order, on paper or another offline medium. This is the
                only time this page will show them. Anyone with the words controls the seal account
                and can decrypt envelopes addressed to it.
              </p>
              <pre className="seal-phrase">{generated.phrase}</pre>
              <p className="muted">
                24 words. The page keeps the phrase in memory so this identity can sign and decrypt
                until the page is closed.
              </p>
              <div className="row">
                <button type="button" onClick={confirmSaved}>
                  I have saved it: hide the phrase
                </button>
              </div>
            </>
          )}

          <h3>Public identity</h3>
          <table>
            <tbody>
              <tr>
                <th>qor1 address</th>
                <td className="address">{generated.identity.address}</td>
              </tr>
              <tr>
                <th>address hex</th>
                <td className="address">{generated.identity.publicData().addressHex}</td>
              </tr>
              <tr>
                <th>ML-DSA-87 SHA3-256</th>
                <td className="address">{generated.identity.publicData().hashes.mlDsaSha3}</td>
              </tr>
              <tr>
                <th>ML-KEM-1024 SHA3-256</th>
                <td className="address">{generated.identity.publicData().hashes.mlkemSha3}</td>
              </tr>
              <tr>
                <th>X25519 public key</th>
                <td className="address">{generated.identity.publicData().hashes.x25519}</td>
              </tr>
              <tr>
                <th>Algorithm ids</th>
                <td>
                  ML-DSA-87: {generated.identity.publicData().algorithmIds.mlDsa}, ML-KEM-1024:{" "}
                  {generated.identity.publicData().algorithmIds.mlkem}
                </td>
              </tr>
            </tbody>
          </table>

          <p className="muted">
            The public data may be copied. The phrase is {SEAL_ACCOUNT_REDACTION} in every implicit
            conversion of the identity object; the table above never includes it.
          </p>

          {saved ? (
            <>
              <h3>Recipient card (public JSON)</h3>
              <p className="muted">
                This card binds the X25519 key and the SHA3-256 of the ML-KEM-1024 key to the
                ML-DSA-87 key. A sender must verify it against the keys registered on chain; this
                page does not register anything.
              </p>
              <pre>{card === null ? "not signed" : safeJson(card)}</pre>
              <div className="row">
                <button type="button" onClick={forget}>
                  Forget the seal identity in this page
                </button>
              </div>
              <p className="muted">
                Forgetting drops this page's reference to the identity. JavaScript cannot prove the
                phrase was erased from memory, so close the tab as well.
              </p>
            </>
          ) : (
            <p className="muted">
              The recipient card is signed only after the backup is confirmed. Nothing is registered
              or published by this page.
            </p>
          )}
        </>
      )}

      {error !== null && (
        <p className="notice bad-notice">The seal account operation failed: {error}</p>
      )}

      <details className="raw">
        <summary>Show raw JSON</summary>
        <pre>{safeJson(publicJson)}</pre>
      </details>
    </section>
  );
}
