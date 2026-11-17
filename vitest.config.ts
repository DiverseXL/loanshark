import { defineConfig } from "vitest/config";

// Unit tests must not need the network. Anything that talks to a chain is
// gated behind LIVE_CHAIN=1 and skipped by default. See docs/adr/0006.
export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts"],
    // Contract tests use Hardhat's node:test runner and an in-process EVM, not
    // Vitest. They run through `pnpm --filter @loanshark/contracts test`.
    exclude: ["packages/contracts/**"],
    environment: "node",
    passWithNoTests: false,
  },
});
