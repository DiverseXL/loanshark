// Offline agreement confirmation. Both parties sign the same UTF-8 message with
// QoreX `signArbitrary`; the app verifies each signature against that party's
// registered ML-DSA-87 key. This module builds the message and delegates
// verification to the existing verifier; it does not build a QoreX signer.
//
// Message format, exactly:
//
//   loanshark/v1/agreement|<0x loanId>|<0x agreementHash>
//
// The chain id is not in this string because QoreSign prefixes every signed
// message with `qorechain-msg-v1|<chainId>|`; a signature for one chain does not
// verify for another. ASSUMPTION: the domain tag, the field order and the
// 0x-prefixed lowercase hex encoding are this project's format (ADR-0010).

import type { PqcAccountReader, VerifyHybridMessageResult } from "@loanshark/chain-client";
import { verifyHybridMessage } from "@loanshark/chain-client";
import type { MessageSigner } from "@loanshark/qoreseal-adapter";
import type { Hex } from "viem";
import { commitmentOf } from "./commitment.js";
import { agreementHashOf } from "./text.js";
import type { Terms } from "./terms.js";

/** Domain tag that opens the confirmation message. */
export const CONFIRMATION_DOMAIN = "loanshark/v1/agreement";

const BYTES32_PATTERN = /^0x[0-9a-fA-F]{64}$/;

const requireBytes32 = (name: string, value: string): string => {
  if (!BYTES32_PATTERN.test(value)) throw new TypeError(`${name} is not a 32-byte hex value`);
  return value.toLowerCase();
};

/** The two hashes both parties confirm. */
export interface AgreementConfirmation {
  /** The on-chain loan id, which is the terms commitment. */
  loanId: Hex;
  /** SHA-256 of the canonical agreement text. */
  agreementHash: Hex;
}

/** The exact UTF-8 message both parties sign. */
export function confirmationMessage(input: AgreementConfirmation): Uint8Array {
  const loanId = requireBytes32("loanId", input.loanId);
  const agreementHash = requireBytes32("agreementHash", input.agreementHash);
  return new TextEncoder().encode(`${CONFIRMATION_DOMAIN}|${loanId}|${agreementHash}`);
}

/** The same bytes as text, for display and evidence. */
export function confirmationMessageText(input: AgreementConfirmation): string {
  return new TextDecoder().decode(confirmationMessage(input));
}

/** Derives both hashes from the terms, so they cannot be paired incorrectly. */
export function confirmationFor(terms: Terms): AgreementConfirmation & { message: Uint8Array } {
  const agreementHash = agreementHashOf(terms);
  const loanId = commitmentOf(terms);
  return { loanId, agreementHash, message: confirmationMessage({ loanId, agreementHash }) };
}

export type SignConfirmationFailureCode = "signer-failed";

export type SignConfirmationResult =
  | {
      ok: true;
      value: AgreementConfirmation & { message: Uint8Array; signature: unknown };
    }
  | { ok: false; code: SignConfirmationFailureCode; message: string };

/**
 * Signs the confirmation derived from `terms`. No key material passes through
 * this module; the caller supplies the signer.
 */
export async function signAgreementConfirmation(input: {
  terms: Terms;
  signer: MessageSigner;
}): Promise<SignConfirmationResult> {
  const confirmation = confirmationFor(input.terms);
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
      loanId: confirmation.loanId,
      agreementHash: confirmation.agreementHash,
      message: confirmation.message,
      signature,
    },
  };
}

export interface VerifyConfirmationInput {
  terms: Terms;
  /** Chain id the confirmation was signed for. */
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
 * post-quantum part is required by the underlying verifier. The terms are
 * recomputed here, so a confirmation for different terms fails.
 */
export async function verifyAgreementConfirmation(
  input: VerifyConfirmationInput,
): Promise<VerifyHybridMessageResult> {
  const confirmation = confirmationFor(input.terms);
  return verifyHybridMessage({
    chainId: input.chainId,
    signer: input.signer,
    message: confirmation.message,
    response: input.signature,
    accountClient: input.accountClient,
  });
}
