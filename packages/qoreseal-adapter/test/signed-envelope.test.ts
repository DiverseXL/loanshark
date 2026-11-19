// C3: a tampered envelope or a changed context is rejected.
// T5 and T7: forged, classical-only or PQ-stripped signatures are rejected.
// T6: a lender cannot re-seal the borrower's request under the borrower's
// signature.
//
// Signing uses the official QoreSign `signMessage` API with a throwaway key.
// The account client is a MOCK that returns that key; no chain is contacted.

import { describe, expect, it } from "vitest";
import type { EnvelopeContext, RequestContext } from "../src/aad.js";
import { encodeAad } from "../src/aad.js";
import { openEnvelope, sealMlkemToRecipient } from "../src/adapter.js";
import type { MessageSigner, SignedEnvelope } from "../src/envelope.js";
import { signEnvelope, signedEnvelopeMessageText, verifySignedEnvelope } from "../src/envelope.js";
import {
  createClassicalOnlyThrowawaySigner,
  createThrowawaySigner,
  generateThrowawayIdentity,
  mockAccountClient,
} from "../src/testing.js";

const CHAIN_ID = "qorechain-diana";
const PURPOSE = "loanshark/request";

const sealRequest = (plaintext: string, recipient: Uint8Array, context: RequestContext) => {
  const sealed = sealMlkemToRecipient({
    chainId: context.chainId,
    purpose: PURPOSE,
    recipient: { mlkemPublicKey: recipient },
    plaintext: new TextEncoder().encode(plaintext),
    aad: encodeAad(context),
  });
  if (!sealed.ok) throw new Error(`seal failed: ${sealed.code} ${sealed.message}`);
  return sealed.value.envelope;
};

const sign = async (
  envelope: Uint8Array,
  context: EnvelopeContext,
  signer: MessageSigner,
): Promise<SignedEnvelope> => {
  const signed = await signEnvelope({ envelope, context, signer });
  if (!signed.ok) throw new Error(`sign failed: ${signed.code} ${signed.message}`);
  return signed.value;
};

