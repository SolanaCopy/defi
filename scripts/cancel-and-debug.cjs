const { ethers } = require("hardhat");

const USDC_ADDRESS = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const GTRADE_DIAMOND = "0xFF162c694eAA571f685030649814282eA457f169";
const GOLD_COPY_TRADER = "0x95AEC32a5DfBE98c60aD0EBd9C33E8dF5A7DE6fA";

const DIAMOND_ABI = [
  "function pairMinLeverage(uint256 pairIndex) view returns (uint256)",
  "function pairMaxLeverage(uint256 pairIndex) view returns (uint256)",
  "function pairMinPositionSizeUsd(uint256 pairIndex) view returns (uint256)",
  "function pairOpenFeeP(uint256 pairIndex) view returns (uint256)",
  "function pairCloseFeeP(uint256 pairIndex) view returns (uint256)",
  "function collateralConfig(uint8 collateralIndex) view returns (tuple(address token, uint128 precision, uint128 precisionDelta))",
  "function getCollateralPriceUsd(uint8 index) view returns (uint256)",
];

const TRADER_ABI = [
  "function cancelSignal(uint256 _id) external",
  "function activeSignalId() view returns (uint256)",
  "function usdc() view returns (address)",
];

async function main() {
  const [admin] = await ethers.getSigners();
  const diamond = new ethers.Contract(GTRADE_DIAMOND, DIAMOND_ABI, admin);
  const trader = new ethers.Contract(GOLD_COPY_TRADER, TRADER_ABI, admin);

  // Cancel active signal first
  const activeId = await trader.activeSignalId();
  if (activeId > 0n) {
    console.log("Cancelling signal", activeId.toString(), "...");
    const tx = await trader.cancelSignal(activeId);
    await tx.wait();
    console.log("Cancelled!\n");
  }

  // Debug gTrade pair 90
  console.log("=== gTrade Pair 90 (XAU/USD) Debug ===\n");

  try {
    const minPos = await diamond.pairMinPositionSizeUsd(90);
    console.log("Min position size:", ethers.formatUnits(minPos, 18), "USD");
  } catch(e) { console.log("pairMinPositionSizeUsd error:", e.message.slice(0, 100)); }

  try {
    const openFee = await diamond.pairOpenFeeP(90);
    console.log("Open fee:", ethers.formatUnits(openFee, 10), "%");
  } catch(e) { console.log("pairOpenFeeP error:", e.message.slice(0, 100)); }

  try {
    const closeFee = await diamond.pairCloseFeeP(90);
    console.log("Close fee:", ethers.formatUnits(closeFee, 10), "%");
  } catch(e) { console.log("pairCloseFeeP error:", e.message.slice(0, 100)); }

  // Check collateral config for index 3 (USDC)
  console.log("\n=== Collateral Config ===");
  for (let i = 1; i <= 3; i++) {
    try {
      const config = await diamond.collateralConfig(i);
      console.log(`Collateral ${i}: token=${config.token} precision=${config.precision}`);
    } catch(e) { console.log(`Collateral ${i}: error -`, e.message.slice(0, 80)); }
  }

  try {
    const usdcPrice = await diamond.getCollateralPriceUsd(3);
    console.log("USDC price (index 3):", ethers.formatUnits(usdcPrice, 8), "USD");
  } catch(e) { console.log("USDC price error:", e.message.slice(0, 100)); }

  // Check what USDC the contract uses
  const contractUsdc = await trader.usdc();
  console.log("\nContract USDC:", contractUsdc);
  console.log("Expected USDC:", USDC_ADDRESS);
  console.log("Match:", contractUsdc.toLowerCase() === USDC_ADDRESS.toLowerCase());
}

main().catch(console.error);
