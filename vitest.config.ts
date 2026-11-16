import { defineConfig } from "vitest/config";

// Unit tests must not need the network. Anything that talks to a chain is
// gated behind LIVE_CHAIN=1 and skipped by default. See docs/adr/0006.
export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts"],
    environment: "node",
    passWithNoTests: false,
  },
});
