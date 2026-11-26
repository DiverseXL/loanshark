// Deployment config (ADR-0019). Loaded at runtime; no address is compiled in.
//
// When `settlement` is null the agreement and confirmation steps are disabled
// and say "not deployed". Negotiation still works because it needs no contract.

export interface DeploymentToken {
  readonly label: string;
  readonly address: string;
  readonly decimals: number;
}

export interface DeploymentConfig {
  readonly format: "loanshark-deployment-config-v1";
  readonly chainId: number;
  readonly settlement: string | null;
  readonly tokens: readonly DeploymentToken[];
}

export const NOT_DEPLOYED: DeploymentConfig = Object.freeze({
  format: "loanshark-deployment-config-v1",
  chainId: 9800,
  settlement: null,
  tokens: [],
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Strict: an unknown format or a malformed token list produces NOT_DEPLOYED. */
export function parseDeploymentConfig(value: unknown): DeploymentConfig {
  if (!isRecord(value) || value["format"] !== "loanshark-deployment-config-v1") {
    return NOT_DEPLOYED;
  }
  const chainId = value["chainId"];
  const settlement = value["settlement"];
  const tokens = value["tokens"];
  if (typeof chainId !== "number" || !Number.isInteger(chainId)) return NOT_DEPLOYED;
  if (settlement !== null && typeof settlement !== "string") return NOT_DEPLOYED;
  if (!Array.isArray(tokens)) return NOT_DEPLOYED;
  const parsed: DeploymentToken[] = [];
  for (const token of tokens) {
    if (!isRecord(token)) return NOT_DEPLOYED;
    const label = token["label"];
    const address = token["address"];
    const decimals = token["decimals"];
    if (typeof label !== "string" || typeof address !== "string") return NOT_DEPLOYED;
    if (
      typeof decimals !== "number" ||
      !Number.isInteger(decimals) ||
      decimals < 0 ||
      decimals > 36
    ) {
      return NOT_DEPLOYED;
    }
    parsed.push({ label, address, decimals });
  }
  return { format: "loanshark-deployment-config-v1", chainId, settlement, tokens: parsed };
}

export async function loadDeploymentConfig(
  fetchFn: typeof fetch = fetch,
  url = "/deployment.json",
): Promise<DeploymentConfig> {
  try {
    const response = await fetchFn(url, { headers: { accept: "application/json" } });
    if (!response.ok) return NOT_DEPLOYED;
    return parseDeploymentConfig(await response.json());
  } catch {
    return NOT_DEPLOYED;
  }
}
