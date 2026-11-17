# Phase 2 result: M1 offline cryptographic slice

Date: 2026-11-17. Network: none used by any test in this phase. Host: Windows,
Git Bash; PowerShell equivalents are in the final report.

This file records commands and their unedited output. Nothing here is
reconstructed. Where output was truncated for width or for length, it is marked
as truncated.

## Task 0: baseline

Starting commit: `9380d89` (`docs: record M0-3 as done and close the ADR-0003
open question`). `git status --porcelain` returned no output and
`git branch --show-current` returned `main`.

### Remote

Command:

```bash
git remote -v
```

Output: none. The repository has no remote, so nothing was pushed and CI has
not run on GitHub. The owner was asked for the URL; no URL was supplied in this
session.

### Baseline checks

Command:

```bash
pnpm verify-env
pnpm test
```

`pnpm verify-env` output:

```
tool            pinned        actual
--------------  ------------  ------------
node            26.13.0       26.13.0
pnpm            12.21.0       12.21.0
typescript      5.9.3         5.9.3
@biomejs/biome  2.6.8         2.6.8
vitest          5.1.0         5.1.0

Toolchain matches the pinned versions.
```

`pnpm test` output:

```
 RUN  v5.1.0 C:/Users/user/Documents/loanshark

 ↓ packages/chain-client/test/verify-hybrid-message.live.test.ts (1 test | 1 skipped)
 ✓ packages/chain-client/test/smoke.test.ts (1 test) 37ms
 ✓ packages/chain-client/test/verify-hybrid-message.test.ts (12 tests) 232ms

 Test Files  2 passed | 1 skipped (3)
      Tests  13 passed | 1 skipped (14)
```

## Task 1: QoreSeal TypeScript package

### npm availability

Command:

```bash
npm view @qorechain/qoreseal --json
```

Output, truncated with `head -60` (marked truncated):

```json
{
  "_id": "@qorechain/qoreseal@0.1.0",
  "name": "@qorechain/qoreseal",
  "dist-tags": { "latest": "0.1.0" },
  "versions": ["0.0.0-stage", "0.1.0"],
  "time": {
    "created": "2026-10-29T12:19:18.966Z",
    "modified": "2026-10-29T12:20:15.361Z",
    "0.1.0": "2026-10-29T12:20:15.124Z"
  },
  "description": "ML-KEM-1024 (FIPS 203) encryption of data to QoreChain accounts, with an X25519 hybrid mode, multi-recipient envelopes and epoch keys for private groups and sidechains.",
  "maintainers": ["qorechain <liviu@qorechain.io>"],
  "repository": {
    "url": "git+https://github.com/qorechain/qoreseal.git",
    "type": "git",
    "directory": "packages/ts"
  },
  "license": "Apache-2.0",
  "dist": {
    "shasum": "d28e723501bb82d6bc7595777601b6c804e445ef",
    "tarball": "https://registry.npmjs.org/@qorechain/qoreseal/-/qoreseal-0.1.0.tgz",
    "integrity": "sha512-OBUwTVsibzTH/zOpqT6lkq7mH/dCg9zV4hSw3tEMUttt3Jb4BqF4BF6/DsZqzSY1+joPusm3gRutx17kV+Hb5w==",
    "unpackedSize": 150022
  },
```

Result: the package is published. This phase depends on the exact npm version
`0.1.0`, not a git dependency and not a local build.

### Repository commit

Command:

```bash
git ls-remote https://github.com/qorechain/qoreseal.git
```

Output, unedited:

```
bbd4dbbe8b987639be4f0b12084000e7da2272f4	HEAD
bbd4dbbe8b987639be4f0b12084000e7da2272f4	refs/heads/main
f5f5c49b7a5d72fc35be084a5a6298b8ea9cbb85	refs/tags/go/v0.1.0
d1c4ec30590784e3c9731c03d5c39e5a1aee553f	refs/tags/v0.1.0
f5f5c49b7a5d72fc35be084a5a6298b8ea9cbb85	refs/tags/v0.1.0^{}
```

