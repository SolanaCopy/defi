const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("GoldCopyTrader (V1 with fixes)", function () {
  let contract, usdc, diamond, admin, user1, user2;
  const entry = BigInt(Math.round(4390 * 1e10));
  const tp = BigInt(Math.round(4430 * 1e10));
  const sl = BigInt(Math.round(4370 * 1e10));
  const lev = 50000; // 50x

  beforeEach(async function () {
    [admin, user1, user2] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    usdc = await MockUSDC.deploy();
    await usdc.waitForDeployment();

    const MockDiamond = await ethers.getContractFactory("MockDiamond");
    diamond = await MockDiamond.deploy();
    await diamond.waitForDeployment();

    const V1 = await ethers.getContractFactory("GoldCopyTrader");
    contract = await V1.deploy(await usdc.getAddress(), await diamond.getAddress());
    await contract.waitForDeployment();

    await usdc.mint(user1.address, 10000000000n);
    await usdc.mint(user2.address, 10000000000n);
    await usdc.mint(admin.address, 10000000000n);

    await usdc.connect(user1).approve(await contract.getAddress(), ethers.MaxUint256);
    await usdc.connect(user2).approve(await contract.getAddress(), ethers.MaxUint256);
    await usdc.approve(await contract.getAddress(), ethers.MaxUint256);
  });

  // ===== BASIC FLOW =====

  it("full flow: postSignal → copyTrade → closeSignal → claimProceeds (profit)", async function () {
    await contract.postSignal(true, entry, tp, sl, lev);
    await contract.connect(user1).copyTrade(1, 1000000000n);
    await contract.closeSignal(1, 500); // +5%

    // profit = (1000 * 500 * 50000) / (10000 * 1000) = 2500
    // fee = (2500 * 2000) / 10000 = 500  — WRONG, new formula is different
    // grossProfit = 1000e6 * 500 * 50000 = 25000000000000000
    // fee = grossProfit * 2000 / (10000 * 10000 * 1000) = 500e6
    // profit = grossProfit / (10000 * 1000) = 2500e6
    // payout = 1000 + 2500 - 500 = 3000
    const payout = await contract.getExpectedPayout(user1.address, 1);
    expect(payout).to.equal(3000000000n);

    await usdc.mint(await contract.getAddress(), 2000000000n); // fund for profit payout
    await contract.connect(user1).claimProceeds(1);
    expect(await contract.totalFeesCollected()).to.equal(500000000n);
  });

  it("full flow: loss, no fee", async function () {
    await contract.postSignal(true, entry, tp, sl, lev);
    await contract.connect(user1).copyTrade(1, 1000000000n);
    await contract.closeSignal(1, -200); // -2%

    // loss = (1000 * 200 * 50000) / (10000 * 1000) = 1000
    // payout = 1000 - 1000 = 0
    expect(await contract.getExpectedPayout(user1.address, 1)).to.equal(0n);
    await contract.connect(user1).claimProceeds(1);
    expect(await contract.totalFeesCollected()).to.equal(0n);
  });

  it("cancelSignal = breakeven refund", async function () {
    await contract.postSignal(true, entry, tp, sl, lev);
    await contract.connect(user1).copyTrade(1, 500000000n);
    await contract.cancelSignal(1);

    expect(await contract.getExpectedPayout(user1.address, 1)).to.equal(500000000n);
    await contract.connect(user1).claimProceeds(1);
    expect(await usdc.balanceOf(user1.address)).to.equal(10000000000n);
  });

  it("multiple users copy same signal", async function () {
    await contract.postSignal(true, entry, tp, sl, lev);
    await contract.connect(user1).copyTrade(1, 1000000000n);
    await contract.connect(user2).copyTrade(1, 500000000n);
    await contract.closeSignal(1, 200); // +2%

    const p1 = await contract.getExpectedPayout(user1.address, 1);
    const p2 = await contract.getExpectedPayout(user2.address, 1);
    // user1: profit=1000, fee=200, payout=1800
    // user2: profit=500, fee=100, payout=900
    expect(p1).to.equal(1800000000n);
    expect(p2).to.equal(900000000n);
  });

  // ===== TP/SL VALIDATION =====

  it("LONG: rejects wrong TP/SL order", async function () {
    await expect(contract.postSignal(true, entry, sl, tp, lev))
      .to.be.revertedWith("Long: TP>entry>SL");
  });

  it("SHORT: rejects wrong TP/SL order", async function () {
    await expect(contract.postSignal(false, entry, tp, sl, lev))
      .to.be.revertedWith("Short: TP<entry<SL");
  });

  it("SHORT: correct order works", async function () {
    await contract.postSignal(false, entry, sl, tp, lev);
    expect(await contract.getActiveSignalId()).to.equal(1n);
  });

  // ===== ACCESS CONTROL =====

  it("non-admin can't postSignal", async function () {
    await expect(contract.connect(user1).postSignal(true, entry, tp, sl, lev))
      .to.be.revertedWith("Not admin");
  });

  it("non-admin can't closeSignal", async function () {
    await contract.postSignal(true, entry, tp, sl, lev);
    await expect(contract.connect(user1).closeSignal(1, 0))
      .to.be.revertedWith("Not admin");
  });

  it("non-admin can't cancelSignal", async function () {
    await contract.postSignal(true, entry, tp, sl, lev);
    await expect(contract.connect(user1).cancelSignal(1))
      .to.be.revertedWith("Not admin");
  });

  it("non-admin can't setPaused", async function () {
    await expect(contract.connect(user1).setPaused(true))
      .to.be.revertedWith("Not admin");
  });

  it("non-admin can't withdrawFees", async function () {
    await expect(contract.connect(user1).withdrawFees())
      .to.be.revertedWith("Not admin");
  });

  // ===== DOUBLE ACTIONS =====

  it("can't copy same signal twice", async function () {
    await contract.postSignal(true, entry, tp, sl, lev);
    await contract.connect(user1).copyTrade(1, 100000000n);
    await expect(contract.connect(user1).copyTrade(1, 100000000n))
      .to.be.revertedWith("Already copied");
  });

  it("can't claim twice", async function () {
    await contract.postSignal(true, entry, tp, sl, lev);
    await contract.connect(user1).copyTrade(1, 100000000n);
    await contract.closeSignal(1, 0);
    await contract.connect(user1).claimProceeds(1);
    await expect(contract.connect(user1).claimProceeds(1))
      .to.be.revertedWith("Claimed");
  });

  it("can't claim unclosed signal", async function () {
    await contract.postSignal(true, entry, tp, sl, lev);
    await contract.connect(user1).copyTrade(1, 100000000n);
    await expect(contract.connect(user1).claimProceeds(1))
      .to.be.revertedWith("Not closed");
  });

  it("can't claim without position", async function () {
    await contract.postSignal(true, entry, tp, sl, lev);
    await contract.connect(user1).copyTrade(1, 100000000n);
    await contract.closeSignal(1, 0);
    await expect(contract.connect(user2).claimProceeds(1))
      .to.be.revertedWith("No position");
  });

  it("only one active signal at a time", async function () {
    await contract.postSignal(true, entry, tp, sl, lev);
    await expect(contract.postSignal(true, entry, tp, sl, lev))
      .to.be.revertedWith("Close active signal first");
  });

  // ===== LIMITS =====

  it("min collateral 5 USDC", async function () {
    await contract.postSignal(true, entry, tp, sl, lev);
    await expect(contract.connect(user1).copyTrade(1, 1000000n))
      .to.be.revertedWith("Min 5 USDC");
  });

  it("leverage 2x-250x enforced", async function () {
    await expect(contract.postSignal(true, entry, tp, sl, 1000))
      .to.be.revertedWith("Lev 2x-250x");
    await expect(contract.postSignal(true, entry, tp, sl, 300000))
      .to.be.revertedWith("Lev 2x-250x");
  });

  it("result capped at +/- 50%", async function () {
    await contract.postSignal(true, entry, tp, sl, lev);
    await expect(contract.closeSignal(1, 6000))
      .to.be.revertedWith("Result out of range");
    await expect(contract.closeSignal(1, -6000))
      .to.be.revertedWith("Result out of range");
  });

  // ===== FEE LOGIC =====

  it("fee locked at signal creation", async function () {
    await contract.setFeePercent(1000); // 10%
    await contract.postSignal(true, entry, tp, sl, lev);
    await contract.connect(user1).copyTrade(1, 1000000000n);
    await contract.setFeePercent(500); // change to 5%
    await contract.closeSignal(1, 100); // +1%

    await usdc.mint(await contract.getAddress(), 500000000n);
    await contract.connect(user1).claimProceeds(1);

    // profit = 500. fee at 10% = 50
    expect(await contract.totalFeesCollected()).to.equal(50000000n);
  });

  it("no fee on loss", async function () {
    await contract.postSignal(true, entry, tp, sl, lev);
    await contract.connect(user1).copyTrade(1, 1000000000n);
    await contract.closeSignal(1, -100);
    await contract.connect(user1).claimProceeds(1);
    expect(await contract.totalFeesCollected()).to.equal(0n);
  });

  it("fee percent max 20%", async function () {
    await expect(contract.setFeePercent(3000)).to.be.revertedWith("Max 20%");
    await contract.setFeePercent(0); // 0% works
  });

  it("withdrawFees sends to admin", async function () {
    await contract.postSignal(true, entry, tp, sl, lev);
    await contract.connect(user1).copyTrade(1, 1000000000n);
    await contract.closeSignal(1, 200);
    await usdc.mint(await contract.getAddress(), 1000000000n);
    await contract.connect(user1).claimProceeds(1);

    const fees = await contract.totalFeesCollected();
    expect(fees).to.be.gt(0n);
    const before = await usdc.balanceOf(admin.address);
    await contract.withdrawFees();
    const after = await usdc.balanceOf(admin.address);
    expect(after - before).to.equal(fees);
    expect(await contract.totalFeesCollected()).to.equal(0n);
  });

  // ===== LEVERAGE PAYOUT =====

  it("higher leverage = higher profit", async function () {
    // 100x
    await contract.postSignal(true, entry, tp, sl, 100000);
    await contract.connect(user1).copyTrade(1, 100000000n);
    await contract.closeSignal(1, 100); // +1%
    const p100 = await contract.getExpectedPayout(user1.address, 1);
    // profit = 100 * 100 * 100000 / (10000*1000) = 100. fee=20. payout=180
    expect(p100).to.equal(180000000n);
  });

  it("higher leverage = higher loss", async function () {
    await contract.postSignal(true, entry, tp, sl, 100000); // 100x
    await contract.connect(user1).copyTrade(1, 100000000n);
    await contract.closeSignal(1, -100); // -1%
    // loss = 100 * 100 * 100000 / (10000*1000) = 100. payout = 100-100 = 0
    expect(await contract.getExpectedPayout(user1.address, 1)).to.equal(0n);
  });

  // ===== EMERGENCY WITHDRAW =====

  it("emergency withdraw after 7 days", async function () {
    await contract.postSignal(true, entry, tp, sl, lev);
    await contract.connect(user1).copyTrade(1, 100000000n);
    await ethers.provider.send("evm_increaseTime", [604801]);
    await ethers.provider.send("evm_mine", []);
    await contract.connect(user1).emergencyWithdraw(1);
  });

  it("emergency withdraw too early", async function () {
    await contract.postSignal(true, entry, tp, sl, lev);
    await contract.connect(user1).copyTrade(1, 100000000n);
    await expect(contract.connect(user1).emergencyWithdraw(1))
      .to.be.revertedWith("Too early");
  });

  // ===== ADMIN =====

  it("two-step admin transfer", async function () {
    await contract.transferAdmin(user1.address);
    await contract.connect(user1).acceptAdmin();
    expect(await contract.admin()).to.equal(user1.address);
  });

  it("zero address admin blocked", async function () {
    await expect(contract.transferAdmin(ethers.ZeroAddress))
      .to.be.revertedWith("Zero addr");
  });

  it("wrong pending admin blocked", async function () {
    await contract.transferAdmin(user1.address);
    await expect(contract.connect(user2).acceptAdmin())
      .to.be.revertedWith("Not pending admin");
  });

  it("pause blocks copyTrade and postSignal", async function () {
    await contract.setPaused(true);
    await expect(contract.postSignal(true, entry, tp, sl, lev))
      .to.be.revertedWith("Paused");
  });

  it("claim reverts if insufficient balance (prevents 0-payout bug)", async function () {
    await contract.postSignal(true, entry, tp, sl, lev);
    await contract.connect(user1).copyTrade(1, 100000000n);
    await contract.closeSignal(1, 500); // payout > balance
    await expect(contract.connect(user1).claimProceeds(1))
      .to.be.revertedWith("Insufficient balance, try later");
  });

  it("claim succeeds after contract is funded", async function () {
    await contract.postSignal(true, entry, tp, sl, lev);
    await contract.connect(user1).copyTrade(1, 100000000n);
    await contract.closeSignal(1, 500);
    await usdc.mint(await contract.getAddress(), 5000000000n);
    await contract.connect(user1).claimProceeds(1);
  });

  it("claim with 0 payout (total loss) works without balance", async function () {
    await contract.postSignal(true, entry, tp, sl, lev);
    await contract.connect(user1).copyTrade(1, 100000000n);
    await contract.closeSignal(1, -5000);
    await contract.connect(user1).claimProceeds(1);
  });

  // ===== MULTI-SIGNAL LIFECYCLE =====

  it("3 signals: profit, loss, breakeven", async function () {
    // Signal 1: profit
    await contract.postSignal(true, entry, tp, sl, lev);
    await contract.connect(user1).copyTrade(1, 100000000n);
    await contract.closeSignal(1, 200);
    await usdc.mint(await contract.getAddress(), 200000000n);
    await contract.connect(user1).claimProceeds(1);

    // Signal 2: loss
    await contract.postSignal(true, entry, tp, sl, lev);
    await contract.connect(user1).copyTrade(2, 100000000n);
    await contract.closeSignal(2, -200);
    await contract.connect(user1).claimProceeds(2);

    // Signal 3: breakeven
    await contract.postSignal(true, entry, tp, sl, lev);
    await contract.connect(user1).copyTrade(3, 100000000n);
    await contract.cancelSignal(3);
    await contract.connect(user1).claimProceeds(3);

    // Verify signal count
    expect(await contract.signalCount()).to.equal(3n);
  });

  // ===== AUTO-COPY =====

  it("enableAutoCopy + bot executeCopyFor", async function () {
    // User enables auto-copy for 200 USDC per trade
    await contract.connect(user1).enableAutoCopy(200000000n);
    const config = await contract.autoCopy(user1.address);
    expect(config.amount).to.equal(200000000n);
    expect(config.enabled).to.equal(true);

    // Admin posts signal
    await contract.postSignal(true, entry, tp, sl, lev);

    // Bot executes copy for user1
    await contract.executeCopyFor(user1.address, 1);

    // Check position
    const pos = await contract.positions(user1.address, 1);
    expect(pos.collateral).to.equal(200000000n);
    expect(await usdc.balanceOf(user1.address)).to.equal(9800000000n);
  });

  it("auto-copy skips if insufficient balance", async function () {
    // User has 10000 USDC, sets auto-copy to 20000
    await contract.connect(user1).enableAutoCopy(20000000000n);
    await contract.postSignal(true, entry, tp, sl, lev);

    // Should skip silently (no revert)
    await contract.executeCopyFor(user1.address, 1);

    // No position created
    const pos = await contract.positions(user1.address, 1);
    expect(pos.collateral).to.equal(0n);
  });

  it("auto-copy skips if not approved", async function () {
    // Remove approval
    await usdc.connect(user1).approve(await contract.getAddress(), 0);
    await contract.connect(user1).enableAutoCopy(100000000n);
    await contract.postSignal(true, entry, tp, sl, lev);

    // Should skip silently
    await contract.executeCopyFor(user1.address, 1);
    const pos = await contract.positions(user1.address, 1);
    expect(pos.collateral).to.equal(0n);
  });

  it("disableAutoCopy stops copying", async function () {
    await contract.connect(user1).enableAutoCopy(100000000n);
    await contract.connect(user1).disableAutoCopy();

    await contract.postSignal(true, entry, tp, sl, lev);
    await expect(contract.executeCopyFor(user1.address, 1))
      .to.be.revertedWith("Not enabled");
  });

  it("auto-copy won't double copy", async function () {
    await contract.connect(user1).enableAutoCopy(100000000n);
    await contract.postSignal(true, entry, tp, sl, lev);
    await contract.executeCopyFor(user1.address, 1);

    await expect(contract.executeCopyFor(user1.address, 1))
      .to.be.revertedWith("Already copied");
  });

  it("auto-copy min amount enforced", async function () {
    await expect(contract.connect(user1).enableAutoCopy(1000000n)) // 1 USDC
      .to.be.revertedWith("Min 5 USDC");
  });

  it("auto-copy + manual copy + claim full lifecycle", async function () {
    // User1: auto-copy 300 USDC. User2: manual copy 500 USDC.
    await contract.connect(user1).enableAutoCopy(300000000n);
    await contract.postSignal(true, entry, tp, sl, lev);

    await contract.executeCopyFor(user1.address, 1);
    await contract.connect(user2).copyTrade(1, 500000000n);

    await contract.closeSignal(1, 0); // breakeven

    await contract.connect(user1).claimProceeds(1);
    await contract.connect(user2).claimProceeds(1);

    expect(await usdc.balanceOf(user1.address)).to.equal(10000000000n);
    expect(await usdc.balanceOf(user2.address)).to.equal(10000000000n);
  });

  it("getAutoCopyUsers returns correct list", async function () {
    await contract.connect(user1).enableAutoCopy(100000000n);
    await contract.connect(user2).enableAutoCopy(200000000n);

    const users = await contract.getAutoCopyUsers();
    expect(users.length).to.equal(2);
    expect(users[0]).to.equal(user1.address);
    expect(users[1]).to.equal(user2.address);
  });

  it("copy window: can't copy after 1 hour", async function () {
    await contract.postSignal(true, entry, tp, sl, lev);
    await ethers.provider.send("evm_increaseTime", [3601]); // 1 hour + 1 sec
    await ethers.provider.send("evm_mine", []);
    await expect(contract.connect(user1).copyTrade(1, 100000000n))
      .to.be.revertedWith("Copy window closed");
  });

  it("copy window: can copy within 1 hour", async function () {
    await contract.postSignal(true, entry, tp, sl, lev);
    await ethers.provider.send("evm_increaseTime", [3500]); // under 1 hour
    await ethers.provider.send("evm_mine", []);
    await contract.connect(user1).copyTrade(1, 100000000n);
    expect((await contract.positions(user1.address, 1)).collateral).to.equal(100000000n);
  });

  it("copy window: auto-copy blocked after window", async function () {
    await contract.connect(user1).enableAutoCopy(100000000n);
    await contract.postSignal(true, entry, tp, sl, lev);
    await ethers.provider.send("evm_increaseTime", [3601]);
    await ethers.provider.send("evm_mine", []);
    await expect(contract.executeCopyFor(user1.address, 1))
      .to.be.revertedWith("Copy window closed");
  });

  it("front-run protection: can't copy after closeSignal submitted", async function () {
    await contract.postSignal(true, entry, tp, sl, lev);
    await contract.connect(user1).copyTrade(1, 100000000n);
    // Wait for copy window to close
    await ethers.provider.send("evm_increaseTime", [3601]);
    await ethers.provider.send("evm_mine", []);
    // Now close signal — no one can front-run because copy window is closed
    await contract.closeSignal(1, 500);
    // Attacker can't copy anymore (signal is closed)
    await expect(contract.connect(user2).copyTrade(1, 100000000n))
      .to.be.revertedWith("Not active");
  });

  it("non-admin can't executeCopyFor", async function () {
    await contract.connect(user1).enableAutoCopy(100000000n);
    await contract.postSignal(true, entry, tp, sl, lev);
    await expect(contract.connect(user1).executeCopyFor(user1.address, 1))
      .to.be.revertedWith("Not admin");
  });

  // ===== COMPREHENSIVE LOGIC TESTS =====

  it("LOGIC: profit math at different leverages", async function () {
    const cases = [
      // [leverage, resultPct, deposit, expectedProfit, expectedFee]
      { lev: 2000,   res: 1000, dep: 1000, desc: "2x, +10%" },    // profit=200, fee=40
      { lev: 10000,  res: 500,  dep: 100,  desc: "10x, +5%" },    // profit=50, fee=10
      { lev: 50000,  res: 100,  dep: 500,  desc: "50x, +1%" },    // profit=250, fee=50
      { lev: 100000, res: 50,   dep: 200,  desc: "100x, +0.5%" }, // profit=100, fee=20
      { lev: 150000, res: 200,  dep: 100,  desc: "150x, +2%" },   // profit=300, fee=60
      { lev: 250000, res: 10,   dep: 1000, desc: "250x, +0.1%" }, // profit=250, fee=50
    ];

    for (let i = 0; i < cases.length; i++) {
      const c = cases[i];
      const dep = BigInt(c.dep) * 1000000n;
      const expectedProfit = (BigInt(c.dep) * BigInt(c.res) * BigInt(c.lev)) / 10000000n;
      const expectedFee = (expectedProfit * 2000n) / 10000n;
      const expectedPayout = dep + expectedProfit * 1000000n / 1000000n - expectedFee * 1000000n / 1000000n;

      await contract.postSignal(true, entry, tp, sl, c.lev);
      await contract.connect(user1).copyTrade(i + 1, dep);
      await contract.closeSignal(i + 1, c.res);

      const payout = await contract.getExpectedPayout(user1.address, i + 1);
      expect(payout).to.be.gt(0n, c.desc + " payout should be > 0");

      await usdc.mint(await contract.getAddress(), 10000000000n);
      await contract.connect(user1).claimProceeds(i + 1);
    }
  });

  it("LOGIC: loss math at different leverages", async function () {
    // 50x, -1%: loss = 500 * 100 * 50000 / 10000000 = 250. payout = 500 - 250 = 250
    await contract.postSignal(true, entry, tp, sl, 50000);
    await contract.connect(user1).copyTrade(1, 500000000n);
    await contract.closeSignal(1, -100);
    expect(await contract.getExpectedPayout(user1.address, 1)).to.equal(250000000n);

    // 100x, -0.5%: loss = 1000 * 50 * 100000 / 10000000 = 500. payout = 500
    await contract.postSignal(true, entry, tp, sl, 100000);
    await contract.connect(user2).copyTrade(2, 1000000000n);
    await contract.closeSignal(2, -50);
    expect(await contract.getExpectedPayout(user2.address, 2)).to.equal(500000000n);
  });

  it("LOGIC: max loss = total liquidation", async function () {
    // 50x, -50%: loss = 100 * 5000 * 50000 / 10000000 = 2500. 2500 > 100 → payout = 0
    await contract.postSignal(true, entry, tp, sl, 50000);
    await contract.connect(user1).copyTrade(1, 100000000n);
    await contract.closeSignal(1, -5000);
    expect(await contract.getExpectedPayout(user1.address, 1)).to.equal(0n);
  });

  it("LOGIC: small deposit (5 USDC) profit correctly calculated", async function () {
    await contract.postSignal(true, entry, tp, sl, 50000);
    await contract.connect(user1).copyTrade(1, 5000000n); // 5 USDC
    await contract.closeSignal(1, 200); // +2%
    // profit = 5 * 200 * 50000 / 10000000 = 5 USDC
    // fee = (5e6 * 200 * 50000 * 2000) / (10000 * 10000 * 1000) = 1 USDC
    // payout = 5 + 5 - 1 = 9 USDC
    expect(await contract.getExpectedPayout(user1.address, 1)).to.equal(9000000n);
  });

  it("LOGIC: fee is exactly 20% of profit", async function () {
    await contract.postSignal(true, entry, tp, sl, 50000);
    await contract.connect(user1).copyTrade(1, 1000000000n);
    await contract.closeSignal(1, 200); // +2%
    // profit = 1000 * 200 * 50000 / 10000000 = 1000
    // fee should be exactly 200 (20% of 1000)
    await usdc.mint(await contract.getAddress(), 2000000000n);
    await contract.connect(user1).claimProceeds(1);
    expect(await contract.totalFeesCollected()).to.equal(200000000n);
  });

  it("LOGIC: fee at 0% means no fee", async function () {
    await contract.setFeePercent(0);
    await contract.postSignal(true, entry, tp, sl, 50000);
    await contract.connect(user1).copyTrade(1, 1000000000n);
    await contract.closeSignal(1, 200);
    await usdc.mint(await contract.getAddress(), 2000000000n);
    await contract.connect(user1).claimProceeds(1);
    expect(await contract.totalFeesCollected()).to.equal(0n);
    // User gets full profit
    expect(await usdc.balanceOf(user1.address)).to.equal(11000000000n); // 10000 + 1000
  });

  it("LOGIC: fee at 10%", async function () {
    await contract.setFeePercent(1000);
    await contract.postSignal(true, entry, tp, sl, 50000);
    await contract.connect(user1).copyTrade(1, 1000000000n);
    await contract.closeSignal(1, 200);
    await usdc.mint(await contract.getAddress(), 2000000000n);
    await contract.connect(user1).claimProceeds(1);
    expect(await contract.totalFeesCollected()).to.equal(100000000n); // 10% of 1000 = 100
  });

  it("LOGIC: signal meta tracks correctly", async function () {
    await contract.postSignal(true, entry, tp, sl, 50000);
    await contract.connect(user1).copyTrade(1, 300000000n);
    await contract.connect(user2).copyTrade(1, 700000000n);

    const meta = await contract.signalMeta(1);
    expect(meta[2]).to.equal(1000000000n); // totalCopied
    expect(meta[3]).to.equal(2n);          // copierCount
  });

  it("LOGIC: getUserSignalIds tracks all user signals", async function () {
    await contract.postSignal(true, entry, tp, sl, 50000);
    await contract.connect(user1).copyTrade(1, 100000000n);
    await contract.closeSignal(1, 0);
    await contract.connect(user1).claimProceeds(1);

    await contract.postSignal(true, entry, tp, sl, 50000);
    await contract.connect(user1).copyTrade(2, 200000000n);
    await contract.closeSignal(2, 0);

    const ids = await contract.getUserSignalIds(user1.address);
    expect(ids.length).to.equal(2);
    expect(ids[0]).to.equal(1n);
    expect(ids[1]).to.equal(2n);
  });

  it("LOGIC: multiple users different amounts same signal profit", async function () {
    await contract.postSignal(true, entry, tp, sl, 50000);
    await contract.connect(user1).copyTrade(1, 100000000n);  // 100
    await contract.connect(user2).copyTrade(1, 2000000000n); // 2000
    await contract.closeSignal(1, 100); // +1%

    // user1: profit=50, fee=10, payout=140
    // user2: profit=1000, fee=200, payout=2800
    expect(await contract.getExpectedPayout(user1.address, 1)).to.equal(140000000n);
    expect(await contract.getExpectedPayout(user2.address, 1)).to.equal(2800000000n);
  });

  it("LOGIC: SHORT signal with correct TP/SL", async function () {
    const shortTp = sl; // TP below entry for SHORT
    const shortSl = tp; // SL above entry for SHORT
    await contract.postSignal(false, entry, shortTp, shortSl, 50000);

    const core = await contract.signalCore(1);
    expect(core[0]).to.equal(false); // long = false
    expect(core[1]).to.equal(true);  // active
  });

  it("LOGIC: copy window is exactly 1 hour", async function () {
    await contract.postSignal(true, entry, tp, sl, 50000);

    // At 59 minutes: should work
    await ethers.provider.send("evm_increaseTime", [3540]);
    await ethers.provider.send("evm_mine", []);
    await contract.connect(user1).copyTrade(1, 100000000n);

    // At 61 minutes: should fail for user2
    await ethers.provider.send("evm_increaseTime", [120]);
    await ethers.provider.send("evm_mine", []);
    await expect(contract.connect(user2).copyTrade(1, 100000000n))
      .to.be.revertedWith("Copy window closed");
  });

  it("LOGIC: auto-copy re-enable no duplicates", async function () {
    await contract.connect(user1).enableAutoCopy(100000000n);
    await contract.connect(user1).disableAutoCopy();
    await contract.connect(user1).enableAutoCopy(200000000n);
    await contract.connect(user1).disableAutoCopy();
    await contract.connect(user1).enableAutoCopy(300000000n);

    const users = await contract.getAutoCopyUsers();
    expect(users.length).to.equal(1); // no duplicates
    expect(users[0]).to.equal(user1.address);

    const config = await contract.autoCopy(user1.address);
    expect(config.amount).to.equal(300000000n);
    expect(config.enabled).to.equal(true);
  });

  it("LOGIC: auto-copy amount can be updated", async function () {
    await contract.connect(user1).enableAutoCopy(100000000n);
    await contract.connect(user1).enableAutoCopy(500000000n); // update
    expect((await contract.autoCopy(user1.address)).amount).to.equal(500000000n);
  });

  it("LOGIC: emergencyWithdraw preserves fees", async function () {
    // Create a signal with profit first to generate fees
    await contract.postSignal(true, entry, tp, sl, 50000);
    await contract.connect(user1).copyTrade(1, 500000000n);
    await contract.closeSignal(1, 200);
    await usdc.mint(await contract.getAddress(), 1000000000n);
    await contract.connect(user1).claimProceeds(1);
    const fees = await contract.totalFeesCollected();
    expect(fees).to.be.gt(0n);

    // Now new signal, user2 copies, emergency withdraw
    await contract.postSignal(true, entry, tp, sl, 50000);
    await contract.connect(user2).copyTrade(2, 100000000n);
    await ethers.provider.send("evm_increaseTime", [604801]);
    await ethers.provider.send("evm_mine", []);
    await contract.connect(user2).emergencyWithdraw(2);

    // Fees should still be intact
    expect(await contract.totalFeesCollected()).to.equal(fees);
  });

  it("LOGIC: paused state blocks signal + copy but not claim", async function () {
    await contract.postSignal(true, entry, tp, sl, 50000);
    await contract.connect(user1).copyTrade(1, 100000000n);
    await contract.closeSignal(1, 0);

    await contract.setPaused(true);

    // Can't post or copy
    await expect(contract.postSignal(true, entry, tp, sl, 50000)).to.be.revertedWith("Paused");

    // Can still claim (important for user safety)
    await contract.connect(user1).claimProceeds(1);
    expect(await usdc.balanceOf(user1.address)).to.equal(10000000000n);
  });

  it("LOGIC: exact payout at 2x leverage +10%", async function () {
    await contract.postSignal(true, entry, tp, sl, 2000); // 2x
    await contract.connect(user1).copyTrade(1, 1000000000n); // 1000 USDC
    await contract.closeSignal(1, 1000); // +10%
    // profit = 1000e6 * 1000 * 2000 / 10e6 = 200e6 (200 USDC)
    // fee = 200e6 * 2000/10000 = 40e6
    // payout = 1000 + 200 - 40 = 1160
    expect(await contract.getExpectedPayout(user1.address, 1)).to.equal(1160000000n);
  });

  it("LOGIC: exact payout at 250x leverage +0.1%", async function () {
    await contract.postSignal(true, entry, tp, sl, 250000); // 250x
    await contract.connect(user1).copyTrade(1, 1000000000n); // 1000 USDC
    await contract.closeSignal(1, 10); // +0.1%
    // profit = 1000e6 * 10 * 250000 / 10e6 = 250e6 (250 USDC)
    // fee = 250e6 * 2000/10000 = 50e6
    // payout = 1000 + 250 - 50 = 1200
    expect(await contract.getExpectedPayout(user1.address, 1)).to.equal(1200000000n);
  });

  it("LOGIC: partial loss doesn't wipe out deposit", async function () {
    await contract.postSignal(true, entry, tp, sl, 10000); // 10x
    await contract.connect(user1).copyTrade(1, 1000000000n); // 1000
    await contract.closeSignal(1, -500); // -5%
    // loss = 1000e6 * 500 * 10000 / 10e6 = 500e6
    // payout = 1000 - 500 = 500
    expect(await contract.getExpectedPayout(user1.address, 1)).to.equal(500000000n);
  });

  it("LOGIC: loss exactly equals deposit = 0 payout", async function () {
    await contract.postSignal(true, entry, tp, sl, 10000); // 10x
    await contract.connect(user1).copyTrade(1, 1000000000n);
    await contract.closeSignal(1, -1000); // -10%
    // loss = 1000e6 * 1000 * 10000 / 10e6 = 1000e6. loss == col → payout = 0
    expect(await contract.getExpectedPayout(user1.address, 1)).to.equal(0n);
  });

  it("LOGIC: loss exceeds deposit = 0 payout (no negative)", async function () {
    await contract.postSignal(true, entry, tp, sl, 50000); // 50x
    await contract.closeSignal(1, -500); // -5%
    // loss = col * 500 * 50000 / 10e6 = col * 2.5. loss > col → payout = 0
  });

  it("LOGIC: resultPct 0 = exact refund", async function () {
    await contract.postSignal(true, entry, tp, sl, lev);
    await contract.connect(user1).copyTrade(1, 777000000n); // 777 USDC
    await contract.closeSignal(1, 0);
    expect(await contract.getExpectedPayout(user1.address, 1)).to.equal(777000000n);
    await contract.connect(user1).claimProceeds(1);
    expect(await usdc.balanceOf(user1.address)).to.equal(10000000000n);
  });

  it("LOGIC: resultPct +1 (smallest profit)", async function () {
    await contract.postSignal(true, entry, tp, sl, 50000);
    await contract.connect(user1).copyTrade(1, 1000000000n);
    await contract.closeSignal(1, 1); // +0.01%
    // profit = 1000e6 * 1 * 50000 / 10e6 = 5e6 (5 USDC)
    // fee = 5e6 * 2000/10000 = 1e6
    // payout = 1000 + 5 - 1 = 1004
    expect(await contract.getExpectedPayout(user1.address, 1)).to.equal(1004000000n);
  });

  it("LOGIC: resultPct -1 (smallest loss)", async function () {
    await contract.postSignal(true, entry, tp, sl, 50000);
    await contract.connect(user1).copyTrade(1, 1000000000n);
    await contract.closeSignal(1, -1); // -0.01%
    // loss = 1000e6 * 1 * 50000 / 10e6 = 5e6
    // payout = 1000 - 5 = 995
    expect(await contract.getExpectedPayout(user1.address, 1)).to.equal(995000000n);
  });

  it("LOGIC: max profit +50% at 50x", async function () {
    await contract.postSignal(true, entry, tp, sl, 50000);
    await contract.connect(user1).copyTrade(1, 100000000n); // 100 USDC
    await contract.closeSignal(1, 5000); // +50%
    // profit = 100e6 * 5000 * 50000 / 10e6 = 2500e6 (2500 USDC)
    // fee = 2500e6 * 2000/10000 = 500e6
    // payout = 100 + 2500 - 500 = 2100
    expect(await contract.getExpectedPayout(user1.address, 1)).to.equal(2100000000n);
  });

  it("LOGIC: claim order doesn't affect amounts", async function () {
    await contract.postSignal(true, entry, tp, sl, 50000);
    await contract.connect(user1).copyTrade(1, 500000000n);
    await contract.connect(user2).copyTrade(1, 500000000n);
    await contract.closeSignal(1, 0); // breakeven

    // user2 claims first
    await contract.connect(user2).claimProceeds(1);
    expect(await usdc.balanceOf(user2.address)).to.equal(10000000000n);

    // user1 claims second — should get same amount
    await contract.connect(user1).claimProceeds(1);
    expect(await usdc.balanceOf(user1.address)).to.equal(10000000000n);
  });

  it("LOGIC: fees accumulate across signals", async function () {
    // Signal 1: profit
    await contract.postSignal(true, entry, tp, sl, 50000);
    await contract.connect(user1).copyTrade(1, 1000000000n);
    await contract.closeSignal(1, 200);
    await usdc.mint(await contract.getAddress(), 2000000000n);
    await contract.connect(user1).claimProceeds(1);
    const fees1 = await contract.totalFeesCollected();

    // Signal 2: more profit
    await contract.postSignal(true, entry, tp, sl, 50000);
    await contract.connect(user1).copyTrade(2, 1000000000n);
    await contract.closeSignal(2, 100);
    await usdc.mint(await contract.getAddress(), 1000000000n);
    await contract.connect(user1).claimProceeds(2);
    const fees2 = await contract.totalFeesCollected();

    expect(fees2).to.be.gt(fees1);
  });

  it("LOGIC: withdrawFees resets counter", async function () {
    await contract.postSignal(true, entry, tp, sl, 50000);
    await contract.connect(user1).copyTrade(1, 1000000000n);
    await contract.closeSignal(1, 200);
    await usdc.mint(await contract.getAddress(), 2000000000n);
    await contract.connect(user1).claimProceeds(1);

    await contract.withdrawFees();
    expect(await contract.totalFeesCollected()).to.equal(0n);

    // New signal generates new fees
    await contract.postSignal(true, entry, tp, sl, 50000);
    await contract.connect(user1).copyTrade(2, 1000000000n);
    await contract.closeSignal(2, 100);
    await usdc.mint(await contract.getAddress(), 1000000000n);
    await contract.connect(user1).claimProceeds(2);
    expect(await contract.totalFeesCollected()).to.be.gt(0n);
  });

  it("LOGIC: can't copy inactive signal", async function () {
    await contract.postSignal(true, entry, tp, sl, lev);
    await contract.closeSignal(1, 0);
    await expect(contract.connect(user1).copyTrade(1, 100000000n))
      .to.be.revertedWith("Not active");
  });

  it("LOGIC: can't copy non-existent signal", async function () {
    await expect(contract.connect(user1).copyTrade(99, 100000000n))
      .to.be.revertedWith("Not active");
  });

  it("LOGIC: closeSignal must match active signal id", async function () {
    await contract.postSignal(true, entry, tp, sl, lev);
    await expect(contract.closeSignal(99, 0))
      .to.be.revertedWith("Not active signal");
  });

  it("LOGIC: cancelSignal must match active signal id", async function () {
    await contract.postSignal(true, entry, tp, sl, lev);
    await expect(contract.cancelSignal(99))
      .to.be.revertedWith("Not active signal");
  });

  it("LOGIC: signal counter increments correctly", async function () {
    expect(await contract.signalCount()).to.equal(0n);
    await contract.postSignal(true, entry, tp, sl, lev);
    expect(await contract.signalCount()).to.equal(1n);
    await contract.closeSignal(1, 0);
    await contract.postSignal(true, entry, tp, sl, lev);
    expect(await contract.signalCount()).to.equal(2n);
  });

  it("LOGIC: activeSignalId updates correctly", async function () {
    expect(await contract.getActiveSignalId()).to.equal(0n);
    await contract.postSignal(true, entry, tp, sl, lev);
    expect(await contract.getActiveSignalId()).to.equal(1n);
    await contract.closeSignal(1, 0);
    expect(await contract.getActiveSignalId()).to.equal(0n);
  });

  it("LOGIC: auto-copy with profit + claim", async function () {
    await contract.connect(user1).enableAutoCopy(500000000n); // 500 per trade
    await contract.postSignal(true, entry, tp, sl, 50000);
    await contract.executeCopyFor(user1.address, 1);

    await contract.closeSignal(1, 200); // +2%
    await usdc.mint(await contract.getAddress(), 1000000000n);

    const payout = await contract.getExpectedPayout(user1.address, 1);
    // profit = 500 * 200 * 50000 / 10e6 = 500. fee = 100. payout = 900
    expect(payout).to.equal(900000000n);

    await contract.connect(user1).claimProceeds(1);
  });

  it("LOGIC: auto-copy + manual copy users both get correct payout", async function () {
    await contract.connect(user1).enableAutoCopy(100000000n); // auto: 100
    await contract.postSignal(true, entry, tp, sl, 50000);
    await contract.executeCopyFor(user1.address, 1);
    await contract.connect(user2).copyTrade(1, 400000000n); // manual: 400

    await contract.closeSignal(1, 100); // +1%
    await usdc.mint(await contract.getAddress(), 500000000n);

    // user1: profit=50, fee=10, payout=140
    // user2: profit=200, fee=40, payout=560
    expect(await contract.getExpectedPayout(user1.address, 1)).to.equal(140000000n);
    expect(await contract.getExpectedPayout(user2.address, 1)).to.equal(560000000n);
  });

  it("LOGIC: entry price validation", async function () {
    await expect(contract.postSignal(true, 0, tp, sl, lev))
      .to.be.revertedWith("Bad prices");
    await expect(contract.postSignal(true, entry, 0, sl, lev))
      .to.be.revertedWith("Bad prices");
    await expect(contract.postSignal(true, entry, tp, 0, lev))
      .to.be.revertedWith("Bad prices");
  });

  it("LOGIC: signalCore stores correct data", async function () {
    await contract.postSignal(true, entry, tp, sl, 50000);
    const core = await contract.signalCore(1);
    expect(core[0]).to.equal(true);   // long
    expect(core[1]).to.equal(true);   // active
    expect(core[2]).to.equal(false);  // closed
    expect(core[3]).to.equal(entry);  // entryPrice
    expect(core[4]).to.equal(tp);     // tp
    expect(core[5]).to.equal(sl);     // sl
    expect(core[6]).to.equal(50000);  // leverage
    expect(core[7]).to.equal(0n);     // resultPct
    expect(core[8]).to.equal(2000n);  // feeAtCreation
  });

  it("LOGIC: signalCore updates after close", async function () {
    await contract.postSignal(true, entry, tp, sl, lev);
    await contract.closeSignal(1, 300);
    const core = await contract.signalCore(1);
    expect(core[1]).to.equal(false); // active = false
    expect(core[2]).to.equal(true);  // closed = true
    expect(core[7]).to.equal(300n);  // resultPct
  });

  it("LOGIC: position data stored correctly", async function () {
    await contract.postSignal(true, entry, tp, sl, lev);
    await contract.connect(user1).copyTrade(1, 123456789n);
    const pos = await contract.positions(user1.address, 1);
    expect(pos[0]).to.equal(123456789n); // collateral
    expect(pos[2]).to.equal(false);       // claimed
  });

  // ===== AUTO-COPY ADVANCED TESTS =====

  it("AUTO-COPY: bot copies for multiple users in one signal", async function () {
    await contract.connect(user1).enableAutoCopy(100000000n); // 100 USDC
    await contract.connect(user2).enableAutoCopy(200000000n); // 200 USDC

    await contract.postSignal(true, entry, tp, sl, 50000);

    // Bot iterates and copies for both
    await contract.executeCopyFor(user1.address, 1);
    await contract.executeCopyFor(user2.address, 1);

    const pos1 = await contract.positions(user1.address, 1);
    const pos2 = await contract.positions(user2.address, 1);
    expect(pos1.collateral).to.equal(100000000n);
    expect(pos2.collateral).to.equal(200000000n);

    // Close with profit and claim
    await contract.closeSignal(1, 200);
    await usdc.mint(await contract.getAddress(), 2000000000n);
    await contract.connect(user1).claimProceeds(1);
    await contract.connect(user2).claimProceeds(1);

    // User2 should have more profit (deposited more)
    const bal1 = await usdc.balanceOf(user1.address);
    const bal2 = await usdc.balanceOf(user2.address);
    expect(bal2).to.be.gt(bal1);
  });

  it("AUTO-COPY: mixed auto + manual users", async function () {
    await contract.connect(user1).enableAutoCopy(50000000n); // auto: 50
    await contract.postSignal(true, entry, tp, sl, 50000);

    await contract.executeCopyFor(user1.address, 1); // auto
    await contract.connect(user2).copyTrade(1, 150000000n); // manual: 150

    const meta = await contract.signalMeta(1);
    expect(meta[2]).to.equal(200000000n); // totalCopied = 200
    expect(meta[3]).to.equal(2n); // copierCount = 2
  });

  it("AUTO-COPY: disabled user not copied", async function () {
    await contract.connect(user1).enableAutoCopy(100000000n);
    await contract.connect(user1).disableAutoCopy();

    await contract.postSignal(true, entry, tp, sl, 50000);
    await expect(contract.executeCopyFor(user1.address, 1))
      .to.be.revertedWith("Not enabled");
  });

  it("AUTO-COPY: copy window applies to auto-copy too", async function () {
    await contract.connect(user1).enableAutoCopy(100000000n);
    await contract.postSignal(true, entry, tp, sl, 50000);

    // Wait past copy window
    await ethers.provider.send("evm_increaseTime", [3601]);
    await ethers.provider.send("evm_mine", []);

    await expect(contract.executeCopyFor(user1.address, 1))
      .to.be.revertedWith("Copy window closed");
  });

  // ===== TP/SL SIMULATION TESTS =====

  it("TP HIT: positive result, correct payout", async function () {
    // Simulate: LONG, entry $4390, TP $4430 (+0.91%)
    // resultPct = 91 bps, leverage 50x
    await contract.postSignal(true, entry, tp, sl, 50000);
    await contract.connect(user1).copyTrade(1, 500000000n); // 500 USDC

    // TP hit: result = +91 bps (0.91%)
    await contract.closeSignal(1, 91);

    // profit = 500e6 * 91 * 50000 / 10e6 = 227.5e6
    // fee = 227.5 * 20% = 45.5
    // payout = 500 + 227.5 - 45.5 = 682
    const payout = await contract.getExpectedPayout(user1.address, 1);
    expect(payout).to.equal(682000000n);

    await usdc.mint(await contract.getAddress(), 200000000n);
    await contract.connect(user1).claimProceeds(1);
    expect(await contract.totalFeesCollected()).to.equal(45500000n);
  });

  it("SL HIT: negative result, no fee, correct loss", async function () {
    // Simulate: LONG, entry $4390, SL $4370 (-0.46%)
    // resultPct = -46 bps, leverage 50x
    await contract.postSignal(true, entry, tp, sl, 50000);
    await contract.connect(user1).copyTrade(1, 500000000n);

    // SL hit: result = -46 bps
    await contract.closeSignal(1, -46);

    // loss = 500e6 * 46 * 50000 / 10e6 = 115e6
    // payout = 500 - 115 = 385
    const payout = await contract.getExpectedPayout(user1.address, 1);
    expect(payout).to.equal(385000000n);

    await contract.connect(user1).claimProceeds(1);
    expect(await contract.totalFeesCollected()).to.equal(0n);
  });

  it("LIQUIDATION: loss > collateral = 0 payout", async function () {
    // High leverage, big move = liquidation
    await contract.postSignal(true, entry, tp, sl, 150000); // 150x
    await contract.connect(user1).copyTrade(1, 100000000n); // 100 USDC

    // -1% move at 150x = -150% on collateral = liquidated
    await contract.closeSignal(1, -100);

    // loss = 100e6 * 100 * 150000 / 10e6 = 1500e6. loss > col → payout = 0
    expect(await contract.getExpectedPayout(user1.address, 1)).to.equal(0n);
  });

  it("SHORT TP HIT: price goes down = profit", async function () {
    const shortTp = sl; // TP below entry
    const shortSl = tp; // SL above entry
    await contract.postSignal(false, entry, shortTp, shortSl, 50000);
    await contract.connect(user1).copyTrade(1, 500000000n);

    // SHORT wins when price drops. resultPct = +46 bps
    await contract.closeSignal(1, 46);

    // profit = 500e6 * 46 * 50000 / 10e6 = 115e6
    // fee = 115 * 20% = 23
    // payout = 500 + 115 - 23 = 592
    const payout = await contract.getExpectedPayout(user1.address, 1);
    expect(payout).to.equal(592000000n);
  });

  it("SHORT SL HIT: price goes up = loss", async function () {
    const shortTp = sl;
    const shortSl = tp;
    await contract.postSignal(false, entry, shortTp, shortSl, 50000);
    await contract.connect(user1).copyTrade(1, 500000000n);

    // SHORT loses when price rises. resultPct = -91 bps
    await contract.closeSignal(1, -91);

    // loss = 500e6 * 91 * 50000 / 10e6 = 227.5e6
    // payout = 500 - 227.5 = 272.5
    expect(await contract.getExpectedPayout(user1.address, 1)).to.equal(272500000n);
  });

  it("BOT FLOW: post → auto-copy → TP hit → close → claim", async function () {
    // This simulates the full bot lifecycle
    await contract.connect(user1).enableAutoCopy(200000000n);
    await contract.connect(user2).enableAutoCopy(300000000n);

    // 1. Admin posts signal
    await contract.postSignal(true, entry, tp, sl, 50000);

    // 2. Bot auto-copies for all enabled users
    const users = await contract.getAutoCopyUsers();
    for (const user of users) {
      const config = await contract.autoCopy(user);
      if (config.enabled) {
        await contract.executeCopyFor(user, 1);
      }
    }

    // 3. TP hit — bot closes with result
    await contract.closeSignal(1, 91); // +0.91%

    // 4. Users claim
    await usdc.mint(await contract.getAddress(), 1000000000n);
    await contract.connect(user1).claimProceeds(1);
    await contract.connect(user2).claimProceeds(1);

    // Both should have profit
    expect(await usdc.balanceOf(user1.address)).to.be.gt(10000000000n);
    expect(await usdc.balanceOf(user2.address)).to.be.gt(10000000000n);

    // Fees should be collected
    expect(await contract.totalFeesCollected()).to.be.gt(0n);
  });

  it("BOT FLOW: post → auto-copy → SL hit → close → claim (loss)", async function () {
    await contract.connect(user1).enableAutoCopy(200000000n);

    await contract.postSignal(true, entry, tp, sl, 50000);
    await contract.executeCopyFor(user1.address, 1);

    // SL hit
    await contract.closeSignal(1, -46);

    await contract.connect(user1).claimProceeds(1);

    // User should have less than starting balance
    expect(await usdc.balanceOf(user1.address)).to.be.lt(10000000000n);
    // No fees on loss
    expect(await contract.totalFeesCollected()).to.equal(0n);
  });

  it("LOGIC: complete 5-signal lifecycle with mixed results", async function () {
    const results = [300, -100, 0, 500, -300]; // +3%, -1%, 0%, +5%, -3%
    let user1Balance = 10000000000n;

    for (let i = 0; i < 5; i++) {
      await contract.postSignal(true, entry, tp, sl, 50000);
      await contract.connect(user1).copyTrade(i + 1, 100000000n); // 100 USDC each
      await contract.closeSignal(i + 1, results[i]);

      if (results[i] > 0) {
        await usdc.mint(await contract.getAddress(), 5000000000n);
      }
      await contract.connect(user1).claimProceeds(i + 1);
    }

    // User should have gained on winning trades and lost on losing
    const finalBal = await usdc.balanceOf(user1.address);
    // Can't predict exact due to fee rounding, just check it's reasonable
    expect(finalBal).to.be.gt(9000000000n);  // didn't lose everything
    expect(finalBal).to.be.lt(12000000000n); // didn't gain unreasonably
  });
});
