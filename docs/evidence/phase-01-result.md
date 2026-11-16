# Phase 1 result: workspace, signature verification spike (M0-3), read-only chain checks, CI

Date started: 2026-11-16. Network: QoreChain Diana Testnet (`qorechain-diana`). Host: Windows, PowerShell primary shell; commands below were run through Git Bash and are repeated in PowerShell form where the shell matters.

This file records commands and their unedited output. Nothing here is reconstructed. Where a value was truncated for width it is marked as truncated; nothing is paraphrased.

## Task 0: environment and connectivity

### Tool versions

Command:

```powershell
node --version; git --version; pnpm --version; npm --version
```

Output:

```
v26.13.0
git version 2.56.0.windows.4
no pnpm
11.20.0
```

`pnpm` was not installed at the start of this phase. Corepack is not present in this Node build either (`corepack --version` returned `no corepack`). pnpm is therefore installed as a pinned dev tool in Task 1 and the exact version is recorded in `package.json` (`packageManager`) and `docs/adr/0006-quality-tooling.md`.

### Working tree

`git status --porcelain` returned no output before Task 0 work began, and `git branch --show-current` returned `main`.

### Connectivity

Command (Git Bash; the PowerShell equivalent is in the final report):

```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://github.com
curl -sS -o /dev/null -w "%{http_code}\n" https://api-testnet.qore.host
curl -sS -o /dev/null -w "%{http_code}\n" https://evm-testnet.qore.host
```

Output:

```
200
501
405
```

Interpretation: all three hosts answered. `github.com` returned 200. The two QoreChain hosts returned HTTP errors for the bare root path (501 Not Implemented and 405 Method Not Allowed), which are server responses, so neither host is blocked by the local network. Neither status is a health check of the API; the API was exercised properly below.

### On-chain account fixture

Command:

```powershell
curl.exe -sS -o fixtures/onchain-account-qor1385.json "https://api-testnet.qore.host/qorechain/pqc/v1/account/qor1385wkhky3qkjwq47t8904xrd6s82lmkfjnxxsr"
```

Result: HTTP 200, `Content-Type: application/json`, `x-cosmos-block-height: 10194644`, 3831 bytes, SHA-256 `3976669d8b5d57b4279780c448b1d8e8feb247d193c9863f1c320572ddf05de5`, fetched 2026-11-16T12:33:30Z.

The response body is stored unedited in `fixtures/onchain-account-qor1385.json`. The fetch date, URL, status and hash are in `fixtures/onchain-account-qor1385.meta.json` (ASSUMPTION: a sidecar file was used rather than adding a date field to the JSON, because the task said not to edit the response).

The record contains public keys only: `key_type: hybrid`, `algorithm_id: 1`, `algorithm_name: dilithium5`, `possession_proven: true`, `classical_key_source: auth_account`. No private key, seed phrase or recovery code is present.

## Task 6: read-only EVM chain checks (M0-4, M0-7)

All calls are JSON-RPC `POST https://evm-testnet.qore.host` with `Content-Type: application/json`. Nothing was signed, broadcast or spent. Every raw response body is stored under `fixtures/chain-reads/` exactly as received.

PowerShell form of the first call:

```powershell
$body = '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
Invoke-RestMethod -Method Post -Uri https://evm-testnet.qore.host -ContentType 'application/json' -Body $body
```

Raw bodies (Git Bash commands in the same shape as above, one per line):

```
{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}
  -> {"jsonrpc":"2.0","id":1,"result":"0x2648"}
{"jsonrpc":"2.0","id":2,"method":"eth_blockNumber","params":[]}
  -> {"jsonrpc":"2.0","id":2,"result":"0x9b9214"}
```

`0x2648` is 9800, which matches source-lock claim 3. The block height at the time of the reads was 10195476.

### eth_getCode

Command, once per address:

```bash
curl -sS -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_getCode","params":["<address>","latest"]}' \
  https://evm-testnet.qore.host
```

Result for each of the three addresses: code exists, 1798 bytes (3598 hex characters), no error field. The three runtime byte strings are identical except two hex characters at offset 578, which encode the `decimals()` return value pushed by the constructor. Their SHA-256 values, over the saved response files:

