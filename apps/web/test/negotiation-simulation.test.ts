// Full two-party negotiation simulation (ADR-0019).
//
// REAL: the in-process relay server and client, two seal-account identities with
// fresh throwaway keys, QoreSeal sealing and opening, both verifiers and the
// domain-separated commitment.
// MOCK (labelled): the account client, which serves the keys from this process
// instead of a chain read, and the QoreX signer, replaced by a TEST ONLY hybrid
// signer so nothing asks a wallet for a live signature.
//
// No transaction is sent and no key is persisted.

import { generateSealAccount, type SealAccountIdentity } from "@loanshark/seal-account";
import { addressFromPublicKey } from "@qorechain/qoresign";
import { MemoryRelayStorage, RelayServer } from "@loanshark/api";
import { RelayClient } from "@loanshark/relay-client";
import {
  createThrowawaySigner,
  generateThrowawayIdentity,
  type ThrowawayIdentity,
} from "@loanshark/qoreseal-adapter/testing";
import { parseAmount, type OfferTermsPayload, type RequestPayload } from "@loanshark/negotiation";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createRequest as createRequestPayload,
  evaluateIncomingOffer,
  fetchConfirmations,
  listInbox,
  publishBinding,
  publishCard,
  publishConfirmation,
  randomSalt,
  receiveOffer,
  receiveRequest,
  resolveCounterparty,
  sendOffer,
  sendRequest,
  signConfirmation,
  type NegotiationDeps,
  type NegotiationRegistry,
} from "../src/negotiation/session.js";

const NATIVE_CHAIN_ID = "qorechain-diana";
const TOKEN = "0x97143B771D34ddb9130b807b135Ae675A5a963CA";
const DOMAIN = {
  chainId: 9800n,
  verifyingContract: "0x000000000000000000000000000000000000c0de" as const,
};
// A real wall-clock second, so a binding issued with it is not already expired.
const NOW = Math.floor(Date.now() / 1000);

const makeWallet = (): ThrowawayIdentity => generateThrowawayIdentity();

interface Party {
  identity: SealAccountIdentity;
  wallet: ThrowawayIdentity;
  walletEvm: `0x${string}`;
  deps: NegotiationDeps;
}

const accountIndex = new Map<string, Uint8Array>();
const kemIndex = new Map<string, Uint8Array>();

const accountClient = {
  async readAccount(address: string) {
    const key = accountIndex.get(address);
    return key === undefined ? null : { address, publicKey: key, algorithmId: 1 };
  },
};

const registry: NegotiationRegistry = {
  chainId: NATIVE_CHAIN_ID,
  async getPqPublicKey(address: string) {
    return accountIndex.get(address) ?? null;
  },
  async getMlkemPublicKey(address: string) {
    return kemIndex.get(address) ?? null;
  },
};

function makeParty(): Party {
  const identity = generateSealAccount({ chainId: NATIVE_CHAIN_ID }).identity;
  const wallet = makeWallet();
  const address = addressFromPublicKey(wallet.classicalKey.publicKey, "secp256k1");
  wallet.address = address.bech32;
  const walletEvm = addressFromPublicKey(wallet.classicalKey.publicKey, "eth_secp256k1")
    .hex as `0x${string}`;
  accountIndex.set(identity.address, identity.publicData().mlDsaPublicKey);
  kemIndex.set(identity.address, identity.publicData().mlkemPublicKey);
  accountIndex.set(wallet.address, wallet.pqKey.publicKey);
  return { identity, wallet, walletEvm, deps: null as unknown as NegotiationDeps };
}

function depsFor(party: Party, relay: RelayClient): NegotiationDeps {
  return {
    relay,
    identity: party.identity,
    accountClient,
    registry,
    nativeChainId: NATIVE_CHAIN_ID,
    localW: party.wallet.address,
    localWEvm: party.walletEvm,
    walletSigner: createThrowawaySigner(party.wallet, NATIVE_CHAIN_ID),
    now: () => NOW,
  };
}

