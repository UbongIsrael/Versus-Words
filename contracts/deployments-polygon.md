# Polygon mainnet deployments

| Contract | Address |
| --- | --- |
| USDT (Tether) | `0xc2132D05D31c914a87C6611C10748AEb04B58e8F` |
| VersusEscrow | `0x62deD4A114106058D17C8d38254F5C0e1A432c95` |
| Oracle (address only) | `0xe355a55f5739ab9137b76fb6552c4d2d7fede9bb` |

On-chain `token()` and `oracle()` match the rows above.

Same hex on **Amoy** is MockUSDT, not this escrow. Do not point a mainnet API at Amoy RPC or the reverse.

API env for live USDT pots:

```
FAKE_CHAIN=0
POLYGON_CHAIN_ID=137
POLYGON_RPC=https://polygon-bor-rpc.publicnode.com
USDT_TOKEN=0xc2132D05D31c914a87C6611C10748AEb04B58e8F
USDT_ESCROW=0x62deD4A114106058D17C8d38254F5C0e1A432c95
POLYGON_ORACLE_KEY=<mainnet 64-hex key, never commit>
```
