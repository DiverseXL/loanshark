# ADR-0011: Contract toolchain and compiler settings

Status: Accepted for local-only development. No deployment is part of this
decision.

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
      },
    },
  },
}
```

ASSUMPTION: optimizer enabled at 200 runs is appropriate for this local demo.
It is not tuned, and no gas claim is made. The compiler version is fixed to
0.8.34 rather than a floating pragma in the project's own contracts;
OpenZeppelin 5.6.1 supports it.

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
