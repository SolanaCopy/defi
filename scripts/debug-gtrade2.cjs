const { ethers } = require("hardhat");

const GTRADE_DIAMOND = "0xFF162c694eAA571f685030649814282eA457f169";

async function main() {
  const [admin] = await ethers.getSigners();

  // Decode error selector 0xc5723b51
  console.log("=== Decoding error 0xc5723b51 ===");
  const errorCandidates = [
    "GeneralPaused()", "TradingNotActivated()", "Paused()", "NotActivated()",
    "WrongTradeType()", "InsufficientCollateral()", "BelowMinPositionSizeUsd()",
    "AboveMaxPositionSizeUsd()", "WrongLeverage()", "WrongCollateral()",
    "PriceZero()", "PairNotListed()", "MaxTradesPerPairReached()",
    "WrongSlippage()", "NoDelegation()", "AlreadyBeingMarketClosed()",
    "GeneralClosed()", "GeneralClosedFrom()", "TradingClosedForPair()",
    "MaxTradesReached()", "TradeNotOpen()", "ZeroAddress()",
    "WrongOrderType()", "WrongAccess()", "DelegateNotApproved()",
    "NotAuthorized()", "Unauthorized()", "OnlyOwner()",
    "NotAllowed()", "Forbidden()", "AccessDenied()",
    "NotDelegate()", "InvalidDelegate()", "DelegateRequired()",
    "OnlyTradingContract()", "OnlyCallbacks()", "OnlyManager()",
    "WrongIndex()", "WrongAddress()", "InvalidSender()",
    "NotTradingActivated()", "TradingPaused()", "MarketClosed()",
    "NotWhitelisted()", "WrongCollateralIndex()",
  ];

  const target = "0xc5723b51";
  for (const err of errorCandidates) {
    const hash = ethers.id(err).slice(0, 10);
    if (hash === target) {
      console.log("FOUND:", err);
    }
  }

  // Also try to get the error from 4byte.directory
  console.log("\nNo match in candidates, trying brute force with gTrade-style errors...");

  // More specific gTrade v9 errors
  const gtradeErrors = [
    "InsufficientBalance()", "AboveMax()", "BelowMin()",
    "WrongParams()", "WrongTrade()", "DoesntExist()",
    "AlreadyExists()", "NotYourOrder()", "CantBeSelf()",
    "SlippageExceeded()", "MaxOpenInterestReached()",
    "NotWrappedNativeToken()", "DelegationFailed()",
    "NotAllowedInBacktesting()", "NotEnoughCollateral()",
    "ConflictingPendingOrder()", "Wrongtp()", "Wrongsl()",
    "PendingTrigger()", "NoTrade()", "NoOrder()",
    "InitError()", "AlreadyInitialized()", "WrongLength()",
    "Overflow()", "WrongPairIndex()", "WrongCallback()",
  ];

  for (const err of gtradeErrors) {
    const hash = ethers.id(err).slice(0, 10);
    if (hash === target) {
      console.log("FOUND:", err);
    }
  }

  // Let's try to open a trade directly from admin wallet to gTrade
  // to see if the issue is with our contract or gTrade itself
  console.log("\n=== Testing direct openTrade call ===");
  const usdc = new ethers.Contract("0xaf88d065e77c8cC2239327C5EDb3A432268e5831", [
    "function approve(address, uint256) external returns (bool)",
    "function allowance(address, address) view returns (uint256)",
  ], admin);

  // Check if admin approved Diamond
  const allowance = await usdc.allowance(admin.address, GTRADE_DIAMOND);
  console.log("Admin → Diamond allowance:", allowance > 0n ? "yes" : "no");

  if (allowance === 0n) {
    console.log("Approving Diamond...");
    const tx = await usdc.approve(GTRADE_DIAMOND, ethers.MaxUint256);
    await tx.wait();
    await new Promise(r => setTimeout(r, 3000));
  }

  // Try direct openTrade from admin
  const diamond = new ethers.Contract(GTRADE_DIAMOND, [
    "function openTrade(tuple(address user, uint32 index, uint16 pairIndex, uint24 leverage, bool long, bool isOpen, uint8 collateralIndex, uint8 tradeType, uint120 collateralAmount, uint64 openPrice, uint64 tp, uint64 sl, uint120 positionSizeToken, bool isCounterTrade) trade, uint16 maxSlippageP, address referrer) external",
  ], admin);

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
    await diamond.openTrade.staticCall(trade, 1000, ethers.ZeroAddress);
    console.log("Direct openTrade staticCall SUCCEEDED!");
  } catch(e) {
    const errData = e.data || e.info?.error?.data || "none";
    console.log("Direct openTrade FAILED");
    console.log("Error:", e.message.slice(0, 200));
    console.log("Error data:", errData);
  }
}

main().catch(console.error);
