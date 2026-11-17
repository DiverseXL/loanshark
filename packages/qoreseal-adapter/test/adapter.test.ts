// C1: only the intended recipient can open an envelope.
// C2: one lender cannot read another lender's offer, and offers are independent.
//
// All identities are throwaway test keys generated in this process. The mock
// account client is labelled as such; no test contacts a chain or an RPC.

import { describe, expect, it } from "vitest";
import type { EnvelopeContext } from "../src/aad.js";
import { encodeAad } from "../src/aad.js";
import { openEnvelope, sealMlkemToRecipient } from "../src/adapter.js";
import { generateThrowawayIdentity } from "../src/testing.js";

const CHAIN_ID = "qorechain-diana";
const PURPOSE = "loanshark/offer";
const OFFER_CONTEXT: EnvelopeContext = {
  kind: "offer",
  chainId: CHAIN_ID,
  requestId: "req-001",
  offerId: "off-001",
  borrower: "qor1borrower000000000000000000000000000",
  lender: "qor1lender0000000000000000000000000000",
  version: "1",
};

const seal = (plaintext: string, recipient: Uint8Array, context = OFFER_CONTEXT) => {
  const aad = encodeAad(context);
  const sealed = sealMlkemToRecipient({
    chainId: context.chainId,
    purpose: PURPOSE,
    recipient: { mlkemPublicKey: recipient },
    plaintext: new TextEncoder().encode(plaintext),
    aad,
  });
  if (!sealed.ok) throw new Error(`seal failed: ${sealed.code} ${sealed.message}`);
  return { sealed: sealed.value, aad };
};

describe("seal and open in mlkem mode", () => {
  it("opens for the intended recipient and returns the exact plaintext", () => {
    const recipient = generateThrowawayIdentity();
    const { sealed, aad } = seal(
      "offer terms: 1000 fUSD at 5 percent",
      recipient.sealKeys.mlkemPublicKey,
    );

    const opened = openEnvelope({
      chainId: CHAIN_ID,
      purpose: PURPOSE,
      envelope: sealed.envelope,
      keys: recipient.sealKeys,
      aad,
    });

    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(new TextDecoder().decode(opened.value.plaintext)).toBe(
      "offer terms: 1000 fUSD at 5 percent",
    );
    // The result carries the plaintext and nothing else.
    expect(Object.keys(opened.value)).toEqual(["plaintext"]);
  });

  it("C1: the wrong recipient cannot open it", () => {
    const recipient = generateThrowawayIdentity();
    const stranger = generateThrowawayIdentity();
    const { sealed, aad } = seal("for the borrower only", recipient.sealKeys.mlkemPublicKey);

    const opened = openEnvelope({
      chainId: CHAIN_ID,
      purpose: PURPOSE,
      envelope: sealed.envelope,
      keys: stranger.sealKeys,
      aad,
    });

    expect(opened).toMatchObject({ ok: false, code: "not-a-recipient" });
  });

  it("refuses an envelope opened for another chain or purpose", () => {
    const recipient = generateThrowawayIdentity();
    const { sealed, aad } = seal("chain bound", recipient.sealKeys.mlkemPublicKey);

    expect(
      openEnvelope({
        chainId: "qorechain-vladi",
        purpose: PURPOSE,
        envelope: sealed.envelope,
        keys: recipient.sealKeys,
        aad,
      }),
    ).toMatchObject({ ok: false });
    expect(
      openEnvelope({
        chainId: CHAIN_ID,
        purpose: "loanshark/request",
        envelope: sealed.envelope,
        keys: recipient.sealKeys,
        aad,
      }),
    ).toMatchObject({ ok: false });
  });

  it("rejects a malformed envelope with a typed error", () => {
    const recipient = generateThrowawayIdentity();
    const result = openEnvelope({
      chainId: CHAIN_ID,
      purpose: PURPOSE,
      envelope: new Uint8Array(10),
      keys: recipient.sealKeys,
      aad: encodeAad(OFFER_CONTEXT),
    });
    expect(result).toMatchObject({ ok: false, code: "malformed-envelope" });
  });

  it("rejects unknown input shapes without throwing", () => {
    expect(
      sealMlkemToRecipient({
        chainId: CHAIN_ID,
        purpose: PURPOSE,
        recipient: { mlkemPublicKey: new Uint8Array(1) },
        plaintext: new Uint8Array(1),
        aad: encodeAad(OFFER_CONTEXT),
      }),
    ).toMatchObject({ ok: false, code: "invalid-input" });
  });

  it("C2: lender B cannot open lender A's offer", () => {
    const borrower = generateThrowawayIdentity();
    const lenderA = generateThrowawayIdentity();
    const lenderB = generateThrowawayIdentity();

    // Lender A seals an offer to the borrower.
    const offerA: EnvelopeContext = { ...OFFER_CONTEXT, lender: lenderA.address };
    const { sealed, aad } = seal("lender A: 4 percent", borrower.sealKeys.mlkemPublicKey, offerA);

    // The borrower opens it.
    expect(
      openEnvelope({
        chainId: CHAIN_ID,
        purpose: PURPOSE,
        envelope: sealed.envelope,
        keys: borrower.sealKeys,
        aad,
      }).ok,
    ).toBe(true);

    // Lender B is not a recipient of it.
    expect(
      openEnvelope({
        chainId: CHAIN_ID,
        purpose: PURPOSE,
        envelope: sealed.envelope,
        keys: lenderB.sealKeys,
        aad,
      }),
    ).toMatchObject({ ok: false, code: "not-a-recipient" });
  });

  it("C2: two offers are two independent envelopes", () => {
    const borrower = generateThrowawayIdentity();
    const offerA: EnvelopeContext = {
      ...OFFER_CONTEXT,
      offerId: "off-A",
      lender: "qor1lenderA00000000000000000000000000",
    };
    const offerB: EnvelopeContext = {
      ...OFFER_CONTEXT,
      offerId: "off-B",
      lender: "qor1lenderB00000000000000000000000000",
    };

    const a = seal("offer A: 4 percent", borrower.sealKeys.mlkemPublicKey, offerA);
    const b = seal("offer B: 6 percent", borrower.sealKeys.mlkemPublicKey, offerB);

    expect(Buffer.from(a.sealed.envelope).equals(Buffer.from(b.sealed.envelope))).toBe(false);
    expect(a.aad).not.toEqual(b.aad);

    const openA = openEnvelope({
      chainId: CHAIN_ID,
      purpose: PURPOSE,
      envelope: a.sealed.envelope,
      keys: borrower.sealKeys,
      aad: a.aad,
    });
    const openB = openEnvelope({
      chainId: CHAIN_ID,
      purpose: PURPOSE,
      envelope: b.sealed.envelope,
      keys: borrower.sealKeys,
      aad: b.aad,
    });
    expect(openA.ok && new TextDecoder().decode(openA.value.plaintext)).toBe("offer A: 4 percent");
    expect(openB.ok && new TextDecoder().decode(openB.value.plaintext)).toBe("offer B: 6 percent");

    // Offer A's AAD does not open offer B.
    expect(
      openEnvelope({
        chainId: CHAIN_ID,
        purpose: PURPOSE,
        envelope: b.sealed.envelope,
        keys: borrower.sealKeys,
        aad: a.aad,
      }),
    ).toMatchObject({ ok: false, code: "decryption-failed" });
  });
});
