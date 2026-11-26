# Demo video storyboard

Target length: 2 minutes 55 seconds, inside the 3-minute rule. Every shot is marked:

- **REAL**: the thing on screen runs now and the shot shows what actually happens.
- **MOCKED**: test keys, mock wallet providers or an in-process EVM are used. The narration says so.
- **BLOCKED**: the feature has no evidence yet and must not be filmed, described as working, or implied, until `docs/ACCEPTANCE_MATRIX.md` supports it.

Two rules for the recording. Show whole commands, not edited output. If something does not work on the day, say so on camera and fall back to the saved fixture, and name the fallback.

## Shots

| Time | Shot | On screen | Narration | Status |
|---|---|---|---|---|
| 0:00-0:12 | Title | "LOANSHARK" and one line: private financing on QoreChain, Encrypted Apps. | "LOANSHARK lets a borrower request capital and lenders answer with separately encrypted offers, then settles a labelled test token on QoreChain." | REAL (static text) |
| 0:12-0:32 | What it is and is not | `README.md`, section "What LOANSHARK is, and is not". Highlight the row about no anonymity and the row about test-token settlement. | "It encrypts requests and offers client-side, commits to one canonical agreement by hash, and settles test money. It does not claim anonymity, private transfers or production lending." | REAL (document) |
| 0:32-0:55 | Architecture | `docs/ARCHITECTURE.md` component diagram and trust boundaries. | "There is no server and no API. The wallet signs; the browser encrypts; the chain holds the commitment. Every claim in this video is either in the acceptance matrix or marked as not built." | REAL (document) |
| 0:55-1:25 | Diagnostics app, live | `apps/web` in `preview`. Detection panel, chain guard, account panel. Cursor moves between panels. | "The app finds QoreX over EIP-6963, checks both chain IDs, and reads the account record. This is the diagnostics surface, not a product UI; the acceptance matrix still marks the owner-run browser check as pending." | REAL (live app). Do not claim wrong-chain refusal or the privacy check is verified. C8 and C10 are PENDING |
| 1:25-1:55 | Hybrid signature, live | Press the fixed-message signing button, approve in QoreX, show the verification result with the post-quantum part required. | "QoreX returns a hybrid signature: secp256k1 plus ML-DSA-87. The app verifies it locally against the account's on-chain ML-DSA key, and refuses the signature if the post-quantum part is removed." | REAL (live) if the wallet is installed and on testnet. Otherwise show `fixtures/qorex-signarbitrary.json` and the passing test, and say it is the recorded signature, not a fresh one |
| 1:55-2:20 | Encryption, offline | Terminal: `pnpm vitest run packages/qoreseal-adapter`, showing the C1 wrong-recipient refusal and the envelope tests passing. | "Requests and offers are sealed with QoreSeal, ML-KEM-1024. A different recipient cannot open the envelope. These tests use throwaway keys; no interface for sealing exists yet." | MOCKED (throwaway keys, mocked registry) and REAL as a test run. Say both |
| 2:20-2:40 | Settlement contracts, local | Terminal: `pnpm --filter @loanshark/contracts test`, end of the run showing the suite result for `packages/contracts/test` (53 tests). | "The settlement contract runs a full lifecycle, refuses over-repayment, and rejects fee-on-transfer, false-return, reentrant and non-allowlisted tokens. This is a local in-process EVM. Nothing is deployed." | REAL (local Hardhat), MOCKED tokens in the adversarial cases. State that |
| 2:40-2:55 | Close | `docs/ACCEPTANCE_MATRIX.md` and the Known limitations list. | "The matrix shows what is done, what is pending and what is blocked. The ML-KEM registration path for a web-app user is blocked, so there is no deployed settlement and no product UI yet. That is the honest state of the project." | REAL (documents) |

## BLOCKED shots

Do not film these until the listed evidence exists:

| Shot | Why blocked | Evidence needed |
|---|---|---|
| Sealing a request or offer in the browser and showing the envelope | No browser sealing UI exists; ADR-0005 custody flow is unimplemented | A built flow and its test plus a recorded browser run |
| Decrypting an offer in the browser | Same | Same |
| Creating, funding, claiming or repaying a loan on screen | No product UI; C11 is PENDING | Fund UI and UI e2e |
| Any deployed contract address or transaction hash | Nothing is deployed; no transaction has been sent | Owner-confirmed deploy and a recorded transaction |
| Opening an EVM window and settling under hybrid authorisation | C9 is PENDING; no EVM authorisation flow | Window evidence and a live transaction |
| Registering an ML-KEM recipient key | Blocked, M0-6 and ADR-0004; QoreX refuses `MsgRegisterKEMKey` from dApps | A confirmed registration path |
| Settling in fUSD | Not decided (ADR-0013) and never tested with a real transfer | Owner decision and a real transfer |
| Showing a wrong-chain refusal as verified | C8 is PENDING pending the owner-run browser checklist | Filled `docs/evidence/phase-04-owner-checklist.md` |

## Recording notes

- Record at 1080p or higher, 16:9, with the cursor visible.
- Run `pnpm install` and `pnpm test` before recording, so the terminal output is real and current.
- Do not show mock test keys as if they were the owner's wallet. Say "throwaway test key" when the adapter tests are on screen.
- Do not speed up or cut a command in a way that hides a failure. If a command fails, show it and explain.
- Keep the video at or under 3:00. The timings above leave 5 seconds of slack.
- Upload the video and put the link on the project form; the repository only holds this script (submission checklist S5).
