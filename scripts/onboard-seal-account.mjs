#!/usr/bin/env node
// Owner-run onboarding for the app-held seal account E (ADR-0004, ADR-0014).
//
// The script derives E from LOANSHARK_SEAL_MNEMONIC and prints only public data.
// It is dry-run by default: it reads the account, the ML-DSA-87 status and the
// KEM status from the testnet REST endpoint, writes the raw responses and the
// public recipient card to fixtures-out/, and signs and sends nothing.
//
// `--execute` additionally registers a missing ML-DSA-87 key with a
// classical-only transaction and a missing or changed ML-KEM-1024 key with a
// hybrid transaction. It asks for an exact typed confirmation first. It refuses
// every chain except qorechain-diana and every REST endpoint except the public
// testnet, and it reads the mnemonic only from the environment. It never prints
// the mnemonic and never writes it to the report.
//
// Usage:
//   LOANSHARK_SEAL_MNEMONIC="..." node scripts/onboard-seal-account.mjs
//   LOANSHARK_SEAL_MNEMONIC="..." node scripts/onboard-seal-account.mjs --execute
//   node scripts/onboard-seal-account.mjs --help

import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

export const ALLOWED_CHAIN_ID = "qorechain-diana";
export const ALLOWED_REST = "https://api-testnet.qore.host";
export const REPORT_DIRECTORY = "fixtures-out";

const HELP = `LOANSHARK seal account onboarding (owner-run)

Usage:
  node scripts/onboard-seal-account.mjs [--dry-run | --execute]
  node scripts/onboard-seal-account.mjs --help

Options:
  --dry-run   Read-only. Derive and display public data, read the account and
              both key registrations, write the report. This is the default.
  --execute   Register a missing ML-DSA-87 key (classicalOnly) and a missing or
              changed ML-KEM-1024 key (hybrid). Requires typing an exact
              confirmation and a terminal on stdin. Signs and broadcasts only
              on qorechain-diana.
  --help, -h  Print this text.

Environment:
  LOANSHARK_SEAL_MNEMONIC   Required unless --help. The seal account's BIP-39
                            phrase. Read once, never printed, never written.
  LOANSHARK_SEAL_CHAIN_ID   Optional. Must be ${ALLOWED_CHAIN_ID}.
  LOANSHARK_SEAL_REST       Optional. Must be ${ALLOWED_REST}.

Safety:
  The seal account is a full account. Fund it with only the testnet QOR needed
  for registration, and never reuse the QoreX wallet mnemonic. No result is
  recorded automatically; the owner copies what the checklist asks for.
`;

const normalize = (value) => value.normalize("NFKD").trim().split(/\s+/).join(" ");

/** Parses arguments without touching the environment or the network. */
export function parseArgs(argv) {
  const options = { help: false, execute: false, dryRun: false };
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--execute") options.execute = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (options.dryRun && options.execute) {
    throw new Error("choose one of --dry-run and --execute");
  }
  return options;
}

/** Validates the chain, the REST endpoint and the environment mnemonic. */
export function resolveConfig(env) {
  const chainId = env.LOANSHARK_SEAL_CHAIN_ID ?? ALLOWED_CHAIN_ID;
  if (chainId !== ALLOWED_CHAIN_ID) {
    throw new Error(`refusing chain ${chainId}: this script only runs on ${ALLOWED_CHAIN_ID}`);
  }
  const rest = (env.LOANSHARK_SEAL_REST ?? ALLOWED_REST).replace(/\/+$/, "");
  if (rest !== ALLOWED_REST) {
    throw new Error(`refusing REST endpoint ${rest}: this script only reads ${ALLOWED_REST}`);
  }
  const raw = env.LOANSHARK_SEAL_MNEMONIC;
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new Error(
      "set LOANSHARK_SEAL_MNEMONIC to the seal account's BIP-39 phrase (or use --help)",
    );
  }
  return { chainId, rest, mnemonic: normalize(raw) };
}

/** Removes the phrase from any text before it is printed or written. */
export function redactText(value, secret) {
  const text = typeof value === "string" ? value : String(value);
  if (typeof secret !== "string" || secret.length === 0) return text;
  return text.split(secret).join("[redacted]");
}

/** Refuses to write a report that contains the phrase. */
export function assertNoSecret(text, secret) {
  if (typeof secret === "string" && secret.length > 0 && text.includes(secret)) {
    throw new Error("refusing to write a report containing the mnemonic");
  }
}

export function assertExecuteConfirmation(answer, address) {
  const expected = `REGISTER ${address}`;
  if (answer.trim() !== expected) {
    throw new Error(`confirmation did not match: type "${expected}" exactly`);
  }
  return expected;
}

