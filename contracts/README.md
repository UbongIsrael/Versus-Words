# VersusEscrow

Tiny Polygon USDT pot.

## Amoy testnet (do this)

There is **no official Tether USDT** on Polygon Amoy. Random “Mock USDT” contracts on Amoyscan are other people’s toys — you usually cannot mint them, decimals may be wrong, and they can vanish.

Deploy **our** `src/MockUSDT.sol` first (6 decimals, public `mint`). Then deploy `src/VersusEscrow.sol` pointing at it.

Network:

| | |
| --- | --- |
| Name | Polygon Amoy |
| Chain ID | **80002** |
| RPC | https://rpc-amoy.polygon.technology |
| Explorer | https://amoy.polygonscan.com |
| Gas token | POL from https://faucet.polygon.technology |

Remix → Injected Provider → Amoy.

Amoy MockUSDT (already live): `0x62deD4A114106058D17C8d38254F5C0e1A432c95`

1. Deploy `MockUSDT` (no constructor args). Skip if using the address above.
2. Call `mint(yourWallet, 1000000000)` — that is **1,000 USDT** (6 decimals). Mint the same to the second test wallet.
3. Deploy `VersusEscrow` with:
   - `token_` = MockUSDT address
   - `oracle_` = the address of `POLYGON_ORACLE_KEY` (not a pot recipient)
4. Env:

```
POLYGON_CHAIN_ID=80002
POLYGON_RPC=https://rpc-amoy.polygon.technology
USDT_TOKEN=<MockUSDT address>
USDT_ESCROW=<VersusEscrow address>
POLYGON_ORACLE_KEY=<32-byte hex>
FAKE_CHAIN=0
```

Import the mock token in the wallet: address + symbol USDT + **6** decimals.

## Tests (no Pay, no Amoy)

Simulates the Mini App path on a local Hardhat chain: approve → lock → lock → oracle-signed settle, plus timeout refund and the raw `lock` calldata the web app builds.

```
cd contracts && npm test
```

## Polygon mainnet (later)

Use real USDT: `0xc2132D05D31c914a87C6611C10748AEb04B58e8F`.  
Do **not** deploy `MockUSDT` on mainnet. Verify `VersusEscrow` on Polygonscan.

Live VersusEscrow: `0x62deD4A114106058D17C8d38254F5C0e1A432c95` — see [deployments-polygon.md](deployments-polygon.md).
