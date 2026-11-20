import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CONTRACT_FIELD_CLASSIFICATION,
  CONVERSATION_KEY_FIELDS,
  FOOTPRINT_ACTIONS,
  FOOTPRINTS,
} from "../src/index.js";

// REAL: reads the committed ABI from the deployment manifest. No network.

const MANIFEST = fileURLToPath(new URL("../../../docs/deployments/manifest.json", import.meta.url));

interface AbiParameter {
  name: string;
  type: string;
  components?: AbiParameter[];
}

interface AbiItem {
  type: string;
  name?: string;
  inputs?: AbiParameter[];
}

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as {
  contracts: Record<string, { abi: AbiItem[] }>;
};

/** Every key the ABI requires: `Contract.kind.name.param`, with tuple components. */
function abiFieldKeys(contract: string, abi: AbiItem[]): string[] {
  const keys: string[] = [];
  const walk = (kind: string, name: string, prefix: string, params: AbiParameter[]) => {
    for (const param of params) {
      const key = `${contract}.${kind}.${name}.${prefix}${param.name}`;
      keys.push(key);
      if (param.components) walk(kind, name, `${prefix}${param.name}.`, param.components);
    }
  };
  for (const item of abi) {
    if ((item.type === "function" || item.type === "event") && item.name) {
      walk(item.type, item.name, "", item.inputs ?? []);
    }
  }
  return keys;
}

const ALL_ABI_KEYS = Object.entries(manifest.contracts).flatMap(([contract, value]) =>
  abiFieldKeys(contract, value.abi),
);

describe("contract field classification", () => {
  it("reads both contracts from the committed ABI", () => {
    expect(Object.keys(manifest.contracts).sort()).toEqual(["LoanSettlement", "TestUSD"]);
    expect(ALL_ABI_KEYS.length).toBeGreaterThan(80);
  });

  it("classifies every function parameter and event field", () => {
    const missing = ALL_ABI_KEYS.filter((key) => !(key in CONTRACT_FIELD_CLASSIFICATION));
    expect(missing, `unclassified ABI fields: ${missing.join(", ")}`).toEqual([]);
  });

  it("has no stale classification for a field the ABI no longer has", () => {
    const known = new Set(ALL_ABI_KEYS);
    const stale = Object.keys(CONTRACT_FIELD_CLASSIFICATION).filter((key) => !known.has(key));
    expect(stale, `stale classifications: ${stale.join(", ")}`).toEqual([]);
  });

  it("gives every field a class and a note", () => {
    for (const [key, value] of Object.entries(CONTRACT_FIELD_CLASSIFICATION)) {
      expect(value.note.length, key).toBeGreaterThan(10);
      expect(
        ["public-calldata", "public-event", "public-view-result", "conversation-key"],
        key,
      ).toContain(value.class);
    }
  });

  it("marks nothing as a secret or conversation key", () => {
    expect(CONVERSATION_KEY_FIELDS).toEqual([]);
  });
});

describe("action footprints", () => {
  it("covers every user action exactly once", () => {
    expect(FOOTPRINT_ACTIONS).toHaveLength(12);
    const ids = new Set(FOOTPRINT_ACTIONS.map((action) => action.id));
    expect(ids.size).toBe(12);
    for (const action of FOOTPRINT_ACTIONS) {
      expect(FOOTPRINTS[action.id].label.length).toBeGreaterThan(5);
      expect(action.notPrivate.length).toBeGreaterThan(0);
    }
  });

  it("says which actions do not use the relay", () => {
    for (const id of ["propose-loan", "approve-token", "fund", "claim", "repay"] as const) {
      expect(FOOTPRINTS[id].relaySees).toEqual(["nothing: this action does not use the relay"]);
    }
    for (const id of ["create-request", "send-offer"] as const) {
      expect(FOOTPRINTS[id].relaySees.join(" ")).toContain("client IP");
    }
  });

  it("does not claim anonymity, private transfers or confidential computation", () => {
    const text = JSON.stringify(FOOTPRINT_ACTIONS).toLowerCase();
    for (const banned of [
      "anonymous",
      "anonymity",
      "private transfer",
      "zero-knowledge",
      "confidential computation",
      "fully homomorphic",
    ]) {
      expect(text).not.toContain(banned);
    }
  });
});
