# Changelog

No release has been made. The project is built one phase at a time and each entry below is a phase, not a version.

## Unreleased

### Phase 1: workspace, verification groundwork, read-only chain checks

Added:

- pnpm workspace pinned to node 26.13.0, pnpm 12.21.0, TypeScript 5.9.3, Biome 2.6.8 and Vitest 5.1.0, with `scripts/verify-env.mjs` failing on any toolchain mismatch.
- `packages/chain-client` with strict TypeScript settings and a smoke test.
- `@qorechain/qoresign` 0.2.0 as the official verifier, recorded with its exact `verifyMessage` signature and the bytes it checks (source lock claims 17 to 19).
- Raw fixtures: the PQC account record for `qor1385...xxsr`, and the JSON-RPC responses for `eth_chainId`, `eth_blockNumber`, `eth_getCode` and the ERC-20 metadata calls on three test addresses.
- `.github/workflows/ci.yml`: frozen install, format check, lint, typecheck, tests, and a gitleaks 8.30.1 scan verified by SHA-256.
- ADR-0006 recording the tooling choices as assumptions, and `docs/evidence/phase-01-result.md`.
- `fixtures/qorex-signarbitrary.json`, the real QoreX `signArbitrary` response, with a sidecar recording its provenance and SHA-256, plus `.gitattributes` so fixture bytes survive a checkout.
- `packages/chain-client/src/spike/verify-qorex-signature.ts`, a labelled spike that verifies that response against the on-chain ML-DSA-87 key and runs four tampering controls.
- `packages/chain-client/src/verify-hybrid-message.ts`: `verifyHybridMessage` always requires the post-quantum part, reads keys only from an injected account client, and returns a discriminated result with a typed failure reason. Unit tests use a mocked client; one live test runs only when `LIVE_CHAIN=1`.

Changed:

- README status, milestone row, known limitations and repository structure.
- `docs/research/source-lock.md`: EVM chain ID and JSON-RPC endpoint confirmed at runtime; the three `erc20:` denominations identified by contract metadata.
- `docs/ACCEPTANCE_MATRIX.md`: M0-7 and M0-3 DONE, M0-4 IN PROGRESS.
- ADR-0003: the open question it recorded (does a real response verify unchanged) is answered.

Resolved within the phase:

- M0-3 was blocked at first because the raw QoreX `signArbitrary` response had not been supplied; no signature was reconstructed in its place. The response was supplied later in the same phase, verified on the first attempt with no input adjusted, and the four tampering controls were refused. Recorded in `docs/evidence/phase-01-result.md`.

### Phase 0: protocol reconnaissance

Added:

- Architecture, threat model, acceptance matrix, ADRs 0001 to 0005, source lock and Phase 0 evidence.
- Apache-2.0 licence (provisional, ADR-0001) and the operating contract in `CLAUDE.md`.
