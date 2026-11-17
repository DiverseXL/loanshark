# ADR-0007: Canonical AAD encoding

Status: Proposed, implemented and frozen by fixtures
Context: QoreSeal takes `aad` as opaque bytes, authenticates them with AES-256-GCM, and does not store them in the envelope (source-lock claim 24). The project must define those bytes so two clients agree and so no two different contexts encode identically. The request/offer contexts contain strings supplied by the app (ids and addresses), so a naive concatenation can collide at field boundaries.
Options considered:

1. **Fixed field list, each field length-prefixed (chosen).** Eight fields in a fixed order; each is a 4-byte unsigned big-endian length followed by UTF-8 bytes. Fields that do not apply are encoded with length zero. The field count and order are fixed by `version`.
2. JSON canonicalization (RFC 8785). Rejected: it adds a canonicalization dependency and rules to get wrong, and the wire value is larger than needed. It also makes the byte layout depend on JSON escaping rather than on the protocol fields.
3. Separator-delimited text (`label|chain|kind|...`). Rejected: any field containing the separator makes two contexts collide unless escaping is defined and implemented identically everywhere.
4. Concatenation without lengths. Rejected: `("ab","c")` and `("a","bc")` encode identically.
5. Length-prefixed only the fields that apply. Rejected: the layout then depends on `kind`, which is also the field an attacker would change. A single fixed layout is simpler to test and to review.

Decision: The eight fields, in order, are:

| # | Field | Source | Request | Offer |
|---|---|---|---|---|
| 0 | protocol label | constant | `loanshark/v1` | `loanshark/v1` |
| 1 | chain id | context | `qorechain-diana` | `qorechain-diana` |
| 2 | kind | context | `request` | `offer` |
| 3 | request id | context | required | required |
| 4 | offer id | context | empty | required |
| 5 | borrower | context | required | required |
| 6 | lender | context | empty | required |
| 7 | version | context | `1` | `1` |

Each field is `uint32-big-endian(length) || UTF-8(field)`. The version field is last so a future layout can be introduced as a new version value rather than by changing version 1. Empty values are only legal where this table says so; an empty required field is a `TypeError`, never filled in from memory.

Consequences: `fixtures/aad-vectors.json` freezes the bytes for ten contexts, including one where a request and an offer share every id and party. `packages/qoreseal-adapter/test/aad.test.ts` recomputes each vector; changing the encoding breaks the test. The fixture hash is recorded in `docs/evidence/phase-02-result.md`.

Test required: C3 in the acceptance matrix and T4 in the threat model.
