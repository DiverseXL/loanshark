// Read-only transaction preflight.
//
// Every check is a JSON-RPC read or an `eth_call` simulation. Nothing signs and
// nothing sends. A check is pass, fail or unknown; any RPC error, timeout or
// malformed response makes that check unknown and the whole result unknown.
// "unknown" is never reported as "ready".

import type { FootprintActionId } from "@loanshark/privacy-footprint";
import { FOOTPRINTS } from "@loanshark/privacy-footprint";
import { decodeErrorResult, decodeFunctionResult, encodeFunctionData, keccak256 } from "viem";
import { ERC20_ABI, LOAN_STATES, MAX_UINT256, REVERT_ERRORS_ABI, SETTLEMENT_ABI } from "./abi.js";
import type {
  Address,
  CheckStatus,
  PreflightAction,
  PreflightCheck,
  PreflightConfig,
  PreflightDeps,
  PreflightPlan,
  PreflightResult,
  Terms,
} from "./types.js";

const DEFAULT_TIMEOUT_MS = 10_000;

const FOOTPRINT_OF: Record<PreflightAction, FootprintActionId> = {
  propose: "propose-loan",
  approve: "approve-token",
  fund: "fund",
  claim: "claim",
  repay: "repay",
  withdraw: "withdraw",
  cancel: "cancel",
  refund: "refund",
};

/** States in which the contract allows each action. */
const ALLOWED_STATES: Record<PreflightAction, number[]> = {
  propose: [0], // None
  approve: [],
  fund: [1], // Proposed
  claim: [2], // Funded
  cancel: [1],
  refund: [2],
  repay: [3, 4], // Active, Defaulted
  withdraw: [3, 4, 5, 8], // Active, Defaulted, Repaid, Refunded
};

const ROLE: Record<PreflightAction, "borrower" | "lender" | "any"> = {
  propose: "borrower",
  approve: "any",
  fund: "lender",
  claim: "borrower",
  cancel: "borrower",
  refund: "lender",
  repay: "borrower",
  withdraw: "lender",
};

type RpcOutcome<T> = { ok: true; value: T } | { ok: false; error: string };

