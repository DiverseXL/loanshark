// Browser encrypted vault for persisting the seal account (ADR-0016).
//
// Key derivation: WebCrypto PBKDF2-HMAC-SHA256 with 600,000 iterations.
// Encryption: AES-256-GCM with fresh 12-byte IV and 32-byte salt per write.
// Storage: Only the AEAD blob record is written to localStorage.
// Plaintext mnemonics and passphrases are never stored unencrypted.

import { SealAccountIdentity } from "@loanshark/seal-account";

export const VAULT_STORAGE_KEY = "loanshark.vault.v1";
export const VAULT_ALGORITHM = "AES-GCM-256-PBKDF2-SHA256" as const;
export const VAULT_ITERATIONS = 600_000;
export const DEFAULT_AUTOLOCK_MS = 15 * 60 * 1000; // 15 minutes

export interface StoredVaultBlob {
  version: 1;
  algorithm: typeof VAULT_ALGORITHM;
  iterations: number;
  salt: string; // hex
  iv: string; // hex
  ciphertext: string; // hex
  address: string; // qor1...
  updatedAt: string; // ISO 8601
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const memoryStorageFallback = new Map<string, string>();
const defaultStorage: StorageLike = {
  getItem(key: string): string | null {
    if (typeof localStorage !== "undefined") {
      return localStorage.getItem(key);
    }
    return memoryStorageFallback.get(key) ?? null;
  },
  setItem(key: string, value: string): void {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(key, value);
    } else {
      memoryStorageFallback.set(key, value);
    }
  },
  removeItem(key: string): void {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(key);
    } else {
      memoryStorageFallback.delete(key);
    }
  },
};

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const fromHex = (hex: string): Uint8Array => {
  if (hex.length % 2 !== 0) throw new TypeError("invalid hex string");
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
};

const aadForVault = (iterations: number): Uint8Array =>
  new TextEncoder().encode(`loanshark/vault/v1|${iterations}`);

