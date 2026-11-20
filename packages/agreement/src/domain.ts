// The settlement domain for this project's test deployment.
//
// No contract is deployed at TEST_ONLY_VERIFYING_CONTRACT. It is a fixed,
// clearly labelled placeholder used to freeze the agreement vectors at a known
// chain id and address. A real deployment substitutes the deployed address; the
// commitment and the confirmation message then differ, which is the point of the
// domain separation.

import type { CommitmentDomain } from "./commitment.js";

/** Diana EVM chain id, recorded in `docs/research/source-lock.md` claim 54. */
export const DIANA_EVM_CHAIN_ID = 9800n;

/**
 * TEST ONLY. No contract exists at this address on any network. It labels the
 * vectors so a reader cannot mistake them for a deployment.
 */
export const TEST_ONLY_VERIFYING_CONTRACT = "0x000000000000000000000000000000000000c0de" as const;

/** TEST ONLY. The domain the frozen agreement vectors were produced with. */
export const TEST_ONLY_DOMAIN: CommitmentDomain = {
  chainId: DIANA_EVM_CHAIN_ID,
  verifyingContract: TEST_ONLY_VERIFYING_CONTRACT,
};
