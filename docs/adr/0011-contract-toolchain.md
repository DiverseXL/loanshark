# ADR-0011: Contract toolchain and compiler settings

Status: Accepted for local-only development and for a reproducible deployment
manifest (Step 6b). No deployment is part of this decision; the owner performs
every deployment.

## Node.js support check (Task 4 gate)

This machine runs Node 26.13.0 (the pinned workspace version). Hardhat's
official Node.js support page says:

> Hardhat 3 launched with support for Node.js v22.13.0 or greater. Hardhat 3
> will support all subsequent even major versions of Node.js as long as they're
> maintained by the Node.js team.

Source: <https://hardhat.org/docs/reference/nodejs-support>, read on 2026-11-17.
Node 26 is an even major version and is the current maintained line, so it is
inside the documented policy. The gate was also checked at runtime: Hardhat
3.22.0 loaded this project's config and ran `hardhat compile` on Node 26.13.0
with no version error. No Node downgrade and no alternate toolchain was used.

ASSUMPTION: "maintained by the Node.js team" includes Node 26 at this date. If
the owner has information that Node 26 is not maintained, this ADR must be
revisited before more contract work.

## Pinned versions

| Component | Version | Source |
|---|---|---|
| `hardhat` | 3.22.0 | npm, pinned exactly |
| `@nomicfoundation/hardhat-viem` | 3.1.0 | npm, pinned exactly |
| `@nomicfoundation/hardhat-node-test-runner` | 3.1.2 | npm, pinned exactly |
| `@nomicfoundation/hardhat-network-helpers` | 3.0.12 | npm, pinned exactly |
| `viem` (contract tests) | 2.57.11 | npm, pinned exactly; same version as `packages/agreement` |
| `@openzeppelin/contracts` | 5.6.1 | npm, pinned exactly |
| Solidity compiler | 0.8.34 | Hardhat downloads it; WASM build on this machine |

`pnpm-workspace.yaml` allows the `esbuild` install script, because Hardhat's
test runner needs its platform binary. That is the only build script allowed.
No Hardhat HTTP network is configured; the only network is the in-process
`edr-simulated` network named `hardhat`.

## Compiler settings

```ts
solidity: {
  profiles: {
    default: {
      version: "0.8.34",
      settings: {
        optimizer: { enabled: true, runs: 200 },
        evmVersion: "osaka",
      },
    },
  },
}
```

ASSUMPTION: optimizer enabled at 200 runs is appropriate for this local demo.
It is not tuned, and no gas claim is made. The compiler version is fixed to
0.8.34 rather than a floating pragma in the project's own contracts;
OpenZeppelin 5.6.1 supports it.

## EVM target compatibility on Diana (Phase 3b)

`evmVersion` is set to `osaka`, the highest of four targets whose creation
simulations succeeded. The measurements used read-only
`eth_estimateGas` calls with no `to` field and the creation bytecode as
`data`, `from` = `0xd0a1453c7b8157aa0635076c33b3e24a50a923c5`, and a non-zero
placeholder allowlist entry for `LoanSettlement`. No transaction was sent or
signed. Raw requests and responses are in
`docs/evidence/phase-03b-estimate-gas.json`.

| evmVersion | LoanSettlement estimate | TestUSD estimate | Outcome |
|---|---|---|---|
| `osaka` | 1,850,285 | 604,452 | success |
| `cancun` | 1,850,285 | 604,452 | success |
| `shanghai` | 1,850,285 | 609,204 | success |
| `paris` | 1,871,392 | 618,732 | success |

The chain reported `eth_chainId` `0x2648` (9800, Diana) during the run.

ASSUMPTION: a successful `eth_estimateGas` shows that the node accepts the
creation opcodes for that target; it does not prove that every runtime path is
safe, that the bytecode is correct, or that a real deployment would succeed
under network conditions. It is not a deployment and no deployability claim is
made.

Block time: three read-only `eth_getBlockByNumber("latest")` samples one
minute apart compared the block timestamp with the local UTC clock. The block
timestamp was 1.174 to 2.378 seconds behind the local clock (block timestamps
have whole-second resolution and the comparison includes request latency).
Diana's exact timestamp rule and any future drift are not confirmed; deadlines
must be treated as approximate. Raw samples are in
`docs/evidence/phase-03b-block-time.json`.

## Reproducible manifest (Step 6b)

`scripts/build-manifest.mjs` reads the Hardhat artifacts and writes
`docs/deployments/manifest.json`. It refuses to write if the compiler is not
0.8.34, the EVM target is not `osaka`, or the optimizer is not enabled at 200
runs. The manifest contains, for `TestUSD` and `LoanSettlement`: the ABI, the
creation bytecode and its SHA-256, the runtime bytecode and its SHA-256, the
compiler settings, the constructor signature and argument sources, and the
source commit. It contains no private data and no timestamp, so two builds are
byte-identical.

Hash input: the raw bytecode bytes decoded from the hex string; the `0x` prefix
and hex encoding are excluded. The deploy panel sends the manifest's creation
bytecode unchanged and appends standard ABI words for the constructor.

The double build on 2026-11-18 produced the same file SHA-256 both times:
`0x8b648699d3144aae5c9504b8119358702eaf556ead2dd085a28adcdf6258e1a1`.
`sourceCommit` is the last commit that touched the compiler inputs
(`packages/contracts/contracts` and `hardhat.config.ts`), and the dirty flag
covers only those paths, so later documentation commits do not change the
manifest.
Contract hashes are recorded in `docs/evidence/phase-06-result.md`.

`scripts/verify-deployment.mjs` is the read-only post-deployment check. It
calls only `eth_chainId`, `eth_getCode` and `eth_call`. It hashes the runtime
code and compares it with the manifest. A mismatch is reported, not hidden: if
the code before the trailing CBOR metadata is identical and only the metadata
trailer differs, the report says `MISMATCH, METADATA ONLY` and gives both
metadata lengths; any other difference is reported as a mismatch beyond
metadata. It also checks `allowedTokens()`, `MINIMUM_CLAIM_WINDOW`, the TestUSD
metadata and the owner balances.

ASSUMPTION: the deployment uses exactly the bytecode in this manifest. If the
owner compiles again with different settings, the manifest must be rebuilt
first, and the verification will report the resulting hash mismatch rather than
accept it.

## Test runner and network

Tests use the Node test runner via `@nomicfoundation/hardhat-node-test-runner`
and viem clients from `@nomicfoundation/hardhat-viem`. Time control uses
`networkHelpers.time` from `@nomicfoundation/hardhat-network-helpers`. Every
test runs against the in-process simulated network; no test takes a URL, a
private key or a live-chain provider. Mock tokens are separate test-only
contracts and are named `Mock...`.

Consequence: the Solidity compiler is downloaded on the first compile. That is
a build-time fetch, not a chain interaction; a CI run needs it or a warm
compiler cache. The contract tests themselves make no external request.
