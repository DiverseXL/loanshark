// The app-held seal account E (ADR-0004, ADR-0005, ADR-0014).
//
// One BIP-39 mnemonic gives:
//   - the secp256k1 classical key and the qor1 account address;
//   - the canonical ML-DSA-87 key bound to that address;
//   - the ML-KEM-1024 and X25519 seal keys at index 0.
//
// This is the same derivation as the official QoreSeal example. The private
// material lives in private class fields and is used only through methods that
// return public data, signatures, ciphertext or plaintext. It is never returned
// as an object, logged, or included in JSON.stringify / toString / util.inspect.
//
// Nothing here imports a Node built-in or a network module: the package is used
// by the browser panel as well as by the owner-run script.

import { sha3_256 } from "@noble/hashes/sha3.js";
import type { RecipientCard, SealKeyPair } from "@qorechain/qoreseal";
import { deriveSealKeys, open, seal, signRecipientCard } from "@qorechain/qoreseal";
import type { ClassicalKey, MessageSignature, PqKeyPair } from "@qorechain/qoresign";
import {
  addressFromPublicKey,
  deriveCanonicalPqKey,
  deriveClassicalKey,
  signMessage,
  toHex,
} from "@qorechain/qoresign";
import { generateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { SecretString } from "./secret.js";

const INSPECT = Symbol.for("nodejs.util.inspect.custom");
const REDACTED = "[redacted]";

/** The classical key type the official example uses for a qor1 account. */
const CLASSICAL_KEY_TYPE = "secp256k1" as const;

/** Algorithm ids from the chain: 1 is ML-DSA-87, 2 is ML-KEM-1024. */
export const ML_DSA_87_ALGORITHM_ID = 1;
export const ML_KEM_1024_ALGORITHM_ID = 2;

/** Public-only view of a seal account. Safe to render, copy and serialise. */
export interface SealAccountPublicData {
  readonly chainId: string;
  /** `qor1...` account address. */
  readonly address: string;
  /**
   * The `0x` form of the same 20 account bytes. This is not the Ethereum
   * keccak-derived address; E does not need one.
   */
  readonly addressHex: string;
  readonly classicalKeyType: typeof CLASSICAL_KEY_TYPE;
  /** 33-byte compressed secp256k1 public key. */
  readonly classicalPublicKey: Uint8Array;
  /** 2592-byte ML-DSA-87 public key. */
  readonly mlDsaPublicKey: Uint8Array;
  /** 1568-byte ML-KEM-1024 public key: the key registered on chain. */
  readonly mlkemPublicKey: Uint8Array;
  /** 32-byte X25519 public key: carried in the recipient card. */
  readonly x25519PublicKey: Uint8Array;
  readonly algorithmIds: {
    readonly mlDsa: typeof ML_DSA_87_ALGORITHM_ID;
    readonly mlkem: typeof ML_KEM_1024_ALGORITHM_ID;
  };
  /** Lowercase hex SHA3-256 hashes, plus the X25519 key itself in hex. */
  readonly hashes: {
    readonly mlDsaSha3: string;
    readonly mlkemSha3: string;
    readonly x25519: string;
  };
}

/** JSON-safe public data: bytes become lowercase hex. */
export interface SealAccountJson {
  readonly chainId: string;
  readonly address: string;
  readonly addressHex: string;
  readonly classicalKeyType: typeof CLASSICAL_KEY_TYPE;
  readonly classicalPublicKey: string;
  readonly mlDsaPublicKey: string;
  readonly mlkemPublicKey: string;
  readonly x25519PublicKey: string;
  readonly algorithmIds: SealAccountPublicData["algorithmIds"];
  readonly hashes: SealAccountPublicData["hashes"];
}

export interface SealAccountInput {
  /** BIP-39 English phrase. Normalised before use. */
  readonly mnemonic: string;
  /** Chain id the signatures are bound to, e.g. `qorechain-diana`. */
  readonly chainId: string;
  readonly passphrase?: string;
  /** Seal-key derivation index; defaults to 0 as in the official example. */
  readonly index?: number;
}

export interface GeneratedSealAccount {
  readonly identity: SealAccountIdentity;
  /**
   * The generated phrase. Shown once for backup, then discarded by the caller.
   * The identity keeps its own copy for the life of the page.
   */
  readonly mnemonic: SecretString;
}

const toHexLower = (bytes: Uint8Array): string => toHex(bytes);

/** Canonical BIP-39 spacing, as QoreSign requires for its classical derivation. */
export function normalizeMnemonic(mnemonic: string): string {
  return mnemonic.normalize("NFKD").trim().split(/\s+/).join(" ");
}

/**
 * A seal account. Construction is through `fromMnemonic` or
 * `generateSealAccount`; there is no constructor that takes loose key material.
 */
export class SealAccountIdentity {
  readonly #chainId: string;
  readonly #mnemonic: string;
  readonly #classical: ClassicalKey;
  readonly #pq: PqKeyPair;
  readonly #sealKeys: SealKeyPair;
  readonly #publicData: SealAccountPublicData;

  private constructor(args: {
    chainId: string;
    mnemonic: string;
    classical: ClassicalKey;
    pq: PqKeyPair;
    sealKeys: SealKeyPair;
  }) {
    this.#chainId = args.chainId;
    this.#mnemonic = args.mnemonic;
    this.#classical = args.classical;
    this.#pq = args.pq;
    this.#sealKeys = args.sealKeys;

    const account = addressFromPublicKey(args.classical.publicKey, CLASSICAL_KEY_TYPE);
    this.#publicData = Object.freeze({
      chainId: args.chainId,
      address: account.bech32,
      addressHex: account.hex,
      classicalKeyType: CLASSICAL_KEY_TYPE,
      classicalPublicKey: Uint8Array.from(args.classical.publicKey),
      mlDsaPublicKey: Uint8Array.from(args.pq.publicKey),
      mlkemPublicKey: Uint8Array.from(args.sealKeys.mlkemPublicKey),
      x25519PublicKey: Uint8Array.from(args.sealKeys.x25519PublicKey),
      algorithmIds: Object.freeze({
        mlDsa: ML_DSA_87_ALGORITHM_ID,
        mlkem: ML_KEM_1024_ALGORITHM_ID,
      }),
      hashes: Object.freeze({
        mlDsaSha3: toHexLower(sha3_256(args.pq.publicKey)),
        mlkemSha3: toHexLower(sha3_256(args.sealKeys.mlkemPublicKey)),
        x25519: toHexLower(args.sealKeys.x25519PublicKey),
      }),
    });

    Object.defineProperty(this, INSPECT, {
      value: () => this.toString(),
      enumerable: false,
      configurable: false,
      writable: false,
    });
  }

  /**
   * Derives the identity exactly as the official register-and-encrypt example:
   * `deriveClassicalKey`, `addressFromPublicKey(..., "secp256k1")`,
   * `deriveCanonicalPqKey({ mnemonic, address })`, `deriveSealKeys({ mnemonic })`.
   */
  static fromMnemonic(input: SealAccountInput): SealAccountIdentity {
    if (typeof input.chainId !== "string" || input.chainId.length === 0) {
      throw new TypeError("chainId is required");
    }
    const mnemonic = normalizeMnemonic(input.mnemonic);
    const classical = deriveClassicalKey({
      mnemonic,
      ...(input.passphrase === undefined ? {} : { passphrase: input.passphrase }),
    });
    const address = addressFromPublicKey(classical.publicKey, CLASSICAL_KEY_TYPE).bech32;
    const pq = deriveCanonicalPqKey({ mnemonic, address });
    const sealKeys = deriveSealKeys({
      mnemonic,
      ...(input.passphrase === undefined ? {} : { passphrase: input.passphrase }),
      ...(input.index === undefined ? {} : { index: input.index }),
    });
    return new SealAccountIdentity({
      chainId: input.chainId,
      mnemonic,
      classical,
      pq,
      sealKeys,
    });
  }

  get chainId(): string {
    return this.#chainId;
  }

  get address(): string {
    return this.#publicData.address;
  }

  /** Copies of public values only. */
  publicData(): SealAccountPublicData {
    return {
      ...this.#publicData,
      classicalPublicKey: Uint8Array.from(this.#publicData.classicalPublicKey),
      mlDsaPublicKey: Uint8Array.from(this.#publicData.mlDsaPublicKey),
      mlkemPublicKey: Uint8Array.from(this.#publicData.mlkemPublicKey),
      x25519PublicKey: Uint8Array.from(this.#publicData.x25519PublicKey),
      algorithmIds: { ...this.#publicData.algorithmIds },
      hashes: { ...this.#publicData.hashes },
    };
  }

  /**
   * The official recipient card, signed with the seal account's classical and
   * ML-DSA-87 keys. Public data only.
   */
  recipientCard(args: { issuedAt?: Date | string } = {}): RecipientCard {
    return signRecipientCard({
      chainId: this.#chainId,
      address: this.address,
      keys: this.#sealKeys,
      classicalKey: this.#classical,
      pqKey: this.#pq,
      ...(args.issuedAt === undefined ? {} : { issuedAt: args.issuedAt }),
    });
  }

  /**
   * QoreSign hybrid message signature over `message` (secp256k1 plus
   * ML-DSA-87). This is the seal-account side of an envelope or binding
   * statement. The signature is public.
   */
  signMessage(message: Uint8Array): MessageSignature {
    return signMessage({
      chainId: this.#chainId,
      signer: this.address,
      data: message,
      classicalKey: this.#classical,
      pqKey: this.#pq,
    });
  }

  /**
   * Seals to this account's own public keys in hybrid mode. Used by the tests
   * and the browser panel to prove the derived keys work without a chain call.
   */
  sealToSelf(args: { purpose: string; plaintext: Uint8Array; aad?: Uint8Array }): Uint8Array {
    if (typeof args.purpose !== "string" || args.purpose.length === 0) {
      throw new TypeError("purpose is required");
    }
    if (!(args.plaintext instanceof Uint8Array)) {
      throw new TypeError("plaintext must be a Uint8Array");
    }
    return seal({
      chainId: this.#chainId,
      purpose: args.purpose,
      recipients: [
        {
          mlkemPublicKey: this.#sealKeys.mlkemPublicKey,
          x25519PublicKey: this.#sealKeys.x25519PublicKey,
        },
      ],
      plaintext: args.plaintext,
      mode: "hybrid",
      ...(args.aad === undefined ? {} : { aad: args.aad }),
    });
  }

  /** Opens an envelope addressed to this account. The plaintext is the caller's. */
  openEnvelope(args: { purpose: string; envelope: Uint8Array; aad?: Uint8Array }): Uint8Array {
    if (typeof args.purpose !== "string" || args.purpose.length === 0) {
      throw new TypeError("purpose is required");
    }
    if (!(args.envelope instanceof Uint8Array)) {
      throw new TypeError("envelope must be a Uint8Array");
    }
    return open({
      chainId: this.#chainId,
      purpose: args.purpose,
      envelope: args.envelope,
      keys: this.#sealKeys,
      ...(args.aad === undefined ? {} : { aad: args.aad }),
    });
  }

  /** Deliberate, explicit use of the secret phrase. Never render the result implicitly. */
  useMnemonic<T>(callback: (mnemonic: string) => T): T {
    return callback(this.#mnemonic);
  }

  /** Public JSON only. No secret field is reachable from this object. */
  toJSON(): SealAccountJson {
    return {
      chainId: this.#publicData.chainId,
      address: this.#publicData.address,
      addressHex: this.#publicData.addressHex,
      classicalKeyType: this.#publicData.classicalKeyType,
      classicalPublicKey: toHexLower(this.#classical.publicKey),
      mlDsaPublicKey: toHexLower(this.#pq.publicKey),
      mlkemPublicKey: toHexLower(this.#sealKeys.mlkemPublicKey),
      x25519PublicKey: toHexLower(this.#sealKeys.x25519PublicKey),
      algorithmIds: { ...this.#publicData.algorithmIds },
      hashes: { ...this.#publicData.hashes },
    };
  }

  toString(): string {
    return `SealAccountIdentity(${this.address}) [secrets redacted]`;
  }
}

/**
 * Generates a fresh 24-word phrase in memory and derives the identity. The
 * phrase is returned once as a redacting wrapper; it is not stored anywhere.
 */
export function generateSealAccount(args: {
  chainId: string;
  /** BIP-39 strength in bits. 256 gives 24 words; 128 would give 12. */
  strength?: 128 | 160 | 192 | 224 | 256;
}): GeneratedSealAccount {
  const mnemonic = generateMnemonic(wordlist, args.strength ?? 256);
  return {
    identity: SealAccountIdentity.fromMnemonic({ chainId: args.chainId, mnemonic }),
    mnemonic: new SecretString(mnemonic),
  };
}

export const SEAL_ACCOUNT_REDACTION = REDACTED;
