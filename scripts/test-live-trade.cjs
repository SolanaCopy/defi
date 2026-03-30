const { ethers } = require("hardhat");

const USDC_ADDRESS = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const GTRADE_DIAMOND = "0xFF162c694eAA571f685030649814282eA457f169";
const GOLD_COPY_TRADER = "0xb09d6B8fA13Cbf757393ECb3E9c616C6BE94cA82";

const DIAMOND_ABI = [
  "function getTrades(address user) view returns (tuple(address user, uint32 index, uint16 pairIndex, uint24 leverage, bool long, bool isOpen, uint8 collateralIndex, uint8 tradeType, uint120 collateralAmount, uint64 openPrice, uint64 tp, uint64 sl, uint120 positionSizeToken, bool isCounterTrade)[])",
];

const COPY_TRADER_ABI = [
  "function postSignal(bool _long, uint64 _entry, uint64 _tp, uint64 _sl, uint24 _lev) external",
  "function closeSignal(uint256 _id, int256 _result) external",
  "function cancelSignal(uint256 _id) external",
  "function copyTrade(uint256 _id, uint256 _amount) external",
  "function claimProceeds(uint256 _id) external",
  "function activeSignalId() view returns (uint256)",
];

const USDC_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const [admin] = await ethers.getSigners();
  const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, admin);
  const trader = new ethers.Contract(GOLD_COPY_TRADER, COPY_TRADER_ABI, admin);
  const diamond = new ethers.Contract(GTRADE_DIAMOND, DIAMOND_ABI, admin);

  const ethBal = await ethers.provider.getBalance(admin.address);
  const usdcBal = await usdc.balanceOf(admin.address);
  console.log("Admin:", admin.address);
  console.log("ETH:", ethers.formatEther(ethBal));
  console.log("USDC:", ethers.formatUnits(usdcBal, 6));

  // Use all USDC (floor to whole USDC to be safe)
  // 12 USDC * 250x = $3000 is exact minimum, need more
  // Use 12.8 USDC to be safe
  const amount = 12800000n; // 12.8 USDC
  const leverage = 250000;  // 250x → position = ~$3200 > $3000 min

  if (usdcBal < amount) {
    throw new Error(`Need ${ethers.formatUnits(amount, 6)} USDC, have ${ethers.formatUnits(usdcBal, 6)}`);
  }

  // XAU/USD ~ $3025 current price (March 2026)
  const entryPrice = 3025n * 10n ** 10n;
  const tpPrice    = 3075n * 10n ** 10n;  // +$50
  const slPrice    = 2975n * 10n ** 10n;  // -$50

  // === STEP 1: Approve ===
  console.log("\n[1/5] Checking USDC approval...");
  const allowance = await usdc.allowance(admin.address, GOLD_COPY_TRADER);
  if (allowance < amount) {
    const tx = await usdc.approve(GOLD_COPY_TRADER, ethers.MaxUint256);
    await tx.wait();
    await sleep(3000);
    console.log("Approved!");
  } else {
    console.log("Already approved");
  }

  // === STEP 2: Post signal ===
  console.log("\n[2/5] Posting signal: LONG XAU/USD @ $3025, TP $3075, SL $2975, 250x...");
  const postTx = await trader.postSignal(true, entryPrice, tpPrice, slPrice, leverage);
  await postTx.wait();
  await sleep(3000);
  const signalId = await trader.activeSignalId();
  console.log("Signal #" + signalId.toString() + " posted!");

  // === STEP 3: Copy trade ===
  console.log("\n[3/5] Copying trade with " + ethers.formatUnits(amount, 6) + " USDC...");
  console.log("Position size: ~$" + (Number(amount) / 1e6 * 250).toFixed(0));
  try {
    const copyTx = await trader.copyTrade(signalId, amount, { gasLimit: 5000000 });
    const receipt = await copyTx.wait();
    await sleep(3000);
    console.log("Trade copied! Tx:", receipt.hash);
    console.log("Gas used:", receipt.gasUsed.toString());
  } catch (e) {
    console.error("\nCopyTrade FAILED:", e.message.slice(0, 500));
    console.log("\nCancelling signal...");
    await sleep(3000);
    const cancelTx = await trader.cancelSignal(signalId);
    await cancelTx.wait();
    console.log("Signal cancelled.");
    return;
  }

  // === STEP 4: Verify on gTrade ===
  console.log("\n[4/5] Checking gTrade for open position...");
  await sleep(3000);
  try {
    const trades = await diamond.getTrades(GOLD_COPY_TRADER);
    if (trades.length > 0) {
      console.log("TRADE IS LIVE ON GTRADE!");
      const t = trades[trades.length - 1];
      console.log("  Pair:", t.pairIndex.toString(), t.pairIndex === 90n ? "(XAU/USD)" : "");
      console.log("  Direction:", t.long ? "LONG" : "SHORT");
      console.log("  Leverage:", (Number(t.leverage) / 1000) + "x");
      console.log("  Collateral:", ethers.formatUnits(t.collateralAmount, 6), "USDC");
      console.log("  Open price: $" + (Number(t.openPrice) / 1e10).toFixed(2));
      console.log("  TP: $" + (Number(t.tp) / 1e10).toFixed(2));
      console.log("  SL: $" + (Number(t.sl) / 1e10).toFixed(2));
      console.log("  isOpen:", t.isOpen);
    } else {
      console.log("No open trades found (order may be pending)");
    }
  } catch (e) {
    console.log("Verify error:", e.message.slice(0, 200));
  }

  // === STEP 5: Close & claim ===
  console.log("\n[5/5] Closing signal (breakeven) & claiming...");
  const closeTx = await trader.closeSignal(signalId, 0);
  await closeTx.wait();
  await sleep(3000);
  console.log("Signal closed!");

  const claimTx = await trader.claimProceeds(signalId);
  await claimTx.wait();
  console.log("Proceeds claimed!");

  console.log("\nFinal USDC:", ethers.formatUnits(await usdc.balanceOf(admin.address), 6));
  console.log("Final ETH:", ethers.formatEther(await ethers.provider.getBalance(admin.address)));
  console.log("\n=== LIVE TEST COMPLETE ===");
}

main().catch((error) => {
  console.error("\nFATAL:", error.message.slice(0, 500));
  process.exitCode = 1;
});