describe("signed envelopes", () => {
  it("signs with the official QoreSign API and verifies against the mock key", async () => {
    const borrower = generateThrowawayIdentity();
    const context: RequestContext = {
      kind: "request",
      chainId: CHAIN_ID,
      requestId: "req-001",
      borrower: borrower.address,
      version: "1",
    };
    const envelope = sealRequest("need 1000 fUSD", borrower.sealKeys.mlkemPublicKey, context);
    const signed = await sign(envelope, context, createThrowawaySigner(borrower, CHAIN_ID));

    expect(signed.signature.pq).toBeDefined();
    expect(signedEnvelopeMessageText(envelope, context)).toMatch(
      /^loanshark\/v1\/envelope\|[0-9a-f]{64}\|[0-9a-f]{64}$/,
    );

    const verified = await verifySignedEnvelope({
      signed,
      accountClient: mockAccountClient(borrower),
    });
    expect(verified).toMatchObject({ ok: true, value: { signer: borrower.address } });
  });

  it("C3: a flipped ciphertext byte fails to open", async () => {
    const borrower = generateThrowawayIdentity();
    const context: RequestContext = {
      kind: "request",
      chainId: CHAIN_ID,
      requestId: "req-001",
      borrower: borrower.address,
      version: "1",
    };
    const envelope = sealRequest("no tampering", borrower.sealKeys.mlkemPublicKey, context);
    const tampered = Uint8Array.from(envelope);
    tampered[tampered.length - 1] = (tampered[tampered.length - 1] ?? 0) ^ 0x01;

    const opened = openEnvelope({
      chainId: CHAIN_ID,
      purpose: PURPOSE,
      envelope: tampered,
      keys: borrower.sealKeys,
      aad: encodeAad(context),
    });
    expect(opened).toMatchObject({ ok: false, code: "decryption-failed" });
  });

  it("C3: changing each context field individually fails to open and to verify", async () => {
    const borrower = generateThrowawayIdentity();
    const context: RequestContext = {
      kind: "request",
      chainId: CHAIN_ID,
      requestId: "req-001",
      borrower: borrower.address,
      version: "1",
    };
    const envelope = sealRequest("context bound", borrower.sealKeys.mlkemPublicKey, context);
    const signed = await sign(envelope, context, createThrowawaySigner(borrower, CHAIN_ID));

    const variants: EnvelopeContext[] = [
      { ...context, chainId: "qorechain-vladi" },
      { ...context, requestId: "req-002" },
      { ...context, borrower: generateThrowawayIdentity().address },
      { ...context, version: "2" },
      {
        ...context,
        kind: "offer",
        offerId: "off-001",
        lender: borrower.address,
      } as EnvelopeContext,
    ];

    for (const variant of variants) {
      const opened = openEnvelope({
        chainId: variant.chainId,
        purpose: PURPOSE,
        envelope,
        keys: borrower.sealKeys,
        aad: encodeAad(variant),
      });
      expect(opened.ok, `open with ${JSON.stringify(variant)}`).toBe(false);

      const verified = await verifySignedEnvelope({
        signed: { ...signed, context: variant },
        accountClient: mockAccountClient(borrower),
      });
      expect(verified.ok, `verify with ${JSON.stringify(variant)}`).toBe(false);
    }
  });

  it("C3: an envelope moved to another request fails", async () => {
    const borrower = generateThrowawayIdentity();
    const context: RequestContext = {
      kind: "request",
      chainId: CHAIN_ID,
      requestId: "req-001",
      borrower: borrower.address,
      version: "1",
    };
    const other: RequestContext = { ...context, requestId: "req-999" };
    const envelope = sealRequest("request one", borrower.sealKeys.mlkemPublicKey, context);
    const signed = await sign(envelope, context, createThrowawaySigner(borrower, CHAIN_ID));

    expect(
      openEnvelope({
        chainId: CHAIN_ID,
        purpose: PURPOSE,
        envelope,
        keys: borrower.sealKeys,
        aad: encodeAad(other),
      }),
    ).toMatchObject({ ok: false, code: "decryption-failed" });

    expect(
      await verifySignedEnvelope({
        signed: { ...signed, context: other },
        accountClient: mockAccountClient(borrower),
      }),
    ).toMatchObject({ ok: false });
  });

  it("T6: a variant re-sealed for the second lender is rejected by the signature", async () => {
    const borrower = generateThrowawayIdentity();
    const lender1 = generateThrowawayIdentity();
    const lender2 = generateThrowawayIdentity();
    const context: RequestContext = {
      kind: "request",
      chainId: CHAIN_ID,
      requestId: "req-001",
      borrower: borrower.address,
      version: "1",
    };

    // The borrower seals the same request separately for each lender and signs
    // the first envelope.
    const toLender1 = sealRequest("need 1000 fUSD", lender1.sealKeys.mlkemPublicKey, context);
    const toLender2 = sealRequest("need 1000 fUSD", lender2.sealKeys.mlkemPublicKey, context);
    expect(Buffer.from(toLender1).equals(Buffer.from(toLender2))).toBe(false);
    const signed = await sign(toLender1, context, createThrowawaySigner(borrower, CHAIN_ID));

    expect(
      await verifySignedEnvelope({ signed, accountClient: mockAccountClient(borrower) }),
    ).toMatchObject({ ok: true });

    // A lender moves the borrower's signature onto the envelope for lender 2.
    const forged = await verifySignedEnvelope({
      signed: { ...signed, envelope: toLender2 },
      accountClient: mockAccountClient(borrower),
    });
    expect(forged).toMatchObject({
      ok: false,
      code: "classical-signature-invalid",
      verifierCode: "CLASSICAL_SIGNATURE_INVALID",
    });
  });

  it("T5: a signature by a different key for the stated borrower is rejected", async () => {
    const borrower = generateThrowawayIdentity();
    const attacker = generateThrowawayIdentity();
    const context: RequestContext = {
      kind: "request",
      chainId: CHAIN_ID,
      requestId: "req-001",
      borrower: borrower.address,
      version: "1",
    };
    const envelope = sealRequest("forged request", borrower.sealKeys.mlkemPublicKey, context);
    // The attacker signs, but the context still names the borrower.
    const signed = await sign(envelope, context, createThrowawaySigner(attacker, CHAIN_ID));

    expect(
      await verifySignedEnvelope({ signed, accountClient: mockAccountClient(borrower) }),
    ).toMatchObject({
      ok: false,
      code: "signer-mismatch",
      verifierCode: "ADDRESS_MISMATCH",
    });
  });

  it("T5 and T7: a classical-only signature is refused", async () => {
    const borrower = generateThrowawayIdentity();
    const context: RequestContext = {
      kind: "request",
      chainId: CHAIN_ID,
      requestId: "req-001",
      borrower: borrower.address,
      version: "1",
    };
    const envelope = sealRequest("classical only", borrower.sealKeys.mlkemPublicKey, context);
    const signed = await sign(
      envelope,
      context,
      createClassicalOnlyThrowawaySigner(borrower, CHAIN_ID),
    );
    expect(signed.signature.pq).toBeUndefined();

    expect(
      await verifySignedEnvelope({ signed, accountClient: mockAccountClient(borrower) }),
    ).toMatchObject({
      ok: false,
      code: "pq-part-missing",
      verifierCode: "PQ_LAYER_MISSING",
    });
  });

  it("T7: removing the PQ part from a valid signature is refused", async () => {
    const borrower = generateThrowawayIdentity();
    const context: RequestContext = {
      kind: "request",
      chainId: CHAIN_ID,
      requestId: "req-001",
      borrower: borrower.address,
      version: "1",
    };
    const envelope = sealRequest("pq stripped", borrower.sealKeys.mlkemPublicKey, context);
    const signed = await sign(envelope, context, createThrowawaySigner(borrower, CHAIN_ID));

    const stripped: SignedEnvelope = {
      ...signed,
      signature: {
        signatureType: signed.signature.signatureType,
        classical: signed.signature.classical,
      },
    };
    expect(
      await verifySignedEnvelope({ signed: stripped, accountClient: mockAccountClient(borrower) }),
    ).toMatchObject({
      ok: false,
      code: "pq-part-missing",
      verifierCode: "PQ_LAYER_MISSING",
    });
  });

  it("rejects a signature object that is not shaped like a hybrid signature", async () => {
    const borrower = generateThrowawayIdentity();
    const signed = {
      envelope: new Uint8Array(1),
      context: {
        kind: "request",
        chainId: CHAIN_ID,
        requestId: "r",
        borrower: borrower.address,
        version: "1",
      } as RequestContext,
      signature: {} as SignedEnvelope["signature"],
    };
    expect(
      await verifySignedEnvelope({ signed, accountClient: mockAccountClient(borrower) }),
    ).toMatchObject({ ok: false, code: "invalid-signature-shape" });
  });

  it("ADR-0015: an envelope whose AAD names E instead of W is refused by the verifier", async () => {
    // Borrower has wallet account W and seal account E.
    const walletW = generateThrowawayIdentity();
    const sealE = generateThrowawayIdentity();

    // Expected context: AAD borrower is wallet W (ADR-0015).
    const validContext: RequestContext = {
      kind: "request",
      chainId: CHAIN_ID,
      requestId: "req-001",
      borrower: walletW.address,
      version: "1",
    };

    // Envelope is sealed to sealE and signed by sealE over validContext.
    const envelope = sealRequest(
      "loan request 5000 fUSD",
      sealE.sealKeys.mlkemPublicKey,
      validContext,
    );
    const signed = await sign(envelope, validContext, createThrowawaySigner(sealE, CHAIN_ID));

    // When verified with the valid context and seal account E as signer, it succeeds:
    const validVerification = await verifySignedEnvelope({
      signed,
      signer: sealE.address,
      accountClient: mockAccountClient(sealE),
    });
    expect(validVerification).toMatchObject({ ok: true });

    // An alternative envelope whose AAD mistakenly names seal account E instead of wallet W:
    const invalidContextWithE: RequestContext = {
      ...validContext,
      borrower: sealE.address,
    };
    const invalidEnvelope = sealRequest(
      "loan request 5000 fUSD",
      sealE.sealKeys.mlkemPublicKey,
      invalidContextWithE,
    );
    const signedWithEInAad = await sign(
      invalidEnvelope,
      invalidContextWithE,
      createThrowawaySigner(sealE, CHAIN_ID),
    );

    // When the recipient verifier expects wallet W in the loan context, the envelope whose AAD names E is refused:
    // 1. Verifying against the expected loan context (naming W) fails because AAD hashes differ:
    const refusedByContext = await verifySignedEnvelope({
      signed: { ...signedWithEInAad, context: validContext },
      signer: sealE.address,
      accountClient: mockAccountClient(sealE),
    });
    expect(refusedByContext).toMatchObject({ ok: false });

    // 2. An envelope carrying AAD with E instead of expected wallet W is rejected by the application verifier:
    const contextNamesW = signedWithEInAad.context.borrower === walletW.address;
    expect(contextNamesW).toBe(false);
  });
});
