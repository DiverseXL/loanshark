// @vitest-environment jsdom
//
// Component tests for Setup, Borrower and Lender with a MOCK relay and MOCK
// wallet reads (labelled). A real seal identity is used so sealing and signing
// are the real code paths; no QoreX call is made and nothing is persisted.

import { addressFromPublicKey } from "@qorechain/qoresign";
import { generateSealAccount, type SealAccountIdentity } from "@loanshark/seal-account";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BorrowerArea } from "../src/negotiation/BorrowerArea.js";
import { NOT_DEPLOYED, type DeploymentConfig } from "../src/negotiation/deployment.js";
import { LenderArea } from "../src/negotiation/LenderArea.js";
import type { NegotiationDeps, RelayLike } from "../src/negotiation/session.js";
import { SetupArea } from "../src/negotiation/SetupArea.js";

const TOKEN = "0x97143B771D34ddb9130b807b135Ae675A5a963CA";
const NATIVE = "qorechain-diana";

const tokens = [{ label: "fUSD", address: TOKEN, decimals: 6 }];
const deployment: DeploymentConfig = { ...NOT_DEPLOYED, tokens };

const lenderSeal = generateSealAccount({ chainId: NATIVE }).identity;
const borrowerSeal = generateSealAccount({ chainId: NATIVE }).identity;

// A TEST ONLY wallet stand-in: the seal identity's hybrid signer plays W so the
// test crosses no jsdom realm boundary. It is not a QoreX wallet.
const borrowerWallet = generateSealAccount({ chainId: NATIVE }).identity;
const lenderWallet = generateSealAccount({ chainId: NATIVE }).identity;
const borrowerEvm = addressFromPublicKey(
  borrowerWallet.publicData().classicalPublicKey,
  "eth_secp256k1",
).hex as `0x${string}`;
const lenderEvm = addressFromPublicKey(
  lenderWallet.publicData().classicalPublicKey,
  "eth_secp256k1",
).hex as `0x${string}`;
const mockSigner = (identity: SealAccountIdentity) => ({
  sign: async (message: Uint8Array) => identity.signMessage(message),
});

const makeRelay = (overrides: Partial<RelayLike> = {}): RelayLike => {
  const ok = async (value: unknown) => ({ ok: true as const, value });
  const base: RelayLike = {
    postEnvelope: vi.fn(async () => ok({ id: "a".repeat(64) })),
    getEnvelope: async () => ({ ok: false, refusal: "http-error", message: "not used" }),
    getInbox: async () => ok([]),
    postCard: async () => ok({}),
    getCard: async () =>
      ok({ sealAddress: lenderSeal.address, card: {}, updatedAt: "2026-11-26T00:00:00Z" }),
    postBinding: async () => ok({}),
    getBinding: async (walletAddress: string) =>
      ok({
        walletAddress,
        statement: {
          fields: {
            sealAddress: lenderSeal.address,
            walletEvmAddress: lenderEvm,
          },
        },
        updatedAt: "2026-11-26T00:00:00Z",
      }),
    postConfirmation: async () => ok({}),
    getConfirmations: async () => ok([]),
  };
  return { ...base, ...overrides } as RelayLike;
};

const makeDeps = (
  identity: SealAccountIdentity,
  wallet: SealAccountIdentity,
  drawerEvm: `0x${string}`,
  relay: RelayLike,
): NegotiationDeps => ({
  relay,
  identity,
  accountClient: { readAccount: async () => null },
  registry: {
    chainId: NATIVE,
    getPqPublicKey: async () => lenderSeal.publicData().mlDsaPublicKey,
    getMlkemPublicKey: async () => lenderSeal.publicData().mlkemPublicKey,
  },
  nativeChainId: NATIVE,
  localW: wallet.address,
  localWEvm: drawerEvm,
  walletSigner: mockSigner(wallet),
  now: () => 1_700_000_000,
});

afterEach(() => {
  cleanup();
});

