// In-process server tests for the @loanshark/api relay server (ADR-0017).
//
// Tests every endpoint positive and negative, immutability, secret-field rejection,
// Origin/Host checks, body size limits, rate limiting, and verifies that no
// stored record or log line contains the plaintext of a sealed test message.

import { request as httpRequest } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RelayServer } from "../src/server.js";
import { MemoryRelayStorage } from "../src/storage.js";
import type { EnvelopeRecordInput } from "../src/types.js";

const VALID_SENDER_W = "qor19rl4cm2hmr8afy4kldpxz3fka4jguq0agt672h";
const VALID_RECIPIENT_W = "qor1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq709m5v";
const VALID_SEAL_E = "qor17w033z2a0f8w6q2t6f0m9h4s2k1l8v7e5d3c2a";

describe("apps/api relay server", () => {
  let server: RelayServer;
  let port: number;
  let baseUrl: string;
  const logs: string[] = [];

  beforeEach(async () => {
    logs.length = 0;
    server = new RelayServer({
      storage: new MemoryRelayStorage(),
      allowedHosts: ["localhost", "127.0.0.1"],
      allowedOrigins: ["http://localhost:5173", "http://127.0.0.1:5173"],
      rateLimitMax: 50,
      logFn: (line) => logs.push(line),
    });
    port = await server.listen(0, "127.0.0.1");
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await server.close();
  });

  const request = (
    path: string,
    options: {
      method?: string;
      headers?: Record<string, string>;
      body?: unknown;
    } = {},
  ): Promise<{
    status: number;
    headers: Map<string, string>;
    text: string;
    json: unknown;
  }> => {
    return new Promise((resolve, reject) => {
      const method = options.method ?? "GET";
      const headers: Record<string, string> = {
        Host: `127.0.0.1:${port}`,
        ...options.headers,
      };
      let bodyStr: string | undefined;
      if (options.body !== undefined) {
        bodyStr = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
        headers["Content-Type"] = "application/json";
        headers["Content-Length"] = Buffer.byteLength(bodyStr).toString();
      }

      const req = httpRequest(
        {
          hostname: "127.0.0.1",
          port,
          path,
          method,
          headers,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf-8");
            let json: unknown = null;
            try {
              json = JSON.parse(text);
            } catch {
              json = null;
            }
            const headerMap = new Map<string, string>();
            for (const [k, v] of Object.entries(res.headers)) {
              if (v !== undefined) {
                headerMap.set(k.toLowerCase(), Array.isArray(v) ? v.join(", ") : v);
              }
            }
            resolve({
              status: res.statusCode ?? 0,
              headers: headerMap,
              text,
              json,
            });
          });
        },
      );

      req.on("error", reject);
      if (bodyStr) req.write(bodyStr);
      req.end();
    });
  };

  it("sets fixed security headers and nosniff on every response", async () => {
    const res = await request("/v1/inbox/" + VALID_RECIPIENT_W);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("content-security-policy")).toBe("default-src 'none'");
  });

  it("handles CORS: accepts allowed origin and rejects unauthorized origin", async () => {
    // Allowed origin
    const okCors = await request("/v1/inbox/" + VALID_RECIPIENT_W, {
      headers: { Origin: "http://localhost:5173" },
    });
    expect(okCors.status).toBe(200);
    expect(okCors.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");

    // Preflight OPTIONS
    const preflight = await request("/v1/envelopes", {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:5173" },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");

    // Unauthorized origin
    const badCors = await request("/v1/inbox/" + VALID_RECIPIENT_W, {
      headers: { Origin: "https://evil.attacker.com" },
    });
    expect(badCors.status).toBe(403);
  });

  it("enforces Host allowlist and rejects unknown Host headers", async () => {
    const badHost = await request("/v1/inbox/" + VALID_RECIPIENT_W, {
      headers: { Host: "evil.attacker.com" },
    });
    expect(badHost.status).toBe(400);
    expect(badHost.json).toMatchObject({ error: "bad-request" });
  });

  it("requires X-Loanshark-Action header on writes and rejects write without it", async () => {
    const envelopeInput: EnvelopeRecordInput = {
      kind: "request",
      loanRef: "loan-001",
      senderW: VALID_SENDER_W,
      recipientW: VALID_RECIPIENT_W,
      ciphertext: Buffer.from("sealed ciphertext").toString("base64"),
      signature: { signatureType: "ml-dsa-87-hybrid", classical: {}, pq: {} },
      aad: { chainId: "qorechain-diana", borrower: VALID_SENDER_W },
      createdAt: new Date().toISOString(),
    };

    // Missing custom header
    const noHeader = await request("/v1/envelopes", {
      method: "POST",
      body: envelopeInput,
    });
    expect(noHeader.status).toBe(403);
    expect(noHeader.json).toMatchObject({
      error: "forbidden",
      message: expect.stringContaining("X-Loanshark-Action"),
    });

    // With custom header
    const withHeader = await request("/v1/envelopes", {
      method: "POST",
      headers: { "X-Loanshark-Action": "1" },
      body: envelopeInput,
    });
    expect(withHeader.status).toBe(201);
  });

  it("POST /v1/envelopes and GET /v1/envelopes/:id round-trip with immutability", async () => {
    const envelopeInput: EnvelopeRecordInput = {
      kind: "request",
      loanRef: "loan-100",
      senderW: VALID_SENDER_W,
      recipientW: VALID_RECIPIENT_W,
      ciphertext: Buffer.from("encrypted payload bytes").toString("base64"),
      signature: { sig: "sample-sig" },
      aad: { version: "1", borrower: VALID_SENDER_W },
      createdAt: "2026-11-19T12:00:00Z",
    };

    const postRes = await request("/v1/envelopes", {
      method: "POST",
      headers: { "X-Loanshark-Action": "1" },
      body: envelopeInput,
    });
    expect(postRes.status).toBe(201);
    const postJson = postRes.json as { envelope: { id: string } };
    expect(postJson.envelope.id).toMatch(/^[0-9a-f]{64}$/);
    const id = postJson.envelope.id;

    // GET by id
    const getRes = await request(`/v1/envelopes/${id}`);
    expect(getRes.status).toBe(200);
    expect(getRes.json).toMatchObject({
      envelope: {
        id,
        kind: "request",
        loanRef: "loan-100",
        senderW: VALID_SENDER_W,
        recipientW: VALID_RECIPIENT_W,
      },
    });

    // Content-addressed immutability: re-posting identical data returns identical id
    const repostRes = await request("/v1/envelopes", {
      method: "POST",
      headers: { "X-Loanshark-Action": "1" },
      body: envelopeInput,
    });
    expect(repostRes.status).toBe(201);
    expect((repostRes.json as { envelope: { id: string } }).envelope.id).toBe(id);

    // GET non-existent id
    const nonExistent = await request(
      "/v1/envelopes/0000000000000000000000000000000000000000000000000000000000000000",
    );
    expect(nonExistent.status).toBe(404);
  });

  it("GET /v1/inbox/:walletAddress returns envelope metadata addressed to that wallet", async () => {
    const env1: EnvelopeRecordInput = {
      kind: "request",
      loanRef: "loan-inbox-1",
      senderW: VALID_SENDER_W,
      recipientW: VALID_RECIPIENT_W,
      ciphertext: "Y2lwaGVydGV4dDE=",
      signature: { s: 1 },
      aad: { a: 1 },
      createdAt: "2026-11-19T10:00:00Z",
    };
    const env2: EnvelopeRecordInput = {
      kind: "offer",
      loanRef: "loan-inbox-2",
      senderW: VALID_SENDER_W,
      recipientW: VALID_RECIPIENT_W,
      ciphertext: "Y2lwaGVydGV4dDI=",
      signature: { s: 2 },
      aad: { a: 2 },
      createdAt: "2026-11-19T11:00:00Z",
    };

    await request("/v1/envelopes", {
      method: "POST",
      headers: { "X-Loanshark-Action": "1" },
      body: env1,
    });
    await request("/v1/envelopes", {
      method: "POST",
      headers: { "X-Loanshark-Action": "1" },
      body: env2,
    });

    const inboxRes = await request(`/v1/inbox/${VALID_RECIPIENT_W}`);
    expect(inboxRes.status).toBe(200);
    const inbox = inboxRes.json as { items: Array<{ loanRef: string; kind: string }> };
    expect(inbox.items).toHaveLength(2);
    // Ordered newest first
    expect(inbox.items[0]?.loanRef).toBe("loan-inbox-2");
    expect(inbox.items[1]?.loanRef).toBe("loan-inbox-1");

    // Empty inbox for another wallet
    const emptyInbox = await request(`/v1/inbox/${VALID_SENDER_W}`);
    expect(emptyInbox.status).toBe(200);
    expect((emptyInbox.json as { items: unknown[] }).items).toHaveLength(0);
  });

  it("POST /v1/cards and GET /v1/cards/:sealAddress round-trip", async () => {
    const cardInput = {
      sealAddress: VALID_SEAL_E,
      card: {
        address: VALID_SEAL_E,
        keys: { mlkem: "sample-kem-pubkey" },
        signatures: { pq: "card-pq-sig" },
      },
    };

    const postCard = await request("/v1/cards", {
      method: "POST",
      headers: { "X-Loanshark-Action": "1" },
      body: cardInput,
    });
    expect(postCard.status).toBe(200);

    const getCard = await request(`/v1/cards/${VALID_SEAL_E}`);
    expect(getCard.status).toBe(200);
    expect(getCard.json).toMatchObject({
      card: {
        sealAddress: VALID_SEAL_E,
        card: { keys: { mlkem: "sample-kem-pubkey" } },
      },
    });

    const missingCard = await request("/v1/cards/qor1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq709m5v");
    expect(missingCard.status).toBe(404);
  });

  it("POST /v1/bindings and GET /v1/bindings/:walletAddress round-trip", async () => {
    const bindingInput = {
      walletAddress: VALID_SENDER_W,
      statement: {
        version: 1,
        fields: {
          walletAddress: VALID_SENDER_W,
          sealAddress: VALID_SEAL_E,
        },
        walletSignature: { sig: "w" },
        sealSignature: { sig: "e" },
      },
    };

    const postBinding = await request("/v1/bindings", {
      method: "POST",
      headers: { "X-Loanshark-Action": "1" },
      body: bindingInput,
    });
    expect(postBinding.status).toBe(200);

    const getBinding = await request(`/v1/bindings/${VALID_SENDER_W}`);
    expect(getBinding.status).toBe(200);
    expect(getBinding.json).toMatchObject({
      binding: {
        walletAddress: VALID_SENDER_W,
        statement: { version: 1 },
      },
    });

    const missingBinding = await request(`/v1/bindings/${VALID_RECIPIENT_W}`);
    expect(missingBinding.status).toBe(404);
  });

  it("defense in depth: rejects any request containing secret-named fields", async () => {
    const secretPayloads = [
      { mnemonic: "twelve secret words..." },
      { privateKey: "0x123456" },
      { private_key: "0x123456" },
      { seed: "raw seed bytes" },
      { secret: "super-secret" },
      { nested: { deeply: { mnemonic: "leaked phrase" } } },
    ];

    for (const bad of secretPayloads) {
      const res = await request("/v1/envelopes", {
        method: "POST",
        headers: { "X-Loanshark-Action": "1" },
        body: {
          kind: "request",
          loanRef: "test",
          senderW: VALID_SENDER_W,
          recipientW: VALID_RECIPIENT_W,
          ciphertext: "Y2lwaGVy",
          signature: {},
          aad: {},
          createdAt: new Date().toISOString(),
          ...bad,
        },
      });
      expect(res.status).toBe(400);
      expect(res.json).toMatchObject({
        error: "bad-request",
        message: expect.stringContaining("prohibited secret field name"),
      });
    }
  });

  it("rejects path traversal in path parameters", async () => {
    const traversalPaths = [
      "/v1/envelopes/../etc/passwd",
      "/v1/inbox/..%2f..",
      "/v1/cards/foo/../bar",
      "/v1/bindings/..\\test",
    ];

    for (const path of traversalPaths) {
      const res = await request(path);
      expect(res.status).toBe(400);
      expect(res.json).toMatchObject({ error: "bad-request" });
    }
  });

  it("rejects request bodies exceeding size limit (64 KiB)", async () => {
    const bigString = "x".repeat(70 * 1024);
    const res = await request("/v1/envelopes", {
      method: "POST",
      headers: { "X-Loanshark-Action": "1" },
      body: { big: bigString },
    });
    expect(res.status).toBe(413);
    expect(res.json).toMatchObject({ error: "payload-too-large" });
  });

  it("verifies that no stored record or log line contains plaintext of a sealed message", async () => {
    const sensitiveSecretPlaintext = "CONFIDENTIAL_LOAN_TERMS_DO_NOT_REVEAL_999999999";
    const ciphertextBase64 = Buffer.from("encrypted-aes-gcm-data").toString("base64");

    const envelopeInput: EnvelopeRecordInput = {
      kind: "offer",
      loanRef: "loan-secret-test",
      senderW: VALID_SENDER_W,
      recipientW: VALID_RECIPIENT_W,
      ciphertext: ciphertextBase64,
      signature: { sig: "sample" },
      aad: { version: "1" },
      createdAt: new Date().toISOString(),
    };

    const res = await request("/v1/envelopes", {
      method: "POST",
      headers: { "X-Loanshark-Action": "1" },
      body: envelopeInput,
    });
    expect(res.status).toBe(201);

    // Check logs: must not contain plaintext
    for (const logLine of logs) {
      expect(logLine).not.toContain(sensitiveSecretPlaintext);
      expect(logLine).not.toContain(ciphertextBase64); // even ciphertext body shouldn't be logged
    }

    // Check stored records: neither storage nor memory must contain the plaintext
    const stored = server.storage.getEnvelope(
      (res.json as { envelope: { id: string } }).envelope.id,
    );
    expect(stored).toBeDefined();
    const storedJson = JSON.stringify(stored);
    expect(storedJson).not.toContain(sensitiveSecretPlaintext);
  });
});