/** Derives an AES-GCM CryptoKey from a passphrase using PBKDF2-HMAC-SHA256. */
async function deriveVaultKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: Uint8Array.from(salt),
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export class SealVaultManager {
  private readonly storage: StorageLike;
  private readonly autolockMs: number;
  private activeIdentity: SealAccountIdentity | null = null;
  private autolockTimer: ReturnType<typeof setTimeout> | null = null;
  private onLockCallback?: (() => void) | undefined;

  constructor(
    options: {
      storage?: StorageLike | undefined;
      autolockMs?: number | undefined;
      onLock?: (() => void) | undefined;
    } = {},
  ) {
    this.storage = options.storage ?? defaultStorage;
    this.autolockMs = options.autolockMs ?? DEFAULT_AUTOLOCK_MS;
    this.onLockCallback = options.onLock;
  }

  /** Checks whether an encrypted vault blob exists in storage. */
  hasVault(): boolean {
    const raw = this.storage.getItem(VAULT_STORAGE_KEY);
    return raw !== null && raw.trim().length > 0;
  }

  /** Reads the public metadata from the stored blob (no decryption). */
  getVaultMetadata(): { address: string; updatedAt: string; iterations: number } | null {
    const raw = this.storage.getItem(VAULT_STORAGE_KEY);
    if (!raw) return null;
    try {
      const blob = JSON.parse(raw) as StoredVaultBlob;
      return {
        address: blob.address,
        updatedAt: blob.updatedAt,
        iterations: blob.iterations,
      };
    } catch {
      return null;
    }
  }

  /** Returns the in-memory unlocked seal account identity, or null if locked. */
  getUnlockedIdentity(): SealAccountIdentity | null {
    return this.activeIdentity;
  }

  isUnlocked(): boolean {
    return this.activeIdentity !== null;
  }

  private resetAutolock(): void {
    if (this.autolockTimer !== null) {
      clearTimeout(this.autolockTimer);
      this.autolockTimer = null;
    }
    if (this.autolockMs > 0 && this.activeIdentity !== null) {
      this.autolockTimer = setTimeout(() => {
        this.lock();
      }, this.autolockMs);
    }
  }

  /**
   * Encrypts and saves the seal account mnemonic to local storage.
   * Derives key using PBKDF2 with 600,000 iterations and random salt.
   * Encrypts payload with fresh 12-byte IV using AES-256-GCM.
   */
  async save(args: {
    mnemonic: string;
    chainId: string;
    passphrase: string;
  }): Promise<StoredVaultBlob> {
    if (!args.passphrase) {
      throw new Error("passphrase is required");
    }
    if (!args.mnemonic) {
      throw new Error("mnemonic is required");
    }

    const salt = new Uint8Array(32);
    crypto.getRandomValues(salt);

    const iv = new Uint8Array(12);
    crypto.getRandomValues(iv);

    const key = await deriveVaultKey(args.passphrase, salt, VAULT_ITERATIONS);

    // Derive identity to record public address
    const identity = SealAccountIdentity.fromMnemonic({
      mnemonic: args.mnemonic,
      chainId: args.chainId,
    });

    const plaintext = JSON.stringify({
      mnemonic: args.mnemonic,
      chainId: args.chainId,
    });

    const ciphertextBuffer = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: Uint8Array.from(aadForVault(VAULT_ITERATIONS)),
      },
      key,
      new TextEncoder().encode(plaintext),
    );

    const blob: StoredVaultBlob = {
      version: 1,
      algorithm: VAULT_ALGORITHM,
      iterations: VAULT_ITERATIONS,
      salt: toHex(salt),
      iv: toHex(iv),
      ciphertext: toHex(new Uint8Array(ciphertextBuffer)),
      address: identity.address,
      updatedAt: new Date().toISOString(),
    };

    // Stored blob contains only ciphertext, salt, iv, and parameters
    this.storage.setItem(VAULT_STORAGE_KEY, JSON.stringify(blob));

    this.activeIdentity = identity;
    this.resetAutolock();

    return blob;
  }

  /**
   * Unlocks the vault using the user passphrase.
   * Throws Error("invalid-passphrase") if wrong passphrase or tampering.
   */
  async unlock(passphrase: string): Promise<SealAccountIdentity> {
    if (!passphrase) {
      throw new Error("invalid-passphrase");
    }

    const raw = this.storage.getItem(VAULT_STORAGE_KEY);
    if (!raw) {
      throw new Error("vault-not-found");
    }

    let blob: StoredVaultBlob;
    try {
      blob = JSON.parse(raw) as StoredVaultBlob;
    } catch {
      throw new Error("vault-corrupted");
    }

    if (blob.version !== 1 || blob.algorithm !== VAULT_ALGORITHM) {
      throw new Error("vault-unsupported-version");
    }

    let salt: Uint8Array;
    let iv: Uint8Array;
    let ciphertext: Uint8Array;
    try {
      salt = fromHex(blob.salt);
      iv = fromHex(blob.iv);
      ciphertext = fromHex(blob.ciphertext);
    } catch {
      throw new Error("invalid-passphrase");
    }

    let key: CryptoKey;
    try {
      key = await deriveVaultKey(passphrase, salt, blob.iterations);
    } catch {
      throw new Error("invalid-passphrase");
    }

    let decryptedBuffer: ArrayBuffer;
    try {
      decryptedBuffer = await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: Uint8Array.from(iv),
          additionalData: Uint8Array.from(aadForVault(blob.iterations)),
        },
        key,
        Uint8Array.from(ciphertext),
      );
    } catch {
      // OperationError from AES-GCM authentication failure: wrong passphrase or tampered ciphertext
      throw new Error("invalid-passphrase");
    }

    const decryptedText = new TextDecoder().decode(decryptedBuffer);
    let payload: { mnemonic: string; chainId: string };
    try {
      payload = JSON.parse(decryptedText) as { mnemonic: string; chainId: string };
    } catch {
      throw new Error("invalid-passphrase");
    }

    const identity = SealAccountIdentity.fromMnemonic({
      mnemonic: payload.mnemonic,
      chainId: payload.chainId,
    });

    this.activeIdentity = identity;
    this.resetAutolock();

    return identity;
  }

  /** Clears memory and returns vault to locked state. */
  lock(): void {
    this.activeIdentity = null;
    if (this.autolockTimer !== null) {
      clearTimeout(this.autolockTimer);
      this.autolockTimer = null;
    }
    if (this.onLockCallback) {
      this.onLockCallback();
    }
  }

  /** Deletes the stored encrypted vault blob and clears memory. */
  forget(): void {
    this.storage.removeItem(VAULT_STORAGE_KEY);
    this.lock();
  }
}
