import { describe, expect, it } from "vitest";
import {
  buildRequest,
  canonicalJson,
  checkOfferMatchesRequest,
  decodeOffer,
  decodeRequest,
  encodeRequest,
  MAX_NOTE_LENGTH,
  type OfferPayload,
  REQUEST_SCHEMA_ID,
  type RequestPayload,
  validateOffer,
  validateRequest,
} from "../src/index.js";

const BORROWER_W = "qor1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5tfman7";
const LENDER_W = "qor19rl4cm2hmr8afy4kldpxz3fka4jguq0agt672h";
const TOKEN = "0x97143b771d34ddb9130b807b135ae675a5a963ca";
const SALT = `0x${"ab".repeat(32)}`;

const validRequest = (): RequestPayload => ({
  schema: REQUEST_SCHEMA_ID,
  requestId: "00112233445566778899aabbccddeeff",
  borrowerW: BORROWER_W,
  lenderW: LENDER_W,
  token: TOKEN,
  principal: "1000000",
  maxTotalCost: "1100000",
  latestDueDate: "1700300000",
  note: "Equipment for a workshop",
  createdAt: "2026-11-26T10:00:00Z",
});

const validOffer = (): OfferPayload => ({
  schema: "loanshark.offer.v1",
  offerId: "ffeeddccbbaa99887766554433221100",
  requestId: validRequest().requestId,
  borrowerW: BORROWER_W,
  lenderW: LENDER_W,
  terms: {
    borrower: "0x1111111111111111111111111111111111111111",
    lender: "0x2222222222222222222222222222222222222222",
    token: TOKEN,
    principal: "1000000",
    interest: "50000",
    dueDate: "1700300000",
    graceSeconds: "3600",
    fundingDeadline: "1700100000",
    claimDeadline: "1700200000",
    salt: SALT,
  },
  offerExpiresAt: "1700050000",
  note: "Offer valid for one day",
});

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe("request validation", () => {
  it("accepts a well-formed request and reports no errors", () => {
    const result = validateRequest(validRequest());
    expect(result.ok).toBe(true);
  });

  it("rejects an unknown field", () => {
    const result = validateRequest({ ...validRequest(), extra: "x" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]?.code).toBe("unknown-field");
  });

  it("rejects a number where a decimal string is required", () => {
    const result = validateRequest({ ...validRequest(), principal: 1000000 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]?.code).toBe("wrong-type");
  });

  it("rejects negative, float and hex numbers", () => {
    for (const value of ["-1", "1.5", "0x10", "1e6", "01"]) {
      const result = validateRequest({ ...validRequest(), principal: value });
      expect(result.ok, value).toBe(false);
      if (!result.ok) expect(result.errors[0]?.code).toBe("not-decimal");
    }
  });

  it("rejects a maximum total cost below the principal", () => {
    const result = validateRequest({ ...validRequest(), maxTotalCost: "999999" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]?.field).toBe("maxTotalCost");
  });

  it("rejects the same address for borrower and lender", () => {
    const result = validateRequest({ ...validRequest(), lenderW: BORROWER_W });
    expect(result.ok).toBe(false);
  });

  it("rejects a non-canonical qor1 address", () => {
    const result = validateRequest({ ...validRequest(), lenderW: LENDER_W.toUpperCase() });
    expect(result.ok).toBe(false);
  });

  it("rejects an overlong note and an overlong field list", () => {
    const overlong = validateRequest({ ...validRequest(), note: "a".repeat(MAX_NOTE_LENGTH + 1) });
    expect(overlong.ok).toBe(false);
    if (!overlong.ok) expect(overlong.errors[0]?.code).toBe("too-long");
  });

  it("rejects a wrong schema id and a bad timestamp", () => {
    expect(validateRequest({ ...validRequest(), schema: "loanshark.request.v0" }).ok).toBe(false);
    expect(validateRequest({ ...validRequest(), createdAt: "2026-11-26 10:00:00" }).ok).toBe(false);
  });

  it("builds a request with an injected id and defaults the note", () => {
    const built = buildRequest({
      borrowerW: BORROWER_W,
      lenderW: LENDER_W,
      token: TOKEN,
      principal: "1000000",
      maxTotalCost: "1100000",
      latestDueDate: "1700300000",
      requestId: "00112233445566778899aabbccddeeff",
      createdAt: "2026-11-26T10:00:00Z",
    });
    expect(built.ok).toBe(true);
    if (built.ok) expect(built.value.note).toBe("");
  });
});

describe("canonical encoding", () => {
  it("is deterministic and independent of key order", () => {
    const a = { z: "1", a: { y: "2", b: "3" } };
    const b = { a: { b: "3", y: "2" }, z: "1" };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(canonicalJson(a)).toBe('{"a":{"b":"3","y":"2"},"z":"1"}');
  });

  it("refuses numbers and booleans", () => {
    expect(() => canonicalJson({ n: 1 })).toThrow(/numbers are not allowed/);
    expect(() => canonicalJson({ b: true })).toThrow(/booleans are not allowed/);
  });

  it("round-trips a request through the canonical bytes", () => {
    const encoded = encodeRequest(validRequest());
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    const decoded = decodeRequest(encoded.value);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) expect(decoded.value).toEqual(validRequest());
  });

  it("rejects a payload over the size bound and invalid UTF-8", () => {
    const huge = `{"x":"${"a".repeat(9000)}"}`;
    const result = decodeRequest(huge);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]?.code).toBe("too-large");
    expect(decodeRequest(new Uint8Array([0xff, 0xfe])).ok).toBe(false);
  });
});

describe("offer validation", () => {
  it("accepts a well-formed offer", () => {
    expect(validateOffer(validOffer()).ok).toBe(true);
  });

  it("rejects an unknown field inside terms", () => {
    const bad = clone(validOffer());
    (bad.terms as unknown as Record<string, unknown>)["bonus"] = "1";
    const result = validateOffer(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]?.field).toBe("terms.bonus");
  });

  it("rejects a zero principal and an overflow", () => {
    const zero = clone(validOffer());
    (zero.terms as unknown as Record<string, unknown>)["principal"] = "0";
    expect(validateOffer(zero).ok).toBe(false);

    const overflow = clone(validOffer());
    (overflow.terms as unknown as Record<string, unknown>)["interest"] =
      "115792089237316195423570985008687907853269984665640564039457584007913129639935";
    expect(validateOffer(overflow).ok).toBe(false);
  });

  it("rejects a malformed salt", () => {
    const bad = clone(validOffer());
    (bad.terms as unknown as Record<string, unknown>)["salt"] = "0x12";
    expect(validateOffer(bad).ok).toBe(false);
  });

  it("decodes only a valid canonical payload", () => {
    const encoded = canonicalJson(validOffer());
    expect(decodeOffer(encoded).ok).toBe(true);
    expect(decodeOffer("{not json").ok).toBe(false);
  });

  it("detects an offer that answers a different request", () => {
    const request = validRequest();
    const moved = clone(validOffer());
    (moved as unknown as Record<string, unknown>)["requestId"] = "ffeeddccbbaa99887766554433221100";
    const result = checkOfferMatchesRequest(moved, request);
    expect(result.ok).toBe(false);
  });
});
