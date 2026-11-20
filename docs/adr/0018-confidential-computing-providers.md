# ADR-0018: Confidential computing providers: evaluated, not adopted

Status: Accepted, 2026-11-20. This record decides that LOANSHARK uses no
confidential-compute provider. It does not adopt, install or call any of them.

Context: the Step 9b brief asks for a provider evaluation record before more
code is written, and for the decision to be tied to this repository's facts
rather than to vendor claims. The brief names Nox, Marlin Oyster TEE matching,
Zama FHEVM, Arcium MPC, Oasis Sapphire/OPL, 0G Private Compute, zero-knowledge
eligibility proofs and ERC-7984 confidential tokens.

## What the research briefs say, and how to read it

The briefs are not in this working tree. `docs/research/` contains two markdown
files, `source-lock.md` and `qorechain-support-reply-2026-11-17.md`; there is no
PDF and no separate provider brief. Everything below that is attributed to "a
brief" is therefore **stated by a brief, not independently verified**: the
statements could not be read here, only summarised from the task text, and none
of them is evidence.

What was actually checked on 2026-11-20, read-only, with no credentials:

| Check | Raw result |
|---|---|
| `https://docs.zama.org/protocol` | HTTP 200. "Welcome to the Zama Confidential Blockchain Protocol Docs... build confidential dApps using Fully Homomorphic Encryption (FHE)." |
| `https://docs.noxprotocol.io/getting-started/welcome` | HTTP 404 |
| `https://docs.nox.iex.ec/` | DNS failure (`ENOTFOUND`). The documentation moved; `docs.iex.ec` hosts Nox pages and the search result for `docs.iex.ec/nox-protocol/protocol/global-architecture-overview` describes Nox as "a confidential computation protocol for DeFi" with Intel TDX, a Handle Gateway and a KMS |
| `https://docs.marlin.org/oyster/` | HTTP 200, redirected to `https://docs.marlin.org/`, body text: "Welcome to the Marlin docs!" only (a JavaScript shell). Nothing about Oyster or TEE matching could be read |
| `https://docs.arcium.com/` | HTTP 200. "Arcium provides encrypted computation through the blockchain. It uses Multi-Party Computation (MPC)... gives applications a way to add encryption without leaving the Solana ecosystem." |
| `https://docs.oasis.io/build/sapphire/` | HTTP 200. "Sapphire is our official confidential ParaTime for smart contract development with Ethereum Virtual Machine (EVM) compatibility." |
| `https://docs.0g.ai/` | HTTP 200. "0G (Zero Gravity), the trust layer for AI: private compute, encrypted storage, data availability, and an AI-native L1." |
| `npm view <name> version` | `@qorechain/qoreseal` 0.1.0 (Apache-2.0, published 2026-10-29); `@fhevm/solidity` 0.13.4; `@zama-fhe/relayer-sdk` 0.4.5; `fhevm` 0.6.2; `hardhat-fhevm` 0.1.6; `@oasisprotocol/sapphire-paratime` 2.3.0; `@oasisprotocol/sapphire-contracts` 0.2.18; `@arcium-hq/client` 0.16.0; `@0gfoundation/0g-ts-sdk` 1.2.8; `@0glabs/0g-ts-sdk` 0.3.3; `@marlinprotocol/oyster` 404; `nox-sdk` 404; `@iexec/nox-sdk` 404; `@nox-protocol/sdk` 404; `nox-protocol` 404 |

The GitHub API was not called, so nothing here is limited by its rate limits;
the repository pages checked were ordinary documentation URLs.

Nox's archived or sunset status could not be verified. Its docs are marked
"currently under development", which is a documentation statement, not a status
record. This record therefore treats Nox as a live-looking project whose
availability, chain support and SDK names are unconfirmed.

## Decision

No confidential-compute provider is used in the hackathon build. Every provider
is classified below against this repository's facts, not against its marketing.

| Provider | Class | Reasons tied to this repository |
|---|---|---|
| Nox (iExec) | NO-GO | Documents a TEE-based confidential DeFi protocol, but no Diana (EVM 9800) deployment or bridge and no transaction evidence exists; its SDK names could not be confirmed (four candidate npm names return 404); the off-chain components (Handle Gateway, KMS, Runner) are iExec infrastructure this project cannot verify; its "archived" status is unverified. Adopting it would add a dependency whose live service and chain support are unproven, against rule 2 |
| Marlin Oyster TEE matching | NO-GO | The claim in the brief ("Oyster does TEE matching") is stated by a brief, not independently verified. The documentation root returns a JavaScript shell and `@marlinprotocol/oyster` is not a package. No Diana deployment, no matching service contract and no attestation path could be found |
| Zama FHEVM | LAB ONLY | Real and published (`@fhevm/solidity` 0.13.4, `@zama-fhe/relayer-sdk` 0.4.5, docs reachable). But FHEVM is a separate chain and toolchain; it is not Diana, the settlement contract is plain Solidity with public amounts, and rule 7 forbids claiming FHE. A laboratory exercise would not change what LOANSHARK can show, so nothing was installed |
| Arcium MPC | NO-GO | Its own documentation scopes it to Solana ("without leaving the Solana ecosystem"). This repository has no Solana code, no Solana wallet path and no Solana deployment |
| Oasis Sapphire / OPL | NO-GO | A separate confidential ParaTime with EVM compatibility; using it would mean deploying `LoanSettlement` on another network, not on Diana, so the loan would not be on the chain this project targets. Its npm packages are published, which is not the same as a usable Diana deployment |
| 0G Private Compute | NO-GO | Its documentation describes an AI-oriented L1 with private compute and encrypted storage on its own Galileo testnet. No Diana support, no settlement integration and no evidence of a maintained confidential-compute endpoint this project could verify |
| Zero-knowledge eligibility proofs | NO-GO | There is no circuit, no trusted setup, no verifier contract on Diana and no audited proving system in this repository. Building one now would be an unreviewed cryptography dependency behind a privacy claim |
| ERC-7984 confidential tokens | NO-GO | Confidential balances require confidential-token infrastructure (FHE or a TEE) on the settlement chain. LOANSHARK settles a labelled test ERC-20 with public balances and public transfers, and the `LoanProposed` event publishes principal and interest. Claiming ERC-7984 behaviour would violate rules 3 and 7 |

