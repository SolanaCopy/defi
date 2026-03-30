const { ethers } = require("hardhat");

const USDC_ADDRESS = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const GTRADE_DIAMOND = "0xFF162c694eAA571f685030649814282eA457f169";
const GOLD_COPY_TRADER = "0x95AEC32a5DfBE98c60aD0EBd9C33E8dF5A7DE6fA";

async function main() {
  const [admin] = await ethers.getSigners();

  // First, let's try calling openTrade directly on gTrade from the admin wallet
  // to see if the issue is with gTrade itself or with our contract
  const diamond = new ethers.Contract(GTRADE_DIAMOND, [
    "function openTrade(tuple(address user, uint32 index, uint16 pairIndex, uint24 leverage, bool long, bool isOpen, uint8 collateralIndex, uint8 tradeType, uint120 collateralAmount, uint64 openPrice, uint64 tp, uint64 sl, uint120 positionSizeToken, bool isCounterTrade) trade, uint16 maxSlippageP, address referrer) external",
    "function getTradingActivated() view returns (uint8)",
    "function getAllPairsRestrictedMaxLeverage() view returns (uint256[])",
  ], admin);

  // Check if trading is active
  try {
    const activated = await diamond.getTradingActivated();
    console.log("Trading activated:", activated.toString());
    // 0 = paused, 1 = active, 2 = close-only
  } catch(e) { console.log("getTradingActivated error:", e.message.slice(0, 100)); }

  // Check restricted leverage for pair 90
  try {
    const restricted = await diamond.getAllPairsRestrictedMaxLeverage();
    if (restricted.length > 90) {
      console.log("Pair 90 restricted max leverage:", restricted[90].toString());
    }
  } catch(e) { console.log("Restricted leverage error:", e.message.slice(0, 100)); }

  // Try to simulate copyTrade via staticCall to get error
  const trader = new ethers.Contract(GOLD_COPY_TRADER, [
    "function copyTrade(uint256 _id, uint256 _amount) external",
    "function activeSignalId() view returns (uint256)",
    "function postSignal(bool _long, uint64 _entry, uint64 _tp, uint64 _sl, uint24 _lev) external",
    "function cancelSignal(uint256 _id) external",
  ], admin);

  // Post signal
  console.log("\nPosting signal...");
  const postTx = await trader.postSignal(
    true,
    3025n * 10n ** 10n,
    3075n * 10n ** 10n,
    2975n * 10n ** 10n,
    250000
  );
  await postTx.wait();
  await new Promise(r => setTimeout(r, 3000));

  const signalId = await trader.activeSignalId();
  console.log("Signal ID:", signalId.toString());

  // Try staticCall to get revert reason
  console.log("\nSimulating copyTrade with staticCall...");
  try {
    await trader.copyTrade.staticCall(signalId, 12800000n, { gasLimit: 5000000 });
    console.log("staticCall succeeded (unexpected)");
  } catch (e) {
    console.log("Revert reason:", e.message);
    // Try to decode
    if (e.data) {
      console.log("Error data:", e.data);
    }
    if (e.revert) {
      console.log("Revert:", e.revert);
    }
    if (e.info?.error?.data) {
      console.log("Info error data:", e.info.error.data);
    }
  }

  // Cancel signal
  console.log("\nCancelling...");
  await new Promise(r => setTimeout(r, 3000));
  const cancelTx = await trader.cancelSignal(signalId);
  await cancelTx.wait();
  console.log("Cancelled");
}

main().catch(console.error);
