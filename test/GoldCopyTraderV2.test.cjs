const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("GoldCopyTraderV2", function () {
  let contract, usdc, admin, user1, user2;
  const entry = BigInt(Math.round(4390 * 1e10));
  const tp = BigInt(Math.round(4430 * 1e10));
  const sl = BigInt(Math.round(4370 * 1e10));

  beforeEach(async function () {
    [admin, user1, user2] = await ethers.getSigners();

    // Deploy mock USDC
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    usdc = await MockUSDC.deploy();
    await usdc.waitForDeployment();

    // Deploy mock Diamond
    const MockDiamond = await ethers.getContractFactory("MockDiamond");
    const diamond = await MockDiamond.deploy();
    await diamond.waitForDeployment();

    // Deploy V2
    const V2 = await ethers.getContractFactory("GoldCopyTraderV2");
    contract = await V2.deploy(await usdc.getAddress(), await diamond.getAddress());
    await contract.waitForDeployment();

    // Mint USDC
    await usdc.mint(admin.address, 10000000000n);
    await usdc.mint(user1.address, 10000000000n);
    await usdc.mint(user2.address, 10000000000n);

    // Approve
    await usdc.connect(user1).approve(await contract.getAddress(), ethers.MaxUint256);
    await usdc.connect(user2).approve(await contract.getAddress(), ethers.MaxUint256);
    await usdc.approve(await contract.getAddress(), ethers.MaxUint256);
  });

  it("deposit + cancel + claim (full refund)", async function () {
    await contract.postSignal(true, entry, tp, sl, 50000);
    await contract.connect(user1).deposit(1000000000n);
    await contract.connect(user2).deposit(500000000n);
    await contract.cancelSignal();

    expect(await contract.getExpectedPayout(user1.address, 1)).to.equal(1000000000n);
    expect(await contract.getExpectedPayout(user2.address, 1)).to.equal(500000000n);

    await contract.connect(user1).claim(1);
    await contract.connect(user2).claim(1);

    expect(await usdc.balanceOf(user1.address)).to.equal(10000000000n);
    expect(await usdc.balanceOf(user2.address)).to.equal(10000000000n);
  });

  it("withdrawDeposit returns USDC", async function () {
    await contract.postSignal(true, entry, tp, sl, 50000);
    await contract.connect(user1).deposit(500000000n);

    const before = await usdc.balanceOf(user1.address);
    await contract.connect(user1).withdrawDeposit(1);
    const after = await usdc.balanceOf(user1.address);

    expect(after - before).to.equal(500000000n);
  });

  it("userCancelExpiredSignal after 24h", async function () {
    await contract.postSignal(true, entry, tp, sl, 50000);
    await contract.connect(user1).deposit(300000000n);

    await ethers.provider.send("evm_increaseTime", [90000]);
    await ethers.provider.send("evm_mine", []);

    await contract.connect(user1).userCancelExpiredSignal(1);
    await contract.connect(user1).claim(1);

    expect(await usdc.balanceOf(user1.address)).to.equal(10000000000n);
  });

  it("TP/SL validation (LONG)", async function () {
    await expect(contract.postSignal(true, entry, sl, tp, 50000))
      .to.be.revertedWith("Long: TP>entry>SL");
  });

  it("TP/SL validation (SHORT)", async function () {
    await expect(contract.postSignal(false, entry, tp, sl, 50000))
      .to.be.revertedWith("Short: TP<entry<SL");
    await contract.postSignal(false, entry, sl, tp, 50000); // correct order
  });

  it("admin blocked from deposit()", async function () {
    await contract.postSignal(true, entry, tp, sl, 50000);
    await expect(contract.deposit(100000000n))
      .to.be.revertedWith("Admin use adminDeposit");
  });

  it("double deposit blocked", async function () {
    await contract.postSignal(true, entry, tp, sl, 50000);
    await contract.connect(user1).deposit(100000000n);
    await expect(contract.connect(user1).deposit(100000000n))
      .to.be.revertedWith("Already deposited");
  });

  it("min deposit enforced", async function () {
    await contract.postSignal(true, entry, tp, sl, 50000);
    await expect(contract.connect(user1).deposit(1000000n))
      .to.be.revertedWith("Min 5 USDC");
  });

  it("max deposit enforced", async function () {
    await contract.postSignal(true, entry, tp, sl, 50000);
    await expect(contract.connect(user1).deposit(60000000000n))
      .to.be.revertedWith("Max 50000 USDC");
  });

  it("adminDeposit + adminWithdrawDeposit", async function () {
    await contract.adminDeposit(1000000000n);
    expect(await usdc.balanceOf(await contract.getAddress())).to.equal(1000000000n);

    await contract.adminWithdrawDeposit(1000000000n);
    expect(await usdc.balanceOf(await contract.getAddress())).to.equal(0n);
  });

  it("only one active signal", async function () {
    await contract.postSignal(true, entry, tp, sl, 50000);
    await expect(contract.postSignal(true, entry, tp, sl, 50000))
      .to.be.revertedWith("Close active signal first");
  });

  it("re-deposit after withdraw blocked", async function () {
    await contract.postSignal(true, entry, tp, sl, 50000);
    await contract.connect(user1).deposit(100000000n);
    await contract.connect(user1).withdrawDeposit(1);
    await expect(contract.connect(user1).deposit(100000000n))
      .to.be.revertedWith("Already deposited");
  });

  it("fee percent max 20%", async function () {
    await expect(contract.setFeePercent(3000)).to.be.revertedWith("Max 20%");
    await contract.setFeePercent(1000); // 10% should work
  });

  it("pause blocks deposits", async function () {
    await contract.postSignal(true, entry, tp, sl, 50000);
    await contract.setPaused(true);
    await expect(contract.connect(user1).deposit(100000000n))
      .to.be.revertedWith("Paused");
  });

  it("two-step admin transfer", async function () {
    await contract.transferAdmin(user1.address);
    await contract.connect(user1).acceptAdmin();
    expect(await contract.admin()).to.equal(user1.address);
  });

  // ===== BUG / EXPLOIT TESTS =====

  it("BUG: can't claim twice", async function () {
    await contract.postSignal(true, entry, tp, sl, 50000);
    await contract.connect(user1).deposit(100000000n);
    await contract.cancelSignal();
    await contract.connect(user1).claim(1);
    await expect(contract.connect(user1).claim(1))
      .to.be.revertedWith("Already claimed");
  });

  it("BUG: can't claim unclosed signal", async function () {
    await contract.postSignal(true, entry, tp, sl, 50000);
    await contract.connect(user1).deposit(100000000n);
    await expect(contract.connect(user1).claim(1))
      .to.be.revertedWith("Not settled");
  });

  it("BUG: can't claim without position", async function () {
    await contract.postSignal(true, entry, tp, sl, 50000);
    await contract.connect(user1).deposit(100000000n);
    await contract.cancelSignal();
    await expect(contract.connect(user2).claim(1))
      .to.be.revertedWith("No position");
  });

  it("BUG: non-admin can't post signal", async function () {
    await expect(contract.connect(user1).postSignal(true, entry, tp, sl, 50000))
      .to.be.revertedWith("Not admin");
  });

  it("BUG: non-admin can't cancel signal", async function () {
    await contract.postSignal(true, entry, tp, sl, 50000);
    await expect(contract.connect(user1).cancelSignal())
      .to.be.revertedWith("Not admin");
  });

  it("BUG: non-admin can't settle", async function () {
    await contract.postSignal(true, entry, tp, sl, 50000);
    await expect(contract.connect(user1).settleSignal(0))
      .to.be.revertedWith("Not admin");
  });

  it("BUG: can't withdraw after trade opened (cancel = SETTLED)", async function () {
    await contract.postSignal(true, entry, tp, sl, 50000);
    await contract.connect(user1).deposit(100000000n);
    await contract.cancelSignal();
    await expect(contract.connect(user1).withdrawDeposit(1))
      .to.be.revertedWith("Trade already opened");
  });

  it("BUG: can't deposit 0 USDC", async function () {
    await contract.postSignal(true, entry, tp, sl, 50000);
    await expect(contract.connect(user1).deposit(0))
      .to.be.revertedWith("Min 5 USDC");
  });

  it("BUG: can't cancel expired before timeout", async function () {
    await contract.postSignal(true, entry, tp, sl, 50000);
    await contract.connect(user1).deposit(100000000n);
    await expect(contract.connect(user1).userCancelExpiredSignal(1))
      .to.be.revertedWith("Not expired");
  });

  it("BUG: emergency withdraw too early blocked", async function () {
    await contract.postSignal(true, entry, tp, sl, 50000);
    await contract.connect(user1).deposit(100000000n);
    // Can't emergency withdraw in COLLECTING phase
    await expect(contract.connect(user1).emergencyWithdraw(1))
      .to.be.revertedWith("Not in trading");
  });

  it("BUG: adminWithdrawDeposit blocked during active signal", async function () {
    await contract.adminDeposit(500000000n);
    await contract.postSignal(true, entry, tp, sl, 50000);
    await expect(contract.adminWithdrawDeposit(500000000n))
      .to.be.revertedWith("Signal active");
  });

  it("BUG: adminWithdrawDeposit can't drain claim reserves", async function () {
    // Setup: signal with deposits, cancel, then try to drain
    await contract.postSignal(true, entry, tp, sl, 50000);
    await contract.connect(user1).deposit(1000000000n);
    await contract.cancelSignal();
    // Admin deposits extra
    await contract.adminDeposit(500000000n);
    // Now try to withdraw more than admin deposited
    await expect(contract.adminWithdrawDeposit(600000000n))
      .to.be.revertedWith("More than deposited");
  });

  it("BUG: proportional split with multiple users", async function () {
    await contract.postSignal(true, entry, tp, sl, 50000);
    await contract.connect(user1).deposit(750000000n); // 750
    await contract.connect(user2).deposit(250000000n); // 250
    await contract.cancelSignal();

    // User1 should get 750, User2 should get 250
    const p1 = await contract.getExpectedPayout(user1.address, 1);
    const p2 = await contract.getExpectedPayout(user2.address, 1);
    expect(p1).to.equal(750000000n);
    expect(p2).to.equal(250000000n);

    await contract.connect(user1).claim(1);
    await contract.connect(user2).claim(1);
  });

  it("BUG: getExpectedPayout returns 0 after claim", async function () {
    await contract.postSignal(true, entry, tp, sl, 50000);
    await contract.connect(user1).deposit(100000000n);
    await contract.cancelSignal();
    await contract.connect(user1).claim(1);
    expect(await contract.getExpectedPayout(user1.address, 1)).to.equal(0n);
  });

  it("BUG: acceptAdmin by random user blocked", async function () {
    await contract.transferAdmin(user1.address);
    await expect(contract.connect(user2).acceptAdmin())
      .to.be.revertedWith("Not pending admin");
  });

  it("BUG: zero address admin transfer blocked", async function () {
    await expect(contract.transferAdmin(ethers.ZeroAddress))
      .to.be.revertedWith("Zero addr");
  });

  it("BUG: adminDeposit zero blocked", async function () {
    await expect(contract.adminDeposit(0))
      .to.be.revertedWith("Zero amount");
  });

  it("BUG: max deposit per user enforced", async function () {
    await contract.postSignal(true, entry, tp, sl, 50000);
    await usdc.mint(user1.address, 60000000000n);
    await expect(contract.connect(user1).deposit(50001000000n)) // 50,001 USDC
      .to.be.revertedWith("Max 50000 USDC");
    // Exactly 50k should work
    await contract.connect(user1).deposit(50000000000n);
  });

  it("BUG: leverage bounds enforced", async function () {
    await expect(contract.postSignal(true, entry, tp, sl, 1000)) // 1x
      .to.be.revertedWith("Lev 2x-250x");
    await expect(contract.postSignal(true, entry, tp, sl, 300000)) // 300x
      .to.be.revertedWith("Lev 2x-250x");
  });

  // ===== PROFIT / LOSS / SETTLE / FEE TESTS =====

  it("SETTLE: profit distributed proportionally with 20% fee", async function () {
    await contract.postSignal(true, entry, tp, sl, 50000);
    await contract.connect(user1).deposit(1000000000n); // 1000
    await contract.connect(user2).deposit(500000000n);   // 500

    // Simulate: admin opens trade, gTrade returns 1800 (pool was 1500, profit = 300)
    // We fake this by: cancel won't work for settle, so we need openTrade
    // Use mock diamond which doesn't revert
    await contract.openTrade(0);

    // Admin settles with 1800 USDC returned (20% profit on 1500)
    // First admin needs to fund the contract with the "returned" USDC
    await usdc.mint(await contract.getAddress(), 300000000n); // simulate gTrade profit
    await contract.settleSignal(1800000000n);

    // User1: share = (1800 * 1000) / 1500 = 1200. Profit = 200. Fee = 40. Payout = 1160
    // User2: share = (1800 * 500) / 1500 = 600. Profit = 100. Fee = 20. Payout = 580
    const p1 = await contract.getExpectedPayout(user1.address, 1);
    const p2 = await contract.getExpectedPayout(user2.address, 1);
    expect(p1).to.equal(1160000000n); // 1160 USDC
    expect(p2).to.equal(580000000n);  // 580 USDC

    await contract.connect(user1).claim(1);
    await contract.connect(user2).claim(1);

    // Fees collected: 40 + 20 = 60
    expect(await contract.totalFeesCollected()).to.equal(60000000n);
  });

  it("SETTLE: loss distributed proportionally, no fee", async function () {
    await contract.postSignal(true, entry, tp, sl, 50000);
    await contract.connect(user1).deposit(1000000000n);
    await contract.connect(user2).deposit(500000000n);
    await contract.openTrade(0);

    // gTrade returns 900 (loss of 600 on pool of 1500)
    // Contract already has 1500, but gTrade "took" 600, so we need to remove it
    // Simulate: burn 600 from contract
    // Actually the contract has 1500 USDC. If gTrade returns 900, contract now has 900.
    // We need to get rid of 600. Let's use a different approach:
    // Transfer 600 out to simulate gTrade keeping it
    // We can't transfer from contract, so let's just settle with 900
    // The contract has 1500 but we say totalReturned = 900
    await contract.settleSignal(900000000n);

    // User1: share = (900 * 1000) / 1500 = 600
    // User2: share = (900 * 500) / 1500 = 300
    // No fee on losses
    const p1 = await contract.getExpectedPayout(user1.address, 1);
    const p2 = await contract.getExpectedPayout(user2.address, 1);
    expect(p1).to.equal(600000000n);
    expect(p2).to.equal(300000000n);

    await contract.connect(user1).claim(1);
    await contract.connect(user2).claim(1);

    expect(await contract.totalFeesCollected()).to.equal(0n);
  });

  it("SETTLE: breakeven returns exact deposit, no fee", async function () {
    await contract.postSignal(true, entry, tp, sl, 50000);
    await contract.connect(user1).deposit(1000000000n);
    await contract.connect(user2).deposit(500000000n);
    await contract.openTrade(0);

    await contract.settleSignal(1500000000n); // exact return

    expect(await contract.getExpectedPayout(user1.address, 1)).to.equal(1000000000n);
    expect(await contract.getExpectedPayout(user2.address, 1)).to.equal(500000000n);

    await contract.connect(user1).claim(1);
    await contract.connect(user2).claim(1);

    expect(await contract.totalFeesCollected()).to.equal(0n);
    expect(await usdc.balanceOf(user1.address)).to.equal(10000000000n);
    expect(await usdc.balanceOf(user2.address)).to.equal(10000000000n);
  });

  it("SETTLE: total loss returns 0", async function () {
    await contract.postSignal(true, entry, tp, sl, 50000);
    await contract.connect(user1).deposit(100000000n);
    await contract.openTrade(0);

    await contract.settleSignal(0); // total loss

    expect(await contract.getExpectedPayout(user1.address, 1)).to.equal(0n);
    await contract.connect(user1).claim(1);
    expect(await usdc.balanceOf(user1.address)).to.equal(9900000000n); // lost 100
  });

  it("SETTLE: 3x cap enforced", async function () {
    await contract.postSignal(true, entry, tp, sl, 50000);
    await contract.connect(user1).deposit(100000000n);
    await contract.openTrade(0);

    // Try to settle with 4x return
    await usdc.mint(await contract.getAddress(), 300000000n);
    await expect(contract.settleSignal(400000000n))
      .to.be.revertedWith("Result too high");

    // 3x should work
    await contract.settleSignal(300000000n);
  });

  it("SETTLE: can't settle in COLLECTING phase", async function () {
    await contract.postSignal(true, entry, tp, sl, 50000);
    await expect(contract.settleSignal(0))
      .to.be.revertedWith("Not trading");
  });

  it("FEE: fee locked at signal creation", async function () {
    // Set fee to 10%
    await contract.setFeePercent(1000);
    await contract.postSignal(true, entry, tp, sl, 50000);
    await contract.connect(user1).deposit(1000000000n);

    // Change fee to 5% — shouldn't affect this signal
    await contract.setFeePercent(500);

    await contract.openTrade(0);
    await usdc.mint(await contract.getAddress(), 500000000n);
    await contract.settleSignal(1500000000n); // 500 profit

    // Fee should be 10% of 500 = 50 (not 5%)
    const payout = await contract.getExpectedPayout(user1.address, 1);
    expect(payout).to.equal(1450000000n); // 1000 + 500 - 50

    await contract.connect(user1).claim(1);
    expect(await contract.totalFeesCollected()).to.equal(50000000n);
  });

  it("FEE: withdrawFees sends to admin", async function () {
    await contract.postSignal(true, entry, tp, sl, 50000);
    await contract.connect(user1).deposit(1000000000n);
    await contract.openTrade(0);
    await usdc.mint(await contract.getAddress(), 200000000n);
    await contract.settleSignal(1200000000n);
    await contract.connect(user1).claim(1);

    const fees = await contract.totalFeesCollected();
    expect(fees).to.be.gt(0n);

    const before = await usdc.balanceOf(admin.address);
    await contract.withdrawFees();
    const after = await usdc.balanceOf(admin.address);
    expect(after - before).to.equal(fees);
    expect(await contract.totalFeesCollected()).to.equal(0n);
  });

  it("FEE: no fees on loss", async function () {
    await contract.postSignal(true, entry, tp, sl, 50000);
    await contract.connect(user1).deposit(1000000000n);
    await contract.openTrade(0);
    await contract.settleSignal(800000000n); // loss
    await contract.connect(user1).claim(1);

    expect(await contract.totalFeesCollected()).to.equal(0n);
  });

  it("SETTLE: unequal deposits, correct proportional profit split", async function () {
    await contract.postSignal(true, entry, tp, sl, 50000);
    await contract.connect(user1).deposit(900000000n);  // 900 (60%)
    await contract.connect(user2).deposit(600000000n);  // 600 (40%)
    await contract.openTrade(0);

    await usdc.mint(await contract.getAddress(), 750000000n); // 50% profit
    await contract.settleSignal(2250000000n);

    // User1: 2250 * 900 / 1500 = 1350. Profit = 450. Fee = 90. Payout = 1260
    // User2: 2250 * 600 / 1500 = 900. Profit = 300. Fee = 60. Payout = 840
    expect(await contract.getExpectedPayout(user1.address, 1)).to.equal(1260000000n);
    expect(await contract.getExpectedPayout(user2.address, 1)).to.equal(840000000n);

    await contract.connect(user1).claim(1);
    await contract.connect(user2).claim(1);

    expect(await contract.totalFeesCollected()).to.equal(150000000n); // 90 + 60
  });

  it("SETTLE: small deposit (5 USDC min) profit test", async function () {
    await contract.postSignal(true, entry, tp, sl, 50000);
    await contract.connect(user1).deposit(5000000n); // 5 USDC
    await contract.openTrade(0);

    // 10% profit: 5 → 5.5 returned
    await usdc.mint(await contract.getAddress(), 500000n);
    await contract.settleSignal(5500000n);

    // Profit = 0.5. Fee = 0.1. Payout = 5.4
    expect(await contract.getExpectedPayout(user1.address, 1)).to.equal(5400000n);
    await contract.connect(user1).claim(1);
  });

  it("CLOSETRADE: wrong index blocked", async function () {
    await contract.postSignal(true, entry, tp, sl, 50000);
    await contract.connect(user1).deposit(100000000n);
    await contract.openTrade(5); // gTradeIndex = 5

    await expect(contract.closeTrade(99, 0))
      .to.be.revertedWith("Wrong trade index");
  });

  it("BUG: multiple signals lifecycle", async function () {
    // Signal 1: deposit + cancel + claim
    await contract.postSignal(true, entry, tp, sl, 50000);
    await contract.connect(user1).deposit(200000000n);
    await contract.cancelSignal();
    await contract.connect(user1).claim(1);

    // Signal 2: deposit + cancel + claim
    await contract.postSignal(true, entry, tp, sl, 50000);
    await contract.connect(user1).deposit(300000000n);
    await contract.connect(user2).deposit(100000000n);
    await contract.cancelSignal();
    await contract.connect(user1).claim(2);
    await contract.connect(user2).claim(2);

    // All USDC back
    expect(await usdc.balanceOf(user1.address)).to.equal(10000000000n);
    expect(await usdc.balanceOf(user2.address)).to.equal(10000000000n);
  });
});
