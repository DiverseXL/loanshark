// Static hygiene checks over apps/web/src and index.html.
//
// These are not runtime proofs. They are a guard against the obvious mistake:
// a storage call, a transaction method, an inline script, a remote origin, or
// a second message being added to the signing path.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TEST_MESSAGE } from "../src/constants.js";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const srcRoot = join(appRoot, "src");

const walk = (directory: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) out.push(full);
  }
  return out;
};

const sourceFiles = walk(srcRoot).map((path) => ({
  path: relative(appRoot, path),
  text: readFileSync(path, "utf8"),
}));

const indexHtml = readFileSync(join(appRoot, "index.html"), "utf8");
const css = readFileSync(join(srcRoot, "app.css"), "utf8");

describe("storage and key material", () => {
  const forbidden: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /\blocalStorage\b/, label: "localStorage" },
    { pattern: /\bsessionStorage\b/, label: "sessionStorage" },
    { pattern: /\bindexedDB\b/i, label: "IndexedDB" },
    { pattern: /\bIDBFactory\b/, label: "IDBFactory" },
    { pattern: /\bcaches\b/, label: "Cache Storage" },
    { pattern: /document\.cookie/, label: "document.cookie" },
    { pattern: /mnemonic/i, label: "mnemonic" },
    { pattern: /seedPhrase|seed phrase/i, label: "seed phrase" },
    { pattern: /privateKey|private_key/i, label: "private key" },
    { pattern: /secretKey|secret_key/i, label: "secret key" },
    {
      pattern:
        /gtag|googletagmanager|google-analytics|plausible\.io|posthog|segment\.io|hotjar|mixpanel/i,
      label: "analytics",
    },
  ];

  it("has no storage API and no key-like material in apps/web/src", () => {
    for (const file of sourceFiles) {
      for (const rule of forbidden) {
        expect(rule.pattern.test(file.text), `${rule.label} in ${file.path}`).toBe(false);
      }
    }
  });
});

describe("forbidden transaction methods", () => {
  // eth_sendTransaction is the one exception, and only in the deploy module;
  // the test below pins that. Everything else stays forbidden everywhere.
  const forbidden: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /eth_sendRawTransaction/, label: "eth_sendRawTransaction" },
    { pattern: /signAndBroadcast/, label: "signAndBroadcast" },
    { pattern: /eth_requestAccounts/, label: "eth_requestAccounts" },
    { pattern: /eth_signTransaction/, label: "eth_signTransaction" },
    { pattern: /wallet_sendCalls|wallet_signTransaction/, label: "wallet transaction method" },
    { pattern: /\beth_sign\b|\bpersonal_sign\b|wallet_sign/i, label: "message signing method" },
    {
      pattern: /MsgRegisterPQCKey|MsgRegisterKEMKey|MsgRotatePQCKey/i,
      label: "key-management message",
    },
  ];

  it("contains no raw-transaction, broadcast, account-request or key-management call", () => {
    for (const file of sourceFiles) {
      for (const rule of forbidden) {
        expect(rule.pattern.test(file.text), `${rule.label} in ${file.path}`).toBe(false);
      }
    }
  });

  it("keeps eth_sendTransaction in the deploy module only, called from a click", () => {
    const mentions = sourceFiles
      .filter((file) => /eth_sendTransaction/.test(file.text))
      .map((file) => file.path);
    expect(mentions).toEqual([join("src", "deploy", "flow.ts")]);

    const flowFile = sourceFiles.find((file) => file.path === join("src", "deploy", "flow.ts"));
    // Exactly one request call. The other mentions are status text.
    const calls =
      flowFile?.text.match(/provider\.request\(\{\s*method:\s*"eth_sendTransaction"/g) ?? [];
    expect(calls).toHaveLength(1);

    // The only callers are the four onClick handlers in the panel.
    const callers = sourceFiles
      .filter((file) => file.path !== join("src", "deploy", "flow.ts"))
      .filter((file) => /flow\.runStep\(/.test(file.text))
      .map((file) => file.path);
    expect(callers).toEqual([join("src", "deploy", "DeployPanel.tsx")]);

    const panel = sourceFiles.find(
      (file) => file.path === join("src", "deploy", "DeployPanel.tsx"),
    );
    const clickHandlers =
      panel?.text.match(/onClick=\{\(\) => \{\s*void flow\.runStep\(id\);/g) ?? [];
    expect(clickHandlers).toHaveLength(1);
    expect(panel?.text).not.toMatch(/useEffect\([^)]*runStep/s);
    expect(panel?.text).toContain("void flow.runStep(id);");
  });

  it("mentions signArbitrary in exactly two files: the type and the signer", () => {
    const mentions = sourceFiles
      .filter((file) => /signArbitrary/.test(file.text))
      .map((file) => file.path)
      .sort();
    expect(mentions).toEqual([
      join("src", "wallet", "signer.ts"),
      join("src", "wallet", "types.ts"),
    ]);
    const signerFile = sourceFiles.find((file) => file.path === join("src", "wallet", "signer.ts"));
    expect(signerFile?.text).toContain("signArbitrary.call(");
  });

  it("encodes only the fixed test message for signing", () => {
    expect(TEST_MESSAGE).toBe("LOANSHARK test message, no funds");
    const encoders = sourceFiles.filter((file) => /new TextEncoder\(\)\.encode\(/.test(file.text));
    expect(encoders.map((file) => file.path)).toEqual([join("src", "App.tsx")]);
    const app = sourceFiles.find((file) => file.path === join("src", "App.tsx"));
    expect(app?.text).toContain("new TextEncoder().encode(TEST_MESSAGE)");
  });
});

describe("static asset policy", () => {
  const csp =
    /http-equiv="Content-Security-Policy"[\s\S]*?content="([^"]+)"/.exec(indexHtml)?.[1] ?? "";

  it("declares a content security policy", () => {
    expect(csp).not.toBe("");
  });

  it("blocks inline script and eval", () => {
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("unsafe-inline");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("object-src 'none'");
  });

  it("limits connect-src to the REST host and the EVM host", () => {
    const connect = /connect-src ([^;]+)/.exec(csp)?.[1] ?? "";
    expect(
      connect
        .split(/\s+/)
        .filter((token) => token.length > 0)
        .sort(),
    ).toEqual(["https://api-testnet.qore.host", "https://evm-testnet.qore.host"]);
    expect(connect).not.toContain("*");
  });

  it("loads no remote script, stylesheet or font", () => {
    expect(indexHtml).not.toMatch(/<script[^>]+src="https?:/i);
    expect(indexHtml).not.toMatch(/<link[^>]+href="https?:/i);
    expect(css).not.toMatch(/@import\s+url\(\s*["']?https?:/i);
    expect(css).not.toMatch(/fonts\.googleapis|fonts\.gstatic/);
  });

  it("contains no inline event handler or dangerous HTML sink", () => {
    expect(indexHtml).not.toMatch(/\son[a-z]+="/i);
    for (const file of sourceFiles) {
      expect(file.text, `dangerous HTML in ${file.path}`).not.toContain("dangerouslySetInnerHTML");
      expect(file.text, `eval in ${file.path}`).not.toMatch(/\beval\s*\(/);
      expect(file.text, `new Function in ${file.path}`).not.toMatch(/new Function\s*\(/);
    }
  });
});
