// Owner-run loopback relay for the negotiation flow (ADR-0017, ADR-0019).
//
// Binds to 127.0.0.1 only, stores ciphertext and public records only, verifies
// nothing and holds no key material. No transaction and no network call leaves
// the machine.
//
// Usage: node scripts/run-relay.mjs [--file path/to/relay.jsonl]
//        pnpm relay

import { MemoryRelayStorage, RelayServer } from "@loanshark/api";

const args = process.argv.slice(2);
const fileIndex = args.indexOf("--file");
const file = fileIndex >= 0 ? args[fileIndex + 1] : undefined;
const port = Number(process.env["PORT"] ?? 8787);

const server = new RelayServer({
  storage: new MemoryRelayStorage(file),
  allowedHosts: ["localhost", "127.0.0.1", "localhost:5173", "127.0.0.1:5173"],
  allowedOrigins: ["http://localhost:5173", "http://127.0.0.1:5173"],
  rateLimitMax: 200,
  logFn: (line) => {
    // Method, path, status and duration only. Never a body.
    console.log(line);
  },
});

const bound = await server.listen(port, "127.0.0.1");
console.log(`LOANSHARK relay listening on http://127.0.0.1:${bound}`);
console.log(file === undefined ? "storage: in memory" : `storage: ${file}`);
console.log("stores ciphertext and public records only; verifies nothing; no transaction path");

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    void server.close().then(() => process.exit(0));
  });
}
