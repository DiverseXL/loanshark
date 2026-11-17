# ADR-0001: Licence

Status: Accepted (2026-11-17)

Context: The hackathon rules have now been read from the organiser's pages on 2026-11-17: "Project code must be published under the MIT or Apache-2.0 licence, with the licence file in the repository" (`https://build.qorechain.io/rules`; `docs/research/source-lock.md` claim 48). The start page repeats that the repository needs an MIT or Apache-2.0 licence (`https://build.qorechain.io/start`). Before this date the requirement was recorded as unknown and the choice was provisional.

Options: MIT; Apache-2.0.

Decision: Apache-2.0. It matches the licence of QoreSeal and the QoreChain SDK and carries a patent grant. The repository ships the full, unmodified Apache-2.0 text in `LICENSE`.

Consequences: Apache-2.0 satisfies the rule. Dependencies must still be licence-reviewed before submission (M7). Kyrve code is not copied. The rules page does not mention GitHub licence detection, so the file itself, not a badge, is the requirement that is met.

Test required: Run the dependency licence check in M7 and confirm the GitHub licence view shows Apache-2.0 once the repository is public.