export const reportName = (address, now = new Date()) =>
  `seal-onboarding-${address}-${now.toISOString().replace(/[:.]/g, "-")}.json`;

const jsonSafe = (value) =>
  JSON.parse(
    JSON.stringify(value, (_key, item) =>
      typeof item === "bigint" ? item.toString() : item instanceof Uint8Array ? undefined : item,
    ),
  );

async function readJson(rest, path, secret) {
  const url = `${rest}${path}`;
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = redactText(text, secret);
    }
    return { url, status: response.status, ok: response.ok, body };
  } catch (error) {
    return {
      url,
      status: 0,
      ok: false,
      body: null,
      error: redactText(error instanceof Error ? error.message : String(error), secret),
    };
  }
}

const accountInfoOf = (read) => read.body?.info ?? null;

const pqStatusOf = (read) => {
  if (!read.ok) return { registered: false, note: `HTTP ${read.status}` };
  if (read.body?.found === false) return { registered: false };
  const account = read.body?.account;
  if (!account) return { registered: false, note: "no account object" };
  return {
    registered: typeof account.public_key === "string" && account.public_key.length > 0,
    algorithmId: account.algorithm_id,
    keyType: account.key_type,
    possessionProven: account.possession_proven === true,
    publicKeyBase64: account.public_key ?? null,
  };
};

const kemStatusOf = (read) => {
  if (!read.ok) return { registered: false, note: `HTTP ${read.status}` };
  if (read.body?.found === false) return { registered: false };
  const key = read.body?.key;
  if (!key) return { registered: false, note: "no key object" };
  return {
    registered: typeof key.public_key === "string" && key.public_key.length > 0,
    algorithmId: key.algorithm_id,
    algorithmName: key.algorithm_name,
    registeredHeight: key.registered_height ?? null,
    publicKeyBase64: key.public_key ?? null,
  };
};