```
76c6398eeb0c53636767f24e9f16ec81457af710bd52294188fc5bade25c6c8b  getCode-0x0229...1c28.json
cde01466afdd7260d934de00303e69e9c24286373587056c56a479337f5de90a  getCode-0x4604...451A.json
9a0bb82f6707cae8000405e98865bf6f51dbdc02a0302ca6acbe9e58a37aa608  getCode-0x9714...63CA.json
```

The runtime code exposes the standard selectors `06fdde03` (`name()`), `95d89b41` (`symbol()`), `313ce567` (`decimals()`), `18160ddd` (`totalSupply()`), `70a08231` (`balanceOf(address)`), `a9059cbb` (`transfer(address,uint256)`), `095ea7b3` (`approve(address,uint256)`), `23b872dd` (`transferFrom(address,address,uint256)`) and `dd62ed3e` (`allowance(address,address)`).

### eth_call

Command, once per address and selector:

```bash
curl -sS -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_call","params":[{"to":"<address>","data":"<selector>"},"latest"]}' \
  https://evm-testnet.qore.host
```

Raw results, unedited:

```
0x02292293c13880a26242690eb70a0e42B8E91c28 0x06fdde03
  {"jsonrpc":"2.0","id":1,"result":"0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000084665737420455448000000000000000000000000000000000000000000000000"}
0x02292293c13880a26242690eb70a0e42B8E91c28 0x95d89b41
  {"jsonrpc":"2.0","id":1,"result":"0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000046645544800000000000000000000000000000000000000000000000000000000"}
0x02292293c13880a26242690eb70a0e42B8E91c28 0x313ce567
  {"jsonrpc":"2.0","id":1,"result":"0x0000000000000000000000000000000000000000000000000000000000000012"}
0x4604e7E45b2ecdbfbDc157103f5B2b62cb16451A 0x06fdde03
  {"jsonrpc":"2.0","id":1,"result":"0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000084665737420425443000000000000000000000000000000000000000000000000"}
0x4604e7E45b2ecdbfbDc157103f5B2b62cb16451A 0x95d89b41
  {"jsonrpc":"2.0","id":1,"result":"0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000046642544300000000000000000000000000000000000000000000000000000000"}
0x4604e7E45b2ecdbfbDc157103f5B2b62cb16451A 0x313ce567
  {"jsonrpc":"2.0","id":1,"result":"0x0000000000000000000000000000000000000000000000000000000000000008"}
0x97143B771D34ddb9130b807b135Ae675A5a963CA 0x06fdde03
  {"jsonrpc":"2.0","id":1,"result":"0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000084665737420555344000000000000000000000000000000000000000000000000"}
0x97143B771D34ddb9130b807b135Ae675A5a963CA 0x95d89b41
  {"jsonrpc":"2.0","id":1,"result":"0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000046655534400000000000000000000000000000000000000000000000000000000"}
0x97143B771D34ddb9130b807b135Ae675A5a963CA 0x313ce567
  {"jsonrpc":"2.0","id":1,"result":"0x0000000000000000000000000000000000000000000000000000000000000006"}
```

Decoded (ABI string decoding for `name`/`symbol`, integer for `decimals`):

| Address | `name()` | `symbol()` | `decimals()` | Code |
|---|---|---|---|---|
| `0x02292293c13880a26242690eb70a0e42B8E91c28` | `Fest ETH` | `fETH` | 18 | present |
| `0x4604e7E45b2ecdbfbDc157103f5B2b62cb16451A` | `Fest BTC` | `fBTC` | 8 | present |
| `0x97143B771D34ddb9130b807b135Ae675A5a963CA` | `Fest USD` | `fUSD` | 6 | present |

What these calls establish: each address is a contract, each answers the three ERC-20 metadata calls without reverting, and each reports the name, symbol and decimals above.

What remains unknown, and is not concluded here:

- Who deployed each contract, and whether the name or symbol is accurate about the asset. The strings are claims by the contract, not proof of backing.
- Whether any of them is a stablecoin, a wrapped asset or a test faucet token. `fUSD` with 6 decimals is suggestive and nothing more. No issuer, reserve, or peg was checked.
- Whether supply is fixed or mintable, who can mint, and what the test account's balances are worth.
- The explorer and faucet for Diana. They are named in acceptance item M0-4 and were not exercised by this task, so M0-4 is not complete.

