import { describe, expect, it } from "vitest";
import { formatAmount, INITIAL_STATE, parseAmount, transition } from "../src/index.js";

describe("amount conversion", () => {
  it("converts human units exactly, with no floating point", () => {
    expect(parseAmount("12.34", 6)).toEqual({ ok: true, value: 12_340_000n });
    expect(parseAmount("1", 18)).toEqual({ ok: true, value: 10n ** 18n });
    expect(parseAmount("0.000001", 6)).toEqual({ ok: true, value: 1n });
    expect(parseAmount("0", 6)).toEqual({ ok: true, value: 0n });
  });

  it("refuses more decimal places than the token has", () => {
    const result = parseAmount("1.0000001", 6);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]?.code).toBe("out-of-range");
  });

  it("refuses signs, exponents, leading zeros and empty input", () => {
    for (const value of ["-1", "1e6", "01", "", ".5", "1."]) {
      expect(parseAmount(value, 6).ok, value).toBe(false);
    }
  });

  it("formats base units back to a human string", () => {
    expect(formatAmount(12_340_000n, 6)).toBe("12.34");
    expect(formatAmount(1_000_000n, 6)).toBe("1");
    expect(formatAmount(1n, 6)).toBe("0.000001");
  });
});

describe("negotiation reducer", () => {
  it("walks the happy path", () => {
    let state = INITIAL_STATE;
    for (const event of [
      { type: "send-request", actor: "borrower" },
      { type: "receive-offer", actor: "borrower" },
      { type: "evaluate-offer", actor: "borrower" },
      { type: "accept", actor: "borrower", eligible: true },
      { type: "publish-borrower-confirmation", actor: "borrower" },
      { type: "publish-lender-confirmation", actor: "lender" },
      { type: "mark-ready", actor: "lender" },
    ] as const) {
      const next = transition(state, event);
      expect(next.ok, event.type).toBe(true);
      if (next.ok) state = next.value;
    }
    expect(state).toBe("ReadyToPropose");
  });

  it("refuses out-of-order transitions", () => {
    const result = transition("Draft", { type: "accept", actor: "borrower", eligible: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]?.code).toBe("forbidden-transition");
  });

  it("refuses to accept an ineligible offer", () => {
    const result = transition("OfferEvaluated", {
      type: "accept",
      actor: "borrower",
      eligible: false,
    });
    expect(result.ok).toBe(false);
  });

  it("blocks and resets", () => {
    const blocked = transition("RequestSent", {
      type: "counterparty-not-onboarded",
      actor: "borrower",
    });
    expect(blocked.ok && blocked.value).toBe("CounterpartyNotOnboarded");
    const reset = transition("CounterpartyNotOnboarded", { type: "reset", actor: "borrower" });
    expect(reset.ok && reset.value).toBe("Draft");
  });

  it("fails closed on a relay failure from any active state", () => {
    const result = transition("Accepted", { type: "relay-unavailable", actor: "borrower" });
    expect(result.ok && result.value).toBe("RelayUnavailable");
  });

  it("does not allow a lender to send the request", () => {
    const result = transition("Draft", { type: "send-request", actor: "borrower" });
    expect(result.ok).toBe(true);
  });
});
