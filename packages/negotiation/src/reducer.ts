// The off-chain negotiation state machine (ADR-0019).
//
// Pure: no clock, no network, no randomness. Each event names who may trigger
// it; a transition from any other state is refused with a typed reason rather
// than silently ignored.

import { error, fail, ok, type Result } from "./errors.js";

export const NEGOTIATION_STATES = [
  "Draft",
  "RequestSent",
  "OfferReceived",
  "OfferEvaluated",
  "Accepted",
  "BorrowerConfirmed",
  "LenderConfirmed",
  "ReadyToPropose",
  "CounterpartyNotOnboarded",
  "RelayUnavailable",
] as const;

export type NegotiationState = (typeof NEGOTIATION_STATES)[number];

export type NegotiationActor = "borrower" | "lender";

export type NegotiationEvent =
  | { readonly type: "send-request"; readonly actor: "borrower" }
  | { readonly type: "receive-offer"; readonly actor: "borrower" | "lender" }
  | { readonly type: "evaluate-offer"; readonly actor: "borrower" }
  | { readonly type: "accept"; readonly actor: "borrower"; readonly eligible: boolean }
  | { readonly type: "publish-borrower-confirmation"; readonly actor: "borrower" }
  | { readonly type: "publish-lender-confirmation"; readonly actor: "lender" }
  | { readonly type: "mark-ready"; readonly actor: NegotiationActor }
  | { readonly type: "counterparty-not-onboarded"; readonly actor: NegotiationActor }
  | { readonly type: "relay-unavailable"; readonly actor: NegotiationActor }
  | { readonly type: "reset"; readonly actor: NegotiationActor };

interface Rule {
  readonly from: readonly NegotiationState[];
  readonly to: NegotiationState;
  /** Checked before the state change; returns a message to refuse. */
  readonly guard?: (event: NegotiationEvent) => string | null;
}

const RULES: Record<NegotiationEvent["type"], Rule> = {
  "send-request": { from: ["Draft"], to: "RequestSent" },
  "receive-offer": { from: ["RequestSent"], to: "OfferReceived" },
  "evaluate-offer": { from: ["OfferReceived"], to: "OfferEvaluated" },
  accept: {
    from: ["OfferEvaluated"],
    to: "Accepted",
    guard: (event) =>
      event.type === "accept" && event.eligible
        ? null
        : "the offer is not eligible; an ineligible offer cannot be accepted",
  },
  "publish-borrower-confirmation": { from: ["Accepted"], to: "BorrowerConfirmed" },
  "publish-lender-confirmation": { from: ["BorrowerConfirmed"], to: "LenderConfirmed" },
  "mark-ready": { from: ["LenderConfirmed"], to: "ReadyToPropose" },
  "counterparty-not-onboarded": {
    from: ["Draft", "RequestSent", "OfferReceived", "OfferEvaluated", "Accepted"],
    to: "CounterpartyNotOnboarded",
  },
  "relay-unavailable": {
    from: [
      "Draft",
      "RequestSent",
      "OfferReceived",
      "OfferEvaluated",
      "Accepted",
      "BorrowerConfirmed",
      "LenderConfirmed",
    ],
    to: "RelayUnavailable",
  },
  reset: { from: ["CounterpartyNotOnboarded", "RelayUnavailable"], to: "Draft" },
};

/** The only function that changes a negotiation state. */
export function transition(
  state: NegotiationState,
  event: NegotiationEvent,
): Result<NegotiationState> {
  const rule = RULES[event.type];
  if (rule === undefined) {
    return fail([
      error("event", "forbidden-transition", `${(event as { type: string }).type} is not an event`),
    ]);
  }
  if (!rule.from.includes(state)) {
    return fail([
      error(
        "state",
        "forbidden-transition",
        `${event.type} is not allowed from ${state}; expected one of ${rule.from.join(", ")}`,
      ),
    ]);
  }
  const refusal = rule.guard?.(event) ?? null;
  if (refusal !== null) {
    return fail([error("event", "forbidden-transition", refusal)]);
  }
  return ok(rule.to);
}

/** Initial state before anything is sent. */
export const INITIAL_STATE: NegotiationState = "Draft";
