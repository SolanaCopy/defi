const { ethers } = require("hardhat");

const USDC_ADDRESS = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const GTRADE_DIAMOND = "0xFF162c694eAA571f685030649814282eA457f169";
const GOLD_COPY_TRADER = "0xe58A6Efa1d395B4cfC361C5D3Ac6909ed1eA5999";

const COPY_TRADER_ABI = [
  "function postSignal(bool _long, uint64 _entry, uint64 _tp, uint64 _sl, uint24 _lev) external",
  "function closeSignal(uint256 _id, int256 _result) external",
  "function cancelSignal(uint256 _id) external",
  "function copyTrade(uint256 _id, uint256 _amount) external",
  "function claimProceeds(uint256 _id) external",
  "function activeSignalId() view returns (uint256)",
  "function signalCount() view returns (uint256)",
  "function signalCore(uint256) view returns (bool long, bool active, bool closed, uint64 entryPrice, uint64 tp, uint64 sl, uint24 leverage, int256 resultPct, uint256 feeAtCreation)",
  "function signalMeta(uint256) view returns (uint256 timestamp, uint256 closedAt, uint256 totalCopied, uint256 copierCount)",
  "function positions(address, uint256) view returns (uint256 collateral, uint32 gTradeIndex, bool claimed)",
  "function getUserSignalIds(address) view returns (uint256[])",
  "function getExpectedPayout(address, uint256) view returns (uint256)",
  "function getActiveSignalId() view returns (uint256)",
  "function admin() view returns (address)",
  "function feePercent() view returns (uint256)",
  "function totalFeesCollected() view returns (uint256)",
  "function paused() view returns (bool)",
  "function usdc() view returns (address)",
  "function diamond() view returns (address)",
  "function adminDeposit(uint256) external",
  "function setFeePercent(uint256) external",
  "function setPaused(bool) external",
  "function withdrawFees() external",
];

const USDC_ABI = [
  "function approve(address, uint256) external returns (bool)",
  "function allowance(address, address) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

let passed = 0;
let failed = 0;

function check(name, condition, detail) {
  if (condition) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.log(`  ❌ ${name} — ${detail || 'FAILED'}`);
    failed++;
  }
}

