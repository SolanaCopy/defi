const { ethers } = require("hardhat");

const GTRADE_DIAMOND = "0xFF162c694eAA571f685030649814282eA457f169";
const GOLD_COPY_TRADER = "0xb09d6B8fA13Cbf757393ECb3E9c616C6BE94cA82";

async function main() {
  const [admin] = await ethers.getSigners();

  const diamond = new ethers.Contract(GTRADE_DIAMOND, [
    "function getTrades(address user) view returns (tuple(address user, uint32 index, uint16 pairIndex, uint24 leverage, bool long, bool isOpen, uint8 collateralIndex, uint8 tradeType, uint120 collateralAmount, uint64 openPrice, uint64 tp, uint64 sl, bool isCounterTrade, uint160 positionSizeToken, uint24 __placeholder)[])",
    "function getPendingOrders(address user) view returns (tuple(uint8 orderType, uint32 tradeIndex, uint16 pairIndex, bool isOpen, bool long)[])",
  ], admin);

  console.log("Checking trades for contract:", GOLD_COPY_TRADER);

  try {
    const trades = await diamond.getTrades(GOLD_COPY_TRADER);
    console.log("\nOpen trades:", trades.length);
    trades.forEach((t, i) => {
      console.log(`\n  Trade ${i}:`);
      console.log(`    Pair: ${t.pairIndex} ${t.pairIndex === 90n ? "(XAU/USD)" : ""}`);
      console.log(`    Direction: ${t.long ? "LONG" : "SHORT"}`);
      console.log(`    Leverage: ${(Number(t.leverage) / 1000)}x`);
      console.log(`    Collateral: ${ethers.formatUnits(t.collateralAmount, 6)} USDC`);
      console.log(`    Open price: $${(Number(t.openPrice) / 1e10).toFixed(2)}`);
      console.log(`    TP: $${(Number(t.tp) / 1e10).toFixed(2)}`);
      console.log(`    SL: $${(Number(t.sl) / 1e10).toFixed(2)}`);
      console.log(`    isOpen: ${t.isOpen}`);
    });
  } catch(e) {
    console.log("getTrades error:", e.message.slice(0, 200));
  }

  try {
    const pending = await diamond.getPendingOrders(GOLD_COPY_TRADER);
    console.log("\nPending orders:", pending.length);
    pending.forEach((p, i) => {
      console.log(`  Order ${i}: type=${p.orderType} pair=${p.pairIndex} open=${p.isOpen} long=${p.long}`);
    });
  } catch(e) {
    console.log("getPendingOrders error:", e.message.slice(0, 200));
  }
}

main().catch(console.error);
