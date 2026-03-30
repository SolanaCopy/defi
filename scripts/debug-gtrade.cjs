const { ethers } = require("hardhat");

const GTRADE_DIAMOND = "0xFF162c694eAA571f685030649814282eA457f169";
const GOLD_COPY_TRADER = "0x95AEC32a5DfBE98c60aD0EBd9C33E8dF5A7DE6fA";
const USDC_ADDRESS = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";

async function main() {
  const [admin] = await ethers.getSigners();
  const provider = admin.provider;

  // Try to decode error 0xc5723b51
  const errorSig = "0xc5723b51";
  console.log("Error selector:", errorSig);

  // Common gTrade error signatures - let's check
  const errors = [
    "GeneralPaused()",
    "TradingNotActivated()",
    "Paused()",
    "NotActivated()",
    "WrongTradeType()",
    "InsufficientCollateral()",
    "BelowMinPositionSizeUsd()",
    "AboveMaxPositionSizeUsd()",
    "WrongLeverage()",
    "WrongCollateral()",
    "PriceZero()",
    "AlreadyBeingMarketClosed()",
    "PairNotListed()",
    "MaxTradesPerPairReached()",
    "MaxPendingOrdersReached()",
    "WrongSlippage()",
    "Delegations()",
    "NoDelegation()",
  ];

  for (const err of errors) {
    const hash = ethers.id(err).slice(0, 10);
    if (hash === errorSig) {
      console.log("MATCH:", err, "=", hash);
    }
  }

  // Try more gTrade view functions
  const diamond = new ethers.Contract(GTRADE_DIAMOND, [
    "function getTradingActivated() view returns (uint8)",
    "function isTradingActivated() view returns (bool)",
    "function isPaused() view returns (bool)",
    "function pairTradersArray(uint256, uint8) view returns (address[])",
    // Delegation functions
    "function getDelegatedTraders(address) view returns (address[])",
    "function delegations(address, address) view returns (bool)",
    // Try different function names for trading status
    "function getTradingVariables() view returns (uint256, uint256, uint256)",
    "function pairJob(uint256) view returns (string, string)",
    "function pairs(uint256) view returns (tuple(string from, string to, uint256 spreadP, uint256 groupIndex, uint256 feeIndex))",
    "function pairFeed(uint256) view returns (tuple(uint256 maxDeviationP, address chainlinkFeed, bytes32 pythPriceId, uint8 feedCalculation))",
  ], admin);

  // Check pair 90 info
  console.log("\n=== Pair 90 Info ===");
  try {
    const pair = await diamond.pairs(90);
    console.log("Pair:", pair.from + "/" + pair.to);
    console.log("Spread:", pair.spreadP?.toString());
    console.log("Group:", pair.groupIndex?.toString());
    console.log("Fee index:", pair.feeIndex?.toString());
  } catch(e) { console.log("pairs(90) error:", e.message.slice(0, 150)); }

  try {
    const feed = await diamond.pairFeed(90);
    console.log("Feed:", JSON.stringify(feed, (k,v) => typeof v === 'bigint' ? v.toString() : v));
  } catch(e) { console.log("pairFeed error:", e.message.slice(0, 150)); }

  // Check USDC allowance from contract to diamond
  const usdc = new ethers.Contract(USDC_ADDRESS, [
    "function allowance(address, address) view returns (uint256)",
    "function balanceOf(address) view returns (uint256)",
  ], admin);

  console.log("\n=== Contract State ===");
  const contractUsdcBal = await usdc.balanceOf(GOLD_COPY_TRADER);
  console.log("Contract USDC balance:", ethers.formatUnits(contractUsdcBal, 6));
  const contractAllowance = await usdc.allowance(GOLD_COPY_TRADER, GTRADE_DIAMOND);
  console.log("Contract → Diamond USDC allowance:", contractAllowance === ethers.MaxUint256 ? "MAX" : contractAllowance.toString());

  // Try checking if this is the right gTrade Diamond
  console.log("\n=== Diamond Contract Check ===");
  const code = await provider.getCode(GTRADE_DIAMOND);
  console.log("Has code:", code.length > 2);
  console.log("Code size:", (code.length - 2) / 2, "bytes");

  // Check if maybe the Diamond has been upgraded/moved
  // Let's check a known gTrade v9.2 function
  const diamond2 = new ethers.Contract(GTRADE_DIAMOND, [
    "function getTradesCount(address, uint8) view returns (uint32)",
    "function maxTradesPerPair() view returns (uint32)",
    "function getOpenTrades(address trader, uint32 start, uint32 end) view returns (tuple(address user, uint32 index, uint16 pairIndex, uint24 leverage, bool long, bool isOpen, uint8 collateralIndex, uint8 tradeType, uint120 collateralAmount, uint64 openPrice, uint64 tp, uint64 sl, uint120 positionSizeToken, bool isCounterTrade)[])",
  ], admin);

  try {
    const maxTrades = await diamond2.maxTradesPerPair();
    console.log("Max trades per pair:", maxTrades.toString());
  } catch(e) { console.log("maxTradesPerPair error:", e.message.slice(0, 100)); }

  try {
    const count = await diamond2.getTradesCount(GOLD_COPY_TRADER, 0);
    console.log("Trade count (type 0):", count.toString());
  } catch(e) { console.log("getTradesCount error:", e.message.slice(0, 100)); }
}

main().catch(console.error);
