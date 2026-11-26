# @loanshark/negotiation

Pure, offline negotiation data for LOANSHARK (ADR-0019): the
`loanshark.request.v1` and `loanshark.offer.v1` payloads, canonical JSON, strict
validation, exact decimal-to-base-unit conversion and the off-chain state
machine.

There is no network call, no clock read, no random source except the CSPRNG used
by `randomId` for identifiers, and no key material. Sealing, signing and relay
transport are done by `@loanshark/qoreseal-adapter`, `@loanshark/seal-account`
and `@loanshark/relay-client`; evaluation is `@loanshark/agreement`.

The validator rejects unknown fields, wrong types, any number that is not a
decimal string, oversized payloads and overlong notes. It never coerces and
never partially accepts.

A confidential-compute backend is **not** implemented and no provider is
adopted (ADR-0018). The offer evaluator's interface could accept one later; this
package stays local and deterministic.
