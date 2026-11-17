// QorexMessageSigner tests. The provider here is a MOCK object named mockNative;
// it is not QoreX and no wallet or network is involved. The tests cover the
// queue, the guard, rejection without retry and the non-throwing result shape.

import { describe, expect, it, vi } from "vitest";
import type { ChainGuardState } from "../src/wallet/chains.js";
import { QorexMessageSigner } from "../src/wallet/signer.js";
import type { QorexNativeProvider } from "../src/wallet/types.js";

const READY: ChainGuardState = {
  status: "ready",
  nativeChainId: "qorechain-diana",
  evmChainId: "0x2648",
};

const WRONG: ChainGuardState = {
  status: "wrong-chain",
  reason: "evm",
  nativeChainId: "qorechain-diana",
  evmChainId: "0x1",
  message: "The EVM provider is on 0x1.",
};

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const encoder = new TextEncoder();

function makeSigner(options: {
  native: QorexNativeProvider;
  guard?: ChainGuardState;
  authorize?: boolean;
}): QorexMessageSigner {
  return new QorexMessageSigner({
    native: options.native,
    address: "qor1mockaddress",
    nativeChainId: "qorechain-diana",
    guard: async () => options.guard ?? READY,
    authorize: async () => options.authorize ?? true,
  });
}

describe("QorexMessageSigner queue (MOCK provider)", () => {
  it("keeps the second call away from the provider until the first settles", async () => {
    const first = deferred<unknown>();
    const calls: string[] = [];
    const mockNative: QorexNativeProvider = {
      enable: vi.fn(async () => undefined),
      signArbitrary: vi.fn(async (_chain: string, _address: string, text: string) => {
        calls.push(text);
        return calls.length === 1 ? first.promise : { id: 2 };
      }),
    };
    const signer = makeSigner({ native: mockNative });

    const one = signer.requestSignature(encoder.encode("one"));
    const two = signer.requestSignature(encoder.encode("two"));

    await vi.waitFor(() => expect(calls).toEqual(["one"]));
    // Give the second call every microtask it could use; it must still wait.
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toEqual(["one"]);
    expect(mockNative.signArbitrary).toHaveBeenCalledTimes(1);

    first.resolve({ id: 1 });
    const firstResult = await one;
    expect(firstResult.ok).toBe(true);
    await vi.waitFor(() => expect(calls).toEqual(["one", "two"]));
    expect(await two).toEqual({ ok: true, value: { id: 2 } });
    expect(signer.requests).toBe(2);
  });

  it("resolves two concurrent calls in the order they were made", async () => {
    const gates = [deferred<unknown>(), deferred<unknown>()];
    let index = 0;
    const mockNative: QorexNativeProvider = {
      enable: vi.fn(async () => undefined),
      signArbitrary: vi.fn(async () => {
        const gate = gates[index];
        index += 1;
        if (gate === undefined) throw new Error("unexpected third call");
        return gate.promise;
      }),
    };
    const signer = makeSigner({ native: mockNative });

    const one = signer.requestSignature(encoder.encode("first"));
    const two = signer.requestSignature(encoder.encode("second"));
    await vi.waitFor(() => expect(mockNative.signArbitrary).toHaveBeenCalledTimes(1));

    gates[0]?.resolve({ order: 1 });
    expect(await one).toEqual({ ok: true, value: { order: 1 } });
    await vi.waitFor(() => expect(mockNative.signArbitrary).toHaveBeenCalledTimes(2));
    gates[1]?.resolve({ order: 2 });
    expect(await two).toEqual({ ok: true, value: { order: 2 } });
  });
});

describe("QorexMessageSigner refusal paths (MOCK provider)", () => {
  it("returns request-rejected and never retries a rejected request", async () => {
    const mockNative: QorexNativeProvider = {
      enable: vi.fn(async () => undefined),
      signArbitrary: vi.fn(async () => {
        throw new Error("QoreX: signature rejected");
      }),
    };
    const signer = makeSigner({ native: mockNative });

    const result = await signer.requestSignature(encoder.encode("message"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("request-rejected");
      expect(result.message).toContain("signature rejected");
    }
    expect(mockNative.signArbitrary).toHaveBeenCalledTimes(1);
  });

  it("lets the queue continue after a rejection without resubmitting it", async () => {
    let call = 0;
    const mockNative: QorexNativeProvider = {
      enable: vi.fn(async () => undefined),
      signArbitrary: vi.fn(async () => {
        call += 1;
        if (call === 1) throw new Error("user rejected");
        return { okSignature: true };
      }),
    };
    const signer = makeSigner({ native: mockNative });

    const first = await signer.requestSignature(encoder.encode("first"));
    expect(first.ok).toBe(false);
    const second = await signer.requestSignature(encoder.encode("second"));
    expect(second.ok).toBe(true);
    expect(mockNative.signArbitrary).toHaveBeenCalledTimes(2);
  });

  it("does not reach the provider at all when the guard is wrong-chain", async () => {
    const mockNative: QorexNativeProvider = {
      enable: vi.fn(async () => undefined),
      signArbitrary: vi.fn(async () => ({ id: 1 })),
    };
    const signer = makeSigner({ native: mockNative, guard: WRONG });

    const result = await signer.requestSignature(encoder.encode("message"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("wrong-chain");
    expect(mockNative.signArbitrary).not.toHaveBeenCalled();
  });

  it("does not reach the provider when authorisation is refused", async () => {
    const mockNative: QorexNativeProvider = {
      enable: vi.fn(async () => undefined),
      signArbitrary: vi.fn(async () => ({ id: 1 })),
    };
    const signer = makeSigner({ native: mockNative, authorize: false });

    const result = await signer.requestSignature(encoder.encode("message"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("not-authorized");
    expect(mockNative.signArbitrary).not.toHaveBeenCalled();
  });

  it("treats a non-object answer as malformed and never as success", async () => {
    const mockNative: QorexNativeProvider = {
      enable: vi.fn(async () => undefined),
      signArbitrary: vi.fn(async () => "not-a-signature"),
    };
    const signer = makeSigner({ native: mockNative });

    const result = await signer.requestSignature(encoder.encode("message"));
    expect(result).toEqual({
      ok: false,
      code: "malformed-response",
      message: "signArbitrary returned no signature object.",
    });
  });

  it("refuses a message that is not UTF-8 without calling the provider", async () => {
    const mockNative: QorexNativeProvider = {
      enable: vi.fn(async () => undefined),
      signArbitrary: vi.fn(async () => ({ id: 1 })),
    };
    const signer = makeSigner({ native: mockNative });

    const result = await signer.requestSignature(new Uint8Array([0xff, 0xfe]));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("malformed-response");
    expect(mockNative.signArbitrary).not.toHaveBeenCalled();
  });

  it("throws a typed QorexSignerError, never a string, from the MessageSigner entry point", async () => {
    const mockNative: QorexNativeProvider = {
      enable: vi.fn(async () => undefined),
      signArbitrary: vi.fn(async () => {
        throw new Error("request rejected");
      }),
    };
    const signer = makeSigner({ native: mockNative });

    await expect(signer.sign(encoder.encode("message"))).rejects.toMatchObject({
      name: "QorexSignerError",
      code: "request-rejected",
    });
    await expect(signer.sign(encoder.encode("message"))).rejects.toBeInstanceOf(Error);
  });
});
