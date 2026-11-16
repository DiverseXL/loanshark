import { describe, expect, it } from "vitest";
import { CHAIN_CLIENT_PACKAGE } from "../src/index.js";

describe("chain-client package", () => {
  it("exposes its package name", () => {
    expect(CHAIN_CLIENT_PACKAGE).toBe("@loanshark/chain-client");
  });
});
