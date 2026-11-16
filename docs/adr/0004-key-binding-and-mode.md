# ADR-0004: Key binding, encryption mode and KEM key registration

Status: Proposed, with a BLOCKED dependency
Context: "ML-DSA key binding" is the recipient card: the account signs the X25519 key and the hash of its registered ML-KEM key with its ML-DSA-87 key, and `verify_recipient_card` checks both against the chain. Hybrid mode needs the card; mlkem mode needs only the on-chain KEM key. The wallet-adapter source says QoreX refuses `MsgRegisterKEMKey` from web apps.
Decision: Hybrid mode with card verification is the default, because the brief requires the binding. mlkem mode is a fallback only, chosen explicitly. The offline crypto slice can be built with generated keys; the registered-key flow cannot until a registration path is confirmed.
BLOCKED: how a web-app user registers an ML-KEM key. Candidates: a QoreX screen (unchecked), guidance from the QoreChain team. No substitute is built meanwhile.
Test required: C1, T3.
