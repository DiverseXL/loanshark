// SPIKE - exploratory code, not a production API. It exists to answer one
// question with evidence: does a real QoreX `native.signArbitrary` response
// verify with the official verifier, against the account's on-chain ML-DSA-87
// key, with the post-quantum part required?
//
// It is a script, not a library. It prints what it did, and exits non-zero when
// the positive case or any negative control does not behave as stated. The
// production module is src/verify-hybrid-message.ts (Task 5).
//
// Nothing here signs, broadcasts or writes to the chain. Both fixtures are read
// from disk. The ML-DSA-87 public key comes from the on-chain account record,
// never from the signature response.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { MessageSignature } from "@qorechain/qoresign";
import {
  addressFromBytes,
  adr36SignBytes,
  isQoreSignError,
  messagePqSignBytes,
  verifyMessage,
} from "@qorechain/qoresign";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const SIGNATURE_FIXTURE = join(REPO_ROOT, "fixtures", "qorex-signarbitrary.json");
const ACCOUNT_FIXTURE = join(REPO_ROOT, "fixtures", "onchain-account-qor1385.json");

// Recorded in fixtures/qorex-signarbitrary.meta.json. The message text is what
// was asked to be signed; that it is exactly what QoreX signed is the thing
// this spike tests (ASSUMPTION, see the evidence file).
const CHAIN_ID = "qorechain-diana";
const SIGNER = "qor1385wkhky3qkjwq47t8904xrd6s82lmkfjnxxsr";
const MESSAGE = "LOANSHARK test message, no funds";

const hex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

interface AccountRecord {
  account: {
    address: string;
    public_key: string;
    algorithm_id: number;
    algorithm_name: string;
  };
}

/** The outcome of one verifyMessage call: either it returned, or it threw. */
type Attempt = { ok: true } | { ok: false; name: string; code: string; message: string };

const attempt = (fn: () => void): Attempt => {
  try {
    fn();
    return { ok: true };
  } catch (err) {
    if (isQoreSignError(err)) {
      return { ok: false, name: "QoreSignError", code: err.code, message: err.message };
    }
    return {
      ok: false,
      name: err instanceof Error ? err.name : typeof err,
      code: "(not a QoreSignError)",
      message: err instanceof Error ? err.message : String(err),
    };
  }
};

const describe = (label: string, a: Attempt, expected: string): string => {
  if (a.ok) return `${label}: ACCEPTED (expected ${expected})`;
  return `${label}: REJECTED ${a.code} "${a.message}" (expected ${expected})`;
};

let failures = 0;
const check = (label: string, a: Attempt, wantAccepted: boolean, expectedCode?: string): void => {
  const asExpected = wantAccepted
    ? a.ok
    : !a.ok && (expectedCode === undefined || a.code === expectedCode);
  if (!asExpected) failures += 1;
  console.log(describe(label, a, wantAccepted ? "accepted" : (expectedCode ?? "rejected")));
};

const raw = JSON.parse(readFileSync(SIGNATURE_FIXTURE, "utf8")) as Record<string, unknown>;
const accountFile = JSON.parse(readFileSync(ACCOUNT_FIXTURE, "utf8")) as AccountRecord;

// The on-chain key. This is the only ML-DSA-87 key used anywhere below.
const pqPublicKey = new Uint8Array(Buffer.from(accountFile.account.public_key, "base64"));

// The response, unchanged, including the classical-only `pub_key` and
// `signature` fields that the verifier is documented to ignore. The cast is
// only because JSON.parse widens `signatureType` to string.
const signature = raw as unknown as MessageSignature;

// The bytes the verifier builds from source. messagePqSignBytes is
// `UTF-8("qorechain-msg-v1|" + chainId + "|") || data`, and adr36SignBytes is
// the amino document with the base64 message and the signer. Both are imported
// from the verifier so the printed bytes are the ones actually checked.
const pqBytes = messagePqSignBytes(CHAIN_ID, MESSAGE);
const classicalBytes = adr36SignBytes(SIGNER, utf8(MESSAGE));

