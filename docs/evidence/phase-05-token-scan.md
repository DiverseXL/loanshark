# Phase 5 token selector scan (read-only, offline)

Date: 2026-11-17. No chain call was made. The inputs are the three saved `eth_getCode` responses already in `fixtures/chain-reads/`, captured on 2026-11-16. The scan reads those files only.

Purpose: check whether the runtime code of the three `erc20:` contracts on the test account exposes common administrative entry points. This is a heuristic, not a proof, and it does not establish who controls the tokens.

## Method

- Selectors are computed from the function signatures by `toFunctionSelector` in viem 2.57.11, which is pinned by `packages/agreement/package.json`. None was typed by hand.
- Script: `scripts/token-selector-scan.mjs`. Run with `node scripts/token-selector-scan.mjs`.
- For each contract, the script lowercases the returned hex and searches for each 4-byte selector as a byte substring.
- Each contract returned 1798 bytes of runtime code. The three responses differ (SHA-256 `0e6fb04e...bf12`, `3bae56a3...e8d0`, `9a09b07f...d822`), consistent with the same template compiled with different immutable constructor values rather than one shared address.

The signatures scanned: `owner()`, `mint(address,uint256)`, `burn(uint256)`, `burnFrom(address,uint256)`, `pause()`, `unpause()`, `paused()`, `blacklist(address)`, `addToBlacklist(address)`, `isBlacklisted(address)`, `transferOwnership(address)`, `renounceOwnership()`, `upgradeTo(address)`, `upgradeToAndCall(address,bytes)`, `implementation()`.

## Result

`yes` would mean the 4 bytes occur somewhere in the runtime code. `no` means they do not.

| Function | Selector | fETH `0x02292293c13880a26242690eb70a0e42B8E91c28` | fBTC `0x4604e7E45b2ecdbfbDc157103f5B2b62cb16451A` | fUSD `0x97143B771D34ddb9130b807b135Ae675A5a963CA` |
|---|---|---|---|---|
| `owner()` | `0x8da5cb5b` | no | no | no |
| `mint(address,uint256)` | `0x40c10f19` | no | no | no |
| `burn(uint256)` | `0x42966c68` | no | no | no |
| `burnFrom(address,uint256)` | `0x79cc6790` | no | no | no |
| `pause()` | `0x8456cb59` | no | no | no |
| `unpause()` | `0x3f4ba83a` | no | no | no |
| `paused()` | `0x5c975abb` | no | no | no |
| `blacklist(address)` | `0xf9f92be4` | no | no | no |
| `addToBlacklist(address)` | `0x44337ea1` | no | no | no |
| `isBlacklisted(address)` | `0xfe575a87` | no | no | no |
| `transferOwnership(address)` | `0xf2fde38b` | no | no | no |
| `renounceOwnership()` | `0x715018a6` | no | no | no |
| `upgradeTo(address)` | `0x3659cfe6` | no | no | no |
| `upgradeToAndCall(address,bytes)` | `0x4f1ef286` | no | no | no |
| `implementation()` | `0x5c60da1b` | no | no | no |

No scanned selector occurs in any of the three contracts.

## What this cannot show

- **A selector can be absent yet the behaviour can exist.** An admin function with a different name or argument list has a different selector and is not searched. A function can also be implemented with inline assembly or an unstructured dispatch that never uses the selector as a PUSH4 constant.
- **A selector can be present without being callable.** Selector bytes can occur by coincidence in constants, dispatch tables, revert data or the trailing CBOR metadata. None was found here, so this risk did not affect the result.
- **Proxies and delegate calls are invisible.** If a contract delegates to an implementation, the admin functions live at the implementation address, which was not read. The presence of `implementation()` would have been a hint, but its absence does not rule out a proxy that uses another slot or a custom entry point.
- **It says nothing about the deployer, owner or supply.** The deployer address, the account that can mint, the current supply and any backing are not in the runtime code. Those need block and transaction history or storage reads.
- **It says nothing about transfer behaviour.** Fees, blocklists enforced in `transfer` under a different entry point, and upgradeability through a separate controller are not covered by this signature list.
- **The code was read on 2026-11-16 and may have changed.** `eth_getCode` was not repeated for this scan.

Treat the result as: the saved runtime code of these three contracts contains none of the fifteen selectors, which is consistent with a minimal ERC-20 and says nothing about who controls it.
