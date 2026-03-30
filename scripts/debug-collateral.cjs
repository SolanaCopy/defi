const { ethers } = require("hardhat");

const GTRADE_DIAMOND = "0xFF162c694eAA571f685030649814282eA457f169";
const USDC_ADDRESS = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";

async function main() {
  const [admin] = await ethers.getSigners();

  const diamond = new ethers.Contract(GTRADE_DIAMOND, [
    // Try different collateral getter signatures
    "function getCollateral(uint8 index) view returns (tuple(address collateral, bool isActive, uint88 __placeholder, uint128 precision, uint128 precisionDelta, uint256 maxNegativePnlOnOpenP))",
    "function getCollateralIndex(address collateral) view returns (uint8)",
    "function getCollateralsCount() view returns (uint8)",
  ], admin);

  // Find how many collateral types exist
  try {
    const count = await diamond.getCollateralsCount();
    console.log("Collateral count:", count.toString());
  } catch(e) { console.log("getCollateralsCount error:", e.message.slice(0, 100)); }

  // Find USDC's collateral index
  try {
    const idx = await diamond.getCollateralIndex(USDC_ADDRESS);
    console.log("USDC collateral index:", idx.toString());
  } catch(e) { console.log("getCollateralIndex error:", e.message.slice(0, 100)); }

  // Check each possible index (1-5)
  for (let i = 0; i <= 5; i++) {
    try {
      const col = await diamond.getCollateral(i);
      console.log(`Index ${i}: token=${col.collateral} active=${col.isActive} precision=${col.precision}`);
    } catch(e) {
      // skip
    }
  }

  // Also try openTrade with collateral index 1 and 2
  const diamond2 = new ethers.Contract(GTRADE_DIAMOND, [
    "function openTrade(tuple(address user, uint32 index, uint16 pairIndex, uint24 leverage, bool long, bool isOpen, uint8 collateralIndex, uint8 tradeType, uint120 collateralAmount, uint64 openPrice, uint64 tp, uint64 sl, uint120 positionSizeToken, bool isCounterTrade) trade, uint16 maxSlippageP, address referrer) external",
  ], admin);

  for (const colIdx of [1, 2, 3]) {
    const trade = {
      user: admin.address,
      index: 0,
      pairIndex: 90,
      leverage: 250000,
      long: true,
      isOpen: true,
      collateralIndex: colIdx,
      tradeType: 0,
      collateralAmount: 12800000n,
      openPrice: 3025n * 10n ** 10n,
      tp: 3075n * 10n ** 10n,
      sl: 2975n * 10n ** 10n,
      positionSizeToken: 0,
      isCounterTrade: false,
    };

    try {
      await diamond2.openTrade.staticCall(trade, 1000, ethers.ZeroAddress);
      console.log(`\nCollateral index ${colIdx}: SUCCESS!`);
    } catch(e) {
      const errData = e.data || "none";
      console.log(`\nCollateral index ${colIdx}: FAILED (${errData})`);
    }
  }
}

main().catch(console.error);
