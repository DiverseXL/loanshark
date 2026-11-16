# ADR-0006: Workspace and quality tooling

Status: Accepted. Every item in this record is an ASSUMPTION: the brief named no tools, so the choices below are the project's own and can be replaced without touching protocol decisions.

Context: ADR-0002 accepts a TypeScript pnpm monorepo on Windows with PowerShell. The phase needs one place to install, lint, format, typecheck, test and build, and a way to notice that a developer is on a different toolchain. Package scripts are required; Makefiles are not.

Decision, with the reason and the alternative for each:

| Choice | Version pinned | Reason | Alternative considered and not taken |
|---|---|---|---|
| pnpm workspaces | `pnpm@12.21.0` | ADR-0002 already names pnpm; strict `node_modules` layout makes an undeclared dependency fail instead of resolving by accident, which matters for a security-adjacent package. | npm workspaces (looser hoisting, no lockfile-level workspace protocol); Yarn Berry (extra configuration, PnP needs editor setup). |
| Exact versions, no ranges | `node 26.13.0`, `typescript 5.9.3`, `@biomejs/biome 2.6.8`, `vitest 5.1.0`, `@types/node 26.6.6` | A verification result is only reproducible if the compiler and test runner cannot drift. `pnpm-lock.yaml` is committed; `scripts/verify-env.mjs` fails on any mismatch with these pins. | Caret ranges with a lockfile: lockfile pins installs but a fresh `pnpm add` can silently change versions. |
| TypeScript for build and typecheck | 5.9.3 | Long-term stable line; TypeScript 7 (the native port) is the current `latest` tag but was not chosen because the toolchain around it is newer and the phase did not need it. | TypeScript 7.0.2. |
| Biome for lint and format | 2.6.8 | One binary, one config, no plugin graph; fast enough to run on every commit and in CI. | ESLint plus Prettier: two configs, plugin compatibility work, slower. |
| Vitest for tests | 5.1.0 | Runs TypeScript directly, same transform as the build, `describe`/`it` API already familiar, and a clean skip mechanism for live-network tests. | Jest with `ts-jest` (extra transform config on ESM); Node's built-in `node:test` (no assertion ergonomics for this size of suite). |
| gitleaks secret scan in CI | `gitleaks` action, version pinned in the workflow | The repository must never contain a seed phrase, private key or recovery code; a scanner in CI is a backstop, not a substitute for review. | TruffleHog (also viable; no local install needed for gitleaks beyond the action). |
| Formatter scope: code and JSON only | n/a | `biome format` would reflow the Markdown tables in the Phase 0 documents. Rewriting them would change documents this phase is not allowed to change, and would make the audit diff unreadable. Markdown is therefore outside `files.includes` and `format:check` does not touch it. | Format Markdown too, accepting a large unrequested rewrite of the Phase 0 docs. |

Consequences:

- `pnpm verify-env` must pass before a result is trusted. It prints node, pnpm, TypeScript, Biome and Vitest, and exits non-zero on any mismatch with `package.json`.
- `pnpm-workspace.yaml` contains a `minimumReleaseAgeExclude` block that pnpm 12 wrote itself when the pinned Biome packages were resolved. It is kept as generated; removing it makes a fresh install ask for confirmation.
- Unit tests must not need the network. Anything that reaches a chain is off by default and only runs with `LIVE_CHAIN=1`.
- CI is not claimed as passing until a workflow run has executed on GitHub and its link and test counts are recorded in `docs/evidence/phase-01-result.md`.

Test required: a clean checkout runs `pnpm install --frozen-lockfile`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck` and `pnpm test` with no network for the tests.
