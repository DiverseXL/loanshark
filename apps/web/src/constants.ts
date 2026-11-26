// Fixed values for this phase. Every one of them has a recorded source:
//
//   qorechain-diana  source-lock claim 1
//   0x2648           source-lock claim 3 (runtime eth_chainId)
//   REST host        source-lock claim 2
//   EVM host         source-lock claim 4
//   derived address  ADR-0009 (the derivation; the identity link itself is an
//                    ASSUMPTION the owner has not yet confirmed)
//
// The test message is fixed by the phase brief. It is the only message this
// page ever asks the wallet to sign.
export const NATIVE_CHAIN_ID = "qorechain-diana";
export const EVM_CHAIN_ID = "0x2648";
export const EVM_CHAIN_ID_DECIMAL = 9800;
export const REST_HOST = "https://api-testnet.qore.host";
export const EVM_RPC_HOST = "https://evm-testnet.qore.host";
export const ACCOUNT_PATH = "/qorechain/pqc/v1/account";
export const DERIVED_EVM_ADDRESS = "0xd0a1453c7b8157aa0635076c33b3e24a50a923c5";
export const TEST_MESSAGE = "LOANSHARK test message, no funds";

// Build-time relay URL. The loopback default matches the local relay server;
// no other host is allowed by the content security policy.
export const RELAY_URL =
  (import.meta.env["VITE_RELAY_URL"] as string | undefined) ?? "http://127.0.0.1:8787";

// The signer used by the fourth negative control. It is synthetic, derived by
// the verifier's own addressFromBytes from the 20 bytes 0x01..0x14, exactly as
// recorded in docs/evidence/phase-01-result.md. It is not claimed to exist.
export const CONTROL_SIGNER = "qor1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5tfman7";
