# AI usage

This file documents how AI was used to build LOANSHARK, as the Best AI-Native Build award requires: the workflow, what the AI generated, and the human contribution. It records only what the repository and the commit history show. Fields marked `OWNER TO COMPLETE` are not recorded anywhere in the repository and must be filled in by the owner before submission.

## Workflow

- An AI coding agent worked under the operating contract in `CLAUDE.md`, which the owner wrote. The contract forbids deployment, transactions, signing requests and pushes without the owner's explicit confirmation, forbids invented facts and emojis, requires every unverified choice to be marked `ASSUMPTION`, and requires a commit after each task.
- Work was split into phases (Phase 0, 1, 2, 3, 3b, 4 and Step 6a), one phase per request. Each phase has a brief, a result file in `docs/evidence/`, and one or more commits.
- Before a phase ran, its plan was reviewed by the owner and by an AI assistant. The owner then answered the open questions in chat. `OWNER TO COMPLETE`: the date and form of each plan review, and the name of the reviewing assistant.
- External technical claims had to be recorded in `docs/research/source-lock.md` with the source, how it was confirmed (runtime, source or docs only) and, where it matters, the commit read. Claims that were wrong were marked superseded rather than deleted; for example claim 13.
- Results were written into dated evidence files with the commands and their output, and were not reconstructed afterwards. Where output was truncated for width, the file says so.
- Tests were required before a requirement could be marked DONE in `docs/ACCEPTANCE_MATRIX.md`. Anything without a passing test and recorded evidence stayed PENDING or BLOCKED.
- The commit history names the AI tool in 30 of 39 commits, with the footer `Generated with Codebuff` and `Co-Authored-By: Codebuff <noreply@codebuff.com>`. The remaining commits are later documentation and preparation commits. `OWNER TO COMPLETE`: the agent and model used for each phase, if this should be listed per phase.

Note, not repository evidence: the step that produced this file was run by an AI agent in the OpenCode harness, model DeepSeek V4.1 Flash Free.

## What AI generated

From the commit history at the time this file was written, 39 commits between 2026-11-16 and 2026-11-18: 17 `docs`, 10 `feat`, 4 `test`, 4 `chore`, 2 `fix`, 1 `build`, 1 `ci`.

| Area | Generated work | Where |
|---|---|---|
| Phase 0 groundwork | Architecture, threat model, the first five ADRs (0001 to 0005), the source lock and the Phase 0 evidence file | `docs/`, commit `96b9e44` |
| Toolchain and CI | The pnpm workspace with exact pins, the environment check script, the CI workflow with a SHA-256-pinned gitleaks binary | `package.json`, `pnpm-workspace.yaml`, `scripts/`, `.github/workflows/ci.yml` |
| Chain client | `verifyHybridMessage`, the verification spike and the tests, including the four tampering controls | `packages/chain-client` |
| Encryption adapter | The offline QoreSeal adapter, canonical AAD, signed envelopes, recipient-card handling, and the official QoreSeal vector reproduction (20 cases) | `packages/qoreseal-adapter` |
| Agreement package | Loan terms, the `keccak256(abi.encode(terms))` commitment, canonical agreement text and confirmation message, with frozen vectors | `packages/agreement` |
| Contracts | `TestUSD` and `LoanSettlement`, plus lifecycle, boundary, adversarial-token, reentrancy and invariant tests (33 passing) | `packages/contracts` |
| Diagnostics app | Vite/React/TypeScript app with six panels, wallet detection, two chain guards, a signing queue and local verification | `apps/web` |
| Evidence and records | Source lock, acceptance matrix, limitations, changelog, phase result files and the owner checklist, all maintained by the agent | `docs/` |
| Step 6a | Recorded rules, token selector scan and script, settlement-token ADR, submission checklist, this file and the demo storyboard | `docs/`, `scripts/token-selector-scan.mjs` |

The agent did not have a wallet, did not deploy anything and did not send any transaction. All chain data in the repository was read-only or supplied by the owner.

## Human contribution

- **Operating constraints.** The owner wrote `CLAUDE.md` and set the rules for every phase: no deployment, no transaction, no signing request, no push without confirmation, no invented facts.
- **Product and technical decisions.** The owner chose TypeScript (ADR-0002), the Apache-2.0 licence (ADR-0001) and the loan model. ADR-0008 records decisions 1 to 9 as owner-confirmed in chat on 2026-11-17, including no collateral, no interest maths, no admin key in the settlement contract, pull payments, and the 3600-second minimum claim window.
- **Wallet actions.** The owner installed and used QoreX, made the first transaction that registered the account's ML-DSA-87 key, and approved the `signArbitrary` request for the message `LOANSHARK test message, no funds`. The raw response was supplied from the owner's session (`fixtures/qorex-signarbitrary.json` and its sidecar), and the console and terminal observations in `docs/evidence/phase-00-result.md` were copied from the owner's machine.
- **Evidence supplied.** The owner supplied the raw QoreX signature, the account state, and the hackathon rules summary that the agent then checked against the organiser's pages.
- **Review.** The owner reviewed plans and results between phases and gave the phase briefs, including the scope limits that kept the project honest (no unbuilt feature claimed as working).
- **Hands-on coding.** `OWNER TO COMPLETE`: state whether the owner wrote or edited any code, tests or documentation directly, and which parts.
- **Time and effort.** `OWNER TO COMPLETE`: approximate hours of owner review, number of prompts, and the reviewing assistant's role.
- **Identity and team.** `OWNER TO COMPLETE`: team members, their registration status, and the X account used for the fest.

## Decisions still with the owner

These are recorded in the repository as open, and the AI did not decide them:

- The settlement token allowlist: Option A (TestUSD and fUSD) or Option B (TestUSD only), `docs/adr/0013-settlement-token.md`.
- The qor1-to-0x address comparison, ADR-0009.
- The owner-run browser checklist, `docs/evidence/phase-04-owner-checklist.md`.
- The commit author email that will become public when the repository is pushed, and whether to rewrite history to change it.

## What is not claimed

- No claim that the owner reviewed every line or every commit.
- No claim that the AI's output was correct without the tests and checks recorded in `docs/`.
- No claim of deployment, on-chain settlement, registered ML-KEM keys or a product UI. The acceptance matrix is the authority.