/** One JSON-RPC call with a timeout. Any failure is returned, never thrown. */
async function rpc<T>(
  deps: PreflightDeps,
  method: string,
  params: unknown[],
): Promise<RpcOutcome<T>> {
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<RpcOutcome<T>>((resolve) => {
    timer = setTimeout(
      () => resolve({ ok: false, error: `${method} timed out after ${timeoutMs} ms` }),
      timeoutMs,
    );
  });
  try {
    const call = deps.request(method, params).then(
      (value): RpcOutcome<T> => ({ ok: true, value: value as T }),
      (error): RpcOutcome<T> => ({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return await Promise.race([call, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

const pass = (id: string, explanation: string): PreflightCheck => ({
  id,
  status: "pass",
  explanation,
});
const fail = (id: string, explanation: string): PreflightCheck => ({
  id,
  status: "fail",
  explanation,
});
const unknown = (id: string, explanation: string): PreflightCheck => ({
  id,
  status: "unknown",
  explanation,
});

const asHex = (value: unknown): `0x${string}` | null =>
  typeof value === "string" && /^0x[0-9a-fA-F]*$/.test(value) ? (value as `0x${string}`) : null;

/** Splits a runtime code blob's trailing CBOR metadata, as the verifier does. */
export function splitRuntimeMetadata(code: `0x${string}`): {
  body: string;
  metadata: string;
} {
  const hex = code.slice(2).toLowerCase();
  if (hex.length < 4) return { body: hex, metadata: "" };
  const totalBytes = Number.parseInt(hex.slice(-4), 16);
  if (!Number.isFinite(totalBytes) || totalBytes * 2 > hex.length) {
    return { body: hex, metadata: "" };
  }
  return {
    body: hex.slice(0, hex.length - totalBytes * 2),
    metadata: hex.slice(hex.length - totalBytes * 2),
  };
}

const lc = (value: Address): Address => value.toLowerCase() as Address;

/** Addresses are lowercased: viem rejects a mixed-case address with a bad checksum. */
function normalizePlan(input: PreflightPlan): PreflightPlan {
  const terms = input.terms;
  return {
    ...input,
    from: lc(input.from),
    settlement: lc(input.settlement),
    token: lc(input.token),
    ...(terms
      ? {
          terms: {
            ...terms,
            borrower: lc(terms.borrower),
            lender: lc(terms.lender),
            token: lc(terms.token),
          },
        }
      : {}),
  };
}

function encodeCall(plan: PreflightPlan): { to: Address; data: `0x${string}` } {
  if (plan.action === "approve") {
    return {
      to: plan.token,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "approve",
        args: [plan.settlement, plan.amount],
      }),
    };
  }
  if (plan.action === "propose") {
    if (!plan.terms) throw new Error("propose requires terms");
    return {
      to: plan.settlement,
      data: encodeFunctionData({
        abi: SETTLEMENT_ABI,
        functionName: "proposeLoan",
        args: [plan.terms],
      }),
    };
  }
  const loanId = plan.loanId;
  if (!loanId) throw new Error(`${plan.action} requires a loanId`);
  const functionName = plan.action;
  if (plan.action === "repay") {
    return {
      to: plan.settlement,
      data: encodeFunctionData({
        abi: SETTLEMENT_ABI,
        functionName,
        args: [loanId, plan.amount],
      }),
    };
  }
  return {
    to: plan.settlement,
    data: encodeFunctionData({ abi: SETTLEMENT_ABI, functionName, args: [loanId] }),
  };
}

function decodeRevert(data: `0x${string}`): string {
  try {
    const decoded = decodeErrorResult({ abi: REVERT_ERRORS_ABI, data });
    return `${decoded.errorName}(${(decoded.args ?? []).map(String).join(", ")})`;
  } catch {
    return `undecoded revert data ${data.slice(0, 10)}`;
  }
}

/**
 * Runs the preflight. Never throws for a bad chain, bad input or failed RPC:
 * the result says blocked or unknown and explains why.
 */
export async function preflight(
  inputPlan: PreflightPlan,
  config: PreflightConfig,
  deps: PreflightDeps,
): Promise<PreflightResult> {
  const plan = normalizePlan(inputPlan);
  const checks: PreflightCheck[] = [];
  const footprint = FOOTPRINT_OF[plan.action];
  const publicFields = [...FOOTPRINTS[footprint].publicOnChain];
  let tokenDecimals: number | undefined;
  let estimatedGas: bigint | undefined;

  // 1. Chain id.
  const chainRead = await rpc<string>(deps, "eth_chainId", []);
  if (!chainRead.ok) {
    checks.push(unknown("chain-id", `eth_chainId failed: ${chainRead.error}`));
  } else {
    const remote = asHex(chainRead.value);
    if (remote === null) {
      checks.push(unknown("chain-id", "eth_chainId returned a malformed value"));
    } else {
      const actual = Number.parseInt(remote, 16);
      if (actual !== config.expectedChainId) {
        checks.push(
          fail(
            "chain-id",
            `the node reports chain ${actual}, the config expects ${config.expectedChainId}`,
          ),
        );
      } else if (plan.chainId !== config.expectedChainId) {
        checks.push(
          fail(
            "chain-id",
            `the plan was built for chain ${plan.chainId}, the config expects ${config.expectedChainId}`,
          ),
        );
      } else {
        checks.push(pass("chain-id", `the node and the plan are on chain ${actual}`));
      }
    }
  }

  // 2. Settlement address and runtime code.
  if (plan.settlement.toLowerCase() !== config.settlementAddress.toLowerCase()) {
    checks.push(
      fail(
        "settlement-address",
        `the plan targets ${plan.settlement}, the config expects ${config.settlementAddress}`,
      ),
    );
  } else {
    const codeRead = await rpc<string>(deps, "eth_getCode", [plan.settlement, "latest"]);
    if (!codeRead.ok) {
      checks.push(unknown("settlement-code", `eth_getCode failed: ${codeRead.error}`));
    } else {
      const code = asHex(codeRead.value);
      if (code === null) {
        checks.push(unknown("settlement-code", "eth_getCode returned a malformed value"));
      } else if (code === "0x") {
        checks.push(
          fail("settlement-code", "no contract code at the settlement address on this chain"),
        );
      } else if (!config.expectedRuntimeCodeHash) {
        checks.push(
          pass(
            "settlement-code",
            `code present (${(code.length - 2) / 2} bytes); no hash configured`,
          ),
        );
      } else {
        const actual = keccak256(code);
        if (actual.toLowerCase() === config.expectedRuntimeCodeHash.toLowerCase()) {
          checks.push(pass("settlement-code", "the runtime code hash equals the configured hash"));
        } else {
          const onChain = splitRuntimeMetadata(code);
          const expected = config.expectedRuntimeCodeHash;
          checks.push(
            fail(
              "settlement-code",
              onChain.metadata === ""
                ? `runtime code hash ${actual} does not equal the configured ${expected}; no comparable metadata trailer`
                : `runtime code hash ${actual} does not equal the configured ${expected}. The code before the CBOR metadata trailer is ${onChain.body.length / 2} bytes and the trailer is ${onChain.metadata.length / 2} bytes; a metadata-only difference is still a mismatch and is reported, not accepted`,
            ),
          );
        }
      }
    }
  }

  // 3. Token allowlist: the contract's own list and the configured list.
  const allowedRead = await rpc<string>(deps, "eth_call", [
    {
      to: plan.settlement,
      data: encodeFunctionData({ abi: SETTLEMENT_ABI, functionName: "allowedTokens" }),
    },
    "latest",
  ]);
  const inConfig = config.allowedTokens.some(
    (token) => token.toLowerCase() === plan.token.toLowerCase(),
  );
  if (!allowedRead.ok) {
    checks.push(unknown("token-allowlisted", `allowedTokens() failed: ${allowedRead.error}`));
  } else {
    const data = asHex(allowedRead.value);
    if (data === null) {
      checks.push(unknown("token-allowlisted", "allowedTokens() returned a malformed value"));
    } else {
      let onChainAllowed: Address[] | null = null;
      try {
        onChainAllowed = decodeFunctionResult({
          abi: SETTLEMENT_ABI,
          functionName: "allowedTokens",
          data,
        }) as Address[];
      } catch {
        onChainAllowed = null;
      }
      if (onChainAllowed === null) {
        checks.push(unknown("token-allowlisted", "allowedTokens() could not be decoded"));
      } else {
        const inContract = onChainAllowed.some(
          (token) => token.toLowerCase() === plan.token.toLowerCase(),
        );
        checks.push(
          inContract && inConfig
            ? pass("token-allowlisted", "the token is in the contract's allowlist and the config")
            : fail(
                "token-allowlisted",
                `the token is ${inContract ? "" : "not "}in the contract's allowlist (${
                  onChainAllowed.join(", ") || "empty"
                }) and ${inConfig ? "" : "not "}in the config`,
              ),
        );
      }
    }
  }

  // 4. Token decimals, read from the token.
  const decimalsRead = await rpc<string>(deps, "eth_call", [
    { to: plan.token, data: encodeFunctionData({ abi: ERC20_ABI, functionName: "decimals" }) },
    "latest",
  ]);
  if (!decimalsRead.ok) {
    checks.push(unknown("token-decimals", `decimals() failed: ${decimalsRead.error}`));
  } else {
    const data = asHex(decimalsRead.value);
    if (data === null) {
      checks.push(unknown("token-decimals", "decimals() returned a malformed value"));
    } else {
      try {
        tokenDecimals = Number(
          decodeFunctionResult({ abi: ERC20_ABI, functionName: "decimals", data }),
        );
        checks.push(pass("token-decimals", `the token reports ${tokenDecimals} decimals`));
      } catch {
        checks.push(unknown("token-decimals", "decimals() could not be decoded"));
      }
    }
  }

  const pullsFunds = plan.action === "fund" || plan.action === "repay";

  // 5. Sender balance when the action pulls funds.
  if (pullsFunds) {
    const balanceRead = await rpc<string>(deps, "eth_call", [
      {
        to: plan.token,
        data: encodeFunctionData({
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [plan.from],
        }),
      },
      "latest",
    ]);
    if (!balanceRead.ok) {
      checks.push(unknown("token-balance", `balanceOf failed: ${balanceRead.error}`));
    } else {
      const data = asHex(balanceRead.value);
      if (data === null) {
        checks.push(unknown("token-balance", "balanceOf returned a malformed value"));
      } else {
        try {
          const balance = decodeFunctionResult({
            abi: ERC20_ABI,
            functionName: "balanceOf",
            data,
          });
          checks.push(
            balance >= plan.amount
              ? pass("token-balance", `balance ${balance} covers the amount ${plan.amount}`)
              : fail(
                  "token-balance",
                  `balance ${balance} does not cover the amount ${plan.amount}`,
                ),
          );
        } catch {
          checks.push(unknown("token-balance", "balanceOf could not be decoded"));
        }
      }
    }
  } else {
    checks.push(pass("token-balance", "this action does not pull tokens from the sender"));
  }

  // 6. Allowance, and the unlimited-approval rule for approve.
  const allowanceRead = await rpc<string>(deps, "eth_call", [
    {
      to: plan.token,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [plan.from, plan.settlement],
      }),
    },
    "latest",
  ]);
  const allowance: bigint | null = (() => {
    if (!allowanceRead.ok) return null;
    const data = asHex(allowanceRead.value);
    if (data === null) return null;
    try {
      return decodeFunctionResult({ abi: ERC20_ABI, functionName: "allowance", data });
    } catch {
      return null;
    }
  })();
  if (allowance === null) {
    checks.push(
      unknown(
        "allowance",
        allowanceRead.ok
          ? "allowance() could not be decoded"
          : `allowance() failed: ${allowanceRead.error}`,
      ),
    );
  } else if (plan.action === "approve") {
    if (plan.amount === MAX_UINT256) {
      checks.push(
        fail(
          "allowance",
          "the plan approves an unlimited amount; approve the exact amount needed instead",
        ),
      );
    } else if (plan.amount === 0n) {
      checks.push(fail("allowance", "the plan approves zero, which moves nothing"));
    } else {
      checks.push(
        pass(
          "allowance",
          `the plan approves exactly ${plan.amount} base units (current allowance ${allowance})`,
        ),
      );
    }
  } else if (pullsFunds) {
    checks.push(
      allowance >= plan.amount
        ? pass("allowance", `allowance ${allowance} covers the amount ${plan.amount}`)
        : fail("allowance", `allowance ${allowance} does not cover the amount ${plan.amount}`),
    );
  } else {
    checks.push(pass("allowance", "this action does not use an allowance"));
  }

  // 7. Loan state and caller role.
  if (plan.action !== "approve") {
    if (!plan.loanId) {
      checks.push(
        unknown("loan-state", "the plan has no loanId, so stateOf and termsOf cannot be read"),
      );
      checks.push(unknown("caller-role", "the plan has no loanId, so termsOf cannot be read"));
    } else {
      const stateRead = await rpc<string>(deps, "eth_call", [
        {
          to: plan.settlement,
          data: encodeFunctionData({
            abi: SETTLEMENT_ABI,
            functionName: "stateOf",
            args: [plan.loanId],
          }),
        },
        "latest",
      ]);
      const state: number | null = (() => {
        if (!stateRead.ok) return null;
        const data = asHex(stateRead.value);
        if (data === null) return null;
        try {
          return Number(
            decodeFunctionResult({ abi: SETTLEMENT_ABI, functionName: "stateOf", data }),
          );
        } catch {
          return null;
        }
      })();
      if (state === null) {
        checks.push(
          unknown(
            "loan-state",
            stateRead.ok ? "stateOf could not be decoded" : `stateOf failed: ${stateRead.error}`,
          ),
        );
      } else if (plan.action === "propose") {
        checks.push(
          state === 0
            ? pass("loan-state", "no loan exists with this id")
            : fail(
                "loan-state",
                `a loan already exists with this id in state ${LOAN_STATES[state] ?? state}`,
              ),
        );
      } else {
        const allowed = ALLOWED_STATES[plan.action];
        const current = LOAN_STATES[state] ?? String(state);
        checks.push(
          allowed.includes(state)
            ? pass("loan-state", `the loan is ${current}, which ${plan.action} accepts`)
            : fail(
                "loan-state",
                `the loan is ${current}; ${plan.action} requires ${allowed
                  .map((index) => LOAN_STATES[index] ?? index)
                  .join(" or ")}`,
              ),
        );
      }

      if (plan.action === "propose") {
        // The terms do not exist on chain yet; the plan carries them.
        if (!plan.terms) {
          checks.push(
            unknown("caller-role", "propose needs terms in the plan to check the sender"),
          );
        } else {
          checks.push(
            plan.from.toLowerCase() === plan.terms.borrower.toLowerCase()
              ? pass("caller-role", "the sender is the borrower in the planned terms")
              : fail("caller-role", "the sender is not the borrower in the planned terms"),
          );
        }
      } else {
        const termsRead = await rpc<string>(deps, "eth_call", [
          {
            to: plan.settlement,
            data: encodeFunctionData({
              abi: SETTLEMENT_ABI,
              functionName: "termsOf",
              args: [plan.loanId],
            }),
          },
          "latest",
        ]);
        let onChainTerms: Terms | null = null;
        if (termsRead.ok) {
          const data = asHex(termsRead.value);
          if (data !== null) {
            try {
              onChainTerms = decodeFunctionResult({
                abi: SETTLEMENT_ABI,
                functionName: "termsOf",
                data,
              }) as Terms;
            } catch {
              onChainTerms = null;
            }
          }
        }
        if (onChainTerms === null) {
          checks.push(
            unknown(
              "caller-role",
              termsRead.ok ? "termsOf could not be decoded" : `termsOf failed: ${termsRead.error}`,
            ),
          );
        } else {
          const role = ROLE[plan.action];
          const expected =
            role === "borrower"
              ? onChainTerms.borrower
              : role === "lender"
                ? onChainTerms.lender
                : plan.from;
          checks.push(
            plan.from.toLowerCase() === expected.toLowerCase()
              ? pass("caller-role", `the sender is the ${role} for this loan`)
              : fail("caller-role", `the sender ${plan.from} is not the ${role} (${expected})`),
          );
        }
      }
    }

    if (plan.action === "repay" && plan.loanId) {
      const outstandingRead = await rpc<string>(deps, "eth_call", [
        {
          to: plan.settlement,
          data: encodeFunctionData({
            abi: SETTLEMENT_ABI,
            functionName: "outstandingOf",
            args: [plan.loanId],
          }),
        },
        "latest",
      ]);
      if (!outstandingRead.ok) {
        checks.push(unknown("repay-amount", `outstandingOf failed: ${outstandingRead.error}`));
      } else {
        const data = asHex(outstandingRead.value);
        try {
          const outstanding =
            data === null
              ? null
              : decodeFunctionResult({ abi: SETTLEMENT_ABI, functionName: "outstandingOf", data });
          if (outstanding === null) {
            checks.push(unknown("repay-amount", "outstandingOf could not be decoded"));
          } else {
            checks.push(
              plan.amount > 0n && plan.amount <= outstanding
                ? pass(
                    "repay-amount",
                    `repayment ${plan.amount} is within the outstanding ${outstanding}`,
                  )
                : fail("repay-amount", `repayment ${plan.amount} is not within 1..${outstanding}`),
            );
          }
        } catch {
          checks.push(unknown("repay-amount", "outstandingOf could not be decoded"));
        }
      }
    }
  } else {
    checks.push(pass("loan-state", "approve is a token action and does not read loan state"));
    checks.push(pass("caller-role", "approve can be sent by any token holder"));
  }

  // 8. Simulation from the sender.
  let call: { to: Address; data: `0x${string}` } | null = null;
  try {
    call = encodeCall(plan);
  } catch (error) {
    checks.push(
      unknown(
        "simulation",
        `the call could not be encoded: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }
  if (call !== null) {
    const sim = await rpc<string>(deps, "eth_call", [
      { from: plan.from, to: call.to, data: call.data },
      "latest",
    ]);
    if (sim.ok) {
      checks.push(pass("simulation", "eth_call from the sender returned without reverting"));
    } else if (
      /revert|vm exception|invalid opcode|out of gas|execution reverted/i.test(sim.error) ||
      /0x[0-9a-fA-F]{8,}/.test(sim.error)
    ) {
      const data = /0x[0-9a-fA-F]{8,}/.exec(sim.error);
      checks.push(
        fail(
          "simulation",
          data === null
            ? `eth_call reverted: ${sim.error}`
            : `eth_call reverted with ${decodeRevert(data[0] as `0x${string}`)}`,
        ),
      );
    } else {
      // A transport failure is not a revert: the outcome is unknown, not a fail.
      checks.push(unknown("simulation", `eth_call could not be completed: ${sim.error}`));
    }

    // 9. Gas estimate, shown rather than acted on.
    const gas = await rpc<string>(deps, "eth_estimateGas", [
      { from: plan.from, to: call.to, data: call.data },
    ]);
    if (gas.ok) {
      const hex = asHex(gas.value);
      if (hex === null || hex.length <= 2) {
        checks.push(unknown("gas-estimate", "eth_estimateGas returned a malformed value"));
      } else {
        try {
          estimatedGas = BigInt(hex);
          checks.push(pass("gas-estimate", `eth_estimateGas returned ${estimatedGas} gas`));
        } catch {
          checks.push(unknown("gas-estimate", "eth_estimateGas returned a malformed value"));
        }
      }
    } else {
      checks.push(unknown("gas-estimate", `eth_estimateGas failed: ${gas.error}`));
    }
  }

  return {
    status: aggregate(checks),
    checks,
    publicFields,
    footprint,
    ...(tokenDecimals === undefined ? {} : { tokenDecimals }),
    ...(estimatedGas === undefined ? {} : { estimatedGas }),
  };
}

function aggregate(checks: PreflightCheck[]): "ready" | "blocked" | "unknown" {
  if (checks.some((item) => item.status === "fail")) return "blocked";
  if (checks.some((item) => item.status === "unknown")) return "unknown";
  return "ready";
}

export type { CheckStatus };
