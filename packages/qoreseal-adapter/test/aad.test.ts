// Frozen AAD vectors and the properties the encoding must have.
//
// The vectors were produced once from the ADR-0007 encoding and must not be
// regenerated when a test fails. A failure here means the encoding changed.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { EnvelopeContext } from "../src/aad.js";
import { aadFields, aadHex, encodeAad, expectedSigner, PROTOCOL_LABEL } from "../src/aad.js";

const FIXTURES = fileURLToPath(new URL("../../../fixtures/", import.meta.url));

interface Vector {
  name: string;
  context: EnvelopeContext;
  aadHex: string;
}

const vectors = JSON.parse(readFileSync(join(FIXTURES, "aad-vectors.json"), "utf8")) as {
  format: string;
  vectors: Vector[];
};

const BORROWER = "qor1385wkhky3qkjwq47t8904xrd6s82lmkfjnxxsr";
const LENDER = "qor1lender0000000000000000000000000000";

const requestContext = (overrides: Partial<EnvelopeContext> = {}): EnvelopeContext =>
  ({
    kind: "request",
    chainId: "qorechain-diana",
    requestId: "req-001",
    borrower: BORROWER,
    version: "1",
    ...overrides,
  }) as EnvelopeContext;

const offerContext = (overrides: Partial<EnvelopeContext> = {}): EnvelopeContext =>
  ({
    kind: "offer",
    chainId: "qorechain-diana",
    requestId: "req-001",
    offerId: "off-001",
    borrower: BORROWER,
    lender: LENDER,
    version: "1",
    ...overrides,
  }) as EnvelopeContext;

describe("canonical AAD", () => {
  it("matches every frozen vector", () => {
    expect(vectors.format).toBe("loanshark-aad-vectors-v1");
    for (const vector of vectors.vectors) {
      expect(aadHex(vector.context), vector.name).toBe(vector.aadHex);
    }
  });

  it("starts with the protocol label and its length", () => {
    const bytes = encodeAad(requestContext());
    const expected = new TextEncoder().encode(PROTOCOL_LABEL);
    expect(new DataView(bytes.buffer).getUint32(0, false)).toBe(expected.length);
    expect(bytes.slice(4, 4 + expected.length)).toEqual(expected);
  });

  it("gives a request and an offer with the same ids different bytes", () => {
    const request = vectors.vectors.find((v) => v.name === "request-and-offer-same-ids");
    const offer = vectors.vectors.find((v) => v.name === "offer-basic");
    expect(request).toBeDefined();
    expect(offer).toBeDefined();
    expect(request?.aadHex).not.toBe(offer?.aadHex);
  });

  it("changes when any single context field changes", () => {
    const base = aadHex(offerContext());
    const variants: EnvelopeContext[] = [
      offerContext({ chainId: "qorechain-vladi" } as Partial<EnvelopeContext>),
      offerContext({ kind: "request" } as Partial<EnvelopeContext>),
      offerContext({ requestId: "req-002" } as Partial<EnvelopeContext>),
      offerContext({ offerId: "off-002" } as Partial<EnvelopeContext>),
      offerContext({ borrower: LENDER } as Partial<EnvelopeContext>),
      offerContext({ lender: BORROWER } as Partial<EnvelopeContext>),
      offerContext({ version: "2" } as Partial<EnvelopeContext>),
    ];
    for (const variant of variants) expect(aadHex(variant)).not.toBe(base);
  });

  it("is unambiguous at field boundaries", () => {
    const a = requestContext({ requestId: "ab", borrower: "c" } as Partial<EnvelopeContext>);
    const b = requestContext({ requestId: "a", borrower: "bc" } as Partial<EnvelopeContext>);
    expect(aadHex(a)).not.toBe(aadHex(b));
  });

  it("keeps the field order and count fixed", () => {
    expect(aadFields(requestContext())).toHaveLength(8);
    expect(aadFields(offerContext())).toHaveLength(8);
    expect(aadFields(requestContext())[4]).toBe("");
    expect(aadFields(requestContext())[6]).toBe("");
    expect(aadFields(offerContext())[2]).toBe("offer");
  });

  it("names the sender for each kind", () => {
    expect(expectedSigner(requestContext())).toBe(BORROWER);
    expect(expectedSigner(offerContext())).toBe(LENDER);
  });

  it("refuses a context with a missing required field instead of filling it", () => {
    expect(() => encodeAad(requestContext({ requestId: "" } as Partial<EnvelopeContext>))).toThrow(
      TypeError,
    );
    expect(() =>
      encodeAad({
        kind: "offer",
        chainId: "qorechain-diana",
        requestId: "r",
        offerId: "",
        borrower: BORROWER,
        lender: LENDER,
        version: "1",
      }),
    ).toThrow(TypeError);
    expect(() => encodeAad({ ...offerContext(), lender: "" } as EnvelopeContext)).toThrow(
      TypeError,
    );
  });
});
