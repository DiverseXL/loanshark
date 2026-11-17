// Local verification of a signed message.
//
// A signature returned by QoreX is never shown as a success because the wallet
// said so. `runSignatureChecks` re-verifies it with `verifyHybridMessage` from
// `@loanshark/chain-client`, which always requires the ML-DSA-87 part and reads
// the key from the on-chain account record. It then runs four negative controls
// on the returned object. The page may render "verified" only when the positive
// check passed AND every control was refused.
//
// The controls are computed locally and never call the wallet. They are not
// evidence about QoreX; they are evidence that this page's verifier refuses
// tampering in the browser as it does in the test suite.
//
// Control 4 needs the verifier to reach the classical-key/address check, so the
// account record already fetched from chain is relabelled with the synthetic
// signer's address for that one call. Nothing is fetched for the synthetic
// address and no key is invented: the ML-DSA-87 key bytes are the on-chain
// key. The UI labels this as a local harness.

import type {
  OnChainPqcAccount,
  PqcAccountReader,
  VerifyHybridMessageResult,
} from "@loanshark/chain-client";
import { verifyHybridMessage } from "@loanshark/chain-client";
import { CONTROL_SIGNER, NATIVE_CHAIN_ID } from "../constants.js";

export type NegativeControlId = "pq-removed" | "message-changed" | "wrong-chain" | "signer-changed";

export interface NegativeControl {
  readonly id: NegativeControlId;
  readonly label: string;
  /** What the verifier is expected to say. Shown beside the actual reason. */
  readonly expectedReason: string;
  readonly result: VerifyHybridMessageResult;
}

export type SignatureReportStatus = "verified" | "not-verified" | "control-failed";

export interface SignatureReport {
  readonly status: SignatureReportStatus;
  readonly verification: VerifyHybridMessageResult;
  readonly controls: readonly NegativeControl[];
  /** Length of the on-chain ML-DSA-87 key used, when one was read. */
  readonly accountKeyBytes: number | null;
}

export interface SignatureChecksInput {
  readonly response: unknown;
  readonly signer: string;
  readonly message: string;
  readonly chainId?: string;
  readonly accountClient: PqcAccountReader;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Removes the `pq` part, keeping the classical part as the wallet returned it. */
export const withoutPqPart = (response: unknown): unknown => {
  if (!isRecord(response)) return response;
  return { signatureType: response["signatureType"], classical: response["classical"] };
};

/** Changes the last character of the message, so the signed bytes differ. */
export const changeLastCharacter = (message: string): string => {
  const last = message.slice(-1);
  return `${message.slice(0, -1)}${last === "z" ? "y" : "z"}`;
};

/**
 * Decides the one status the page may show. Success needs both the positive
 * verification and all four refusals; anything else is not a success.
 */
export function reportStatus(
  verification: VerifyHybridMessageResult,
  controls: readonly NegativeControl[],
): SignatureReportStatus {
  if (!verification.verified) return "not-verified";
  if (controls.some((control) => control.result.verified)) return "control-failed";
  return "verified";
}

interface AccountRead {
  readonly account: OnChainPqcAccount | null;
  readonly error: string | null;
}

/** Reads the on-chain record once, then serves it without another network call. */
async function readAccountOnce(
  accountClient: PqcAccountReader,
  signer: string,
): Promise<AccountRead> {
  try {
    return { account: await accountClient.readAccount(signer), error: null };
  } catch (err) {
    return { account: null, error: err instanceof Error ? err.message : String(err) };
  }
}

const fixedReader = (read: AccountRead): PqcAccountReader => ({
  async readAccount(address: string): Promise<OnChainPqcAccount | null> {
    if (read.error !== null) throw new Error(read.error);
    return read.account !== null && read.account.address === address ? read.account : null;
  },
});

/** Serves the real on-chain key under the synthetic signer, for control 4 only. */
const relabelledReader = (read: AccountRead): PqcAccountReader => ({
  async readAccount(address: string): Promise<OnChainPqcAccount | null> {
    if (read.error !== null) throw new Error(read.error);
    if (read.account === null || address !== CONTROL_SIGNER) return null;
    return { ...read.account, address: CONTROL_SIGNER };
  },
});

/**
 * Verifies the returned signature and computes the four negative controls.
 * Never throws: a network failure becomes `account-unavailable` and the page
 * reports "not verified", which is the only safe outcome.
 */
export async function runSignatureChecks(input: SignatureChecksInput): Promise<SignatureReport> {
  const chainId = input.chainId ?? NATIVE_CHAIN_ID;
  const read = await readAccountOnce(input.accountClient, input.signer);
  const reader = fixedReader(read);

  const verification = await verifyHybridMessage({
    chainId,
    signer: input.signer,
    message: input.message,
    response: input.response,
    accountClient: reader,
  });

  const control = async (
    id: NegativeControlId,
    label: string,
    expectedReason: string,
    args: {
      response: unknown;
      message: string;
      chainId: string;
      signer: string;
      reader: PqcAccountReader;
    },
  ): Promise<NegativeControl> => ({
    id,
    label,
    expectedReason,
    result: await verifyHybridMessage({
      chainId: args.chainId,
      signer: args.signer,
      message: args.message,
      response: args.response,
      accountClient: args.reader,
    }),
  });

  const controls: NegativeControl[] = [
    await control("pq-removed", "1. The pq part is removed", "pq-part-missing", {
      response: withoutPqPart(input.response),
      message: input.message,
      chainId,
      signer: input.signer,
      reader,
    }),
    await control(
      "message-changed",
      "2. The message is changed by one character",
      "a rejection by the classical or PQ layer",
      {
        response: input.response,
        message: changeLastCharacter(input.message),
        chainId,
        signer: input.signer,
        reader,
      },
    ),
    await control(
      "wrong-chain",
      "3. The chain id is qorechain-vladi instead of qorechain-diana",
      "pq-signature-invalid",
      {
        response: input.response,
        message: input.message,
        chainId: "qorechain-vladi",
        signer: input.signer,
        reader,
      },
    ),
    await control(
      "signer-changed",
      "4. The signer is the synthetic control address",
      "signer-mismatch",
      {
        response: input.response,
        message: input.message,
        chainId,
        signer: CONTROL_SIGNER,
        reader: relabelledReader(read),
      },
    ),
  ];

  return {
    status: reportStatus(verification, controls),
    verification,
    controls,
    accountKeyBytes: read.account === null ? null : read.account.publicKey.length,
  };
}
