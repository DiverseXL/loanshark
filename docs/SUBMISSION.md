# Submission checklist

Every requirement below comes from the organiser's pages, fetched on 2026-11-17: <https://build.qorechain.io/rules>, <https://build.qorechain.io/start> and <https://build.qorechain.io/prizes>. The claims and the differences from the owner's earlier summary are recorded in `docs/research/source-lock.md` claims 45 to 56.

Deadline: 2 December 2026, 23:59 UTC. There is no submit button; at the deadline the project becomes read only and that version is checked. Internal freeze set by the owner: 1 December 2026, so the last day is not used for changes.

Category: Encrypted Apps. Teams of 1 to 4.

Every status is `PENDING`. A row is only DONE when the artefact exists and the check has been run against the submitted version, not against a local copy.

| # | Requirement | Repository artefact or where it will live | Owner action or evidence needed | Status |
|---|---|---|---|---|
| S1 | Public GitHub repository | This repository | Create the public remote and push; the URL is not yet supplied and no remote is configured | PENDING |
| S2 | Original work, built during the event; copied projects are disqualified | Commit history from `96b9e44` (2026-11-16) onwards; `CHANGELOG.md` and `docs/` record each phase | Confirm no code was copied from another project, including Kyrve (ADR-0001, ADR-0008) | PENDING |
| S3 | README | `README.md` | Final pass against the pushed version: scope, status, limitations, credits, licence | PENDING |
| S4 | Licence MIT or Apache-2.0 with the licence file in the repository | `LICENSE` (Apache-2.0) and `ADR-0001` | Confirm the pushed GitHub licence view shows Apache-2.0 | PENDING |
| S5 | Video of up to 3 minutes showing the project working | `docs/DEMO_SCRIPT.md` storyboard | Record the video, publish it, and add the link to the project form. Shots marked BLOCKED in the storyboard stay out until the feature has evidence | PENDING |
| S6 | At least one QoreChain testnet address the project uses (`qor1...`) | `qor1hklqwsqwncrmfc9m772mclkdfesz3zpv4eykrn` is the Ethereum (coin 60) account whose EVM address `0xBDbE07400e9E07B4E0BBf795bC7ecd4E6028882c` QoreX reports, and it is the address to submit (ADR-0009). `qor1385wkhky3qkjwq47t8904xrd6s82lmkfjnxxsr` remains the coin-118 account of the Step 1 signature evidence; it can sign messages but cannot send on the EVM lane, so it is not the settlement address | Confirm the project form carries `qor1hklqwsqwncrmfc9m772mclkdfesz3zpv4eykrn` and that QoreX still reports the same EVM account for it | PENDING |
| S7 | Cover image, 16:9, at least 1200 x 675, JPG/PNG/WebP, up to 5 MB | Not created | Produce the image and upload it. The rules page lists a featured image as required; the start page calls it optional and offers a generated cover. Treated as required until the organiser says otherwise (source-lock, "Mismatches") | PENDING |
| S8 | Commits made during the fest (4 November to 2 December 2026) | All commits dated 2026-11-16 and 2026-11-17 | Confirm the dates are visible on the public repository after the push | PENDING |
| S9 | Kits and open source libraries used are credited in the README | README Credits section: QoreSeal, QoreSign, QoreChain wallet adapter, Hardhat, viem, OpenZeppelin, React, Vite, Vitest, Biome, TypeScript, pnpm | Check the list against the dependency files and the code; the start page says only what is really in the code should be claimed | PENDING |
| S10 | `AI_USAGE.md` for the Best AI-Native Build award (optional award) | `AI_USAGE.md` | Complete every `OWNER TO COMPLETE` field, tick the AI-native option on the project form | PENDING |
| S11 | Encrypted Apps: ML-KEM-1024 encryption | `packages/qoreseal-adapter` in explicit mlkem mode; tests in `packages/qoreseal-adapter/test/` | No further action for the requirement as stated; the video must show it working | PENDING |
| S12 | Encrypted Apps: registered recipient keys | Source path exists: app-held account E with `scripts/onboard-seal-account.mjs` registers both keys (ADR-0004, ADR-0014, M0-6). QoreX still refuses `MsgRegisterKEMKey` from dApps, so the owner runs it separately | No key has been registered by this repository; run `docs/evidence/phase-08-owner-checklist.md` and show the read-back | PENDING |
| S13 | Encrypted Apps: ML-DSA key binding | Recipient card verification in `packages/qoreseal-adapter` uses the on-chain ML-DSA-87 key and the KEM key hash (source-lock claim 12) | Show the binding in the video; it is offline with mocked registry data, not a live registration | PENDING |
| S14 | Encrypted Apps: client-side encryption and decryption | Adapter and tests; the browser UI for sealing does not exist | Show, or document, where encryption and decryption run client-side. The diagnostics app does not seal | PENDING |
| S15 | Registration complete: GitHub, X and QoreX testnet address connected; 18 or older; every team member registered individually | n/a | Owner registers on the platform and completes all four steps | PENDING |
| S16 | Project created on the platform: name, description, how it is made, one category, kits, testnet address, cover image, video | n/a | Owner creates and fills the project form; select Encrypted Apps; tick only kits visible in the code | PENDING |
| S17 | Team size within 1 to 4 | n/a | Owner states the team and confirms every member is registered | PENDING |
| S18 | QoreChain Build GitHub App installed so commits appear in the feed | n/a | Owner installs it on the public repository | PENDING |
| S21 | The recorded demo shows a complete negotiation without a money screen | The Borrower and Lender screens; `docs/DEMO_SCRIPT.md` | Owner records two profiles and the order in `docs/evidence/phase-10-owner-checklist.md`; the video says no transaction was sent | PENDING |
| S20 | The project does not overclaim confidential computation | `docs/adr/0018-confidential-computing-providers.md` records the providers evaluated and not adopted, the read-only checks and the gates a future provider must pass; `docs/PRIVACY_FOOTPRINT.md` states what is public | Nothing to do beyond keeping the claim accurate in the video and the project description | PENDING |
| S19 | Everything in place by 2 December 2026, 23:59 UTC | n/a | Owner freezes changes on 1 December 2026 and confirms the submitted version | PENDING |

## Not a submission requirement

The Q-Day Drill on 18 November 2026 is a separate award. Registration closed on 17 November 2026 at 23:59 UTC and required registering the drill account's classical (ECDSA) private key with the organiser. This project has not registered, no key material was requested or handled, and nothing is deployed (M0-6). Treat it as out of scope unless the owner says otherwise.
