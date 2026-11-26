// Tests for the encrypted browser vault module (ADR-0016).
//
// Tests:
//   - round trip with the right passphrase
//   - wrong passphrase fails without revealing why beyond a typed error
//   - tampering with ciphertext, nonce or salt fails
//   - the stored record contains no plaintext mnemonic words
//   - auto-lock clears memory
//   - forget removes the record

import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_AUTOLOCK_MS,
  SealVaultManager,
  type StorageLike,
  VAULT_STORAGE_KEY,
} from "../src/vault/vault.js";

const TEST_CHAIN_ID = "qorechain-diana";
const TEST_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art";
const TEST_PASSPHRASE = "correct-horse-battery-staple-123!";

class MemoryStorage implements StorageLike {
  private map = new Map<string, string>();

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

describe("apps/web encrypted vault", () => {
  let storage: MemoryStorage;
  let vault: SealVaultManager;

  beforeEach(() => {
    storage = new MemoryStorage();
    vault = new SealVaultManager({ storage, autolockMs: 100 });
  });

  it("round trip with the right passphrase", async () => {
    expect(vault.hasVault()).toBe(false);

    const savedBlob = await vault.save({
      mnemonic: TEST_MNEMONIC,
      chainId: TEST_CHAIN_ID,
      passphrase: TEST_PASSPHRASE,
    });

    expect(vault.hasVault()).toBe(true);
    expect(vault.isUnlocked()).toBe(true);
    expect(vault.getUnlockedIdentity()?.address).toBe(savedBlob.address);

    // Lock and unlock
    vault.lock();
    expect(vault.isUnlocked()).toBe(false);
    expect(vault.getUnlockedIdentity()).toBeNull();

    const unlockedIdentity = await vault.unlock(TEST_PASSPHRASE);
    expect(unlockedIdentity.address).toBe(savedBlob.address);
    expect(vault.isUnlocked()).toBe(true);
  });

  it("wrong passphrase fails without revealing why beyond a typed error", async () => {
    await vault.save({
      mnemonic: TEST_MNEMONIC,
      chainId: TEST_CHAIN_ID,
      passphrase: TEST_PASSPHRASE,
    });
    vault.lock();

    await expect(vault.unlock("incorrect-password")).rejects.toThrow("invalid-passphrase");
    expect(vault.isUnlocked()).toBe(false);
    expect(vault.getUnlockedIdentity()).toBeNull();
  });

  it("tampering with ciphertext, nonce (iv) or salt fails", async () => {
    await vault.save({
      mnemonic: TEST_MNEMONIC,
      chainId: TEST_CHAIN_ID,
      passphrase: TEST_PASSPHRASE,
    });
    vault.lock();

    const rawBlob = storage.getItem(VAULT_STORAGE_KEY);
    expect(rawBlob).not.toBeNull();
    const originalBlob = JSON.parse(rawBlob as string) as Record<string, string>;

    // 1. Tamper ciphertext
    const tamperedCiphertext = {
      ...originalBlob,
      ciphertext: originalBlob["ciphertext"]?.slice(0, -2) + "ff",
    };
    storage.setItem(VAULT_STORAGE_KEY, JSON.stringify(tamperedCiphertext));
    await expect(vault.unlock(TEST_PASSPHRASE)).rejects.toThrow("invalid-passphrase");

    // 2. Tamper nonce/iv
    const tamperedIv = {
      ...originalBlob,
      iv: originalBlob["iv"]?.slice(0, -2) + "00",
    };
    storage.setItem(VAULT_STORAGE_KEY, JSON.stringify(tamperedIv));
    await expect(vault.unlock(TEST_PASSPHRASE)).rejects.toThrow("invalid-passphrase");

    // 3. Tamper salt
    const tamperedSalt = {
      ...originalBlob,
      salt: originalBlob["salt"]?.slice(0, -2) + "aa",
    };
    storage.setItem(VAULT_STORAGE_KEY, JSON.stringify(tamperedSalt));
    await expect(vault.unlock(TEST_PASSPHRASE)).rejects.toThrow("invalid-passphrase");
  }, 90_000);

  it("the stored record contains no plaintext mnemonic words", async () => {
    await vault.save({
      mnemonic: TEST_MNEMONIC,
      chainId: TEST_CHAIN_ID,
      passphrase: TEST_PASSPHRASE,
    });

    const rawBlob = storage.getItem(VAULT_STORAGE_KEY);
    expect(rawBlob).not.toBeNull();

    // Check that none of the distinctive words from the test phrase appear in storage
    const words = TEST_MNEMONIC.split(" ");
    for (const word of words) {
      expect((rawBlob as string).toLowerCase()).not.toContain(`"${word}"`);
      expect((rawBlob as string).toLowerCase()).not.toContain(` ${word} `);
    }
    // Entire phrase should not appear anywhere in storage
    expect(rawBlob).not.toContain(TEST_MNEMONIC);
    expect(rawBlob).not.toContain(TEST_PASSPHRASE);
  });

  it("auto-lock clears memory on timer expiry", async () => {
    let lockCallbackFired = false;
    const autoVault = new SealVaultManager({
      storage,
      autolockMs: 50, // 50ms for test
      onLock: () => {
        lockCallbackFired = true;
      },
    });

    await autoVault.save({
      mnemonic: TEST_MNEMONIC,
      chainId: TEST_CHAIN_ID,
      passphrase: TEST_PASSPHRASE,
    });
    expect(autoVault.isUnlocked()).toBe(true);

    // Wait for autolock timeout
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(autoVault.isUnlocked()).toBe(false);
    expect(autoVault.getUnlockedIdentity()).toBeNull();
    expect(lockCallbackFired).toBe(true);
  });

  it("forget removes the record from storage and clears memory", async () => {
    await vault.save({
      mnemonic: TEST_MNEMONIC,
      chainId: TEST_CHAIN_ID,
      passphrase: TEST_PASSPHRASE,
    });
    expect(vault.hasVault()).toBe(true);
    expect(vault.isUnlocked()).toBe(true);

    vault.forget();

    expect(vault.hasVault()).toBe(false);
    expect(vault.isUnlocked()).toBe(false);
    expect(vault.getUnlockedIdentity()).toBeNull();
    expect(storage.getItem(VAULT_STORAGE_KEY)).toBeNull();
  });
});