None is GO or CONDITIONAL. There is no provider that is live, maintained,
deployed on Diana with transaction evidence, and verifiable by this project's own
code.

## Why private matching is not applicable

ADR-0008 decision 1 fixes one borrower and one lender per loan. The borrower
publishes one request to one lender; the lender answers with one offer; there is
no pool, no auction and no set of offers to match. A private-matching engine
would compute over a set that does not exist. Offers are already encrypted
individually for the borrower (ADR-0003), which is the privacy property this
model needs.

## Gates any provider would have to pass

A future step may adopt a provider only if all of these hold:

1. A live, maintained service, with a status or incident record this project
   can cite at a named date, not a marketing page.
2. A verified deployment or bridge for Diana (EVM 9800) with transaction
   evidence from this project's own read-only calls, not from the provider's
   screenshots.
3. Attestation or a proof verified by this project's own code, against a
   measurement this project pins. A boolean from the service is never accepted,
   in the same way the contract verifier refuses a metadata-only match.
4. A per-file licence review added to `docs/evidence/phase-07-licences.md` and
   `scripts/check-licences.mjs`.
5. A reproducible image or build where a TEE is used, so the code that sees the
   data is the code that was reviewed.
6. No plaintext document, key or phrase leaves the client: the provider must
   accept ciphertext or client-encrypted inputs, and the cryptography stays
   client-side (rule 6).
7. No post-quantum claim beyond what QoreChain documents. None of these
   providers is claimed to be post-quantum.

## What an attested enclave would and would not change

Even an attested enclave sees plaintext inputs while it computes. Adopting one
would add a trust boundary, not remove one: the owner would have to trust the
hardware vendor, the attestation service and the provider's key management, and
this project would have to verify the attestation itself. Documents, seed
phrases and keys never go to a compute service in any design considered here.
No provider is claimed to provide post-quantum protection; the only post-quantum
property in LOANSHARK is QoreChain's ML-DSA-87 and ML-KEM-1024, as documented by
QoreChain.

## Mismatch recorded: QoreSeal on npm

A brief states that the QoreSeal TypeScript package is not on npm and must be
built from its repository's packages/ts directory. `docs/research/source-lock.md` claim 13 records that
statement as SUPERSEDED; claim 22 records the registry and source evidence for
`@qorechain/qoreseal` 0.1.0 (Apache-2.0, published 2026-10-29T12:20:15Z). On
2026-11-20 `npm view @qorechain/qoreseal version` returned `0.1.0` and the
workspace both depends on and builds the published package. Runtime and registry
win: the package is published, and this repository uses the npm release.

## Provider-neutral interface: a documented boundary only

If a provider is ever adopted, the only thing it may implement is this boundary.
No implementation exists; the types are recorded so a future step does not invent
a different shape.

```ts
/** What the borrower asked for. Never leaves the client in plaintext. */
export interface RequestSummary {
  token: string;
  principal: bigint;
  maxTotalCost: bigint;
  latestDueDate: bigint;
  now: bigint;
}

/** What the lender offered. Never leaves the client in plaintext. */
export interface OfferSummary {
  token: string;
  principal: bigint;
  interest: bigint;
  dueDate: bigint;
  fundingDeadline: bigint;
  claimDeadline: bigint;
}

export interface EvaluationCheck {
  id: string;
  pass: boolean;
  expected: string;
  actual: string;
  explanation: string;
}

/** A backend may be local, or (one day) remote. No implementation is adopted. */
export interface OfferEvaluationBackend {
  readonly id: string;
  evaluate(
    request: RequestSummary,
    offer: OfferSummary,
    now: bigint,
  ): Promise<{ eligible: boolean; checks: EvaluationCheck[] }>;
}
```

The local implementation of this shape is Step 9b Task 3
(`LocalOfferEvaluator`). It is pure and offline. No remote backend exists, and
none may be added without passing the gates above.

## Consequences

- LOANSHARK claims QoreSeal content privacy, public EVM settlement and no private
  transfers. It claims no confidential computation, no FHE, no MPC, no ZK proof
  and no confidential token.
- The threat model has no compute-provider trust boundary, because no provider is
  used; the row says so explicitly.
- If a provider is adopted later, this ADR is superseded, not edited, and the
  gates above become acceptance criteria with their own evidence.
