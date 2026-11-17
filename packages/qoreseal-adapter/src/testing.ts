// TEST ONLY. Nothing in this module may be used by the app or the API.
//
// It generates a throwaway account and seal key pair in memory, signs with the
// official QoreSign signing API, and returns a mock account client. The keys
// exist only for the process and are never written, logged or transmitted.
//
// The mock account client is NOT a chain client: it answers from the identity
// in this process. Tests that use it prove the verifier's wiring, not that a
// key is registered on QoreChain.

import { randomBytes } from "node:crypto";
import type { PqcAccountReader } from "@loanshark/chain-client";
import { generateSealKeys } from "@qorechain/qoreseal";
import type { SealKeyPair } from "@qorechain/qoreseal";
import type { ClassicalKey, PqKeyPair } from "@qorechain/qoresign";
import {
  addressFromPublicKey,
  classicalKeyFromPrivate,
  pqKeyFromSeed,
  signMessage,
} from "@qorechain/qoresign";
import type { MessageSigner } from "./envelope.js";

/** A throwaway identity. Every field is secret except `address`. */
export interface ThrowawayIdentity {
  /** Fixed marker so this can never be mistaken for a real identity. */
  readonly label: "TEST ONLY, throwaway";
  /** `qor1...` address derived from the classical key. */
  address: string;
  /** ML-KEM-1024 and X25519 keys for sealing. */
  sealKeys: SealKeyPair;
  /** secp256k1 key used to sign. */
  classicalKey: ClassicalKey;
  /** ML-DSA-87 key used to sign. */
  pqKey: PqKeyPair;
}

/**
 * Generates a fresh identity from the operating system's CSPRNG. There is no
 * mnemonic, no persistence and no recovery path: losing the process loses it.
 */
export function generateThrowawayIdentity(): ThrowawayIdentity {
  const classicalKey = classicalKeyFromPrivate(randomBytes(32), "secp256k1");
  const pqKey = pqKeyFromSeed(randomBytes(32));
  const account = addressFromPublicKey(classicalKey.publicKey, classicalKey.type);
  return {
    label: "TEST ONLY, throwaway",
    address: account.bech32,
    sealKeys: generateSealKeys(),
    classicalKey,
    pqKey,
  };
}

/**
 * TEST ONLY signer backed by QoreSign `signMessage`. One instance is bound to
 * one chain id, because QoreSign includes the chain id in its signing bytes.
 */
export function createThrowawaySigner(identity: ThrowawayIdentity, chainId: string): MessageSigner {
  return {
    sign: async (message) =>
      signMessage({
        chainId,
        signer: identity.address,
        data: message,
        classicalKey: identity.classicalKey,
        pqKey: identity.pqKey,
      }),
  };
}

/**
 * TEST ONLY classical-only signer: the same keys, but no ML-DSA-87 part. It
 * exists to prove that a classical-only signature is refused.
 */
export function createClassicalOnlyThrowawaySigner(
  identity: ThrowawayIdentity,
  chainId: string,
): MessageSigner {
  return {
    sign: async (message) =>
      signMessage({
        chainId,
        signer: identity.address,
        data: message,
        classicalKey: identity.classicalKey,
      }),
  };
}

/**
 * MOCK account client. It is not a network client: it returns the identity's
 * public ML-DSA-87 key for that address and nothing for any other address.
 */
export function mockAccountClient(identity: ThrowawayIdentity): PqcAccountReader {
  return {
    readAccount: async (address) =>
      address === identity.address
        ? { address, publicKey: identity.pqKey.publicKey, algorithmId: 1 }
        : null,
  };
}
