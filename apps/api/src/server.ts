// LOANSHARK ephemeral ciphertext relay server (ADR-0017).
//
// Implemented using Node's standard node:http module with zero external dependencies.
// Stores ciphertext and public data only. Does NOT verify signatures.
// Never logs request or response bodies. Never holds private keys.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { MemoryRelayStorage, type RelayStorage } from "./storage.js";
import type {
  ApiErrorResponse,
  BindingRecordInput,
  CardRecordInput,
  EnvelopeRecordInput,
} from "./types.js";

const MAX_BODY_SIZE = 64 * 1024; // 64 KiB
const SECRET_FIELD_PATTERN = /^(mnemonic|private_?key|seed|secret)$/i;
const QOR1_ADDRESS_PATTERN = /^qor1[0-9a-z]{38,58}$/;
const HEX_ID_PATTERN = /^[0-9a-f]{64}$/;

export interface RelayServerOptions {
  storage?: RelayStorage | undefined;
  port?: number | undefined;
  host?: string | undefined;
  allowedHosts?: string[] | undefined;
  allowedOrigins?: string[] | undefined;
  rateLimitMax?: number | undefined; // max requests per minute per IP
  rateLimitWindowMs?: number | undefined;
  logFn?: ((line: string) => void) | undefined;
}

export function findSecretField(value: unknown): string | null {
  if (value === null || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findSecretField(item);
      if (found) return found;
    }
    return null;
  }
  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (SECRET_FIELD_PATTERN.test(key)) {
      return key;
    }
    const found = findSecretField(obj[key]);
    if (found) return found;
  }
  return null;
}

export class RelayServer {
  readonly server: Server;
  readonly storage: RelayStorage;
  private readonly allowedHosts: Set<string>;
  private readonly allowedOrigins: Set<string>;
  private readonly rateLimitMax: number;
  private readonly rateLimitWindowMs: number;
  private readonly rateLimits = new Map<string, { count: number; resetAt: number }>();
  private readonly logFn?: ((line: string) => void) | undefined;

  constructor(options: RelayServerOptions = {}) {
    this.storage = options.storage ?? new MemoryRelayStorage();
    this.allowedHosts = new Set(
      (options.allowedHosts ?? ["localhost", "127.0.0.1", "localhost:5173", "127.0.0.1:5173"]).map(
        (h) => h.toLowerCase(),
      ),
    );
    this.allowedOrigins = new Set(
      options.allowedOrigins ?? ["http://localhost:5173", "http://127.0.0.1:5173"],
    );
    this.rateLimitMax = options.rateLimitMax ?? 200;
    this.rateLimitWindowMs = options.rateLimitWindowMs ?? 60_000;
    this.logFn = options.logFn;

    this.server = createServer((req, res) => {
      this.handleRequest(req, res);
    });
  }

