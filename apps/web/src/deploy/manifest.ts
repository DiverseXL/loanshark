// Typed access to docs/deployments/manifest.json.
//
// The manifest is the only source of bytecode for the deploy panel. It is built
// by scripts/build-manifest.mjs from the Hardhat artifacts and contains no
// private data: ABI, bytecode, hashes, compiler settings and constructor shape.

import manifestJson from "../../../../docs/deployments/manifest.json";

export interface ConstructorArgument {
  readonly name: string;
  readonly type: string;
  readonly source: string;
}

export interface ContractManifest {
  readonly sourceName: string;
  readonly abi: readonly unknown[];
  readonly creationBytecode: `0x${string}`;
  readonly creationBytecodeSha256: string;
  readonly runtimeBytecode: `0x${string}`;
  readonly runtimeBytecodeSha256: string;
  readonly constructor: {
    readonly signature: string;
    readonly arguments: readonly ConstructorArgument[];
    readonly encoding: string;
    readonly encodingNote: string;
  };
}

export interface DeploymentManifest {
  readonly format: string;
  readonly network: {
    readonly name: string;
    readonly evmChainId: string;
    readonly evmChainIdDecimal: number;
    readonly evmRpc: string;
    readonly explorer: string;
  };
  readonly sourceCommit: string;
  readonly workingTreeDirty: boolean;
  readonly compiler: {
    readonly version: string;
    readonly longVersion: string;
    readonly evmVersion: string;
    readonly optimizer: { readonly enabled: boolean; readonly runs: number };
  };
  readonly hashInput: string;
  readonly allowlist: {
    readonly option: string;
    readonly adr: string;
    readonly tokens: readonly {
      readonly label: string;
      readonly address: string | null;
      readonly note: string;
    }[];
  };
  readonly contracts: {
    readonly TestUSD: ContractManifest;
    readonly LoanSettlement: ContractManifest;
  };
}

export const manifest = manifestJson as unknown as DeploymentManifest;

/** ADR-0013 Option A: the fest fUSD address, immutable in the constructor. */
export const FUSD_ADDRESS = "0x97143B771D34ddb9130b807b135Ae675A5a963CA" as const;