console.log("== SPIKE: QoreX signArbitrary response verification ==");
console.log(`fixture: ${SIGNATURE_FIXTURE}`);
console.log(`fixture sha256: ${sha256(new Uint8Array(readFileSync(SIGNATURE_FIXTURE)))}`);
console.log(`on-chain account fixture: ${ACCOUNT_FIXTURE}`);
console.log(`account address on chain: ${accountFile.account.address}`);
console.log(
  `account algorithm: id ${accountFile.account.algorithm_id} (${accountFile.account.algorithm_name})`,
);
console.log(`chain id: ${CHAIN_ID}`);
console.log(`signer: ${SIGNER}`);
console.log(`message: ${JSON.stringify(MESSAGE)}`);
console.log(`signatureType in response: ${String(raw["signatureType"])}`);
console.log("");
console.log("-- bytes signed, from the verifier's source --");
console.log(
  'ML-DSA-87: UTF-8("qorechain-msg-v1|" + chain_id + "|") || UTF-8(message), empty context',
);
console.log(`  length: ${pqBytes.length}`);
console.log(`  sha256: ${sha256(pqBytes)}`);
console.log(`  head (hex): ${hex(pqBytes.subarray(0, 40))}`);
console.log("classical: ADR-36 amino document, no whitespace, keys sorted");
console.log(`  length: ${classicalBytes.length}`);
console.log(`  sha256: ${sha256(classicalBytes)}`);
console.log(`  text: ${new TextDecoder().decode(classicalBytes)}`);
console.log("");
console.log("-- positive case: response object passed unchanged, requirePq: true --");
const positive = attempt(() =>
  verifyMessage({
    chainId: CHAIN_ID,
    signer: SIGNER,
    data: MESSAGE,
    signature,
    pqPublicKey,
    requirePq: true,
  }),
);
check("main", positive, true);
console.log(
  positive.ok
    ? "returned object used unchanged: yes, extra top-level pub_key and signature fields were not removed"
    : "returned object used unchanged: yes, and it still threw",
);
console.log("");
console.log("-- negative controls --");

// 1. The post-quantum part is removed. requirePq stays true, so this must be
// refused rather than fall back to the classical part alone.
const withoutPq = { ...raw };
delete withoutPq["pq"];
check(
  "control 1 (pq part removed)",
  attempt(() =>
    verifyMessage({
      chainId: CHAIN_ID,
      signer: SIGNER,
      data: MESSAGE,
      signature: withoutPq as unknown as MessageSignature,
      pqPublicKey,
      requirePq: true,
    }),
  ),
  false,
  "PQ_LAYER_MISSING",
);

// 2. One character of the message changed: trailing "s" to "z".
check(
  "control 2 (message changed by one character)",
  attempt(() =>
    verifyMessage({
      chainId: CHAIN_ID,
      signer: SIGNER,
      data: "LOANSHARK test message, no fundz",
      signature,
      pqPublicKey,
      requirePq: true,
    }),
  ),
  false,
);

// 3. A different chain id. qorechain-vladi is a real QoreChain chain id, listed
// in LEGACY_SIGN_BYTES_CHAINS in @qorechain/pqc 0.2.3. The classical part is
// chain-independent (the ADR-36 doc has chain_id ""), so this isolates the
// chain id binding of the ML-DSA-87 part.
check(
  "control 3 (wrong chain id: qorechain-vladi)",
  attempt(() =>
    verifyMessage({
      chainId: "qorechain-vladi",
      signer: SIGNER,
      data: MESSAGE,
      signature,
      pqPublicKey,
      requirePq: true,
    }),
  ),
  false,
);

// 4. A different signer address. Derived by the verifier's own addressFromBytes
// from 20 fixed bytes, so it is a valid bech32 account address that no key here
// controls. It is a synthetic input for this control and is not claimed to be a
// funded or existing account.
const otherAddress = addressFromBytes(Uint8Array.from({ length: 20 }, (_, i) => i + 1)).bech32;
check(
  `control 4 (signer changed to ${otherAddress})`,
  attempt(() =>
    verifyMessage({
      chainId: CHAIN_ID,
      signer: otherAddress,
      data: MESSAGE,
      signature,
      pqPublicKey,
      requirePq: true,
    }),
  ),
  false,
  "ADDRESS_MISMATCH",
);

console.log("");
console.log(
  failures === 0
    ? "RESULT: all checks behaved as expected"
    : `RESULT: ${failures} check(s) did not behave as expected`,
);
process.exitCode = failures === 0 ? 0 : 1;
