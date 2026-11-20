// End-to-end binding statement flow: producer and verifier (ADR-0014, ADR-0017).
//
// Producer:
//   1. Builds the ADR-0014 statement fields with normalized addresses and timestamps.
//   2. Obtains wallet account W's signature via the injected signer (e.g. QorexMessageSigner).
//   3. Obtains seal account E's countersignature via SealAccountIdentity.
//   4. Publishes the completed BindingStatement to the relay server.
//
// Verifier:
//   1. Fetches the binding statement for wallet account W from the relay.
//   2. Verifies both W and E hybrid signatures against on-chain ML-DSA-87 records.
//   3. Enforces the validity expiry window and verifies W's derived EVM address.

import type { PqcAccountReader } from "@loanshark/chain-client";
import type {
  BindingStatement,
  BindingStatementFields,
  SealAccountIdentity,
} from "@loanshark/seal-account";
import {
  bindingStatementBytes,
  createBindingStatementFields,
  signBindingStatement,
} from "@loanshark/seal-account";
import type { RelayClient } from "./client.js";
import type { RelayResult, StoredBindingRecord } from "./types.js";

export interface MessageSignerLike {
  sign(message: Uint8Array): Promise<unknown>;
}

export interface ProduceBindingInput {
  chainId: string;
  walletAddress: string;
  walletEvmAddress: string;
  walletSigner: MessageSignerLike;
  sealIdentity: SealAccountIdentity;
  relayClient: RelayClient;
  issuedAt?: Date;
  expiry?: Date;
}

export interface ProduceBindingResult {
  statement: BindingStatement;
  stored: StoredBindingRecord;
}

export interface FetchAndVerifyBindingInput {
  walletAddress: string;
  relayClient: RelayClient;
  walletAccountClient: PqcAccountReader;
  sealAccountClient: PqcAccountReader;
  now?: Date;
  requireEvmAddressMatch?: boolean;
}

/**
 * Builds the ADR-0014 statement, signs with W and E, and publishes to the relay.
 */
export async function produceAndPublishBinding(
  input: ProduceBindingInput,
): Promise<RelayResult<ProduceBindingResult>> {
  let fields: BindingStatementFields;
  try {
    fields = createBindingStatementFields({
      chainId: input.chainId,
      walletAddress: input.walletAddress,
      sealAddress: input.sealIdentity.address,
      walletEvmAddress: input.walletEvmAddress,
      ...(input.issuedAt ? { issuedAt: input.issuedAt } : {}),
      ...(input.expiry ? { expiry: input.expiry } : {}),
    });
  } catch (err) {
    return {
      ok: false,
      refusal: "binding-invalid",
      message: `invalid statement fields: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const statementBytes = bindingStatementBytes(fields);

  let walletSignature: unknown;
  try {
    walletSignature = await input.walletSigner.sign(statementBytes);
  } catch (err) {
    return {
      ok: false,
      refusal: "binding-invalid",
      message: `wallet signing failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  let statement: BindingStatement;
  try {
    statement = signBindingStatement({
      fields,
      walletSignature,
      sealIdentity: input.sealIdentity,
    });
  } catch (err) {
    return {
      ok: false,
      refusal: "binding-invalid",
      message: `seal countersigning failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const publishRes = await input.relayClient.postBinding({
    walletAddress: input.walletAddress,
    statement: statement as unknown as Record<string, unknown>,
  });

  if (!publishRes.ok) {
    return publishRes;
  }

  return {
    ok: true,
    value: {
      statement,
      stored: publishRes.value,
    },
  };
}

/**
 * Fetches a binding statement from the relay and verifies it end to end.
 * If verification fails, returns a typed refusal and NEVER the untrusted statement.
 */
export async function fetchAndVerifyBinding(
  input: FetchAndVerifyBindingInput,
): Promise<RelayResult<StoredBindingRecord>> {
  return input.relayClient.getBinding(input.walletAddress, {
    walletAccountClient: input.walletAccountClient,
    sealAccountClient: input.sealAccountClient,
    ...(input.now ? { now: input.now } : {}),
    ...(input.requireEvmAddressMatch !== undefined
      ? { requireEvmAddressMatch: input.requireEvmAddressMatch }
      : {}),
  });
}
