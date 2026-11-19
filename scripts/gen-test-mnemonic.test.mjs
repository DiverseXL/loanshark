import { describe, expect, it } from "vitest";
import { generateTestPhrase } from "./gen-test-mnemonic.mjs";

describe("test phrase generation", () => {
  it("defaults to 24 words and derives a qor1 address", () => {
    const { phrase, address } = generateTestPhrase();
    expect(phrase.split(" ")).toHaveLength(24);
    expect(address).toMatch(/^qor1[0-9a-z]+$/);
  });

  it("accepts 12 words when asked", () => {
    const { phrase } = generateTestPhrase({ words: 12 });
    expect(phrase.split(" ")).toHaveLength(12);
  });

  it("refuses any other word count", () => {
    expect(() => generateTestPhrase({ words: 13 })).toThrow(/12 or 24/);
    expect(() => generateTestPhrase({ words: 0 })).toThrow(/12 or 24/);
  });

  it("does not repeat a phrase between runs", () => {
    const first = generateTestPhrase({ words: 12 });
    const second = generateTestPhrase({ words: 12 });
    expect(first.phrase).not.toBe(second.phrase);
    expect(first.address).not.toBe(second.address);
  });
});
