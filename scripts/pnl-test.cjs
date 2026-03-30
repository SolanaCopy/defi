const { ethers } = require("hardhat");

const USDC_ADDRESS = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const GTRADE_DIAMOND = "0xFF162c694eAA571f685030649814282eA457f169";
const GOLD_COPY_TRADER = "0xb09d6B8fA13Cbf757393ECb3E9c616C6BE94cA82";

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
  "function balanceOf(address) view returns (uint256)",
];

const DIAMOND_ABI = [
  "function getTrades(address user) view returns (tuple(address user, uint32 index, uint16 pairIndex, uint24 leverage, bool long, bool isOpen, uint8 collateralIndex, uint8 tradeType, uint120 collateralAmount, uint64 openPrice, uint64 tp, uint64 sl, bool isCounterTrade, uint160 positionSizeToken, uint24 __placeholder)[])",
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const [admin] = await ethers.getSigners();
  const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, admin);
  const trader = new ethers.Contract(GOLD_COPY_TRADER, COPY_TRADER_ABI, admin);
  const diamond = new ethers.Contract(GTRADE_DIAMOND, DIAMOND_ABI, admin);

  const startUsdc = await usdc.balanceOf(admin.address);
  const startEth = await ethers.provider.getBalance(admin.address);
  console.log("=== START ===");
  console.log("USDC:", ethers.formatUnits(startUsdc, 6));
  console.log("ETH:", ethers.formatEther(startEth));

  const amount = 12800000n; // 12.8 USDC
  const leverage = 250000;  // 250x

  // XAU/USD entry - use wide TP/SL to avoid instant close
  const entry = 3025n * 10n ** 10n;
  const tp    = 3200n * 10n ** 10n;  // TP far away ($3200)
  const sl    = 2800n * 10n ** 10n;  // SL far away ($2800)

  // Step 1: Approve
  console.log("\n[1/6] Approve...");
  const allowance = await usdc.allowance(admin.address, GOLD_COPY_TRADER);
  if (allowance < amount) {
    const tx = await usdc.approve(GOLD_COPY_TRADER, ethers.MaxUint256);
    await tx.wait();
    await sleep(3000);
    console.log("Done");
  } else {
    console.log("Already approved");
  }

  // Step 2: Post signal
  console.log("\n[2/6] Post signal: LONG XAU/USD, 250x, TP $3200, SL $2800...");
  const postTx = await trader.postSignal(true, entry, tp, sl, leverage);
  await postTx.wait();
  await sleep(3000);
  const signalId = await trader.activeSignalId();
  console.log("Signal #" + signalId.toString());

  // Step 3: Copy trade
  console.log("\n[3/6] Copy trade with 12.8 USDC...");
  const balBefore = await usdc.balanceOf(GOLD_COPY_TRADER);
  try {
    const copyTx = await trader.copyTrade(signalId, amount, { gasLimit: 5000000 });
    const receipt = await copyTx.wait();
    console.log("Tx:", receipt.hash);
    console.log("Gas:", receipt.gasUsed.toString());
  } catch (e) {
    console.error("FAILED:", e.message.slice(0, 300));
    await sleep(3000);
    await (await trader.cancelSignal(signalId)).wait();
    console.log("Signal cancelled.");
    return;
  }

  // Step 4: Check gTrade
  console.log("\n[4/6] Checking gTrade...");
  await sleep(5000);
  const contractBal = await usdc.balanceOf(GOLD_COPY_TRADER);
  console.log("Contract USDC after trade:", ethers.formatUnits(contractBal, 6));

  try {
    const trades = await diamond.getTrades(GOLD_COPY_TRADER);
    if (trades.length > 0) {
      console.log("OPEN TRADE ON GTRADE:");
      const t = trades[trades.length - 1];
      console.log("  XAU/USD", t.long ? "LONG" : "SHORT", (Number(t.leverage)/1000)+"x");
      console.log("  Collateral:", ethers.formatUnits(t.collateralAmount, 6), "USDC");
      console.log("  Entry: $" + (Number(t.openPrice) / 1e10).toFixed(2));
    } else {
      console.log("No open trades (gTrade executed & closed instantly)");
    }
  } catch(e) {}

  // Step 5: Calculate actual PnL from contract balance
  // gTrade returned some USDC to contract - calculate the real result
  const returned = contractBal - balBefore;
  const sent = amount;
  const diff = returned - sent;
  const pnlPct = Number(diff) * 10000 / Number(sent); // basis points

  console.log("\n[5/6] PnL Calculation:");
  console.log("  Sent to gTrade:", ethers.formatUnits(sent, 6), "USDC");
  console.log("  Returned:", ethers.formatUnits(returned, 6), "USDC");
  console.log("  PnL:", ethers.formatUnits(diff, 6), "USDC");
  console.log("  PnL %:", (Number(diff) / Number(sent) * 100).toFixed(4) + "%");

  // Close signal with actual result (negative = loss from fees)
  // resultPct is in basis points relative to leveraged position
  // loss_on_collateral = diff / sent (negative)
  // resultPct = loss_on_collateral * 10000 / (leverage/1000)
  const resultPct = Math.round(pnlPct * 1000 / leverage);
  console.log("  resultPct for contract:", resultPct, "(basis points on leveraged position)");

  // Use a slightly more negative result to ensure contract has enough
  const safeResult = Math.min(resultPct, -1);
  console.log("  Using safeResult:", safeResult);

  console.log("\n[6/6] Close signal & claim...");
  await sleep(3000);
  const closeTx = await trader.closeSignal(signalId, safeResult);
  await closeTx.wait();
  console.log("Signal closed with result:", safeResult);

  await sleep(3000);

  // Check if claim will work
  const col = 12800000n;
  let expectedPayout;
  if (safeResult >= 0) {
    const profit = col * BigInt(safeResult) * BigInt(leverage) / (10000n * 1000n);
    const fee = profit * 2000n / 10000n;
    expectedPayout = col + profit - fee;
  } else {
    const loss = col * BigInt(-safeResult) * BigInt(leverage) / (10000n * 1000n);
    expectedPayout = loss >= col ? 0n : col - loss;
  }

  const currentBal = await usdc.balanceOf(GOLD_COPY_TRADER);
  console.log("Expected payout:", ethers.formatUnits(expectedPayout, 6));
  console.log("Contract balance:", ethers.formatUnits(currentBal, 6));

  if (currentBal >= expectedPayout) {
    const claimTx = await trader.claimProceeds(signalId);
    await claimTx.wait();
    console.log("Claimed!");
  } else {
    console.log("WARNING: Not enough in contract. Gap:", ethers.formatUnits(expectedPayout - currentBal, 6));
  }

  const finalUsdc = await usdc.balanceOf(admin.address);
  const finalEth = await ethers.provider.getBalance(admin.address);
  console.log("\n=== RESULT ===");
  console.log("USDC:", ethers.formatUnits(finalUsdc, 6), "(was", ethers.formatUnits(startUsdc, 6) + ")");
  console.log("ETH:", ethers.formatEther(finalEth));
  console.log("Net PnL:", ethers.formatUnits(finalUsdc - startUsdc, 6), "USDC (incl gTrade fees + gas)");
}

main().catch((e) => {
  console.error("\nFATAL:", e.message.slice(0, 300));
  process.exitCode = 1;
});