  private sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
    const json = JSON.stringify(data);
    res.writeHead(statusCode, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": Buffer.byteLength(json),
    });
    res.end(json);
  }

  private sendError(res: ServerResponse, statusCode: number, error: string, message: string): void {
    const body: ApiErrorResponse = { error, message };
    this.sendJson(res, statusCode, body);
  }

  private setFixedHeaders(req: IncomingMessage, res: ServerResponse): boolean {
    // Fixed security headers on every response
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Security-Policy", "default-src 'none'");

    // CORS handling: allowed origin only, never wildcard
    const origin = req.headers.origin;
    if (origin) {
      if (this.allowedOrigins.has(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Loanshark-Action");
        res.setHeader("Access-Control-Max-Age", "86400");
      } else {
        this.sendError(res, 403, "forbidden", `origin '${origin}' is not allowed`);
        return false;
      }
    }
    return true;
  }

  private checkHost(req: IncomingMessage, res: ServerResponse): boolean {
    const rawHost = req.headers.host;
    if (!rawHost) {
      this.sendError(res, 400, "bad-request", "missing Host header");
      return false;
    }
    const host = rawHost.toLowerCase();
    // Allow either exact match or hostname without port match
    const hostname = host.split(":")[0] ?? "";
    if (!this.allowedHosts.has(host) && !this.allowedHosts.has(hostname)) {
      this.sendError(res, 400, "bad-request", `host '${rawHost}' is not allowed`);
      return false;
    }
    return true;
  }

  private checkRateLimit(req: IncomingMessage, res: ServerResponse): boolean {
    const ip = req.socket.remoteAddress ?? "unknown";
    const now = Date.now();
    const entry = this.rateLimits.get(ip);
    if (!entry || now > entry.resetAt) {
      this.rateLimits.set(ip, { count: 1, resetAt: now + this.rateLimitWindowMs });
      return true;
    }
    entry.count += 1;
    if (entry.count > this.rateLimitMax) {
      this.sendError(res, 429, "rate-limited", "too many requests, please slow down");
      return false;
    }
    return true;
  }

  private async readBodyJson(req: IncomingMessage, res: ServerResponse): Promise<unknown | null> {
    const contentLength = req.headers["content-length"];
    if (contentLength && Number.parseInt(contentLength, 10) > MAX_BODY_SIZE) {
      this.sendError(
        res,
        413,
        "payload-too-large",
        `request body exceeds maximum size of ${MAX_BODY_SIZE} bytes`,
      );
      return null;
    }

    const chunks: Buffer[] = [];
    let totalLength = 0;

    for await (const chunk of req) {
      totalLength += (chunk as Buffer).length;
      if (totalLength > MAX_BODY_SIZE) {
        this.sendError(
          res,
          413,
          "payload-too-large",
          `request body exceeds maximum size of ${MAX_BODY_SIZE} bytes`,
        );
        return null;
      }
      chunks.push(chunk as Buffer);
    }

    const rawText = Buffer.concat(chunks).toString("utf-8");
    if (!rawText.trim()) {
      this.sendError(res, 400, "bad-request", "request body is empty");
      return null;
    }

    try {
      return JSON.parse(rawText);
    } catch {
      this.sendError(res, 400, "bad-request", "invalid JSON in request body");
      return null;
    }
  }

  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const start = Date.now();
    const method = req.method ?? "GET";
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const pathname = url.pathname;

    res.on("finish", () => {
      const duration = Date.now() - start;
      // Log method, path, status, and duration ONLY. Never bodies.
      if (this.logFn) {
        this.logFn(
          `[${new Date().toISOString()}] ${method} ${pathname} ${res.statusCode} (${duration}ms)`,
        );
      }
    });

    // Path traversal check on raw URL before normalization
    const rawUrl = req.url ?? "/";
    if (rawUrl.includes("..") || rawUrl.includes("//") || rawUrl.includes("\\")) {
      this.sendError(res, 400, "bad-request", "path traversal detected");
      return;
    }

    if (!this.setFixedHeaders(req, res)) return;
    if (!this.checkHost(req, res)) return;
    if (!this.checkRateLimit(req, res)) return;

    if (method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // Protect write endpoints against CSRF with required custom header
    if (method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE") {
      const customHeader = req.headers["x-loanshark-action"];
      if (!customHeader || (typeof customHeader === "string" && !customHeader.trim())) {
        this.sendError(
          res,
          403,
          "forbidden",
          "missing required X-Loanshark-Action header on write",
        );
        return;
      }
    }

    this.route(req, res, method, pathname);
  }

  private async route(
    req: IncomingMessage,
    res: ServerResponse,
    method: string,
    pathname: string,
  ): Promise<void> {
    // 1. POST /v1/envelopes
    if (method === "POST" && pathname === "/v1/envelopes") {
      const body = await this.readBodyJson(req, res);
      if (body === null) return;

      const secretKey = findSecretField(body);
      if (secretKey) {
        this.sendError(
          res,
          400,
          "bad-request",
          `request contains prohibited secret field name: ${secretKey}`,
        );
        return;
      }

      if (typeof body !== "object" || body === null || Array.isArray(body)) {
        this.sendError(res, 400, "bad-request", "request body must be an object");
        return;
      }

      const input = body as Record<string, unknown>;
      const kind = input["kind"];
      const loanRef = input["loanRef"];
      const senderW = input["senderW"];
      const recipientW = input["recipientW"];
      const ciphertext = input["ciphertext"];
      const signature = input["signature"];
      const aad = input["aad"];
      const createdAt = input["createdAt"];

      if (kind !== "request" && kind !== "offer") {
        this.sendError(res, 400, "bad-request", "kind must be 'request' or 'offer'");
        return;
      }
      if (typeof loanRef !== "string" || !loanRef.trim()) {
        this.sendError(res, 400, "bad-request", "loanRef is required");
        return;
      }
      if (typeof senderW !== "string" || !QOR1_ADDRESS_PATTERN.test(senderW)) {
        this.sendError(res, 400, "bad-request", "senderW must be a valid qor1 address");
        return;
      }
      if (typeof recipientW !== "string" || !QOR1_ADDRESS_PATTERN.test(recipientW)) {
        this.sendError(res, 400, "bad-request", "recipientW must be a valid qor1 address");
        return;
      }
      if (typeof ciphertext !== "string" || !ciphertext.trim()) {
        this.sendError(res, 400, "bad-request", "ciphertext is required");
        return;
      }
      if (typeof signature !== "object" || signature === null) {
        this.sendError(res, 400, "bad-request", "signature object is required");
        return;
      }
      if (typeof aad !== "object" || aad === null) {
        this.sendError(res, 400, "bad-request", "aad context object is required");
        return;
      }
      if (typeof createdAt !== "string" || !createdAt.trim()) {
        this.sendError(res, 400, "bad-request", "createdAt timestamp is required");
        return;
      }

      const record: EnvelopeRecordInput = {
        kind,
        loanRef,
        senderW,
        recipientW,
        ciphertext,
        signature: signature as Record<string, unknown>,
        aad: aad as Record<string, unknown>,
        createdAt,
      };

      const stored = this.storage.insertEnvelope(record);
      this.sendJson(res, 201, { envelope: stored });
      return;
    }

    // 2. GET /v1/envelopes/:id
    if (method === "GET" && pathname.startsWith("/v1/envelopes/")) {
      const id = pathname.slice("/v1/envelopes/".length);
      if (!HEX_ID_PATTERN.test(id)) {
        this.sendError(res, 400, "bad-request", "invalid envelope id; must be 64-char hex");
        return;
      }
      const record = this.storage.getEnvelope(id);
      if (!record) {
        this.sendError(res, 404, "not-found", `envelope '${id}' not found`);
        return;
      }
      this.sendJson(res, 200, { envelope: record });
      return;
    }

    // 3. GET /v1/inbox/:walletAddress
    if (method === "GET" && pathname.startsWith("/v1/inbox/")) {
      const walletAddress = pathname.slice("/v1/inbox/".length);
      if (!QOR1_ADDRESS_PATTERN.test(walletAddress)) {
        this.sendError(res, 400, "bad-request", "invalid wallet address");
        return;
      }
      const items = this.storage.getInbox(walletAddress);
      this.sendJson(res, 200, { items });
      return;
    }

    // 4. POST /v1/cards
    if (method === "POST" && pathname === "/v1/cards") {
      const body = await this.readBodyJson(req, res);
      if (body === null) return;

      const secretKey = findSecretField(body);
      if (secretKey) {
        this.sendError(
          res,
          400,
          "bad-request",
          `request contains prohibited secret field name: ${secretKey}`,
        );
        return;
      }

      if (typeof body !== "object" || body === null || Array.isArray(body)) {
        this.sendError(res, 400, "bad-request", "request body must be an object");
        return;
      }

      const input = body as Record<string, unknown>;
      const sealAddress = input["sealAddress"];
      const card = input["card"];

      if (typeof sealAddress !== "string" || !QOR1_ADDRESS_PATTERN.test(sealAddress)) {
        this.sendError(res, 400, "bad-request", "sealAddress must be a valid qor1 address");
        return;
      }
      if (typeof card !== "object" || card === null || Array.isArray(card)) {
        this.sendError(res, 400, "bad-request", "card object is required");
        return;
      }

      const record: CardRecordInput = {
        sealAddress,
        card: card as Record<string, unknown>,
      };
      const stored = this.storage.putCard(record);
      this.sendJson(res, 200, { card: stored });
      return;
    }

    // 5. GET /v1/cards/:sealAddress
    if (method === "GET" && pathname.startsWith("/v1/cards/")) {
      const sealAddress = pathname.slice("/v1/cards/".length);
      if (!QOR1_ADDRESS_PATTERN.test(sealAddress)) {
        this.sendError(res, 400, "bad-request", "invalid seal address");
        return;
      }
      const stored = this.storage.getCard(sealAddress);
      if (!stored) {
        this.sendError(res, 404, "not-found", `recipient card for '${sealAddress}' not found`);
        return;
      }
      this.sendJson(res, 200, { card: stored });
      return;
    }

    // 6. POST /v1/bindings
    if (method === "POST" && pathname === "/v1/bindings") {
      const body = await this.readBodyJson(req, res);
      if (body === null) return;

      const secretKey = findSecretField(body);
      if (secretKey) {
        this.sendError(
          res,
          400,
          "bad-request",
          `request contains prohibited secret field name: ${secretKey}`,
        );
        return;
      }

      if (typeof body !== "object" || body === null || Array.isArray(body)) {
        this.sendError(res, 400, "bad-request", "request body must be an object");
        return;
      }

      const input = body as Record<string, unknown>;
      const walletAddress = input["walletAddress"];
      const statement = input["statement"];

      if (typeof walletAddress !== "string" || !QOR1_ADDRESS_PATTERN.test(walletAddress)) {
        this.sendError(res, 400, "bad-request", "walletAddress must be a valid qor1 address");
        return;
      }
      if (typeof statement !== "object" || statement === null || Array.isArray(statement)) {
        this.sendError(res, 400, "bad-request", "statement object is required");
        return;
      }

      const record: BindingRecordInput = {
        walletAddress,
        statement: statement as Record<string, unknown>,
      };
      const stored = this.storage.putBinding(record);
      this.sendJson(res, 200, { binding: stored });
      return;
    }

    // 7. GET /v1/bindings/:walletAddress
    if (method === "GET" && pathname.startsWith("/v1/bindings/")) {
      const walletAddress = pathname.slice("/v1/bindings/".length);
      if (!QOR1_ADDRESS_PATTERN.test(walletAddress)) {
        this.sendError(res, 400, "bad-request", "invalid wallet address");
        return;
      }
      const stored = this.storage.getBinding(walletAddress);
      if (!stored) {
        this.sendError(res, 404, "not-found", `binding statement for '${walletAddress}' not found`);
        return;
      }
      this.sendJson(res, 200, { binding: stored });
      return;
    }

    // 404 for unknown endpoints
    this.sendError(res, 404, "not-found", `unrecognized endpoint: ${method} ${pathname}`);
  }

  listen(port = 0, host = "127.0.0.1"): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server.listen(port, host, () => {
        const addr = this.server.address();
        if (typeof addr === "object" && addr !== null) {
          resolve(addr.port);
        } else {
          reject(new Error("could not determine server port"));
        }
      });
      this.server.on("error", reject);
    });
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.storage.close();
      this.server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}
