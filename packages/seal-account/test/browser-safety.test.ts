// Static checks that the seal-account package stays offline and browser-safe.
//
// These are not a sandbox. They are a guard against the obvious mistake: a Node
// built-in, a network call, browser storage, a console log, or a dependency
// that reaches outside the pinned offline set.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const srcRoot = join(packageRoot, "src");

const walk = (directory: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith(".ts")) out.push(full);
  }
  return out;
};

const sourceFiles = walk(srcRoot).map((path) => ({
  path: relative(packageRoot, path),
  text: readFileSync(path, "utf8"),
}));

describe("offline and browser safety", () => {
  const forbidden: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /from\s+["']node:/, label: "Node built-in import" },
    { pattern: /\brequire\s*\(/, label: "CommonJS require" },
    { pattern: /\bprocess\./, label: "process" },
    { pattern: /\bBuffer\b/, label: "Buffer" },
    { pattern: /\bfetch\s*\(/, label: "fetch" },
    { pattern: /\bXMLHttpRequest\b/, label: "XMLHttpRequest" },
    { pattern: /\bWebSocket\b/, label: "WebSocket" },
    { pattern: /\bEventSource\b/, label: "EventSource" },
    { pattern: /\blocalStorage\b/, label: "localStorage" },
    { pattern: /\bsessionStorage\b/, label: "sessionStorage" },
    { pattern: /\bindexedDB\b/i, label: "IndexedDB" },
    { pattern: /document\.cookie/, label: "document.cookie" },
    { pattern: /\bconsole\./, label: "console" },
    { pattern: /\beval\s*\(/, label: "eval" },
    { pattern: /new Function\s*\(/, label: "new Function" },
    { pattern: /Math\.random\s*\(/, label: "Math.random for secret material" },
    { pattern: /@qorechain\/qoreseal\/network/, label: "QoreSeal network module" },
    { pattern: /@qorechain\/qoresign\/network/, label: "QoreSign network module" },
    { pattern: /abandon abandon/i, label: "embedded test mnemonic" },
  ];

  it("contains no Node built-in, network call, storage, console or random source", () => {
    for (const file of sourceFiles) {
      for (const rule of forbidden) {
        expect(rule.pattern.test(file.text), `${rule.label} in ${file.path}`).toBe(false);
      }
    }
  });

  it("imports only the pinned offline packages and its own modules", () => {
    const allowed = new Set([
      "@loanshark/chain-client",
      "@noble/hashes/sha3.js",
      "@qorechain/qoreseal",
      "@qorechain/qoresign",
      "@scure/bip39",
      "@scure/bip39/wordlists/english.js",
    ]);
    const specifiers = sourceFiles.flatMap((file) =>
      Array.from(file.text.matchAll(/(?:from|import)\s+["']([^"']+)["']/g), (match) => ({
        file: file.path,
        specifier: match[1] ?? "",
      })),
    );

    expect(specifiers.length).toBeGreaterThan(0);
    for (const { file, specifier } of specifiers) {
      const allowedHere = specifier.startsWith("./") || allowed.has(specifier);
      expect(allowedHere, `unexpected import ${specifier} in ${file}`).toBe(true);
    }
  });

  it("does not read environment variables or coin a secret from a timestamp", () => {
    for (const file of sourceFiles) {
      expect(file.text, file.path).not.toMatch(/Date\.now\(\)\s*\.toString/);
      expect(file.text, file.path).not.toMatch(/crypto\.randomUUID.*mnemonic/i);
    }
  });
});