## Task 3 and Task 4 (first attempt): blocked on the signature fixture

This was the state of the phase before the response was supplied. The two sections below supersede it and are the record that counts.

`fixtures/qorex-signarbitrary.json` was not present in the repository. Task 3 says to stop and ask when it is missing, and Task 4 cannot run without a real QoreX response. No signature was reconstructed, retyped or generated in its place, and Task 5 was not started because it depends on Task 4 passing. The verifier itself is ready and recorded (source-lock claims 17 to 19).

## Task 3: the signature fixture

Date: 2026-11-16. The raw `native.signArbitrary` response was supplied through the chat session after the blocked state above was reported. It was written to `fixtures/qorex-signarbitrary.json` with every base64 value copied verbatim, and `fixtures/qorex-signarbitrary.meta.json` records the chain ID, signer, message, SHA-256 and date.

ASSUMPTION (provenance): the object arrived as chat text, not as a captured file, so there is no HTTP status, Content-Type, block height or response size to record, and no transaction hash exists, because `signArbitrary` signs and does not broadcast. The recorded SHA-256 is of the stored file, not of a captured response body.

ASSUMPTION (formatting): the stored file uses LF line endings and a trailing newline; the paste carried CRLF. Line endings are the only difference. A second hash over `JSON.stringify(JSON.parse(file))` is in the sidecar so the content can be checked independently of formatting. `.gitattributes` marks `fixtures/**` as `-text` so a checkout with `core.autocrlf=true` does not rewrite the bytes and invalidate the recorded hash. The `git commit` warning "LF will be replaced by CRLF the next time Git touches it" appeared for a file outside `fixtures/` in the same commit.

Stored file SHA-256:

```
63fd4db15bc582876414baa00a5dfd2b54c87d400518039a6b57f6f3a962fc94  fixtures/qorex-signarbitrary.json
```

### Validation

Command (Git Bash, from the repository root):

```bash
node -e '
const fs=require("fs");
const raw=fs.readFileSync("fixtures/qorex-signarbitrary.json");
console.log("bytes", raw.length, "crlf lines", (raw.toString().match(/\r\n/g)||[]).length);
const j=JSON.parse(raw.toString());
console.log("keys", Object.keys(j).join(","));
const b64=/^[A-Za-z0-9+/]+={0,2}$/;
for (const [n,s] of [["classical.publicKey",j.classical.publicKey],["classical.signature",j.classical.signature],["pq.signature",j.pq.signature]]) {
  const ok=b64.test(s) && s.length%4===0;
  const buf=Buffer.from(s,"base64");
  const canon=Buffer.from(buf).toString("base64")===s;
  console.log(n,"chars",s.length,"validB64",ok,"canonical",canon,"bytes",buf.length);
}
const acct=JSON.parse(fs.readFileSync("fixtures/onchain-account-qor1385.json","utf8"));
console.log("acct keys", Object.keys(acct).join(","));
console.log(JSON.stringify(acct.account? Object.keys(acct.account):null));
'
```

Output, unedited:

```
bytes 6723 crlf lines 0
keys signatureType,classical,pq,pub_key,signature
classical.publicKey chars 44 validB64 true canonical true bytes 33
classical.signature chars 88 validB64 true canonical true bytes 64
pq.signature chars 6172 validB64 true canonical true bytes 4627
acct keys found,account
["address","public_key","algorithm_id","algorithm_name","ecdsa_pubkey","key_type","created_at_height","migration_public_key","migration_algorithm_id","classical_key_source","possession_proven"]
```

### Cross-check against the on-chain account record

Command:

