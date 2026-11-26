// What an action encrypts, what the relay sees and what becomes public.
// The data is the typed footprint (ADR-0018 / Step 9b), not a second claim.

import { FOOTPRINTS, type FootprintActionId } from "@loanshark/privacy-footprint";

export function PrivacyNotice({ action }: { action: FootprintActionId }) {
  const footprint = FOOTPRINTS[action];
  return (
    <details className="raw">
      <summary>What this action encrypts, exposes and makes public</summary>
      <h4>Encrypted off-chain</h4>
      <ul className="result-list">
        {footprint.encryptedOffChain.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <h4>The relay sees</h4>
      <ul className="result-list">
        {footprint.relaySees.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <h4>Public on chain</h4>
      <ul className="result-list">
        {footprint.publicOnChain.length === 0 ? (
          <li>nothing at this step</li>
        ) : (
          footprint.publicOnChain.map((item) => <li key={item}>{item}</li>)
        )}
      </ul>
      <h4>Not private</h4>
      <ul className="result-list">
        {footprint.notPrivate.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </details>
  );
}
