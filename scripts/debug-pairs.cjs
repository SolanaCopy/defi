const { ethers } = require("hardhat");

const GTRADE_DIAMOND = "0xFF162c694eAA571f685030649814282eA457f169";

async function main() {
  const [admin] = await ethers.getSigners();

  const diamond = new ethers.Contract(GTRADE_DIAMOND, [
    "function openTrade(tuple(address user, uint32 index, uint16 pairIndex, uint24 leverage, bool long, bool isOpen, uint8 collateralIndex, uint8 tradeType, uint120 collateralAmount, uint64 openPrice, uint64 tp, uint64 sl, uint120 positionSizeToken, bool isCounterTrade) trade, uint16 maxSlippageP, address referrer) external",
    "function pairs(uint256) view returns (tuple(string from, string to, uint256 spreadP, uint256 groupIndex, uint256 feeIndex))",
    "function pairsCount() view returns (uint256)",
    "function isPairListed(uint256 from, uint256 to) view returns (bool)",
    "function isPairIndexListed(uint256 pairIndex) view returns (bool)",
    "function pairMinPositionSizeUsd(uint256 pairIndex) view returns (uint256)",
    "function pairMinLeverage(uint256 pairIndex) view returns (uint256)",
    "function pairMaxLeverage(uint256 pairIndex) view returns (uint256)",
    "function getGroupIndex(uint256 pairIndex) view returns (uint256)",
  ], admin);

  // Check total pairs count
  try {
    const count = await diamond.pairsCount();
    console.log("Total pairs:", count.toString());
  } catch(e) { console.log("pairsCount error:", e.message.slice(0, 100)); }

  // Check if pair 90 is listed
  try {
    const listed = await diamond.isPairIndexListed(90);
    console.log("Pair 90 listed:", listed);
  } catch(e) { console.log("isPairIndexListed error:", e.message.slice(0, 100)); }

  // Check a few pairs: 0 (BTC), 1 (ETH), 90 (XAU)
  for (const pairIdx of [0, 1, 90]) {
    try {
      const pair = await diamond.pairs(pairIdx);
      const minPos = await diamond.pairMinPositionSizeUsd(pairIdx);
      const minLev = await diamond.pairMinLeverage(pairIdx);
      const maxLev = await diamond.pairMaxLeverage(pairIdx);
      console.log(`\nPair ${pairIdx}: ${pair.from}/${pair.to}`);
      console.log(`  Min position: $${ethers.formatUnits(minPos, 18)}`);
      console.log(`  Leverage: ${minLev}-${maxLev}`);
    } catch(e) { console.log(`Pair ${pairIdx} error:`, e.message.slice(0, 100)); }
  }

  // Try openTrade with BTC/USD (pair 0) to see if ANY pair works
  // Use small amount, just staticCall
  console.log("\n=== Testing openTrade staticCall per pair ===");

  for (const [pairIdx, price] of [[0, 85000n], [1, 3500n], [90, 3025n]]) {
    const trade = {
      user: admin.address,
      index: 0,
      pairIndex: pairIdx,
      leverage: 250000,
      long: true,
      isOpen: true,
      collateralIndex: 3,
      tradeType: 0,
      collateralAmount: 12800000n,
      openPrice: price * 10n ** 10n,
      tp: (price + 100n) * 10n ** 10n,
      sl: (price - 100n) * 10n ** 10n,
      positionSizeToken: 0,
      isCounterTrade: false,
    };

    try {
      await diamond.openTrade.staticCall(trade, 1000, ethers.ZeroAddress);
      console.log(`Pair ${pairIdx}: SUCCESS`);
    } catch(e) {
      const errData = e.data || "none";
      console.log(`Pair ${pairIdx}: ${errData}`);
    }
  }

  // Try with openPrice = 0 (let gTrade use market price)
  console.log("\n=== Testing with openPrice=0, tp=0, sl=0 ===");
  const trade0 = {
    user: admin.address,
    index: 0,
    pairIndex: 90,
    leverage: 250000,
    long: true,
    isOpen: true,
    collateralIndex: 3,
    tradeType: 0,
    collateralAmount: 12800000n,
    openPrice: 0n,
    tp: 0n,
    sl: 0n,
    positionSizeToken: 0,
    isCounterTrade: false,
  };

  try {
    await diamond.openTrade.staticCall(trade0, 1000, ethers.ZeroAddress);
    console.log("openPrice=0: SUCCESS");
  } catch(e) {
    console.log("openPrice=0:", e.data || e.message.slice(0, 100));
  }

  // Try with maxSlippageP = 0
  console.log("\n=== Testing maxSlippageP variations ===");
  for (const slippage of [0, 100, 500, 1000, 5000, 10000]) {
    const trade = {
      user: admin.address,
      index: 0,
      pairIndex: 90,
      leverage: 250000,
      long: true,
      isOpen: true,
      collateralIndex: 3,
      tradeType: 0,
      collateralAmount: 12800000n,
      openPrice: 3025n * 10n ** 10n,
      tp: 3075n * 10n ** 10n,
      sl: 2975n * 10n ** 10n,
      positionSizeToken: 0,
      isCounterTrade: false,
    };

    try {
      await diamond.openTrade.staticCall(trade, slippage, ethers.ZeroAddress);
      console.log(`slippage ${slippage}: SUCCESS`);
    } catch(e) {
      console.log(`slippage ${slippage}: ${e.data || "revert"}`);
    }
  }
}

main().catch(console.error);