```bash
node -e '
const fs=require("fs");
const j=JSON.parse(fs.readFileSync("fixtures/qorex-signarbitrary.json","utf8"));
const acct=JSON.parse(fs.readFileSync("fixtures/onchain-account-qor1385.json","utf8")).account;
console.log("address", acct.address);
console.log("ecdsa_pubkey == classical.publicKey:", acct.ecdsa_pubkey===j.classical.publicKey);
console.log("ecdsa_pubkey == pub_key.value:", acct.ecdsa_pubkey===j.pub_key.value);
console.log("algorithm_id", acct.algorithm_id, acct.algorithm_name, "possession_proven", acct.possession_proven);
const ml=Buffer.from(acct.public_key,"base64");
console.log("on-chain ML-DSA public_key bytes", ml.length);
const pq=Buffer.from(j.pq.signature,"base64");
console.log("pq signature contains on-chain pubkey bytes:", pq.includes(ml));
console.log("pq signature contains on-chain pubkey prefix 32 bytes:", pq.includes(ml.subarray(0,32)));
const crypto=require("crypto");
const f=fs.readFileSync("fixtures/qorex-signarbitrary.json");
console.log("file sha256", crypto.createHash("sha256").update(f).digest("hex"));
console.log("canonical sha256", crypto.createHash("sha256").update(JSON.stringify(j)).digest("hex"));
'
```

Output, unedited:

```
address qor1385wkhky3qkjwq47t8904xrd6s82lmkfjnxxsr
ecdsa_pubkey == classical.publicKey: true
ecdsa_pubkey == pub_key.value: true
algorithm_id 1 dilithium5 possession_proven true
on-chain ML-DSA public_key bytes 2592
pq signature contains on-chain pubkey bytes: false
pq signature contains on-chain pubkey prefix 32 bytes: false
file sha256 63fd4db15bc582876414baa00a5dfd2b54c87d400518039a6b57f6f3a962fc94
canonical sha256 11bdf664c19819ef1f8e1242982d782af88e54fd2c60603b59c05f1f10af489b
```

What this establishes: the response parses, every base64 field is canonical, the `pq` part is exactly 4627 bytes, and the classical public key in the response is byte-identical to the `ecdsa_pubkey` registered on chain for `qor1385wkhky3qkjwq47t8904xrd6s82lmkfjnxxsr`. That tie is what makes it credible that this response belongs to that account; it is not proof on its own, and the signature check below is the proof.

The `pq` part is a bare signature. It does not contain the 2592-byte ML-DSA-87 public key, which agrees with source-lock claim 7.

## Task 4: verification spike

Script: `packages/chain-client/src/spike/verify-qorex-signature.ts`, labelled SPIKE in its header. It reads both fixtures from disk, takes the ML-DSA-87 public key from `fixtures/onchain-account-qor1385.json` (`account.public_key`), passes the response object to `verifyMessage` unchanged, and sets `requirePq: true`.

### What was signed, from the verifier's source

Read in the installed `@qorechain/qoresign@0.2.0` bundle, `packages/chain-client/node_modules/@qorechain/qoresign/dist/chunk-CC36VDKC.js`:

- Line 786: `MESSAGE_PQ_DOMAIN = "qorechain-msg-v1|"`.
- Lines 803 to 806: `messagePqSignBytes(chainId, data)` returns `concat(utf8Encode(`${MESSAGE_PQ_DOMAIN}${chainId}|`), toBytes(data))`, where `toBytes` UTF-8 encodes a string and leaves a `Uint8Array` alone.
- Lines 673 to 676: `adr36SignBytes(signer, data)` returns the UTF-8 of `{"account_number":"0","chain_id":"","fee":{"amount":[],"gas":"0"},"memo":"","msgs":[{"type":"sign/MsgSignData","value":{"data":"<base64 data>","signer":"<signer>"}}],"sequence":"0"}` with no whitespace.
- Lines 831 to 872: `verifyMessage` decodes `sig.classical.publicKey` and `sig.classical.signature`, derives the owning key type with `classicalKeyTypeFor(pub, signer)` and requires it to equal `sig.classical.keyType`, verifies the classical signature over `adr36SignBytes(signer, data)`, then refuses a missing `pq` with `PQ_LAYER_MISSING` unless `requirePq` is explicitly false, requires `pq.algorithmId === 1`, requires `pqPublicKey`, and verifies `pqVerify(pqPublicKey, messagePqSignBytes(chainId, data), pqSig)`. It reads no `pub_key` and no top-level `signature` field. It returns nothing.
- Lines 422 to 426: `pqVerify` calls `mldsa87.verify(publicKey, message, signature)`, and `@qorechain/pqc@0.2.3` passes the message straight to `@noble/post-quantum`'s `ml_dsa87.verify` with no context argument, so the ML-DSA context is empty.

