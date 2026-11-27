// Tests for evmAddressOfBech32 (ADR-0009). Pure: no network, no wallet.
//
// The two positive vectors are the owner-supplied addresses recorded in
// docs/evidence/phase-11a-result.md. The coin-60 vector is also the address the
// QoreX EVM provider reported (0xBDbE07400e9E07B4E0BBf795bC7ecd4E6028882c).

import { bech32 } from "@scure/base";
import { describe, expect, it } from "vitest";
import { evmAddressOfBech32 } from "../src/bech32.js";

const COIN60 = "qor1hklqwsqwncrmfc9m772mclkdfesz3zpv4eykrn";
const COIN118 = "qor1385wkhky3qkjwq47t8904xrd6s82lmkfjnxxsr";

describe("evmAddressOfBech32", () => {
  it("decodes the coin-60 account to the address the QoreX EVM lane reported", () => {
    const result = evmAddressOfBech32(COIN60);
    expect(result).toMatchObject({
      ok: true,
      address: "0xbdbe07400e9e07b4e0bbf795bc7ecd4e6028882c",
    });
    // The same 20 bytes in the provider's EIP-55 form.
    expect(result.ok && result.address).toBe(
      "0xBDbE07400e9E07B4E0BBf795bC7ecd4E6028882c".toLowerCase(),
    );
  });

  it("decodes the coin-118 account to its own 20 bytes, not to the old derived address", () => {
    const result = evmAddressOfBech32(COIN118);
    expect(result).toMatchObject({
      ok: true,
      address: "0x89e8eb5ec4882d2702be59cafa986dd40eafeec9",
    });
    expect(result.ok && result.address).not.toBe("0xd0a1453c7b8157aa0635076c33b3e24a50a923c5");
  });

  it("refuses a valid bech32 string with another prefix", () => {
    const words = bech32.decode(COIN60).words;
    const other = bech32.encode("cosmos", words);
    const result = evmAddressOfBech32(other);
    expect(result).toMatchObject({ ok: false, reason: "wrong-prefix" });
  });

  it("refuses a bad checksum", () => {
    const broken = `${COIN60.slice(0, -1)}m`;
    const result = evmAddressOfBech32(broken);
    expect(result).toMatchObject({ ok: false, reason: "bad-checksum" });
  });

  it("refuses a payload that is not 20 bytes", () => {
    const thirtyTwo = bech32.encodeFromBytes("qor", new Uint8Array(32));
    const result = evmAddressOfBech32(thirtyTwo);
    expect(result).toMatchObject({ ok: false, reason: "wrong-length" });
  });

  it("refuses the uppercase form of a valid address", () => {
    const result = evmAddressOfBech32(COIN60.toUpperCase());
    expect(result).toMatchObject({ ok: false, reason: "non-canonical" });
  });

  it("returns bytes that re-encode to the same address", () => {
    const result = evmAddressOfBech32(COIN60);
    if (!result.ok) throw new Error("expected a decode");
    expect(bech32.encodeFromBytes("qor", result.bytes)).toBe(COIN60);
  });
});
