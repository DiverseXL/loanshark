// Hygiene for the adapter:
// - the main entry imports no network module and performs no I/O;
// - no exported function returns or logs key material;
// - the test-only identity module is a separate entry point;
// - the installed QoreSeal main entry itself is offline.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import * as main from "../src/index.js";
import { encodeAad } from "../src/aad.js";
import { openEnvelope, sealMlkemToRecipient } from "../src/adapter.js";
import { signEnvelope, verifySignedEnvelope } from "../src/envelope.js";
import {
  createThrowawaySigner,
  generateThrowawayIdentity,
  mockAccountClient,
} from "../src/testing.js";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(HERE, "src");
const PACKAGE_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

const sourceFiles = readdirSync(SRC)
  .filter((name) => name.endsWith(".ts"))
  .map((name) => ({ name, text: readFileSync(join(SRC, name), "utf8") }));

/** Every file except the explicitly test-only module. */
const runtimeFiles = sourceFiles.filter((f) => f.name !== "testing.ts");

describe("network isolation", () => {
  it("the main entry imports no network module", () => {
    for (const file of runtimeFiles) {
      expect(file.text, file.name).not.toMatch(/@qorechain\/qoreseal\/network/);
      expect(file.text, file.name).not.toMatch(/@qorechain\/qoresign\/network/);
      expect(file.text, file.name).not.toMatch(/from\s+"node:(http|https|net|tls|dns)"/);
      expect(file.text, file.name).not.toMatch(/\bfetch\s*\(/);
      expect(file.text, file.name).not.toMatch(/\bXMLHttpRequest\b/);
      expect(file.text, file.name).not.toMatch(/\bWebSocket\b/);
    }
  });

  it("the main entry does not export the test helpers", () => {
    const exported = Object.keys(main);
    expect(exported).not.toContain("generateThrowawayIdentity");
    expect(exported).not.toContain("createThrowawaySigner");
    expect(exported).not.toContain("mockAccountClient");
    expect(exported).toEqual(
      expect.arrayContaining([
        "sealMlkemToRecipient",
        "openEnvelope",
        "signEnvelope",
        "verifySignedEnvelope",
      ]),
    );
  });

  it("the installed QoreSeal main entry is offline and network is a separate subpath", () => {
    const pkg = JSON.parse(
      readFileSync(
        join(
          PACKAGE_ROOT,
          "node_modules/.pnpm/@qorechain+qoreseal@0.1.0/node_modules/@qorechain/qoreseal/package.json",
        ),
        "utf8",
      ),
    ) as { exports: Record<string, unknown> };
    expect(Object.keys(pkg.exports)).toContain("./network");

    const mainEntry = readFileSync(
      join(
        PACKAGE_ROOT,
        "node_modules/.pnpm/@qorechain+qoreseal@0.1.0/node_modules/@qorechain/qoreseal/dist/index.js",
      ),
      "utf8",
    );
    expect(mainEntry).not.toMatch(/from\s+"\.\/network/);
    expect(mainEntry).not.toMatch(/from\s+"node:(http|https|net|tls|dns)"/);
    expect(mainEntry).not.toMatch(/\bfetch\s*\(/);
  });
});

describe("no key material leaves the adapter", () => {
  it("seal, open, sign and verify results contain no secret keys", async () => {
    const borrower = generateThrowawayIdentity();
    const context = {
      kind: "request" as const,
      chainId: "qorechain-diana",
      requestId: "req-hygiene",
      borrower: borrower.address,
      version: "1",
    };
    const sealed = sealMlkemToRecipient({
      chainId: context.chainId,
      purpose: "loanshark/request",
      recipient: { mlkemPublicKey: borrower.sealKeys.mlkemPublicKey },
      plaintext: new TextEncoder().encode("hygiene"),
      aad: encodeAad(context),
    });
    expect(sealed.ok).toBe(true);
    if (!sealed.ok) return;

    const opened = openEnvelope({
      chainId: context.chainId,
      purpose: "loanshark/request",
      envelope: sealed.value.envelope,
      keys: borrower.sealKeys,
      aad: encodeAad(context),
    });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(Object.keys(opened.value)).toEqual(["plaintext"]);

    const signed = await signEnvelope({
      envelope: sealed.value.envelope,
      context,
      signer: createThrowawaySigner(borrower, context.chainId),
    });
    expect(signed.ok).toBe(true);
    if (!signed.ok) return;

    const verified = await verifySignedEnvelope({
      signed: signed.value,
      accountClient: mockAccountClient(borrower),
    });
    expect(verified.ok).toBe(true);

    // The secret halves must not appear in anything a caller receives.
    const forbidden = [
      Buffer.from(borrower.sealKeys.mlkemSecretKey).toString("hex"),
      Buffer.from(borrower.sealKeys.x25519SecretKey).toString("hex"),
      Buffer.from(borrower.sealKeys.seed).toString("hex"),
      Buffer.from(borrower.classicalKey.privateKey).toString("hex"),
      Buffer.from(borrower.pqKey.secretKey).toString("hex"),
    ];
    const observable = JSON.stringify({
      sealed: sealed.value,
      opened: opened.value,
      signed: signed.value,
      verified,
    });
    for (const secret of forbidden) expect(observable).not.toContain(secret);
  });

  it("the runtime modules never write to the console", () => {
    for (const file of runtimeFiles) expect(file.text, file.name).not.toMatch(/console\./);
  });

  it("operations do not log, even on failure", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    try {
      const identity = generateThrowawayIdentity();
      openEnvelope({
        chainId: "qorechain-diana",
        purpose: "p",
        envelope: new Uint8Array(4),
        keys: identity.sealKeys,
        aad: new Uint8Array(0),
      });
      expect(log).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
      expect(debug).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
      warn.mockRestore();
      error.mockRestore();
      debug.mockRestore();
    }
  });
});
