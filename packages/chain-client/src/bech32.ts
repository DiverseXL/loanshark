// The `qor1` account address to EVM address rule (ADR-0009).
//
// A QoreChain account address is bech32 (BIP-173) with prefix `qor` and a
// 20-byte payload. On the tested Diana account, that payload is exactly the
// address QoreX reports over `eth_accounts`. This module decodes the payload
// and nothing else: it does not derive an address from a public key, because on
// that account the standard Ethereum derivation of its registered
// `ecdsa_pubkey` gives a DIFFERENT address. See ADR-0009 and
// docs/evidence/phase-11a-result.md.
//
// The decoder is `@scure/base` 2.4.0, pinned exactly and recorded in the source
// lock. It verifies the checksum and refuses non-canonical padding.

import { bech32 } from "@scure/base";

/** The human-readable prefix of a QoreChain account address. */
export const QOR_ADDRESS_PREFIX = "qor";

/** Why a string is not a QoreChain account address. */
export type Bech32AddressFailure =
  /** Not lowercase, so not the canonical form this project compares. */
  | "non-canonical"
  /** Does not start with `qor1`. */
  | "wrong-prefix"
  /** The bech32 checksum does not verify. */
  | "bad-checksum"
  /** Decodes, but the payload is not 20 bytes. */
  | "wrong-length";

export type EvmAddressResult =
  | {
      readonly ok: true;
      /** The 20 payload bytes as a lowercase `0x` address. */
      readonly address: `0x${string}`;
      /** The decoded payload. */
      readonly bytes: Uint8Array;
    }
  | {
      readonly ok: false;
      readonly reason: Bech32AddressFailure;
      readonly message: string;
    };

const refuse = (reason: Bech32AddressFailure, message: string): EvmAddressResult => ({
  ok: false,
  reason,
  message,
});

/**
 * Returns the EVM address form of a QoreChain account: the 20 bytes the bech32
 * address carries. Pure; no network, no key material.
 */
export function evmAddressOfBech32(address: string): EvmAddressResult {
  if (address !== address.toLowerCase()) {
    return refuse(
      "non-canonical",
      "The address is not lowercase. This project compares the canonical `qor1` form only.",
    );
  }
  if (!address.startsWith(`${QOR_ADDRESS_PREFIX}1`)) {
    return refuse(
      "wrong-prefix",
      `The address does not start with ${QOR_ADDRESS_PREFIX}1, so it is not a QoreChain account address.`,
    );
  }

  let bytes: Uint8Array;
  try {
    bytes = bech32.decodeToBytes(address).bytes;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return refuse("bad-checksum", `The bech32 checksum does not verify: ${detail}`);
  }

  if (bytes.length !== 20) {
    return refuse(
      "wrong-length",
      `The address carries ${bytes.length} payload bytes; a QoreChain account address carries 20.`,
    );
  }

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return { ok: true, address: `0x${hex}`, bytes };
}
