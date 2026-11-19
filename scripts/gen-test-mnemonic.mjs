#!/usr/bin/env node
// Generates a throwaway BIP-39 phrase for tests, using the same pinned generator
// as the browser panel. TEST ONLY: the output is random, not a project account,
// and must never be funded or used on any chain. It is printed so a test vector
// can be written down; it is not a secret and is not suitable for a real user.
//
// Usage:
//   node scripts/gen-test-mnemonic.mjs
//   node scripts/gen-test-mnemonic.mjs --words 12

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateSealAccount } from "@loanshark/seal-account";

export const generateTestPhrase = (args = {}) => {
  const words = args.words ?? 24;
  if (words !== 12 && words !== 24) throw new Error("--words must be 12 or 24");
  const strength = words === 12 ? 128 : 256;
  const { identity, mnemonic } = generateSealAccount({
    chainId: "qorechain-diana",
    strength,
  });
  return { phrase: mnemonic.use((value) => value), address: identity.address };
};

const main = () => {
  const index = process.argv.indexOf("--words");
  const words = index === -1 ? 24 : Number(process.argv[index + 1]);
  if (!Number.isInteger(words)) throw new Error("--words must be 12 or 24");
  const { phrase, address } = generateTestPhrase({ words });
  console.log("TEST ONLY - throwaway phrase. Never fund it and never use it as a user's key.");
  console.log(phrase);
  console.log(`derived qor1 address: ${address}`);
  console.log("This output is not evidence and is not a secret.");
};

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(
      `test phrase generation failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
