const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("GoldCopyTrader — Claim Payout Cap", function () {
  let trader, usdc, diamond, admin, user1, user2;

  beforeEach(async function () {
    [admin, user1, user2] = await ethers.getSigners();

    // Deploy mocks
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    usdc = await MockUSDC.deploy();

    const MockDiamond = await ethers.getContractFactory("MockDiamond");
    diamond = await MockDiamond.deploy();

    // Deploy trader
    const Trader = await ethers.getContractFactory("GoldCopyTrader");
    trader = await Trader.deploy(await usdc.getAddress(), await diamond.getAddress());

    // Mint USDC and setup
    await usdc.mint(user1.address, 100n * 10n ** 6n);
    await usdc.mint(user2.address, 100n * 10n ** 6n);
    await usdc.connect(user1).approve(await trader.getAddress(), ethers.MaxUint256);
    await usdc.connect(user2).approve(await trader.getAddress(), ethers.MaxUint256);
  });

  it("should cap payout to available balance instead of reverting", async function () {
    // Post signal and have user copy
    await trader.postSignal(true, 3000n * 10n ** 10n, 3050n * 10n ** 10n, 2950n * 10n ** 10n, 50000);
    await trader.connect(user1).copyTrade(1, 10n * 10n ** 6n); // 10 USDC

    // Close with profit (+5%)
    await trader.closeSignal(1, 500);

    // Drain most USDC from contract (simulate gTrade fees eating balance)
    // Transfer USDC out via admin trick: deploy new trader to drain
    const contractBal = await usdc.balanceOf(await trader.getAddress());
    // Contract should have 10 USDC from user, but let's imagine gTrade took some
    // We can't easily drain, so let's test with a scenario where profit > balance

    // Close signal with high profit that exceeds balance
    // profit = 10 * 500 * 50000 / (10000 * 1000) = 25 USDC
    // fee = 25 * 2000 / 10000 = 5 USDC
    // payout = 10 + 25 - 5 = 30 USDC
    // But contract only has 10 USDC → should cap to 10, not revert

    const balBefore = await usdc.balanceOf(user1.address);
    await trader.connect(user1).claimProceeds(1);
    const balAfter = await usdc.balanceOf(user1.address);

    const received = balAfter - balBefore;
    const contractBalAfter = await usdc.balanceOf(await trader.getAddress());

    // User should receive something (capped to available)
    expect(received).to.be.gt(0);
    // Contract should be drained or near-zero
    expect(contractBalAfter).to.be.lte(received);
  });

  it("should pay full amount when contract has enough balance", async function () {
    // Post signal, user copies
    await trader.postSignal(true, 3000n * 10n ** 10n, 3050n * 10n ** 10n, 2950n * 10n ** 10n, 50000);
    await trader.connect(user1).copyTrade(1, 10n * 10n ** 6n); // 10 USDC

    // Fund contract with extra USDC for payouts
    await usdc.mint(await trader.getAddress(), 100n * 10n ** 6n);

    // Close with small profit (+1%)
    await trader.closeSignal(1, 100);

    // profit = 10 * 100 * 50000 / (10000 * 1000) = 5 USDC
    // fee = 5 * 2000 / 10000 = 1 USDC
    // payout = 10 + 5 - 1 = 14 USDC
    const balBefore = await usdc.balanceOf(user1.address);
    await trader.connect(user1).claimProceeds(1);
    const balAfter = await usdc.balanceOf(user1.address);

    expect(balAfter - balBefore).to.equal(14n * 10n ** 6n);
  });

  it("should handle multiple users claiming when balance is low", async function () {
    // Post signal, both users copy
    await trader.postSignal(true, 3000n * 10n ** 10n, 3050n * 10n ** 10n, 2950n * 10n ** 10n, 50000);
    await trader.connect(user1).copyTrade(1, 10n * 10n ** 6n);
    await trader.connect(user2).copyTrade(1, 10n * 10n ** 6n);

    // Close with breakeven
    await trader.closeSignal(1, 0);

    // Contract has 20 USDC, each user should get 10 back
    await trader.connect(user1).claimProceeds(1);
    await trader.connect(user2).claimProceeds(1);

    expect(await usdc.balanceOf(user1.address)).to.equal(100n * 10n ** 6n);
    expect(await usdc.balanceOf(user2.address)).to.equal(100n * 10n ** 6n);
  });

  it("should handle loss correctly", async function () {
    await trader.postSignal(true, 3000n * 10n ** 10n, 3050n * 10n ** 10n, 2950n * 10n ** 10n, 50000);
    await trader.connect(user1).copyTrade(1, 10n * 10n ** 6n);

    // Close with -2% loss
    await trader.closeSignal(1, -200);

    // loss = 10 * 200 * 50000 / (10000 * 1000) = 10 USDC → total loss
    const balBefore = await usdc.balanceOf(user1.address);
    await trader.connect(user1).claimProceeds(1);
    const balAfter = await usdc.balanceOf(user1.address);

    // Total loss = payout 0
    expect(balAfter - balBefore).to.equal(0);
  });

  it("should handle cancel (breakeven) correctly", async function () {
    await trader.postSignal(true, 3000n * 10n ** 10n, 3050n * 10n ** 10n, 2950n * 10n ** 10n, 50000);
    await trader.connect(user1).copyTrade(1, 10n * 10n ** 6n);

    await trader.cancelSignal(1);

    const balBefore = await usdc.balanceOf(user1.address);
    await trader.connect(user1).claimProceeds(1);
    const balAfter = await usdc.balanceOf(user1.address);

    // Full refund
    expect(balAfter - balBefore).to.equal(10n * 10n ** 6n);
  });
});