async function loadPackages() {
  // Sequential on purpose: cosmjs-types is CommonJS and requires an ESM
  // dependency, so loading it concurrently with the ESM packages trips a
  // partially-loaded-module race in Node.
  const sealAccount = await import("@loanshark/seal-account");
  const qoresign = await import("@qorechain/qoresign");
  const qoresignNetwork = await import("@qorechain/qoresign/network");
  const qoreseal = await import("@qorechain/qoreseal");
  const qoresealNetwork = await import("@qorechain/qoreseal/network");
  const tx = await import("cosmjs-types/cosmos/tx/v1beta1/tx");
  const signing = await import("cosmjs-types/cosmos/tx/signing/v1beta1/signing");
  const protoSigning = await import("@cosmjs/proto-signing");
  const amino = await import("@cosmjs/amino");
  return {
    sealAccount,
    qoresign,
    qoresignNetwork,
    qoreseal,
    qoresealNetwork,
    tx,
    signing,
    protoSigning,
    amino,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(HELP);
    return;
  }

  const config = resolveConfig(process.env);
  const packages = await loadPackages().catch((error) => {
    throw new Error(
      `could not load the onboarding dependencies; run "pnpm install" and ` +
        `"pnpm --filter @loanshark/seal-account build" first (${error.message})`,
    );
  });

  const { SealAccountIdentity } = packages.sealAccount;
  const { addressFromPublicKey, toHex } = packages.qoresign;
  const identity = SealAccountIdentity.fromMnemonic({
    mnemonic: config.mnemonic,
    chainId: config.chainId,
  });
  const publicData = identity.publicData();
  const card = identity.recipientCard();
  const evmForm = addressFromPublicKey(publicData.classicalPublicKey, "eth_secp256k1").hex;
  const mode = options.execute ? "execute" : "dry-run";

  console.log("LOANSHARK seal account onboarding");
  console.log(`mode: ${mode}`);
  console.log(`chain: ${config.chainId}`);
  console.log(`rest: ${config.rest}`);
  console.log("");
  console.log("1. Public identity (derived offline)");
  console.log(`   qor1 address: ${publicData.address}`);
  console.log(`   address hex:  ${publicData.addressHex}`);
  console.log(`   EVM form:     ${evmForm}`);
  console.log(`   classical key (hex): ${toHex(publicData.classicalPublicKey)}`);
  console.log(`   ML-DSA-87 SHA3: ${publicData.hashes.mlDsaSha3}`);
  console.log(`   ML-KEM SHA3:    ${publicData.hashes.mlkemSha3}`);
  console.log(`   X25519 key (hex): ${publicData.hashes.x25519}`);
  console.log("");

  console.log("2. Read-only preflight");
  const reads = {
    account: await readJson(
      config.rest,
      `/cosmos/auth/v1beta1/account_info/${publicData.address}`,
      config.mnemonic,
    ),
    balances: await readJson(
      config.rest,
      `/cosmos/bank/v1beta1/balances/${publicData.address}`,
      config.mnemonic,
    ),
    pq: await readJson(
      config.rest,
      `/qorechain/pqc/v1/account/${publicData.address}`,
      config.mnemonic,
    ),
    kem: await readJson(
      config.rest,
      `/qorechain/pqc/v1/kem/${publicData.address}`,
      config.mnemonic,
    ),
  };

  const accountInfo = accountInfoOf(reads.account);
  const pq = pqStatusOf(reads.pq);
  const kem = kemStatusOf(reads.kem);
  console.log(`   account: ${accountInfo ? "exists on chain" : "not found"}`);
  console.log(
    `   ML-DSA-87: ${pq.registered ? `registered (${pq.keyType ?? "unknown type"})` : "not registered"}`,
  );
  console.log(
    `   ML-KEM-1024: ${kem.registered ? `registered (${kem.algorithmName ?? "unknown algorithm"})` : "not registered"}`,
  );
  if (!accountInfo) {
    console.log("   next: fund the address from the testnet faucet before --execute");
  }
  console.log("");

  const report = {
    generatedAt: new Date().toISOString(),
    mode,
    chainId: config.chainId,
    rest: config.rest,
    identity: identity.toJSON(),
    evmForm,
    card,
    reads,
    interpretation: { accountInfo, pq, kem },
  };
  const reportText = JSON.stringify(jsonSafe(report), null, 2);
  assertNoSecret(reportText, config.mnemonic);
  const path = join(REPORT_DIRECTORY, reportName(publicData.address));
  await mkdir(REPORT_DIRECTORY, { recursive: true });
  await writeFile(path, `${reportText}\n`, { encoding: "utf8", mode: 0o600 });
  console.log(`   wrote ${path} (public data and raw responses only)`);
  console.log("");

  if (!options.execute) {
    console.log("3. Registration steps: skipped (dry-run)");
    console.log("4. Recipient card: generated offline, not published");
    console.log("");
    console.log("Nothing was signed and nothing was sent. Re-run with --execute to register.");
    console.log("Recipient card (public JSON):");
    console.log(JSON.stringify(card, null, 2));
    return;
  }

  if (process.stdin.isTTY !== true) {
    throw new Error("--execute needs an interactive terminal for the typed confirmation");
  }
  if (!accountInfo) {
    throw new Error(
      "the seal account does not exist on chain yet: fund it from the testnet faucet first",
    );
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let answer;
  try {
    answer = await rl.question(`Type "REGISTER ${publicData.address}" to register: `);
  } finally {
    rl.close();
  }
  assertExecuteConfirmation(answer, publicData.address);

  const { fetchPqKeyStatus, broadcastTx, simulateTx, submitWithSignBytesFallback } =
    packages.qoresignNetwork;
  const { buildRegisterPqKeyMessage, signHybrid } = packages.qoresign;
  const { buildRegisterKemKeyMessage, describeKemRegistryError } = packages.qoreseal;
  const { fetchKemKey } = packages.qoresealNetwork;
  const { TxBody } = packages.tx;
  const { SignMode } = packages.signing;
  const { encodePubkey, makeAuthInfoBytes } = packages.protoSigning;
  const { encodeSecp256k1Pubkey } = packages.amino;

  const classical = identity.useMnemonic((mnemonic) => {
    const derived = packages.qoresign.deriveClassicalKey({ mnemonic });
    return derived;
  });
  const pqKey = identity.useMnemonic((mnemonic) => {
    const derived = packages.qoresign.deriveCanonicalPqKey({
      mnemonic,
      address: publicData.address,
    });
    return derived;
  });

  const rawAccountInfo = async () => {
    const read = await readJson(
      config.rest,
      `/cosmos/auth/v1beta1/account_info/${publicData.address}`,
      config.mnemonic,
    );
    const info = accountInfoOf(read);
    if (!info) throw new Error("account not found on chain");
    return {
      accountNumber: BigInt(info.account_number),
      sequence: BigInt(info.sequence ?? "0"),
    };
  };

  const authInfoBytes = (sequence, gasLimit) =>
    makeAuthInfoBytes(
      [{ pubkey: encodePubkey(encodeSecp256k1Pubkey(classical.publicKey)), sequence }],
      [{ denom: "uqor", amount: ((gasLimit + 9n) / 10n).toString() }],
      Number(gasLimit),
      undefined,
      undefined,
      SignMode.SIGN_MODE_DIRECT,
    );

  const send = async ({ message, mode: signingMode }) => {
    const { accountNumber, sequence } = await rawAccountInfo();
    const bodyBytes = TxBody.encode(TxBody.fromPartial({ messages: [message] })).finish();
    const sign = (gasLimit, signBytesVersion) =>
      signHybrid({
        chainId: config.chainId,
        accountNumber,
        bodyBytes,
        authInfoBytes: authInfoBytes(sequence, gasLimit),
        classicalKey: classical,
        pqKey,
        mode: signingMode,
        ...(signBytesVersion === undefined ? {} : { signBytesVersion }),
      }).txBytes;

    const simulation = await simulateTx({ rest: config.rest, txBytes: sign(600_000n) });
    const gasLimit = simulation.suggestedGasLimit;
    const result =
      signingMode === "hybrid"
        ? await submitWithSignBytesFallback({
            rest: config.rest,
            chainId: config.chainId,
            sign: (version) => sign(gasLimit, version),
          })
        : await broadcastTx({ rest: config.rest, txBytes: sign(gasLimit) });

    if (result.code !== 0) {
      const detail =
        signingMode === "hybrid"
          ? (describeKemRegistryError(result.codespace, result.code) ?? result.log)
          : result.log;
      throw new Error(
        `the chain refused the transaction: ${result.codespace} ${result.code} ${detail}`,
      );
    }
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const committed = await fetch(`${config.rest}/cosmos/tx/v1beta1/txs/${result.txhash}`, {
        signal: AbortSignal.timeout(20_000),
      });
      if (committed.ok) {
        const body = await committed.json();
        return { txhash: result.txhash, height: body?.tx_response?.height ?? null };
      }
      await new Promise((done) => setTimeout(done, 1_500));
    }
    throw new Error(`transaction ${result.txhash} was not committed`);
  };

  console.log("3. ML-DSA-87 registration");
  const currentPq = await fetchPqKeyStatus({ rest: config.rest, address: publicData.address });
  if (currentPq.registered) {
    if (!currentPq.publicKey || toHex(currentPq.publicKey) !== toHex(pqKey.publicKey)) {
      throw new Error("the account has a different ML-DSA-87 key registered; refusing to continue");
    }
    console.log("   already registered with this derivation; nothing to send");
  } else {
    const registered = await send({
      message: buildRegisterPqKeyMessage({
        chainId: config.chainId,
        account: publicData.address,
        pqKey,
        classicalPublicKey: classical.publicKey,
      }),
      mode: "classicalOnly",
    });
    console.log(`   registered: ${registered.txhash} at height ${registered.height ?? "unknown"}`);
  }
  console.log("");

  console.log("4. ML-KEM-1024 registration and recipient card");
  const currentKem = await fetchKemKey({ rest: config.rest, address: publicData.address });
  if (
    currentKem.registered &&
    currentKem.publicKey &&
    toHex(currentKem.publicKey) === toHex(publicData.mlkemPublicKey)
  ) {
    console.log("   already registered with this derivation; nothing to send");
  } else {
    const registered = await send({
      message: buildRegisterKemKeyMessage({
        sender: publicData.address,
        mlkemPublicKey: publicData.mlkemPublicKey,
      }),
      mode: "hybrid",
    });
    console.log(`   registered: ${registered.txhash} at height ${registered.height ?? "unknown"}`);
  }

  const finalPq = await fetchPqKeyStatus({ rest: config.rest, address: publicData.address });
  const finalKem = await fetchKemKey({ rest: config.rest, address: publicData.address });
  if (
    !finalPq.registered ||
    !finalPq.publicKey ||
    toHex(finalPq.publicKey) !== toHex(pqKey.publicKey)
  ) {
    throw new Error("read-back check failed: the ML-DSA-87 key on chain is not this derivation");
  }
  if (
    !finalKem.registered ||
    !finalKem.publicKey ||
    toHex(finalKem.publicKey) !== toHex(publicData.mlkemPublicKey)
  ) {
    throw new Error("read-back check failed: the ML-KEM-1024 key on chain is not this derivation");
  }
  console.log("   read-back check passed for both keys");
  console.log("");
  console.log("Recipient card (public JSON):");
  console.log(JSON.stringify(card, null, 2));
  console.log("");
  console.log("Clear LOANSHARK_SEAL_MNEMONIC from the environment and close this terminal.");
}

const invokedPath = process.argv[1] === undefined ? "" : resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`onboarding failed: ${message}`);
    process.exitCode = 1;
  });
}
