// In-process tests for the public signed confirmation endpoints (ADR-0019).
// The server verifies nothing by design; these tests cover shape, immutability
// and the same refusal rules as the other endpoints.

import { request as httpRequest } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RelayServer } from "../src/server.js";
import { MemoryRelayStorage } from "../src/storage.js";
import type { ConfirmationRecordInput } from "../src/types.js";

const LOAN_ID = `0x${"11".repeat(32)}`;
const HASH = `0x${"22".repeat(32)}`;
const CONTRACT = "0x000000000000000000000000000000000000c0de";
const SIGNER = "qor19rl4cm2hmr8afy4kldpxz3fka4jguq0agt672h";

const valid = (): ConfirmationRecordInput => ({
  loanId: LOAN_ID,
  chainId: "9800",
  verifyingContract: CONTRACT,
  agreementHash: HASH,
  signerW: SIGNER,
  role: "borrower",
  signature: { classical: {}, pq: {} },
  createdAt: "2026-11-26T10:00:00Z",
});

describe("confirmation endpoints", () => {
  let server: RelayServer;
  let port: number;

  beforeEach(async () => {
    server = new RelayServer({
      storage: new MemoryRelayStorage(),
      allowedHosts: ["127.0.0.1"],
      allowedOrigins: ["http://127.0.0.1:5173"],
      rateLimitMax: 100,
    });
    port = await server.listen(0, "127.0.0.1");
  });

  afterEach(async () => {
    await server.close();
  });

  const call = (
    path: string,
    options: { method?: string; body?: unknown } = {},
  ): Promise<{ status: number; json: unknown }> =>
    new Promise((resolve, reject) => {
      const body = options.body === undefined ? undefined : JSON.stringify(options.body);
      const req = httpRequest(
        {
          hostname: "127.0.0.1",
          port,
          path,
          method: options.method ?? "GET",
          headers: {
            Host: `127.0.0.1:${port}`,
            "X-Loanshark-Action": "1",
            ...(body === undefined
              ? {}
              : { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }),
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf8");
            resolve({ status: res.statusCode ?? 0, json: text ? JSON.parse(text) : null });
          });
        },
      );
      req.on("error", reject);
      if (body !== undefined) req.write(body);
      req.end();
    });

  it("stores a confirmation, returns it for its loan and is immutable", async () => {
    const first = await call("/v1/confirmations", { method: "POST", body: valid() });
    expect(first.status).toBe(201);
    const id = (first.json as { confirmation: { id: string } }).confirmation.id;

    const second = await call("/v1/confirmations", { method: "POST", body: valid() });
    expect(second.status).toBe(201);
    expect((second.json as { confirmation: { id: string } }).confirmation.id).toBe(id);

    const list = await call(`/v1/confirmations/${LOAN_ID}`);
    expect(list.status).toBe(200);
    expect((list.json as { confirmations: unknown[] }).confirmations).toHaveLength(1);
  });

  it("returns an empty list for an unknown loan", async () => {
    const list = await call(`/v1/confirmations/0x${"ff".repeat(32)}`);
    expect(list.status).toBe(200);
    expect((list.json as { confirmations: unknown[] }).confirmations).toEqual([]);
  });

  it("refuses a malformed field, a bad role and a malformed loan id", async () => {
    expect(
      (await call("/v1/confirmations", { method: "POST", body: { ...valid(), role: "bank" } }))
        .status,
    ).toBe(400);
    expect(
      (await call("/v1/confirmations", { method: "POST", body: { ...valid(), loanId: "0x12" } }))
        .status,
    ).toBe(400);
    expect(
      (await call("/v1/confirmations", { method: "POST", body: { ...valid(), chainId: "98 00" } }))
        .status,
    ).toBe(400);
    expect((await call("/v1/confirmations/nope")).status).toBe(400);
  });

  it("refuses a secret-named field in a confirmation", async () => {
    const response = await call("/v1/confirmations", {
      method: "POST",
      body: { ...valid(), mnemonic: "x" },
    });
    expect(response.status).toBe(400);
  });

  it("requires the write header", async () => {
    const response = await new Promise<number>((resolve, reject) => {
      const body = JSON.stringify(valid());
      const req = httpRequest(
        {
          hostname: "127.0.0.1",
          port,
          path: "/v1/confirmations",
          method: "POST",
          headers: {
            Host: `127.0.0.1:${port}`,
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
          },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        },
      );
      req.on("error", reject);
      req.write(body);
      req.end();
    });
    expect(response).toBe(403);
  });
});
