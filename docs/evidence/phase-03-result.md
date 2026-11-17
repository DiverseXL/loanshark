# Phase 3 result: agreement commitment and local settlement contracts

Date: 2026-11-17. Network: none used. Every test runs on the in-process Hardhat
network; no wallet, chain or QoreX call is made. Host: Windows, Node 26.13.0,
pnpm 12.21.0.

Commands and output below are unedited unless a truncation is marked.

## Task 0: baseline

Starting commit: `94f6dc5d085c1e5c04c8664ef51fe791a39fd9b2` on `main`.
`git status --short` returned no output.

`git remote -v` returned no output. The owner was asked and answered "No
remote - continue locally". Nothing is pushed and CI has not run.

Command:

```bash
pnpm verify-env
pnpm test
```

Output:

```
$ node scripts/verify-env.mjs
tool            pinned        actual
--------------  ------------  ------------
node            26.13.0       26.13.0
pnpm            12.21.0       12.21.0
typescript      5.9.3         5.9.3
@biomejs/biome  2.6.8         2.6.8
vitest          5.1.0         5.1.0

Toolchain matches the pinned versions.
VERIFY_EXIT=0
...
 Test Files  8 passed | 1 skipped (9)
      Tests  68 passed | 1 skipped (69)
   Start at  14:27:38
   Duration  12.52s (tests 51%, import 45%, worker 2%, transform 2%)

TEST_EXIT=0
```

## Task 2: identity binding, derived EVM address

Source fixture: `fixtures/onchain-account-qor1385.json`, account
`qor1385wkhky3qkjwq47t8904xrd6s82lmkfjnxxsr`, `key_type` `hybrid`,
`classical_key_source` `auth_account`, `possession_proven` true.

The fixture's `ecdsa_pubkey` is a base64 compressed secp256k1 key:

```
03d9ec2c76c3c28f0439c550b3dfbfb6a0d32878a5f9093699ae392b46be05acea
```

Method, run from `packages/qoreseal-adapter` (the package that already pins
`@noble/hashes` 2.4.0). Node's built-in `createECDH("secp256k1")` is used only
to decompress the point; `keccak_256` comes from the pinned
`@noble/hashes/sha3.js`. No hash is hand-rolled and no wallet or chain is
called.

Command:

```bash
node --input-type=module -e "
import { createECDH } from 'node:crypto';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { readFileSync } from 'node:fs';
const f = JSON.parse(readFileSync('../../fixtures/onchain-account-qor1385.json','utf8'));
const compressed = Buffer.from(f.account.ecdsa_pubkey, 'base64');
const ecdh = createECDH('secp256k1');
ecdh.setPublicKey(compressed);
const uncompressed = ecdh.getPublicKey();
console.log('compressed_hex', compressed.toString('hex'));
console.log('uncompressed_length', uncompressed.length);
console.log('uncompressed_hex', uncompressed.toString('hex'));
const hash = keccak_256(uncompressed.subarray(1));
console.log('keccak_hex', Buffer.from(hash).toString('hex'));
console.log('address', '0x' + Buffer.from(hash.subarray(12)).toString('hex'));
"
```

Output, unedited:

```
compressed_hex 03d9ec2c76c3c28f0439c550b3dfbfb6a0d32878a5f9093699ae392b46be05acea
uncompressed_length 65
uncompressed_hex 04d9ec2c76c3c28f0439c550b3dfbfb6a0d32878a5f9093699ae392b46be05acea37912359cf3c78956a65d3b4d4ba03f6f8e98c5f8c0449b1ac621478f8b8bbab
keccak_hex b2ec35dcfec754dc65bb88edd0a1453c7b8157aa0635076c33b3e24a50a923c5
address 0xd0a1453c7b8157aa0635076c33b3e24a50a923c5
```

Derived EVM-style address:
`0xd0a1453c7b8157aa0635076c33b3e24a50a923c5`.

This is a derivation from the saved public key. It is not evidence that QoreX
uses this address for EVM transactions; that is the ASSUMPTION in ADR-0009 and
the owner check recorded there.
