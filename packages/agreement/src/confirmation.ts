// Offline agreement confirmation. Both parties sign the same UTF-8 message with
// QoreX `signArbitrary`; the app verifies each signature against that party's
// registered ML-DSA-87 key. This module builds the message and delegates
// verification to the existing verifier; it does not build a QoreX signer.
//
// Message format, exactly:
//
//   loanshark/v2/agreement|<chainId>|<0x verifyingContract>|<0x loanId>|<0x agreementHash>
//
// Version 2 (Step 9b) adds the EVM chain id and the verifying contract address,
// so a confirmation signed for one `LoanSettlement` deployment cannot be used
// for another, and the same terms on another chain produce a different message.
// The QoreSign prefix `qorechain-msg-v1|<chainId>|` still binds the native chain
// id to the signature; that is a separate value from the EVM chain id here.
// ASSUMPTION: the domain tag, the field order and the 0x-prefixed lowercase hex
// encoding are this project's format (ADR-0010).

import type { PqcAccountReader, VerifyHybridMessageResult } from "@loanshark/chain-client";
import { verifyHybridMessage } from "@loanshark/chain-client";
import type { MessageSigner } from "@loanshark/qoreseal-adapter";
import type { Hex } from "viem";
import type { CommitmentDomain } from "./commitment.js";
import { commitmentOf } from "./commitment.js";
import type { Address, Terms } from "./terms.js";
import { agreementHashOf } from "./text.js";

/** Domain tag that opens the confirmation message. */
export const CONFIRMATION_DOMAIN = "loanshark/v2/agreement";

const BYTES32_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

const requireBytes32 = (name: string, value: string): string => {
  if (!BYTES32_PATTERN.test(value)) throw new TypeError(`${name} is not a 32-byte hex value`);
  return value.toLowerCase();
};

const requireAddress = (name: string, value: string): string => {
  if (!ADDRESS_PATTERN.test(value)) throw new TypeError(`${name} is not a 20-byte address`);
  return value.toLowerCase();
};

/** The hashes and the domain both parties confirm. */
export interface AgreementConfirmation {
  /** EVM chain id of the settlement chain. */
  chainId: bigint;
  /** Address of the `LoanSettlement` deployment. */
  verifyingContract: Address;
  /** The on-chain loan id, which is the domain-separated terms commitment. */
  loanId: Hex;
  /** SHA-256 of the canonical agreement text. */
  agreementHash: Hex;
}

/** The exact UTF-8 message both parties sign. */
export function confirmationMessage(input: AgreementConfirmation): Uint8Array {
  const chainId = input.chainId;
  if (chainId < 0n || chainId > 2n ** 256n - 1n) {
    throw new TypeError("chainId does not fit in uint256");
  }
  const verifyingContract = requireAddress("verifyingContract", input.verifyingContract);
  const loanId = requireBytes32("loanId", input.loanId);
  const agreementHash = requireBytes32("agreementHash", input.agreementHash);
  return new TextEncoder().encode(
    `${CONFIRMATION_DOMAIN}|${chainId.toString(10)}|${verifyingContract}|${loanId}|${agreementHash}`,
  );
}

/** The same bytes as text, for display and evidence. */
export function confirmationMessageText(input: AgreementConfirmation): string {
  return new TextDecoder().decode(confirmationMessage(input));
}

/** Derives both hashes from the terms and domain, so they cannot be mispaired. */
export function confirmationFor(
  terms: Terms,
  domain: CommitmentDomain,
): AgreementConfirmation & { message: Uint8Array } {
  const agreementHash = agreementHashOf(terms);
  const loanId = commitmentOf(terms, domain);
  const confirmation = {
    chainId: domain.chainId,
    verifyingContract: domain.verifyingContract,
    loanId,
    agreementHash,
  };
  return { ...confirmation, message: confirmationMessage(confirmation) };
}

export type SignConfirmationFailureCode = "signer-failed";

export type SignConfirmationResult =
  | {
      ok: true;
      value: AgreementConfirmation & { message: Uint8Array; signature: unknown };
    }
  | { ok: false; code: SignConfirmationFailureCode; message: string };

/**
 * Signs the confirmation derived from `terms` and `domain`. No key material
 * passes through this module; the caller supplies the signer.
 */
export async function signAgreementConfirmation(input: {
  terms: Terms;
  domain: CommitmentDomain;
  signer: MessageSigner;
}): Promise<SignConfirmationResult> {
  const confirmation = confirmationFor(input.terms, input.domain);
  let signature: unknown;
  try {
    signature = await input.signer.sign(confirmation.message);
  } catch (err) {
    return {
      ok: false,
      code: "signer-failed",
      message: err instanceof Error ? err.message : String(err),
    };
  }
  return {
    ok: true,
    value: {
      chainId: confirmation.chainId,
      verifyingContract: confirmation.verifyingContract,
      loanId: confirmation.loanId,
      agreementHash: confirmation.agreementHash,
      message: confirmation.message,
      signature,
    },
  };
}

export interface VerifyConfirmationInput {
  terms: Terms;
  /** The EVM chain id and contract address the confirmation claims. */
  domain: CommitmentDomain;
  /** QoreChain native chain id, as QoreSign prefixes it (`qorechain-diana`). */
  chainId: string;
  /** The `qor1...` account expected to have signed (borrower or lender). */
  signer: string;
  /** Raw QoreX signature object; treated as untrusted. */
  signature: unknown;
  /** Reads the signer's registered ML-DSA-87 key. */
  accountClient: PqcAccountReader;
}

/**
 * Verifies a confirmation against the expected signer's on-chain key. The
 * post-quantum part is required by the underlying verifier. Both hashes and the
 * domain are recomputed here, so a confirmation for other terms, another chain
 * id or another contract address fails.
 */
export async function verifyAgreementConfirmation(
  input: VerifyConfirmationInput,
): Promise<VerifyHybridMessageResult> {
  const confirmation = confirmationFor(input.terms, input.domain);
  return verifyHybridMessage({
    chainId: input.chainId,
    signer: input.signer,
    message: confirmation.message,
    response: input.signature,
    accountClient: input.accountClient,
  });
}
