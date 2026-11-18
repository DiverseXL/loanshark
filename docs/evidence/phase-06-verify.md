# Phase 6 deployment verification (read-only)

Status: NOT RUN. No contract has been deployed by this repository or by the assistant. This file is a placeholder; the owner runs `scripts/verify-deployment.mjs` after the deployment and it writes the report here.

## How to produce this file

```powershell
Set-Location C:\path\to\loanshark
node scripts/verify-deployment.mjs `
  --testusd <TestUSD address from step 2> `
  --settlement <LoanSettlement address from step 3> `
  --owner <connected EVM account>
```

The script performs only `eth_chainId`, `eth_getCode` and `eth_call`. It sends no transaction, asks for no key and writes nothing except the report path.

## What it checks

- `eth_getCode` of TestUSD and LoanSettlement, hashed with SHA-256 and compared with the manifest's runtime bytecode hash. A mismatch is reported, not hidden. If the only difference is the trailing CBOR metadata, the report says `MISMATCH, METADATA ONLY` and names the two metadata lengths; anything else is a mismatch beyond metadata.
- `LoanSettlement.allowedTokens()` equals `[TestUSD, 0x97143B771D34ddb9130b807b135Ae675A5a963CA]` in that order.
- `LoanSettlement.MINIMUM_CLAIM_WINDOW()` is 3600.
- TestUSD `name()` is `LOANSHARK Test USD`, `symbol()` is `tUSD`, `decimals()` is 6.
- `balanceOf(owner)` for TestUSD and fUSD. No threshold is asserted.

## Result

OWNER-SUPPLIED. Every field is blank until the owner runs the command:

| Check | Result |
|---|---|
| Chain ID | OWNER-SUPPLIED |
| TestUSD runtime bytecode hash | OWNER-SUPPLIED |
| LoanSettlement runtime bytecode hash | OWNER-SUPPLIED |
| allowedTokens() | OWNER-SUPPLIED |
| MINIMUM_CLAIM_WINDOW | OWNER-SUPPLIED |
| TestUSD name, symbol, decimals | OWNER-SUPPLIED |
| Owner balances | OWNER-SUPPLIED |

The script's own output, including the raw JSON-RPC requests and responses, replaces this section when it runs. Do not paste a result here that the script did not produce.
