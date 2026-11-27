// The QoreX message signer.
//
// Three rules from the phase brief are enforced here and tested:
//
//   1. One request at a time. QoreX is reported to refuse a second concurrent
//      request with an "already waiting" error (source-lock claim 44; not
//      reproduced in this repository). Every call goes through one promise
//      queue, so the second call does not reach the provider until the first
//      has settled.
//   2. No implicit signing. `authorize` is a required dependency and is called
//      for every request; without it resolving true nothing is sent.
//   3. No retry. A rejection is returned as a typed failure and the queue moves
//      on. Nothing here resubmits.
//   4. No signing from the wrong account. The injected account-identity check
//      must report a match; a mismatch blocks the request (ADR-0009).
//
// `sign` implements the existing `MessageSigner` interface from
// `@loanshark/qoreseal-adapter`, which returns the raw signature object and
// throws on failure. The non-throwing entry point is `requestSignature`.

import type { MessageSigner } from "@loanshark/qoreseal-adapter";
import type { ChainGuardState } from "./chains.js";
import { classifyProviderError, describeError } from "./errors.js";
import type { AccountIdentity } from "./identity.js";
import type { QorexNativeProvider, Result, WalletErrorCode } from "./types.js";
import { fail, ok } from "./types.js";

export interface SignerDependencies {
  readonly native: QorexNativeProvider;
  /** The `qor1...` account the signature must belong to. */
  readonly address: string;
  /** Chain id passed to `signArbitrary`; the guard checked it is Diana. */
  readonly nativeChainId: string;
  /** Re-read on every request, so a chain change cannot be outlived. */
  readonly guard: () => Promise<ChainGuardState>;
  /**
   * Re-read on every request. Unless it reports a match of the native account
   * with `eth_accounts[0]`, nothing is signed. The app always supplies it; the
   * optional form exists so a test can prove the check is enforced when set.
   */
  readonly accountIdentity?: () => Promise<AccountIdentity>;
  /** The explicit user action. Returning false sends nothing. */
  readonly authorize: (message: string) => Promise<boolean>;
}

/** Thrown by `sign()` only, because `MessageSigner.sign` cannot return a result. */
export class QorexSignerError extends Error {
  readonly code: WalletErrorCode;

  constructor(code: WalletErrorCode, message: string) {
    super(message);
    this.name = "QorexSignerError";
    this.code = code;
  }
}

export class QorexMessageSigner implements MessageSigner {
  readonly #native: QorexNativeProvider;
  readonly #address: string;
  readonly #nativeChainId: string;
  readonly #guard: () => Promise<ChainGuardState>;
  readonly #accountIdentity: (() => Promise<AccountIdentity>) | undefined;
  readonly #authorize: (message: string) => Promise<boolean>;
  #tail: Promise<void> = Promise.resolve();
  #requests = 0;

  constructor(dependencies: SignerDependencies) {
    this.#native = dependencies.native;
    this.#address = dependencies.address;
    this.#nativeChainId = dependencies.nativeChainId;
    this.#guard = dependencies.guard;
    this.#accountIdentity = dependencies.accountIdentity;
    this.#authorize = dependencies.authorize;
  }

  /** How many calls were accepted into the queue. Used by the diagnostics page. */
  get requests(): number {
    return this.#requests;
  }

  /**
   * `MessageSigner` entry point. The raw object is returned unmodified for the
   * verifier; a failure is an Error with a stable `code`, never a thrown string.
   */
  sign(message: Uint8Array): Promise<unknown> {
    return this.requestSignature(message).then((result) => {
      if (result.ok) return result.value;
      throw new QorexSignerError(result.code, result.message);
    });
  }

  /** The non-throwing entry point, serialised through one queue. */
  requestSignature(message: Uint8Array): Promise<Result<unknown>> {
    this.#requests += 1;
    return this.#enqueue(() => this.#run(message));
  }

  /** Chains the task behind the previous one; a failure does not break the queue. */
  #enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.#tail.then(task, task);
    this.#tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async #run(message: Uint8Array): Promise<Result<unknown>> {
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(message);
    } catch {
      return fail(
        "malformed-response",
        "The message is not valid UTF-8, so it cannot be signed as text.",
      );
    }

    const guard = await this.#guard();
    if (guard.status !== "ready") {
      const message =
        guard.status === "wrong-chain"
          ? guard.message
          : `The chain is unavailable: ${guard.message}`;
      return fail("wrong-chain", message);
    }
    if (guard.nativeChainId !== this.#nativeChainId) {
      return fail(
        "wrong-chain",
        `The guard accepted ${guard.nativeChainId}, but this signer is bound to ${this.#nativeChainId}.`,
      );
    }

    if (this.#accountIdentity !== undefined) {
      let identity: AccountIdentity;
      try {
        identity = await this.#accountIdentity();
      } catch (err) {
        return fail(
          "account-mismatch",
          `The account identity could not be checked: ${describeError(err)} Nothing was signed.`,
        );
      }
      if (identity.status !== "match") {
        return fail("account-mismatch", identity.message);
      }
    }

    const authorised = await this.#authorize(text);
    if (!authorised) {
      return fail("not-authorized", "No explicit user authorisation was given; nothing was sent.");
    }

    const signArbitrary = this.#native.signArbitrary;
    if (signArbitrary === undefined) {
      return fail("no-wallet", "This QoreX build exposes no signArbitrary.");
    }

    let raw: unknown;
    try {
      raw = await signArbitrary.call(this.#native, this.#nativeChainId, this.#address, text);
    } catch (err) {
      // No retry: one refused request is a refused request.
      return fail(classifyProviderError(err), `signArbitrary failed: ${describeError(err)}`);
    }
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      return fail("malformed-response", "signArbitrary returned no signature object.");
    }
    return ok(raw);
  }
}
