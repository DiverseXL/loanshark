// TEST ONLY mnemonic and expected public values.
//
// This is the public all-zero BIP-39 test phrase. It is never funded and never
// used on chain. The expected values were produced once by the official pinned
// packages for that phrase; they are public values only.

import { verifyRecipientCard } from "@qorechain/qoreseal";
import { addressFromPublicKey } from "@qorechain/qoresign";
import type { SealAccountIdentity } from "../src/identity.js";

export const TEST_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

export const TEST_MNEMONIC_B =
  "legal winner thank year wave sausage worth useful legal winner thank yellow";

export const TEST_CHAIN_ID = "qorechain-diana";

/** Frozen values for TEST_MNEMONIC. Public data only. */
export const EXPECTED = {
  address: "qor19rl4cm2hmr8afy4kldpxz3fka4jguq0agt672h",
  addressHex: "0x28Ff5c6d57D8cFD492B6FB42614536eD648E01Fd",
  classicalPublicKey: "024f4e2ad99c34d60b9ba6283c9431a8418af8673212961f97a77b6377fcd05b62",
  mlDsaSha3: "93eb467eb8d32944f646ef6dee8f1f14a1252a7fa4a8a870292dcfb932872c6b",
  mlkemSha3: "889310e1d0d1ff95d9e2f63b433b0816021d92cf4c568101eab46d42c5b99838",
  x25519: "56a902e12bc30ffcb787f50c442d810d15fb1a6c9f97b6ec5743459d055cf434",
  walletEvmAddress: "0x7C1B02B575545d4F24243C229bC9a5ef1649b346",
} as const;

export const walletEvmAddressOf = (identity: SealAccountIdentity): string =>
  addressFromPublicKey(identity.publicData().classicalPublicKey, "eth_secp256k1").hex;

/** Verifies a card against the identity's own public keys, with no registry. */
export const verifyOwnCard = (identity: SealAccountIdentity): void => {
  const card = identity.recipientCard({ issuedAt: "2026-11-19T00:00:00Z" });
  const data = identity.publicData();
  verifyRecipientCard({
    card,
    chainId: TEST_CHAIN_ID,
    address: identity.address,
    pqPublicKey: data.mlDsaPublicKey,
    mlkemPublicKey: data.mlkemPublicKey,
  });
};
