# Operating contract for AI coding agents

This repository is built one phase at a time. Read `docs/ACCEPTANCE_MATRIX.md` and the latest file in `docs/evidence/` before changing anything.

## Rules

1. One phase per request. Stop at each milestone's exit criteria and report. Do not start the next phase unasked.
2. Do not invent QoreChain APIs, addresses, RPC URLs, chain parameters, SDK method names or contract deployments. Every external fact goes into `docs/research/source-lock.md` with its source and how it was confirmed (runtime, source at a named commit, or documentation only). If it cannot be confirmed, mark it BLOCKED and do not build a stand-in.
3. No fake integrations. Anything mocked or simulated is labelled as such in code, docs and the UI.
4. Evidence over assertion. A requirement is DONE only with a passing test and a recorded result in `docs/evidence/`. Never fabricate transaction hashes, outputs or screenshots.
5. Where documentation and runtime disagree, the runtime wins and the mismatch is written down.
6. Cryptography stays client-side. Never send or store seed phrases, private keys or recovery codes on the server. Never ask a user to paste a seed phrase.
7. Do not claim anonymity, private transfers, zero-knowledge proofs, FHE or confidential computation. Do not call an ERC-20 transfer ML-DSA-signed.
8. Verify ML-DSA signatures with the post-quantum part required, against the key registered on-chain. Never trust a public key or a classical-only field taken from the signed response itself.
9. Keep limitations current. Update the Known limitations list in the same change that discovers one.
10. Windows and PowerShell are the primary dev environment. Prefer package scripts over Makefiles. No emojis in code or code blocks.
