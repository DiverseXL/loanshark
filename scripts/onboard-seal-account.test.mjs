import { describe, expect, it } from "vitest";
import {
  ALLOWED_CHAIN_ID,
  ALLOWED_REST,
  assertExecuteConfirmation,
  assertNoSecret,
  parseArgs,
  redactText,
  reportName,
  resolveConfig,
} from "./onboard-seal-account.mjs";

const PHRASE =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

describe("arguments", () => {
  it("defaults to a dry run", () => {
    expect(parseArgs([])).toEqual({ help: false, execute: false, dryRun: false });
  });

  it("accepts --dry-run, --execute and --help", () => {
    expect(parseArgs(["--dry-run"]).dryRun).toBe(true);
    expect(parseArgs(["--execute"]).execute).toBe(true);
    expect(parseArgs(["--help"]).help).toBe(true);
    expect(parseArgs(["-h"]).help).toBe(true);
  });

  it("refuses both modes together and unknown arguments", () => {
    expect(() => parseArgs(["--dry-run", "--execute"])).toThrow(/choose one/);
    expect(() => parseArgs(["--send"])).toThrow(/unknown argument/);
  });
});

describe("environment guards", () => {
  it("requires the mnemonic variable", () => {
    expect(() => resolveConfig({})).toThrow(/LOANSHARK_SEAL_MNEMONIC/);
    expect(() => resolveConfig({ LOANSHARK_SEAL_MNEMONIC: "   " })).toThrow(
      /LOANSHARK_SEAL_MNEMONIC/,
    );
  });

  it("defaults to the Diana testnet and the public REST endpoint", () => {
    const config = resolveConfig({ LOANSHARK_SEAL_MNEMONIC: PHRASE });
    expect(config.chainId).toBe(ALLOWED_CHAIN_ID);
    expect(config.rest).toBe(ALLOWED_REST);
    expect(config.mnemonic).toBe(PHRASE);
  });

  it("normalises incidental whitespace without keeping the raw string", () => {
    const config = resolveConfig({
      LOANSHARK_SEAL_MNEMONIC: `  ${PHRASE.replace(/ /g, "   ")}\n`,
    });
    expect(config.mnemonic).toBe(PHRASE);
  });

  it("refuses mainnet and any other chain", () => {
    expect(() =>
      resolveConfig({
        LOANSHARK_SEAL_MNEMONIC: PHRASE,
        LOANSHARK_SEAL_CHAIN_ID: "qorechain-vladi",
      }),
    ).toThrow(/refusing chain/);
  });

  it("refuses any other REST endpoint", () => {
    expect(() =>
      resolveConfig({
        LOANSHARK_SEAL_MNEMONIC: PHRASE,
        LOANSHARK_SEAL_REST: "https://api.qore.host",
      }),
    ).toThrow(/refusing REST endpoint/);
    expect(() =>
      resolveConfig({
        LOANSHARK_SEAL_MNEMONIC: PHRASE,
        LOANSHARK_SEAL_REST: "http://api-testnet.qore.host",
      }),
    ).toThrow(/refusing REST endpoint/);
  });

  it("accepts a trailing slash on the allowed endpoint", () => {
    expect(
      resolveConfig({
        LOANSHARK_SEAL_MNEMONIC: PHRASE,
        LOANSHARK_SEAL_REST: `${ALLOWED_REST}/`,
      }).rest,
    ).toBe(ALLOWED_REST);
  });
});

describe("redaction and confirmation", () => {
  it("removes the phrase from text", () => {
    expect(redactText(`before ${PHRASE} after`, PHRASE)).toBe("before [redacted] after");
    expect(redactText("nothing to do", PHRASE)).toBe("nothing to do");
  });

  it("refuses a report that contains the phrase", () => {
    expect(() => assertNoSecret(`{"note":"${PHRASE}"}`, PHRASE)).toThrow(/refusing to write/);
    expect(() => assertNoSecret('{"address":"qor1..."}', PHRASE)).not.toThrow();
  });

  it("requires the exact typed confirmation", () => {
    const address = "qor19rl4cm2hmr8afy4kldpxz3fka4jguq0agt672h";
    expect(assertExecuteConfirmation(`REGISTER ${address}`, address)).toBe(`REGISTER ${address}`);
    expect(() => assertExecuteConfirmation("yes", address)).toThrow(/did not match/);
    expect(() => assertExecuteConfirmation(`REGISTER ${address} `, address)).not.toThrow();
    expect(() => assertExecuteConfirmation(`REGISTER ${address}x`, address)).toThrow(
      /did not match/,
    );
  });
});

describe("report naming", () => {
  it("uses the address and a filesystem-safe UTC timestamp", () => {
    const name = reportName(
      "qor19rl4cm2hmr8afy4kldpxz3fka4jguq0agt672h",
      new Date("2026-11-19T12:34:56.789Z"),
    );
    expect(name).toBe(
      "seal-onboarding-qor19rl4cm2hmr8afy4kldpxz3fka4jguq0agt672h-2026-11-19T12-34-56-789Z.json",
    );
    expect(name).not.toMatch(/[:\\/]/);
  });
});