So the ML-DSA-87 part signs `UTF-8("qorechain-msg-v1|" + chain_id + "|") || UTF-8(message)` with an empty context, and the classical part signs the ADR-36 document above. The spike prints both byte strings by calling those two exported builders, so the printed bytes are the ones the verifier actually checks.

### Positive case

Command:

```bash
pnpm -C packages/chain-client build
node packages/chain-client/dist/spike/verify-qorex-signature.js
```

Output, unedited (the two leading `tsc` lines are the build):

```
== SPIKE: QoreX signArbitrary response verification ==
fixture: C:\Users\user\Documents\loanshark\fixtures\qorex-signarbitrary.json
fixture sha256: 63fd4db15bc582876414baa00a5dfd2b54c87d400518039a6b57f6f3a962fc94
on-chain account fixture: C:\Users\user\Documents\loanshark\fixtures\onchain-account-qor1385.json
account address on chain: qor1385wkhky3qkjwq47t8904xrd6s82lmkfjnxxsr
account algorithm: id 1 (dilithium5)
chain id: qorechain-diana
signer: qor1385wkhky3qkjwq47t8904xrd6s82lmkfjnxxsr
message: "LOANSHARK test message, no funds"
signatureType in response: ml-dsa-87-hybrid

-- bytes signed, from the verifier's source --
ML-DSA-87: UTF-8("qorechain-msg-v1|" + chain_id + "|") || UTF-8(message), empty context
  length: 65
  sha256: 99e67790431c36b66d338a4bb7e7f53366a4e1f9d2dc7ff6dabfa370bf3a7ede
  head (hex): 716f7265636861696e2d6d73672d76317c716f7265636861696e2d6469616e617c4c4f414e534841
classical: ADR-36 amino document, no whitespace, keys sorted
  length: 246
  sha256: 25c21f44c726db4f84962c33c0ee9e6c30f3607287736c199fa826ccd77370f1
  text: {"account_number":"0","chain_id":"","fee":{"amount":[],"gas":"0"},"memo":"","msgs":[{"type":"sign/MsgSignData","value":{"data":"TE9BTlNIQVJLIHRlc3QgbWVzc2FnZSwgbm8gZnVuZHM=","signer":"qor1385wkhky3qkjwq47t8904xrd6s82lmkfjnxxsr"}}],"sequence":"0"}

-- positive case: response object passed unchanged, requirePq: true --
main: ACCEPTED (expected accepted)
returned object used unchanged: yes, extra top-level pub_key and signature fields were not removed

-- negative controls --
control 1 (pq part removed): REJECTED PQ_LAYER_MISSING "the signature carries no ML-DSA-87 part" (expected PQ_LAYER_MISSING)
control 2 (message changed by one character): REJECTED CLASSICAL_SIGNATURE_INVALID "the classical signature does not verify" (expected rejected)
control 3 (wrong chain id: qorechain-vladi): REJECTED PQ_SIGNATURE_INVALID "the ML-DSA-87 signature does not verify" (expected rejected)
control 4 (signer changed to qor1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5tfman7): REJECTED ADDRESS_MISMATCH "the classical key does not control qor1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5tfman7" (expected ADDRESS_MISMATCH)

RESULT: all checks behaved as expected
```

Exit code 0. The main verification passed on the first run; no input was adjusted to make it pass.

### The returned object, unchanged

Command (Git Bash, run inside `packages/chain-client` so the package resolves):

```bash
cd packages/chain-client && node --input-type=module -e '
import { readFileSync } from "node:fs";
import { verifyMessage, isQoreSignError } from "@qorechain/qoresign";
const raw = JSON.parse(readFileSync("../../fixtures/qorex-signarbitrary.json","utf8"));
const acc = JSON.parse(readFileSync("../../fixtures/onchain-account-qor1385.json","utf8")).account;
const pqPublicKey = new Uint8Array(Buffer.from(acc.public_key,"base64"));
const args = { chainId:"qorechain-diana", signer:acc.address, data:"LOANSHARK test message, no funds", signature: raw, pqPublicKey, requirePq: true };
const r = verifyMessage(args);
console.log("return value:", r);
console.log("typeof return:", typeof r);
const keys = Object.keys(raw).join(",");
console.log("response keys:", keys);
const stripped = { signatureType: raw.signatureType, classical: raw.classical, pq: raw.pq };
console.log("accepted after removing pub_key and signature:", (() => { try { verifyMessage({...args, signature: stripped}); return "yes"; } catch (e) { return "no: " + (isQoreSignError(e) ? e.code : e); } })());
'
```

