import assert from "node:assert/strict";
import { network } from "hardhat";
import { keccak256, maxUint256, stringToHex } from "viem";

export type NetworkConnection = Awaited<ReturnType<typeof network.create>>;

/** One million base units: one whole 6-decimal token. */
export const ONE_USD = 1_000_000n;

let saltCounter = 0n;

/** Deterministic, unique salt for each test loan. */
export function nextSalt(): `0x${string}` {
  saltCounter += 1n;
  return keccak256(stringToHex(`loanshark-test-loan-${saltCounter}`));
}

export interface World {
  net: NetworkConnection;
  owner: Awaited<ReturnType<NetworkConnection["viem"]["getWalletClients"]>>[number];
  borrower: Awaited<ReturnType<NetworkConnection["viem"]["getWalletClients"]>>[number];
  lender: Awaited<ReturnType<NetworkConnection["viem"]["getWalletClients"]>>[number];
  outsider: Awaited<ReturnType<NetworkConnection["viem"]["getWalletClients"]>>[number];
  otherLender: Awaited<ReturnType<NetworkConnection["viem"]["getWalletClients"]>>[number];
  token: Awaited<ReturnType<NetworkConnection["viem"]["deployContract"]>>;
  token18: Awaited<ReturnType<NetworkConnection["viem"]["deployContract"]>>;
  fusd: Awaited<ReturnType<NetworkConnection["viem"]["deployContract"]>>;
  settlement: Awaited<ReturnType<NetworkConnection["viem"]["deployContract"]>>;
}

/**
 * Deploys the labelled 6-decimal token, an 18-decimal mock token, the MOCK
 * fUSD-profile token and the settlement contract allowlisting TestUSD and the
 * mock fUSD only (ADR-0013 Option A).
 */
export async function deployWorld(net: NetworkConnection): Promise<World> {
  const clients = await net.viem.getWalletClients();
  const owner = clients[0]!;
  const borrower = clients[1]!;
  const lender = clients[2]!;
  const outsider = clients[3]!;
  const otherLender = clients[4]!;

  const token = await net.viem.deployContract("TestUSD", [owner.account.address]);
  const token18 = await net.viem.deployContract("MockDecimals18");
  const fusd = await net.viem.deployContract("MockFusdProfile");
  const settlement = await net.viem.deployContract("LoanSettlement", [token.address, fusd.address]);

  // Fund the participants. This is a test fixture, not part of the product.
  await token.write.mint([borrower.account.address, 10_000n * ONE_USD]);
  await token.write.mint([lender.account.address, 10_000n * ONE_USD]);
  await token.write.mint([otherLender.account.address, 10_000n * ONE_USD]);
  await token.write.mint([outsider.account.address, 10_000n * ONE_USD]);
  await token18.write.mint([borrower.account.address, 10_000n * 10n ** 18n]);
  await token18.write.mint([lender.account.address, 10_000n * 10n ** 18n]);
  await fusd.write.mint([borrower.account.address, 10_000n * ONE_USD]);
  await fusd.write.mint([lender.account.address, 10_000n * ONE_USD]);

  // Standing allowances for the test fixture. The contract pulls principal and
  // repayments with transferFrom, so the payer must approve it first.
  for (const wallet of [borrower, lender]) {
    await token.write.approve([settlement.address, maxUint256], { account: wallet.account });
    await token18.write.approve([settlement.address, maxUint256], { account: wallet.account });
    await fusd.write.approve([settlement.address, maxUint256], { account: wallet.account });
  }

  return {
    net,
    owner,
    borrower,
    lender,
    outsider,
    otherLender,
    token,
    token18,
    fusd,
    settlement,
  };
}

/** Deploys a settlement that allows `token` plus a separate 18-decimal mock. */
export async function deploySettlementFor(
  net: NetworkConnection,
  token: `0x${string}`,
): Promise<Awaited<ReturnType<NetworkConnection["viem"]["deployContract"]>>> {
  const filler = await net.viem.deployContract("MockDecimals18");
  return net.viem.deployContract("LoanSettlement", [token, filler.address]);
}

/** Current chain time as bigint. */
export async function now(net: NetworkConnection): Promise<bigint> {
  return BigInt(await net.networkHelpers.time.latest());
}

export interface TermOptions {
  borrower: World["borrower"];
  lender: World["lender"];
  token: `0x${string}`;
  now: bigint;
  salt?: `0x${string}`;
  principal?: bigint;
  interest?: bigint;
  dueIn?: bigint;
  graceSeconds?: bigint;
  fundingIn?: bigint;
  claimIn?: bigint;
}

/** Builds valid terms with a coherent timeline by default. */
export function makeTerms(options: TermOptions) {
  const {
    borrower,
    lender,
    token,
    now: current,
    salt = nextSalt(),
    principal = 1_000n * ONE_USD,
    interest = 50n * ONE_USD,
    dueIn = 5_600n,
    graceSeconds = 300n,
    fundingIn = 1_000n,
    claimIn = 4_600n,
  } = options;

  return {
    borrower: borrower.account.address,
    lender: lender.account.address,
    token,
    principal,
    interest,
    dueDate: current + dueIn,
    graceSeconds,
    fundingDeadline: current + fundingIn,
    claimDeadline: current + claimIn,
    salt,
  } as const;
}

/** Token balance assertion, in base units. */
export async function assertBalance(
  token: World["token"],
  address: `0x${string}`,
  expected: bigint,
  label = "balance",
): Promise<void> {
  assert.equal(await token.read.balanceOf([address]), expected, label);
}

/** The full happy path, returning the loan id. */
export async function openActiveLoan(world: World, terms: ReturnType<typeof makeTerms>) {
  const loanId = await world.settlement.read.commitmentOf([terms]);
  await world.settlement.write.proposeLoan([terms], { account: world.borrower.account });
  await world.settlement.write.fund([loanId], { account: world.lender.account });
  await world.settlement.write.claim([loanId], { account: world.borrower.account });
  return loanId;
}