describe("Setup screen", () => {
  it("renders the checklist, the registration instruction and the privacy data", () => {
    render(
      <SetupArea
        deps={null}
        identity={null}
        onIdentityChange={vi.fn()}
        walletAddress={null}
        walletEvm={null}
        guardReady={false}
        relayUrl="http://127.0.0.1:8787"
      />,
    );
    expect(screen.getByText("1. Wallet (W) and chain")).toBeTruthy();
    expect(screen.getByText(/TODO: QoreX wallet connected/)).toBeTruthy();
    expect(screen.getByText(/scripts\/onboard-seal-account\.mjs --execute/)).toBeTruthy();
    expect(screen.getAllByText(/The relay sees/).length).toBeGreaterThan(0);
  });
});

describe("Borrower screen", () => {
  const fillForm = (): void => {
    fireEvent.change(screen.getByLabelText(/Lender wallet/), {
      target: { value: lenderWallet.address },
    });
    fireEvent.change(screen.getByLabelText(/^Principal/), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText(/Maximum total cost/), {
      target: { value: "1.1" },
    });
    fireEvent.change(screen.getByLabelText(/Latest due date/), {
      target: { value: "1700006000" },
    });
  };

  it("previews the exact payload and sends it once", async () => {
    const relay = makeRelay();
    const deps = makeDeps(borrowerSeal, borrowerWallet, borrowerEvm, relay);
    render(
      <BorrowerArea
        deps={deps}
        deployment={deployment}
        tokens={tokens}
        walletAddress={borrowerWallet.address}
        sentRequests={[]}
        onRequestSent={vi.fn()}
      />,
    );

    fillForm();
    fireEvent.click(screen.getByText("Preview the exact payload"));
    expect(screen.getByText(/"schema":"loanshark.request.v1"/)).toBeTruthy();

    const send = screen.getByText("Seal, sign and send the request");
    fireEvent.click(send);
    fireEvent.click(send);
    await waitFor(() => {
      expect(screen.getByText(/Request sent to the relay/)).toBeTruthy();
    });
    expect(relay.postEnvelope).toHaveBeenCalledTimes(1);
  });

  it("keeps acceptance disabled and says not deployed", () => {
    render(
      <BorrowerArea
        deps={null}
        deployment={deployment}
        tokens={tokens}
        walletAddress={borrowerWallet.address}
        sentRequests={[]}
        onRequestSent={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/Not deployed: the confirmation needs a settlement address/),
    ).toBeTruthy();
  });
});

describe("Lender screen", () => {
  it("shows an empty inbox and refuses to sign without a deployment", async () => {
    const relay = makeRelay();
    const deps = makeDeps(lenderSeal, lenderWallet, lenderEvm, relay);
    render(
      <LenderArea
        deps={deps}
        deployment={deployment}
        tokens={tokens}
        walletAddress={lenderWallet.address}
        walletEvm={lenderEvm}
      />,
    );
    fireEvent.click(screen.getByText("Refresh requests"));
    await waitFor(() => {
      expect(screen.getByText(/No request has been listed in this page yet/)).toBeTruthy();
    });
    expect(screen.getByText(/Not deployed: the agreement and confirmation steps/)).toBeTruthy();
    expect(screen.queryByText("Sign and publish the lender confirmation")).toBeNull();
  });

  it("fails closed when the relay is unavailable", async () => {
    const relay = makeRelay({
      getInbox: async () => ({
        ok: false,
        refusal: "http-error",
        message: "network error",
      }),
    });
    const deps = makeDeps(lenderSeal, lenderWallet, lenderEvm, relay);
    render(
      <LenderArea
        deps={deps}
        deployment={deployment}
        tokens={tokens}
        walletAddress={lenderWallet.address}
        walletEvm={lenderEvm}
      />,
    );
    fireEvent.click(screen.getByText("Refresh requests"));
    await waitFor(() => {
      expect(screen.getByText(/RelayUnavailable/)).toBeTruthy();
    });
  });
});