Output, unedited:

```
return value: undefined
typeof return: undefined
response keys: signatureType,classical,pq,pub_key,signature
accepted after removing pub_key and signature: yes
```

So the raw response is accepted unchanged, the verifier returns nothing (it throws on failure), and removing the classical-only `pub_key` and `signature` fields makes no difference. Both facts match the source quoted above and source-lock claim 19.

### Negative controls

All four run inside the same script and are listed in the output above. What each one shows:

1. `pq` removed, `requirePq: true`: `PQ_LAYER_MISSING`. The signature is refused rather than accepted on the classical part alone.
2. Message changed by one character (`...no funds` to `...no fundz`): `CLASSICAL_SIGNATURE_INVALID`. The classical check runs before the PQ check in `verifyMessage`, so this control is caught by the classical layer first; it does not by itself isolate the PQ binding. Control 3 does.
3. Chain ID `qorechain-vladi` instead of `qorechain-diana`: `PQ_SIGNATURE_INVALID`. The ADR-36 document has `chain_id: ""`, so the classical part is unaffected and the failure is the ML-DSA-87 part, which binds the chain ID in its domain prefix. This is the control that isolates the post-quantum layer.
4. Signer replaced by `qor1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5tfman7`: `ADDRESS_MISMATCH`. ASSUMPTION: that address is synthetic, derived by the verifier's own `addressFromBytes` from the 20 bytes `0x01..0x14`. It is a valid bech32 account address for this control, and it is not claimed to be an existing or funded account.

ASSUMPTION (message text): `"LOANSHARK test message, no funds"` is the string the user reported asking QoreX to sign. The verification passing against both the classical and the post-quantum parts is consistent with that and is the only evidence for it; the exact byte string QoreX was given was not captured independently.

### Status of M0-3 after Task 4

A QoreX hybrid signature verifies against the on-chain key with the post-quantum part required, on `qorechain-diana`, for the recorded message and signer, and four tampering controls are refused. This is a spike, not a tested module; Task 5 turns it into one.

## Task 7: CI

`.github/workflows/ci.yml` runs on `push` to `main` and on every `pull_request`:

- job `verify`: `actions/checkout` and `actions/setup-node` pinned by commit, `pnpm/action-setup` pinned by commit with `12.21.0`, Node `26.13.0`, then `pnpm install --frozen-lockfile`, `pnpm verify-env`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.
- job `secrets`: the gitleaks 8.30.1 linux-x64 binary, verified against the published SHA-256 before running `gitleaks detect --source . --redact`.

Unit tests need no network: no test currently opens a socket, and the live-chain test required by Task 5 does not exist yet (Task 5 was not started).

Status: the workflow file parses as YAML (`js-yaml` 4.1.1) and every command in the `verify` job has been run locally with the same result recorded below, but the workflow has NOT executed on GitHub. The repository has no remote. No passing badge or "CI passes" claim is made in the README until a real run exists; the run link and test counts get recorded here when it does.

## Task 8: local check results

Commands, run from the repository root on 2026-11-16:

```bash
pnpm verify-env
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Output of `pnpm verify-env`:

```
tool            pinned        actual
--------------  ------------  ------------
node            26.13.0       26.13.0
pnpm            12.21.0       12.21.0
typescript      5.9.3         5.9.3
@biomejs/biome  2.6.8         2.6.8
vitest          5.1.0         5.1.0

Toolchain matches the pinned versions.
```

`pnpm format:check` and `pnpm lint` both reported `Checked 9 files` with no fixes and exited 0. `pnpm typecheck` and `pnpm build` completed without diagnostics. `pnpm test` reported:

```
 Test Files  1 passed (1)
      Tests  1 passed (1)
```

The single test is the `chain-client` smoke test. It is the only test that exists, because the verification spike (Task 4) and the verifier module (Task 5) did not run; the counts above must not be read as coverage of the verifier.