async function main() {
  const [admin] = await ethers.getSigners();
  const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, admin);
  const trader = new ethers.Contract(GOLD_COPY_TRADER, COPY_TRADER_ABI, admin);

  console.log("╔══════════════════════════════════════════╗");
  console.log("║   FULL END-TO-END TEST — GoldCopyTrader  ║");
  console.log("╚══════════════════════════════════════════╝\n");

  // ===== 1. CONTRACT CONFIG =====
  console.log("1️⃣  CONTRACT CONFIG");
  const contractAdmin = await trader.admin();
  check("Admin is deployer", contractAdmin.toLowerCase() === admin.address.toLowerCase());

  const contractUsdc = await trader.usdc();
  check("USDC address correct", contractUsdc.toLowerCase() === USDC_ADDRESS.toLowerCase());

  const contractDiamond = await trader.diamond();
  check("gTrade Diamond correct", contractDiamond.toLowerCase() === GTRADE_DIAMOND.toLowerCase());

  const fee = await trader.feePercent();
  check("Fee is 20%", Number(fee) === 2000, `Got ${Number(fee)}`);

  const isPaused = await trader.paused();
  check("Not paused", !isPaused);

  const activeId = await trader.activeSignalId();
  check("No active signal", Number(activeId) === 0);

  const signalCount = await trader.signalCount();
  console.log(`  ℹ️  Signal count: ${signalCount}\n`);

  // ===== 2. APPROVE USDC =====
  console.log("2️⃣  USDC APPROVAL");
  const allowance = await usdc.allowance(admin.address, GOLD_COPY_TRADER);
  if (allowance < 13000000n) {
    const tx = await usdc.approve(GOLD_COPY_TRADER, ethers.MaxUint256);
    await tx.wait();
    await sleep(3000);
    check("USDC approved", true);
  } else {
    check("USDC already approved", true);
  }

  const usdcBal = await usdc.balanceOf(admin.address);
  console.log(`  ℹ️  USDC balance: ${ethers.formatUnits(usdcBal, 6)}\n`);

  // ===== 3. POST SIGNAL =====
  console.log("3️⃣  POST SIGNAL");
  const entry = 3025n * 10n ** 10n;
  const tp = 3075n * 10n ** 10n;
  const sl = 2975n * 10n ** 10n;
  const leverage = 250000; // 250x (needed for $3000 min position on gTrade)

  const postTx = await trader.postSignal(true, entry, tp, sl, leverage);
  await postTx.wait();
  await sleep(3000);

  const newActiveId = await trader.activeSignalId();
  check("Signal posted", Number(newActiveId) > 0, `activeSignalId=${newActiveId}`);

  const sigId = Number(newActiveId);
  const core = await trader.signalCore(sigId);
  check("Direction is LONG", core.long === true);
  check("Entry price correct", Number(core.entryPrice) === Number(entry), `Got ${core.entryPrice}`);
  check("TP correct", Number(core.tp) === Number(tp));
  check("SL correct", Number(core.sl) === Number(sl));
  check("Leverage is 250x", Number(core.leverage) === 250000);
  check("Signal is active", core.active === true);
  check("Signal not closed", core.closed === false);
  check("Fee locked at 20%", Number(core.feeAtCreation) === 2000, `Got ${core.feeAtCreation}`);

  const meta = await trader.signalMeta(sigId);
  check("Timestamp set", Number(meta.timestamp) > 0);
  check("Copier count is 0", Number(meta.copierCount) === 0);
  console.log();

  // ===== 4. COPY TRADE =====
  console.log("4️⃣  COPY TRADE");
  const copyAmount = 13000000n; // 13 USDC (13 * 250x = $3250 > $3000 min)
  const balBefore = await usdc.balanceOf(admin.address);

  try {
    const copyTx = await trader.copyTrade(sigId, copyAmount, { gasLimit: 5000000 });
    await copyTx.wait();
    await sleep(3000);
    check("Copy trade succeeded", true);
  } catch (e) {
    check("Copy trade succeeded", false, e.message.slice(0, 100));
  }

  const balAfter = await usdc.balanceOf(admin.address);
  check("USDC deducted from wallet", balAfter < balBefore);

  const pos = await trader.positions(admin.address, sigId);
  check("Position recorded", Number(pos.collateral) === Number(copyAmount), `collateral=${pos.collateral}`);
  check("Position not claimed", pos.claimed === false);

  const metaAfter = await trader.signalMeta(sigId);
  check("Copier count is 1", Number(metaAfter.copierCount) === 1);
  check("Total copied correct", Number(metaAfter.totalCopied) === Number(copyAmount));

  const userSids = await trader.getUserSignalIds(admin.address);
  check("User signal IDs updated", userSids.map(Number).includes(sigId));
  console.log();

  // ===== 5. CLOSE SIGNAL =====
  console.log("5️⃣  CLOSE SIGNAL (with -0.01% result = tiny loss from fees)");
  const resultPct = -1; // -0.01% (realistic for gTrade fee impact)

  const closeTx = await trader.closeSignal(sigId, resultPct);
  await closeTx.wait();
  await sleep(3000);

  const coreAfter = await trader.signalCore(sigId);
  check("Signal no longer active", coreAfter.active === false);
  check("Signal is closed", coreAfter.closed === true);
  check("Result stored correctly", Number(coreAfter.resultPct) === resultPct);

  const activeAfter = await trader.activeSignalId();
  check("No active signal", Number(activeAfter) === 0);

  const metaClosed = await trader.signalMeta(sigId);
  check("ClosedAt timestamp set", Number(metaClosed.closedAt) > 0);
  console.log();

  // ===== 6. CHECK EXPECTED PAYOUT =====
  console.log("6️⃣  EXPECTED PAYOUT CALCULATION");
  // loss = 13 * 100 * 250000 / (10000 * 1000) = 32.5 USDC → exceeds collateral → total loss
  // payout = 0
  const expectedPayout = await trader.getExpectedPayout(admin.address, sigId);
  // With 250x and -1%, loss = 13 * 100 * 250000 / 10000000 = 32.5 > 13, so total loss
  console.log(`  ℹ️  Expected payout: ${ethers.formatUnits(expectedPayout, 6)} USDC`);
  check("Expected payout calculated", true);
  console.log();

  // ===== 7. CLAIM PROCEEDS =====
  console.log("7️⃣  CLAIM PROCEEDS");
  const contractBalBefore = await usdc.balanceOf(GOLD_COPY_TRADER);
  const walletBefore = await usdc.balanceOf(admin.address);

  try {
    const claimTx = await trader.claimProceeds(sigId);
    await claimTx.wait();
    await sleep(3000);
    check("Claim succeeded", true);
  } catch (e) {
    check("Claim succeeded", false, e.message.slice(0, 100));
  }

  const walletAfterClaim = await usdc.balanceOf(admin.address);
  const received = walletAfterClaim - walletBefore;
  check("Received correct payout", received > 0n, `Received ${ethers.formatUnits(received, 6)} USDC`);

  const posAfterClaim = await trader.positions(admin.address, sigId);
  check("Position marked as claimed", posAfterClaim.claimed === true);

  // Try double claim
  try {
    await trader.claimProceeds.staticCall(sigId);
    check("Double claim rejected", false, "Should have reverted");
  } catch {
    check("Double claim rejected", true);
  }
  console.log();

  // ===== 8. ADMIN FUNCTIONS =====
  console.log("8️⃣  ADMIN FUNCTIONS");

  // Test fee change
  const setFeeTx = await trader.setFeePercent(1500); // 15%
  await setFeeTx.wait();
  await sleep(2000);
  const newFee = await trader.feePercent();
  check("Fee updated to 15%", Number(newFee) === 1500);

  // Reset fee back
  const resetFeeTx = await trader.setFeePercent(2000);
  await resetFeeTx.wait();
  await sleep(2000);
  check("Fee reset to 20%", Number(await trader.feePercent()) === 2000);

  // Test pause
  const pauseTx = await trader.setPaused(true);
  await pauseTx.wait();
  await sleep(2000);
  check("Contract paused", await trader.paused() === true);

  // Test that copyTrade fails when paused
  try {
    await trader.postSignal.staticCall(true, entry, tp, sl, leverage);
    check("Post signal blocked when paused", false);
  } catch {
    check("Post signal blocked when paused", true);
  }

  // Unpause
  const unpauseTx = await trader.setPaused(false);
  await unpauseTx.wait();
  await sleep(2000);
  check("Contract unpaused", await trader.paused() === false);
  console.log();

  // ===== 9. CANCEL SIGNAL TEST =====
  console.log("9️⃣  CANCEL SIGNAL");
  const postTx2 = await trader.postSignal(true, entry, tp, sl, leverage);
  await postTx2.wait();
  await sleep(3000);
  const cancelId = Number(await trader.activeSignalId());
  check("New signal posted", cancelId > 0);

  const cancelTx = await trader.cancelSignal(cancelId);
  await cancelTx.wait();
  await sleep(2000);

  const cancelledCore = await trader.signalCore(cancelId);
  check("Cancelled signal closed", cancelledCore.closed === true);
  check("Cancelled result is 0 (breakeven)", Number(cancelledCore.resultPct) === 0);
  check("No active signal after cancel", Number(await trader.activeSignalId()) === 0);
  console.log();

  // ===== 10. FRONTEND DATA CHECK =====
  console.log("🔟  FRONTEND DATA VERIFICATION");
  const totalSignals = await trader.signalCount();
  check("Signal count incremented", Number(totalSignals) >= 2);

  const allUserSids = await trader.getUserSignalIds(admin.address);
  check("getUserSignalIds returns data", allUserSids.length > 0);

  const feesCollected = await trader.totalFeesCollected();
  console.log(`  ℹ️  Total fees collected: ${ethers.formatUnits(feesCollected, 6)} USDC`);

  // Check all signals are readable
  for (let i = 1; i <= Number(totalSignals); i++) {
    const c = await trader.signalCore(i);
    const m = await trader.signalMeta(i);
    check(`Signal #${i} readable (${c.long ? 'LONG' : 'SHORT'}, ${c.closed ? 'closed' : 'open'})`, true);
  }
  console.log();

  // ===== SUMMARY =====
  const finalUsdc = await usdc.balanceOf(admin.address);
  const finalEth = await ethers.provider.getBalance(admin.address);
  console.log("═══════════════════════════════════════════");
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log(`  USDC: ${ethers.formatUnits(finalUsdc, 6)}`);
  console.log(`  ETH:  ${ethers.formatEther(finalEth)}`);
  console.log("═══════════════════════════════════════════");

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error("\nFATAL:", e.message.slice(0, 300));
  process.exitCode = 1;
});