describe("two-party negotiation", () => {
  let server: RelayServer;
  let relay: RelayClient;
  let baseUrl: string;
  const borrower = makeParty();
  const lender = makeParty();

  beforeAll(async () => {
    server = new RelayServer({
      storage: new MemoryRelayStorage(),
      allowedHosts: ["127.0.0.1"],
      allowedOrigins: ["http://127.0.0.1:5173"],
      rateLimitMax: 500,
    });
    const port = await server.listen(0, "127.0.0.1");
    baseUrl = `http://127.0.0.1:${port}`;
    relay = new RelayClient({ baseUrl });
    borrower.deps = depsFor(borrower, relay);
    lender.deps = depsFor(lender, relay);

    expect((await publishCard(borrower.deps)).ok).toBe(true);
    expect((await publishCard(lender.deps)).ok).toBe(true);
    const borrowerBinding = await publishBinding(borrower.deps);
    const lenderBinding = await publishBinding(lender.deps);
    expect(borrowerBinding.ok, JSON.stringify(borrowerBinding)).toBe(true);
    expect(lenderBinding.ok, JSON.stringify(lenderBinding)).toBe(true);
  });

  afterAll(async () => {
    await server.close();
  });

  let request: RequestPayload;
  let requestItemId: string;
  let offerTerms: OfferTermsPayload;

  it("borrower sends a request the lender can verify and open", async () => {
    const principal = parseAmount("1", 6);
    const maxTotal = parseAmount("1.1", 6);
    expect(principal.ok && maxTotal.ok).toBe(true);
    if (!principal.ok || !maxTotal.ok) return;

    const built = createRequestPayload({
      borrowerW: borrower.wallet.address,
      lenderW: lender.wallet.address,
      token: TOKEN,
      principal: principal.value.toString(10),
      maxTotalCost: maxTotal.value.toString(10),
      latestDueDate: String(NOW + 6_000),
      note: "Simulation request",
      requestId: "00112233445566778899aabbccddeeff",
      createdAt: new Date(NOW * 1000).toISOString().replace(/.\d{3}Z$/, "Z"),
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    request = built.value;

    const sent = await sendRequest(borrower.deps, request);
    expect(sent.ok, JSON.stringify(sent)).toBe(true);

    const inbox = await listInbox(lender.deps);
    expect(inbox.ok).toBe(true);
    if (!inbox.ok) return;
    const item = inbox.value.find((entry) => entry.kind === "request");
    expect(item).toBeDefined();
    if (item === undefined) return;
    requestItemId = item.id;

    const opened = await receiveRequest(lender.deps, item);
    expect(opened.ok, JSON.stringify(opened)).toBe(true);
    if (opened.ok) expect(opened.value.requestId).toBe(request.requestId);
  });

  it("lender composes an offer and the borrower evaluates it as eligible", async () => {
    expect(request).toBeDefined();
    const inbox = await listInbox(lender.deps);
    if (!inbox.ok) throw new Error("inbox");
    const item = inbox.value.find((entry) => entry.id === requestItemId);
    if (item === undefined) throw new Error("request item");
    const opened = await receiveRequest(lender.deps, item);
    if (!opened.ok) throw new Error(opened.message);

    const counterparty = await resolveCounterparty(lender.deps, request.borrowerW);
    expect(counterparty.ok).toBe(true);
    if (!counterparty.ok) return;

    offerTerms = {
      borrower: counterparty.value.walletEvmAddress,
      lender: lender.walletEvm,
      token: TOKEN,
      principal: request.principal,
      interest: "50000",
      dueDate: String(NOW + 5_600),
      graceSeconds: "3600",
      fundingDeadline: String(NOW + 1_000),
      claimDeadline: String(NOW + 4_600),
      salt: randomSalt(),
    };
    const sent = await sendOffer(
      lender.deps,
      opened.value,
      offerTerms,
      String(NOW + 500),
      "Offer note",
    );
    expect(sent.ok, JSON.stringify(sent)).toBe(true);

    const offers = await listInbox(borrower.deps);
    expect(offers.ok).toBe(true);
    if (!offers.ok) return;
    const offerItem = offers.value.find((entry) => entry.kind === "offer");
    expect(offerItem).toBeDefined();
    if (offerItem === undefined) return;
    const offer = await receiveOffer(borrower.deps, offerItem);
    expect(offer.ok, JSON.stringify(offer)).toBe(true);
    if (!offer.ok) return;

    const evaluation = evaluateIncomingOffer(borrower.deps, request, offer.value);
    expect(evaluation.ok).toBe(true);
    if (!evaluation.ok) return;
    expect(evaluation.value.eligible).toBe(true);
    expect(evaluation.value.checks.every((check) => check.pass)).toBe(true);

    // The same terms are ineligible for a smaller maximum total cost.
    const strict = evaluateIncomingOffer(
      borrower.deps,
      { ...request, maxTotalCost: "1000000" },
      offer.value,
    );
    expect(strict.ok && strict.value.eligible).toBe(false);
  });

  it("both confirmations verify for the same loan and domain", async () => {
    if (offerTerms === undefined) throw new Error("offer terms");
    const { toContractTerms } = await import("@loanshark/negotiation");
    const terms = toContractTerms(offerTerms);

    const borrowerSigned = await signConfirmation(borrower.deps, terms, DOMAIN);
    expect(borrowerSigned.ok).toBe(true);
    if (!borrowerSigned.ok) return;
    const borrowerPublished = await publishConfirmation(borrower.deps, {
      loanId: borrowerSigned.value.confirmation.loanId,
      agreementHash: borrowerSigned.value.confirmation.agreementHash,
      chainId: borrowerSigned.value.confirmation.chainId,
      verifyingContract: borrowerSigned.value.confirmation.verifyingContract,
      role: "borrower",
      signature: borrowerSigned.value.signature,
    });
    expect(borrowerPublished.ok, JSON.stringify(borrowerPublished)).toBe(true);

    const lenderSigned = await signConfirmation(lender.deps, terms, DOMAIN);
    expect(lenderSigned.ok).toBe(true);
    if (!lenderSigned.ok) return;
    expect(lenderSigned.value.confirmation.loanId).toBe(borrowerSigned.value.confirmation.loanId);
    const lenderPublished = await publishConfirmation(lender.deps, {
      loanId: lenderSigned.value.confirmation.loanId,
      agreementHash: lenderSigned.value.confirmation.agreementHash,
      chainId: lenderSigned.value.confirmation.chainId,
      verifyingContract: lenderSigned.value.confirmation.verifyingContract,
      role: "lender",
      signature: lenderSigned.value.signature,
    });
    expect(lenderPublished.ok).toBe(true);

    const verified = await fetchConfirmations(
      borrower.deps,
      borrowerSigned.value.confirmation.loanId,
      DOMAIN,
    );
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.value.map((entry) => entry.role).sort()).toEqual(["borrower", "lender"]);
    }
  });

  it("refuses a confirmation replayed for another contract", async () => {
    if (offerTerms === undefined) throw new Error("offer terms");
    const { toContractTerms } = await import("@loanshark/negotiation");
    const terms = toContractTerms(offerTerms);
    const otherDomain = {
      ...DOMAIN,
      verifyingContract: "0x000000000000000000000000000000000000c0df" as const,
    };
    const signed = await signConfirmation(borrower.deps, terms, otherDomain);
    if (!signed.ok) throw new Error("sign");
    const published = await publishConfirmation(borrower.deps, {
      loanId: signed.value.confirmation.loanId,
      agreementHash: signed.value.confirmation.agreementHash,
      chainId: signed.value.confirmation.chainId,
      verifyingContract: signed.value.confirmation.verifyingContract,
      role: "borrower",
      signature: signed.value.signature,
    });
    expect(published.ok).toBe(true);

    const refused = await fetchConfirmations(
      borrower.deps,
      signed.value.confirmation.loanId,
      DOMAIN,
    );
    expect(refused.ok).toBe(false);
  });

  it("does not send when the counterparty has no binding", async () => {
    const missing = makeWallet();
    const missingAddress = addressFromPublicKey(missing.classicalKey.publicKey, "secp256k1").bech32;
    const before = await listInbox(borrower.deps);
    const built = createRequestPayload({
      borrowerW: borrower.wallet.address,
      lenderW: missingAddress,
      token: TOKEN,
      principal: "1000000",
      maxTotalCost: "1100000",
      latestDueDate: String(NOW + 6_000),
      createdAt: new Date(NOW * 1000).toISOString().replace(/.\d{3}Z$/, "Z"),
    });
    if (!built.ok) throw new Error("request");
    const sent = await sendRequest(borrower.deps, built.value);
    expect(sent.ok).toBe(false);
    if (!sent.ok) expect(sent.state).toBe("CounterpartyNotOnboarded");
    const after = await listInbox(borrower.deps);
    if (!before.ok || !after.ok) throw new Error("inbox");
    expect(after.value).toHaveLength(before.value.length);
  });

  it("fails closed when the relay is down", async () => {
    const dead = new RelayClient({ baseUrl: "http://127.0.0.1:9" });
    const deps = { ...borrower.deps, relay: dead };
    const inbox = await listInbox(deps);
    expect(inbox.ok).toBe(false);
    if (!inbox.ok) expect(inbox.state).toBe("RelayUnavailable");
  });

  it("a tampered ciphertext from a hostile relay is refused", async () => {
    const hostile = new RelayClient({
      baseUrl,
      fetchFn: (async (input: string | URL | Request, init?: RequestInit) => {
        const response = await fetch(input, init);
        if (!String(input).includes("/v1/envelopes/")) return response;
        const body = (await response.json()) as { envelope: { ciphertext: string } };
        const bytes = Buffer.from(body.envelope.ciphertext, "base64");
        const last = bytes.length - 1;
        bytes[last] = (bytes[last] ?? 0) ^ 0xff;
        body.envelope.ciphertext = bytes.toString("base64");
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch,
    });
    const deps = { ...borrower.deps, relay: hostile };
    const inbox = await listInbox(borrower.deps);
    if (!inbox.ok) throw new Error("inbox");
    const offerItem = inbox.value.find((entry) => entry.kind === "offer");
    if (offerItem === undefined) throw new Error("offer item");
    const opened = await receiveOffer(deps, offerItem);
    expect(opened.ok).toBe(false);
    if (!opened.ok) expect(opened.state).toBe("VerificationRefused");
  });

  it("a different seal account cannot open the envelope", async () => {
    const inbox = await listInbox(borrower.deps);
    if (!inbox.ok) throw new Error("inbox");
    const offerItem = inbox.value.find((entry) => entry.kind === "offer");
    if (offerItem === undefined) throw new Error("offer item");
    const third = makeParty();
    third.deps = depsFor(third, relay);
    const opened = await receiveOffer(
      { ...third.deps, localW: borrower.wallet.address },
      offerItem,
    );
    expect(opened.ok).toBe(false);
  });
});
