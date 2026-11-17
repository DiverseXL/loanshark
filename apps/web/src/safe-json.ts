// A JSON renderer for the raw panels. Provider objects are live host objects
// that can be circular and can carry functions, so `JSON.stringify` is not
// enough on its own. This never throws: a value it cannot serialise becomes a
// short marker instead of a blank panel.

export function safeJson(value: unknown): string {
  const seen = new WeakSet<object>();
  try {
    const text = JSON.stringify(
      value,
      (_key, current: unknown) => {
        if (typeof current === "bigint") return `${current.toString()}n`;
        if (typeof current === "function") return "[function]";
        if (typeof current === "object" && current !== null) {
          if (seen.has(current)) return "[circular]";
          seen.add(current);
        }
        return current;
      },
      2,
    );
    return text ?? String(value);
  } catch (err) {
    return `[could not serialise: ${err instanceof Error ? err.message : String(err)}]`;
  }
}

export interface ProviderSummary {
  readonly info: unknown;
  readonly isQoreX: boolean;
  readonly ownKeys: readonly string[];
}

/** A plain record for panel 1, so a live provider is not passed to JSON. */
export function summariseProvider(detail: {
  readonly info: unknown;
  readonly provider: { readonly isQoreX?: boolean };
}): ProviderSummary {
  let ownKeys: string[] = [];
  try {
    ownKeys = Object.keys(detail.provider);
  } catch {
    ownKeys = ["[ownKeys unavailable]"];
  }
  return {
    info: detail.info,
    isQoreX: detail.provider.isQoreX === true,
    ownKeys,
  };
}
