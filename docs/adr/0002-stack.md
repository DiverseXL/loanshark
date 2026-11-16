# ADR-0002: Implementation stack

Status: Accepted for TypeScript (owner decision); contract toolchain Proposed
Context: QoreSeal ships a native TypeScript implementation with network helpers; the Rust crate is offline only and has no browser build in its repository. The development machine is Windows with PowerShell.
Options: TypeScript for app and crypto; Rust for crypto and tooling; Rust compiled to WASM.
Decision: A TypeScript pnpm monorepo for the app, API and shared packages, using the QoreSeal TypeScript package (built from its repository until it is on npm, pinned to a commit). Hardhat with OpenZeppelin for contracts is proposed, not yet confirmed. Rust is deferred; at most an optional command-line checker later.
Consequences: Pin the QoreSeal commit; re-check npm availability. No Makefile; package scripts only.
Test required: QoreSeal TypeScript test vectors pass in this repository's CI.
