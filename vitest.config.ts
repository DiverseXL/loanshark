import { defineConfig } from "vitest/config";

// Unit tests must not need the network. Anything that talks to a chain is
// gated behind LIVE_CHAIN=1 and skipped by default. See docs/adr/0006.
export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts", "scripts/**/*.test.mjs"],
    // Contract tests use Hardhat's node:test runner and an in-process EVM, not
    // Vitest. They run through `pnpm --filter @loanshark/contracts test`.
    // The node_modules exclusion keeps workspace symlinks from running the
    // same package's tests again under each dependent package.
    exclude: ["**/node_modules/**", "**/dist/**", "packages/contracts/**"],
    environment: "node",
    passWithNoTests: false,
    // The vault tests run real PBKDF2-HMAC-SHA256 with 600,000 iterations per
    // save and per unlock. Under full-suite parallelism a single derivation can
    // exceed the 5-second default; the timeout is a resource allowance, not a
    // relaxed assertion.
    testTimeout: 60_000,
  },
});
