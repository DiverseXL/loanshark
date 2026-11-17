# Open questions for QoreChain

Status: written, not sent. Each question names the evidence that makes it a
question rather than a guess. Nothing in this file was submitted anywhere.

## 1. How does a dApp user register an ML-KEM key?

Context: `MsgRegisterKEMKey` is refused when sent by a dApp through QoreX
(source-lock claim 10, read from the wallet-adapter source at
`4ee2f45904ca`). The test account's KEM lookup returns `found: false`
(source-lock claim 15, runtime on 2026-11-16). Without a registered ML-KEM key,
hybrid-mode recipient cards cannot be verified for a real account, which is why
this phase uses mlkem mode with locally generated keys only
(`docs/adr/0004-key-binding-and-mode.md`).

Question: what is the supported path for a browser dApp user on
`qorechain-diana` to register an ML-KEM-1024 key for their own account? Is it a
QoreX screen, a native-lane transaction the app may construct, a
sponsor/facilitator flow, or a CLI step outside the app? A concrete sequence,
including which message type is accepted from which origin, would unblock
hybrid mode.

Evidence: `docs/research/source-lock.md` claims 10 and 15;
`docs/adr/0004-key-binding-and-mode.md`.

## 2. How does a dApp get a user to open an EVM authorization window?

Context: `MsgOpenEVMWindow` is on the same refusal list read from the
wallet-adapter source (source-lock claim 10). The app cannot ask QoreX to open
the window, and C9 in the acceptance matrix depends on an EVM transaction
running under an authorised window.

Question: what is the supported way for a web dApp to have a user open an EVM
authorization window? If it is a QoreX screen, what are its entry points and
limits (targets, value, transaction count, expiry)? If it is a native message,
which signer may submit it and from which origin?

Evidence: `docs/research/source-lock.md` claim 10;
`docs/ACCEPTANCE_MATRIX.md` C9.

## 3. What is the release policy for the QoreSeal TypeScript package on npm?

Context: `@qorechain/qoreseal` 0.1.0 is published on npm with integrity
`sha512-OBUwTVsibzTH/zOpqT6lkq7mH/dCg9zV4hSw3tEMUttt3Jb4BqF4BF6/DsZqzSY1+joPusm3gRutx17kV+Hb5w==`
(source-lock claim 22). The package's own dependency on `@qorechain/qoresign`
is `0.1.0` while this project pins QoreSign `0.2.0` for verification
(source-lock claims 22, 30). The previous source lock said the package was not
on npm (claim 13, now marked superseded).

Question: is 0.1.0 the supported release for the hackathon, and will future
fixes be published to npm rather than requiring a git build? Is it intended
that QoreSeal pin QoreSign 0.1.0 while QoreSign 0.2.0 is current, or will a
QoreSeal release align them? Is there a build attestation linking the npm
tarball to a repository commit?

Evidence: `docs/research/source-lock.md` claims 13, 22 and 30;
`fixtures/qoreseal-vectors-v1.meta.json`.

## 4. What are the official hackathon rules, deadline and licence requirement?

Context: M0-5 is still open. The repository uses Apache-2.0 provisionally
(`docs/adr/0001-licence.md`), and no rule text, deadline or licence requirement
has been confirmed from an official source.

Question: where are the official rules published, what is the submission
deadline and time zone, and what licence and repository-visibility
requirements apply to an Encrypted Apps entry? Is a public GitHub repository
required, and is a particular open-source licence mandated?

Evidence: `docs/research/source-lock.md` claim 16;
`docs/ACCEPTANCE_MATRIX.md` M0-5; `docs/adr/0001-licence.md`.
