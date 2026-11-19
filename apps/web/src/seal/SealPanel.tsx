// Browser panel for the app-held seal account E (ADR-0004, ADR-0005, ADR-0014, ADR-0016).
//
// The phrase is generated in the browser, displayed once, and discarded from
// React state when the owner confirms they saved it. The identity object keeps
// its own copy in private fields for the life of the page.
//
// Persistence with encryption at rest is provided by the encrypted vault module
// (ADR-0016). Nothing persists unless the owner explicitly clicks save and supplies
// a passphrase. Reloading without saving loses the account.
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
import { SealVaultManager } from "../vault/vault.js";

type RecipientCard = ReturnType<SealAccountIdentity["recipientCard"]>;

interface Generated {
  readonly identity: SealAccountIdentity;
  /** Cleared as soon as the owner confirms the backup. */
  readonly phrase: string;
}

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

// Singleton vault manager for the panel
const vaultManager = new SealVaultManager();

export function SealPanel() {
  const [generated, setGenerated] = useState<Generated | null>(null);
  const [saved, setSaved] = useState(false);
  const [card, setCard] = useState<RecipientCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vaultPassphrase, setVaultPassphrase] = useState("");
  const [vaultMsg, setVaultMsg] = useState<string | null>(null);
  const [hasStoredVault, setHasStoredVault] = useState(() => vaultManager.hasVault());

  const generate = (): void => {
    try {
      const result = generateSealAccount({ chainId: NATIVE_CHAIN_ID });
      const phrase = result.mnemonic.use((value) => value);
      setGenerated({ identity: result.identity, phrase });
      setSaved(false);
      setCard(null);
      setError(null);
      setVaultMsg(null);
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
    setVaultMsg(null);
    vaultManager.lock();
  };

  const handleSaveToVault = async (): Promise<void> => {
    if (!generated || !generated.phrase) {
      setError(
        "Cannot save to vault: phrase is already cleared from memory. Generate a new account.",
      );
      return;
    }
    if (!vaultPassphrase.trim()) {
      setError("A passphrase is required to save to the encrypted vault.");
      return;
    }
    try {
      await vaultManager.save({
        mnemonic: generated.phrase,
        chainId: NATIVE_CHAIN_ID,
        passphrase: vaultPassphrase,
      });
      setHasStoredVault(true);
      setVaultPassphrase("");
      setVaultMsg("Saved to encrypted vault at rest (AES-256-GCM, PBKDF2 600,000 iterations).");
      setError(null);
    } catch (err) {
      setError(`Failed to save vault: ${describe(err)}`);
    }
  };

  const handleUnlockVault = async (): Promise<void> => {
    if (!vaultPassphrase.trim()) {
      setError("Enter your passphrase to unlock the vault.");
      return;
    }
    try {
      const identity = await vaultManager.unlock(vaultPassphrase);
      setGenerated({ identity, phrase: "" });
      setSaved(true);
      setCard(identity.recipientCard());
      setVaultPassphrase("");
      setVaultMsg("Vault unlocked successfully.");
      setError(null);
    } catch (err) {
      setError(`Unlock failed: ${describe(err)}`);
    }
  };

  const handleLockVault = (): void => {
    vaultManager.lock();
    setGenerated(null);
    setSaved(false);
    setCard(null);
    setVaultMsg("Vault locked: key material cleared from memory.");
  };

  const handleForgetVault = (): void => {
    vaultManager.forget();
    setHasStoredVault(false);
    setGenerated(null);
    setSaved(false);
    setCard(null);
    setVaultPassphrase("");
    setVaultMsg("Encrypted vault deleted from storage.");
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
        <span className="badge pending">
          {hasStoredVault
            ? vaultManager.isUnlocked()
              ? "VAULT UNLOCKED"
              : "VAULT LOCKED"
            : "IN MEMORY ONLY"}
        </span>
      </div>

      <div className="notice bad-notice">
        <strong>NOT A WALLET AND NOT PERSISTED BY DEFAULT.</strong> This account decrypts envelopes
        and signs request and offer envelopes. Its phrase is generated in this page and shown once.
        It is never sent to a server. You may optionally save it to a local encrypted vault
        protected by a passphrase (AES-256-GCM, 600,000 PBKDF2 iterations).
      </div>

      {hasStoredVault && !generated && (
        <div className="card" style={{ marginBottom: "1rem", padding: "0.75rem" }}>
          <h4>Encrypted Vault at Rest</h4>
          <p className="muted">An encrypted seal account is saved in local browser storage.</p>
          <div className="row">
            <input
              type="password"
              placeholder="Vault passphrase"
              value={vaultPassphrase}
              onChange={(e) => setVaultPassphrase(e.target.value)}
            />
            <button type="button" onClick={() => void handleUnlockVault()}>
              Unlock vault
            </button>
            <button type="button" onClick={handleForgetVault}>
              Forget saved vault
            </button>
          </div>
        </div>
      )}

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

              <div className="card" style={{ margin: "1rem 0", padding: "0.75rem" }}>
                <h4>Optional: Save to Local Encrypted Vault</h4>
                <p className="muted">
                  Persists the seal account encrypted with your passphrase using AES-256-GCM at
                  rest.
                </p>
                <div className="row">
                  <input
                    type="password"
                    placeholder="Set vault passphrase"
                    value={vaultPassphrase}
                    onChange={(e) => setVaultPassphrase(e.target.value)}
                  />
                  <button type="button" onClick={() => void handleSaveToVault()}>
                    Save to encrypted vault
                  </button>
                </div>
              </div>

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
                {hasStoredVault && (
                  <>
                    <button type="button" onClick={handleLockVault}>
                      Lock vault
                    </button>
                    <button type="button" onClick={handleForgetVault}>
                      Forget saved vault
                    </button>
                  </>
                )}
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

      {vaultMsg !== null && <p className="notice">{vaultMsg}</p>}

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
