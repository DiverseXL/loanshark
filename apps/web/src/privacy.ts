// The privacy boundary panel.
//
// Every string below is copied from the README's "What LOANSHARK is, and is
// not" table. `apps/web/test/privacy.test.ts` parses that table out of README.md
// and fails if this file and the README disagree, so the panel cannot drift
// into a broader claim than the repository makes.

export interface ClaimRow {
  readonly does: string;
  readonly doesNotClaim: string;
}

export const CLAIM_ROWS: readonly ClaimRow[] = [
  {
    does: "Encrypt requests and offers client-side for chosen recipients (QoreSeal, ML-KEM-1024)",
    doesNotClaim: "Anonymity. Wallet addresses, token transfers, timing and sizes are public.",
  },
  {
    does: "Encrypt each lender offer separately for the borrower",
    doesNotClaim: "A sealed-bid auction or private matching engine",
  },
  {
    does: "Commit to a canonical agreement version by hash, anchored on-chain",
    doesNotClaim: "Legal enforceability, or that off-chain statements are true",
  },
  {
    does: "Settle a clearly labelled test ERC-20 through settlement contracts",
    doesNotClaim: "Private transfers, real USDC/USDT, or production lending",
  },
  {
    does: "Authenticate senders with QoreX hybrid (secp256k1 + ML-DSA-87) message signatures",
    doesNotClaim:
      "That each ERC-20 transfer is itself ML-DSA-signed. EVM transactions are ECDSA-signed under a hybrid-authorised window.",
  },
];

/** The sentence immediately below the README table. */
export const NO_ZK_CLAIM =
  "No zero-knowledge proofs, FHE or confidential computation are used or claimed.";

/** Exact cells that describe data encrypted only in the browser. */
export const ENCRYPTED_OFF_CHAIN: readonly string[] = [
  CLAIM_ROWS[0]?.does ?? "",
  CLAIM_ROWS[1]?.does ?? "",
];

/** Exact cell that describes what stays public. */
export const PUBLIC_ON_CHAIN: readonly string[] = [CLAIM_ROWS[0]?.doesNotClaim ?? ""];