The full HEAD hash is
`bbd4dbbe8b987639be4f0b12084000e7da2272f4`, matching the short hash
`bbd4dbbe8b98` previously read. `git diff --stat d1c4ec30..bbd4dbbe --
packages/ts vectors` printed no output: the TypeScript package and the vector
file are identical between the `v0.1.0` tag commit and HEAD.

ASSUMPTION: the npm tarball was built from that tagged source. The registry
publishes no build attestation. The evidence that the package agrees with the
published vectors is the 20 passing vector tests below, not a provenance
proof.

### Published test vectors

`vectors/qoreseal-v1.json` was copied with `cp` (not retyped) to
`fixtures/qoreseal-vectors-v1.json`. Hash:

```
e4cc5d0745377e5ed1eb98f5b67b8bd71567292369ceb4b325a9ec780b9e0da7
```

Provenance is in `fixtures/qoreseal-vectors-v1.meta.json`.

Command:

```bash
pnpm vitest run packages/qoreseal-adapter/test/vectors.test.ts
```

Output, unedited:

```
 RUN  v5.1.0 C:/Users/user/Documents/loanshark

 ✓ packages/qoreseal-adapter/test/vectors.test.ts (20 tests) 1159ms

 Test Files  1 passed (1)
      Tests  20 passed (20)
   Start at  13:48:37
   Duration  3.06s (tests 50%, import 41%, transform 8%, worker 1%)
```

## Task 2 to Task 6: adapter, AAD, signed envelopes, tests

Files:

- `packages/qoreseal-adapter/src/adapter.ts`: `sealMlkemToRecipient`,
  `openEnvelope`, typed failures.
- `packages/qoreseal-adapter/src/aad.ts`: canonical AAD (ADR-0007).
- `packages/qoreseal-adapter/src/envelope.ts`: `SignedEnvelope`,
  `MessageSigner`, `signEnvelope`, `verifySignedEnvelope`.
- `packages/qoreseal-adapter/src/testing.ts`: TEST ONLY identity, signers and
  mock account client.
- `packages/qoreseal-adapter/test/`: six test files.

Task 6 was not BLOCKED: `RestOptions` accepts `fetch?: FetchLike`
(source-lock claim 28), so `cards.test.ts` injects a mock registry.

### AAD fixture

Command:

```bash
sha256sum fixtures/aad-vectors.json
```

Output, unedited:

```
7bd40a76dcf86f78afe40ab884e0f802f577d2f64233f20d85bfc42952539946 *fixtures/aad-vectors.json
```

## Final checks

Command, run from the repository root at commit `d46faa2`:

```bash
pnpm verify-env
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
```

Output, unedited except that the `lint` section is truncated after the first
diagnostics block; all 24 diagnostics are infos, not errors. The full command
exited 0.

