// The W/E binding statement (ADR-0014).
//
// Wallet account W (QoreX) and seal account E (app-held) are separate accounts.
// A statement binds them, signed by both:
//   - W signs the fixed-line text with QoreX signArbitrary;
//   - E countersigns it with QoreSign signMessage (the hybrid message signature).
//
// Verification requires the post-quantum part of both signatures against each
// account's on-chain ML-DSA-87 key. It also derives the Ethereum-form address
// of W's verified secp256k1 public key and requires it to equal the recorded
// `walletEvmAddress`. That proves the address is the 0x form of the signing
// key; the ADR-0009 assumption (QoreX's EVM lane uses that key) still applies.

import type { PqcAccountReader } from "@loanshark/chain-client";
import { verifyHybridMessage } from "@loanshark/chain-client";
import type { MessageSignature } from "@qorechain/qoresign";
import {
  addressFromBytes,
  addressFromPublicKey,
  fromBase64,
  fromHex,
  parseAddress,
} from "@qorechain/qoresign";
import type { SealAccountIdentity } from "./identity.js";

export const BINDING_STATEMENT_DOMAIN = "LOANSHARK account binding v1";
export const BINDING_STATEMENT_VERSION = 1;

/** Default and maximum lifetimes. Project choices, not chain parameters. */
export const DEFAULT_BINDING_LIFETIME_DAYS = 30;
export const MAX_BINDING_LIFETIME_DAYS = 90;
/** Tolerated clock skew for a statement issued in the near future. */
export const BINDING_CLOCK_SKEW_MINUTES = 5;

const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
// No whitespace or newline, so a chain id cannot shift the fixed-line layout.
const CHAIN_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export interface BindingStatementFields {
  readonly chainId: string;
  readonly walletAddress: string;
  readonly sealAddress: string;
  readonly walletEvmAddress: string;
  readonly issuedAt: string;
  readonly expiry: string;
}

export interface BindingStatement {
  readonly version: typeof BINDING_STATEMENT_VERSION;
  readonly fields: BindingStatementFields;
  /** Raw QoreX signArbitrary response. Treated as untrusted input. */
  readonly walletSignature: unknown;
  /** QoreSign message signature produced by the seal account. */
  readonly sealSignature: MessageSignature;
}

export type BindingStatementFailureCode =
  | "invalid-statement"
  | "not-yet-valid"
  | "expired"
  | "wallet-signature-invalid"
  | "seal-signature-invalid"
  | "evm-address-mismatch";

export type BindingVerification =
  | {
      readonly ok: true;
      readonly value: {
        readonly chainId: string;
        readonly walletAddress: string;
        readonly sealAddress: string;
        readonly walletEvmAddress: string;
        readonly issuedAt: string;
        readonly expiry: string;
        readonly walletPqPublicKeyLength: number;
        readonly sealPqPublicKeyLength: number;
      };
    }
  | {
      readonly ok: false;
      readonly code: BindingStatementFailureCode;
      readonly message: string;
      readonly verifierCode?: string;
    };

const fail = (
  code: BindingStatementFailureCode,
  message: string,
  verifierCode?: string,
): BindingVerification =>
  verifierCode === undefined
    ? { ok: false, code, message }
    : { ok: false, code, message, verifierCode };

const canonicalQor1 = (value: unknown, name: string): string => {
  if (typeof value !== "string" || !value.startsWith("qor1")) {
    throw new TypeError(`${name} must be a qor1 address`);
  }
  const canonical = parseAddress(value).bech32;
  if (canonical !== value) throw new TypeError(`${name} must be the canonical qor1 address`);
  return canonical;
};

const canonicalEvmAddress = (value: unknown): string => {
  if (typeof value !== "string" || !EVM_ADDRESS_RE.test(value)) {
    throw new TypeError("walletEvmAddress must be 0x followed by 40 hex characters");
  }
  return addressFromBytes(fromHex(value)).hex;
};

export const formatTimestamp = (value: Date): string =>
  value.toISOString().replace(/\.\d{3}Z$/, "Z");

