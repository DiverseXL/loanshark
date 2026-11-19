# ADR-0017: Ephemeral ciphertext relay server

Status: Accepted, 2026-11-19

## Context

Borrowers and lenders interact through web applications in their respective browsers. They need a communication channel to discover public recipient cards, exchange encrypted requests and offers, and retrieve binding statements.
Direct peer-to-peer WebRTC connections introduce NAT traversal complexities, signaling dependencies, and availability requirements (both parties must be online simultaneously). A lightweight relay server solves asynchronous message delivery.

## Decision

Create a minimalist relay server (`apps/api`) that stores only public data and ciphertext:

### 1. Endpoints
All endpoints use JSON with strict schema validation and a hard body size limit (64 KiB):
- `POST /v1/envelopes`: Stores an immutable envelope record:
  ```json
  {
    "kind": "request" | "offer",
    "loanRef": "<string>",
    "senderW": "<qor1...>",
    "recipientW": "<qor1...>",
    "ciphertext": "<base64>",
    "signature": { ... },
    "aad": { ... },
    "createdAt": "<ISO8601>"
  }
  ```
  The record is content-addressed by the SHA-256 digest of its canonical JSON serialization (`sha256(canonicalBytes)`). Because it is content-addressed, duplicate posts are idempotent and existing records can never be modified or overwritten.
- `GET /v1/envelopes/:id`: Retrieves an envelope record by its content-addressed SHA-256 identifier.
- `GET /v1/inbox/:walletAddress`: Returns a list of envelope metadata addressed to `walletAddress` (`recipientW === walletAddress`).
- `POST /v1/cards` & `GET /v1/cards/:sealAddress`: Stores and retrieves public recipient cards by seal account address (`E`).
- `POST /v1/bindings` & `GET /v1/bindings/:walletAddress`: Stores and retrieves public W/E binding statements by wallet address (`W`).

### 2. Server trust model and consequences
- **The server never decrypts and never holds private keys.** It sees only ciphertext, public recipient cards, public binding statements, and routing metadata (`loanRef`, `senderW`, `recipientW`, timestamps).
- **The server DOES NOT verify cryptographic signatures.** The server is an untrusted transport relay. All signature verification (post-quantum ML-DSA-87 against on-chain records, ML-KEM recipient card verification, and ADR-0014 binding statements) is performed by the clients.
- **Consequence**: The relay can be spammed with invalid records, mismatched signatures, or fake envelopes. Clients treat every response from the relay as untrusted and verify all cryptographic assertions before accepting or acting on data. Garbage or forged records are rejected by the client-side verifiers.

### 3. Framework and storage engine choices
- **HTTP server framework choice (ASSUMPTION)**: Built using Node's standard `node:http` module without external frameworks (Express/Fastify/Koa).
  - *Reason*: Eliminates third-party dependencies, minimizes attack surface, and complies with the project's strict licence and dependency audit requirements.
- **Storage engine choice (ASSUMPTION)**: An append-only JSON-lines (`.jsonl`) file with atomic writes (and in-memory index for fast queries).
  - *Reason*: Node's built-in `node:sqlite` module (`DatabaseSync`) is classified as `Stability: 1 - Experimental` in Node.js documentation. In keeping with the project instruction to verify whether `node:sqlite` is stable and otherwise use append-only JSON-lines with atomic writes, the server uses append-only JSONL files with atomic file replacement / fsync. This requires zero native binaries and runs portably across environments.

### 4. Security controls and defense in depth
- **Network binding**: Binds to `127.0.0.1` by default (local loopback).
- **Host and Origin allowlist**: Validates `Host` and `Origin` headers against a configurable allowlist.
- **Mandatory write header**: Requires the custom header `X-Loanshark-Action: 1` on all `POST` requests to protect against cross-site form submission / CSRF.
- **Strict CORS**: CORS headers are returned only for the configured app origin; wildcard `*` is strictly forbidden.
- **Fixed security headers**:
  - `X-Content-Type-Options: nosniff`
  - `Cache-Control: no-store`
  - `Content-Security-Policy: default-src 'none'`
- **Size and rate limits**: Rejects payloads exceeding 64 KiB with HTTP 413. Simple in-memory per-IP rate limiter prevents denial of service.
- **Secret field ban**: As a defense in depth, the server recursively inspects incoming JSON keys. Any request containing keys named like secrets (`mnemonic`, `privateKey`, `seed`, `secret`) is rejected with HTTP 400 Bad Request.
- **Privacy and logging policy**: The server never logs request or response bodies. Logs contain only HTTP method, sanitized path, HTTP status code, and timestamp. Plaintext data never enters logs or storage.