```
=== git rev-parse HEAD ===
d46faa2756b6a93d9ada81a36d64040ac2fced64

=== pnpm verify-env ===
$ node scripts/verify-env.mjs
tool            pinned        actual
--------------  ------------  ------------
node            26.13.0       26.13.0
pnpm            12.21.0       12.21.0
typescript      5.9.3         5.9.3
@biomejs/biome  2.6.8         2.6.8
vitest          5.1.0         5.1.0

Toolchain matches the pinned versions.
exit=0

=== pnpm format:check ===
$ biome format .
Checked 26 files in 48ms. No fixes applied.
exit=0

=== pnpm lint ===
$ biome lint .
packages\chain-client\src\spike\verify-qorex-signature.ts:115:54 lint/complexity/useLiteralKeys  FIXABLE
... (truncated: 24 infos, 0 errors)
Checked 26 files in 170ms. No fixes applied.
Found 24 infos.
exit=0

=== pnpm typecheck ===
$ pnpm -r --if-present typecheck
$ tsc -p tsconfig.json --noEmit
$ tsc -p tsconfig.json --noEmit
exit=0

=== pnpm test ===
$ vitest run

 RUN  v5.1.0 C:/Users/user/Documents/loanshark

 ✓ packages/qoreseal-adapter/test/cards.test.ts (5 tests) 2426ms
   ✓ recipient cards against a mocked registry (MOCK) (5)
     ✓ resolves the card when both registered keys match 1626ms
     ✓ refuses a card whose KEM hash does not match the registered key 350ms
 ✓ packages/qoreseal-adapter/test/signed-envelope.test.ts (9 tests) 2680ms
   ✓ signed envelopes (9)
     ✓ signs with the official QoreSign API and verifies against the mock key 1505ms
     ✓ C3: changing each context field individually fails to open and to verify 308ms
     ✓ T6: a variant re-sealed for the second lender is rejected by the signature 312ms
 ✓ packages/qoreseal-adapter/test/vectors.test.ts (20 tests) 1453ms
   ✓ published QoreSeal vectors (20)
     ✓ keys (2)
       ✓ derives seeds from a mnemonic 340ms
 ✓ packages/chain-client/test/verify-hybrid-message.test.ts (12 tests) 303ms
 ✓ packages/qoreseal-adapter/test/hygiene.test.ts (6 tests) 1132ms
   ✓ no key material leaves the adapter (3)
     ✓ seal, open, sign and verify results contain no secret keys 1060ms
 ✓ packages/qoreseal-adapter/test/adapter.test.ts (7 tests) 1431ms
   ✓ seal and open in mlkem mode (7)
     ✓ opens for the intended recipient and returns the exact plaintext 825ms
 ✓ packages/qoreseal-adapter/test/aad.test.ts (8 tests) 30ms
 ✓ packages/chain-client/test/smoke.test.ts (1 test) 11ms
 ↓ packages/chain-client/test/verify-hybrid-message.live.test.ts (1 test | 1 skipped)

 Test Files  8 passed | 1 skipped (9)
      Tests  68 passed | 1 skipped (69)
   Start at  14:04:40
   Duration  10.81s (tests 49%, import 45%, transform 3%, worker 3%)

exit=0
```

### Test counts

Measured: 68 passed, 1 skipped, 69 collected across 9 files. The skipped test is
the pre-existing live-chain test, skipped because `LIVE_CHAIN` is unset. None of
the 68 opens a socket.

Phase 2 adds 55 tests in six files:

| File | Tests | Real crypto | Mock-backed |
|---|---:|---|---|
| `test/vectors.test.ts` | 20 | yes, the official package against its published vectors | no |
| `test/aad.test.ts` | 8 | no cryptography; byte encoding | no |
| `test/adapter.test.ts` | 7 | yes, seal/open with throwaway keys | no |
| `test/signed-envelope.test.ts` | 9 | yes, QoreSign signing with throwaway keys | yes: MOCK account client |
| `test/cards.test.ts` | 5 | yes, card signing/verification | yes: MOCK registry |
| `test/hygiene.test.ts` | 6 | static import/console checks; one runtime path | one test uses the MOCK account client |

Separated: 35 tests exercise the official package with throwaway keys and no
mock client (20 vectors, 7 adapter, 8 AAD); 14 are mock-backed (9 signed
envelopes, 5 cards); 6 are hygiene checks, one of which runs the mock-backed
verification path.

What the counts establish: the adapter behaves as specified for C1 to C3 and
T3, T5 to T7 with generated keys and injected clients. They do not establish
that any key is registered on QoreChain, and no test registered a key, opened
an EVM window or called the live KEM endpoint.

## CI

`.github/workflows/ci.yml` already runs `pnpm install --frozen-lockfile`,
`pnpm verify-env`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck` and
`pnpm test`, with no network-dependent test enabled. The new tests are covered
by the existing `pnpm test` step. The repository has no remote, so the workflow
has not run on GitHub and there is no run link. No claim that CI passes is made.