const parseTimestamp = (value: unknown, name: string): Date => {
  if (typeof value !== "string" || !TIMESTAMP_RE.test(value)) {
    throw new TypeError(`${name} must be YYYY-MM-DDTHH:MM:SSZ`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || formatTimestamp(date) !== value) {
    throw new TypeError(`${name} is not a valid UTC timestamp`);
  }
  return date;
};

const requireChainId = (value: unknown): string => {
  if (typeof value !== "string" || !CHAIN_ID_RE.test(value)) {
    throw new TypeError("chainId must be a non-empty chain id without whitespace");
  }
  return value;
};

/**
 * Validates and normalises fields. Addresses are canonicalised (qor1 form and
 * EIP-55 0x form), so the signed text is stable. Throws TypeError on bad input.
 */
export function createBindingStatementFields(args: {
  chainId: string;
  walletAddress: string;
  sealAddress: string;
  walletEvmAddress: string;
  /** Defaults to now. */
  issuedAt?: Date;
  /** Defaults to issuedAt plus 30 days. */
  expiry?: Date;
}): BindingStatementFields {
  const chainId = requireChainId(args.chainId);
  const walletAddress = canonicalQor1(args.walletAddress, "walletAddress");
  const sealAddress = canonicalQor1(args.sealAddress, "sealAddress");
  const walletEvmAddress = canonicalEvmAddress(args.walletEvmAddress);
  const issued = args.issuedAt ?? new Date();
  const issuedAt = formatTimestamp(issued);
  const expiryDate =
    args.expiry ?? new Date(issued.getTime() + DEFAULT_BINDING_LIFETIME_DAYS * 24 * 60 * 60 * 1000);
  const expiry = formatTimestamp(expiryDate);
  if (expiryDate.getTime() <= issued.getTime()) {
    throw new TypeError("expiry must be after issuedAt");
  }
  if (expiryDate.getTime() - issued.getTime() > MAX_BINDING_LIFETIME_DAYS * 24 * 60 * 60 * 1000) {
    throw new TypeError(`a binding statement may last at most ${MAX_BINDING_LIFETIME_DAYS} days`);
  }
  return Object.freeze({ chainId, walletAddress, sealAddress, walletEvmAddress, issuedAt, expiry });
}

/**
 * The exact UTF-8 text both accounts sign. Re-validates every field, so a
 * caller cannot inject a newline or shift the layout.
 */
export function bindingStatementText(fields: BindingStatementFields): string {
  const chainId = requireChainId(fields.chainId);
  const walletAddress = canonicalQor1(fields.walletAddress, "walletAddress");
  const sealAddress = canonicalQor1(fields.sealAddress, "sealAddress");
  const walletEvmAddress = canonicalEvmAddress(fields.walletEvmAddress);
  parseTimestamp(fields.issuedAt, "issuedAt");
  parseTimestamp(fields.expiry, "expiry");
  return [
    BINDING_STATEMENT_DOMAIN,
    `Chain ID: ${chainId}`,
    `Wallet account: ${walletAddress}`,
    `Seal account: ${sealAddress}`,
    `Wallet EVM address: ${walletEvmAddress}`,
    `Issued at: ${fields.issuedAt}`,
    `Expires at: ${fields.expiry}`,
  ].join("\n");
}

export const bindingStatementBytes = (fields: BindingStatementFields): Uint8Array =>
  new TextEncoder().encode(bindingStatementText(fields));

/**
 * E countersigns a statement whose W signature was produced elsewhere (QoreX).
 * The seal identity must be the account named in the fields and on the same
 * chain. Throws TypeError on a mismatch.
 */
export function signBindingStatement(args: {
  fields: BindingStatementFields;
  walletSignature: unknown;
  sealIdentity: SealAccountIdentity;
}): BindingStatement {
  const text = bindingStatementText(args.fields);
  if (args.sealIdentity.chainId !== args.fields.chainId) {
    throw new TypeError("the seal account is on a different chain");
  }
  if (args.sealIdentity.address !== args.fields.sealAddress) {
    throw new TypeError("the seal identity is not the sealAddress in the statement");
  }
  return {
    version: BINDING_STATEMENT_VERSION,
    fields: args.fields,
    walletSignature: args.walletSignature,
    sealSignature: args.sealIdentity.signMessage(new TextEncoder().encode(text)),
  };
}

const classicalPublicKeyOf = (signature: unknown): Uint8Array | undefined => {
  if (typeof signature !== "object" || signature === null || Array.isArray(signature)) {
    return undefined;
  }
  const classical = (signature as Record<string, unknown>)["classical"];
  if (typeof classical !== "object" || classical === null || Array.isArray(classical)) {
    return undefined;
  }
  const encoded = (classical as Record<string, unknown>)["publicKey"];
  if (typeof encoded !== "string" || encoded.length === 0) return undefined;
  try {
    return fromBase64(encoded);
  } catch {
    return undefined;
  }
};

/**
 * Verifies both signatures and the expiry window. Keys come from the injected
 * account clients; the post-quantum part is always required on both.
 */
export async function verifyBindingStatement(args: {
  statement: BindingStatement;
  walletAccountClient: PqcAccountReader;
  sealAccountClient: PqcAccountReader;
  /** Injectable clock for tests. Defaults to the real clock. */
  now?: Date;
  /**
   * Require `walletEvmAddress` to be the Ethereum-form address of W's verified
   * classical key. Defaults to true; only a test that studies the weaker
   * statement form should turn it off.
   */
  requireEvmAddressMatch?: boolean;
}): Promise<BindingVerification> {
  const { statement } = args;
  if (
    typeof statement !== "object" ||
    statement === null ||
    statement.version !== BINDING_STATEMENT_VERSION
  ) {
    return fail("invalid-statement", "unsupported binding statement version");
  }

  let text: string;
  let issued: Date;
  let expiry: Date;
  try {
    text = bindingStatementText(statement.fields);
    issued = parseTimestamp(statement.fields.issuedAt, "issuedAt");
    expiry = parseTimestamp(statement.fields.expiry, "expiry");
  } catch (err) {
    return fail("invalid-statement", err instanceof Error ? err.message : String(err));
  }

  if (expiry.getTime() <= issued.getTime()) {
    return fail("invalid-statement", "expiry must be after issuedAt");
  }
  if (expiry.getTime() - issued.getTime() > MAX_BINDING_LIFETIME_DAYS * 24 * 60 * 60 * 1000) {
    return fail(
      "invalid-statement",
      `a statement may last at most ${MAX_BINDING_LIFETIME_DAYS} days`,
    );
  }

  const now = (args.now ?? new Date()).getTime();
  if (issued.getTime() > now + BINDING_CLOCK_SKEW_MINUTES * 60 * 1000) {
    return fail("not-yet-valid", "the statement is issued in the future");
  }
  if (now >= expiry.getTime()) {
    return fail("expired", `the statement expired at ${statement.fields.expiry}`);
  }

  const wallet = await verifyHybridMessage({
    chainId: statement.fields.chainId,
    signer: statement.fields.walletAddress,
    message: text,
    response: statement.walletSignature,
    accountClient: args.walletAccountClient,
  });
  if (!wallet.verified) {
    return fail(
      "wallet-signature-invalid",
      `wallet signature refused: ${wallet.reason}`,
      wallet.verifierCode,
    );
  }

  const seal = await verifyHybridMessage({
    chainId: statement.fields.chainId,
    signer: statement.fields.sealAddress,
    message: text,
    response: statement.sealSignature,
    accountClient: args.sealAccountClient,
  });
  if (!seal.verified) {
    return fail(
      "seal-signature-invalid",
      `seal signature refused: ${seal.reason}`,
      seal.verifierCode,
    );
  }

  if (args.requireEvmAddressMatch !== false) {
    const publicKey = classicalPublicKeyOf(statement.walletSignature);
    if (publicKey === undefined) {
      return fail("evm-address-mismatch", "the wallet signature carries no classical public key");
    }
    let derived: string;
    try {
      derived = addressFromPublicKey(publicKey, "eth_secp256k1").hex;
    } catch (err) {
      return fail(
        "evm-address-mismatch",
        `could not derive the EVM address: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (derived.toLowerCase() !== statement.fields.walletEvmAddress.toLowerCase()) {
      return fail(
        "evm-address-mismatch",
        `the statement names ${statement.fields.walletEvmAddress}, but W's key derives ${derived}`,
      );
    }
  }

  return {
    ok: true,
    value: {
      chainId: statement.fields.chainId,
      walletAddress: statement.fields.walletAddress,
      sealAddress: statement.fields.sealAddress,
      walletEvmAddress: statement.fields.walletEvmAddress,
      issuedAt: statement.fields.issuedAt,
      expiry: statement.fields.expiry,
      walletPqPublicKeyLength: wallet.pqPublicKeyLength,
      sealPqPublicKeyLength: seal.pqPublicKeyLength,
    },
  };
}
