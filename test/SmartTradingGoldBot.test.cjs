const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("SmartTradingGoldBot", function () {
  let bot, usdc, owner, user1, user2;
  const USDC_AMOUNT = 1000n * 10n ** 6n; // 1000 USDC

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    usdc = await MockUSDC.deploy();

    const Bot = await ethers.getContractFactory("SmartTradingGoldBot");
    bot = await Bot.deploy(await usdc.getAddress());

    await usdc.mint(user1.address, USDC_AMOUNT * 10n);
    await usdc.mint(user2.address, USDC_AMOUNT * 10n);
    await usdc.mint(await bot.getAddress(), USDC_AMOUNT * 100n);

    await usdc.connect(user1).approve(await bot.getAddress(), ethers.MaxUint256);
    await usdc.connect(user2).approve(await bot.getAddress(), ethers.MaxUint256);
    await usdc.connect(owner).approve(await bot.getAddress(), ethers.MaxUint256);
  });

  describe("Deposit", function () {
    it("should accept deposits", async function () {
      await bot.connect(user1).deposit(USDC_AMOUNT);
      const user = await bot.users(user1.address);
      expect(user.depositedAmount).to.equal(USDC_AMOUNT);
    });

    it("should reject zero deposits", async function () {
      await expect(bot.connect(user1).deposit(0)).to.be.revertedWith("Amount must be greater than 0");
    });

    it("should accumulate multiple deposits", async function () {
      await bot.connect(user1).deposit(USDC_AMOUNT);
      await bot.connect(user1).deposit(USDC_AMOUNT);
      const user = await bot.users(user1.address);
      expect(user.depositedAmount).to.equal(USDC_AMOUNT * 2n);
    });
  });

  describe("Rewards (2% daily, weekdays only)", function () {
    it("should accrue rewards after 1 weekday", async function () {
      // Get current time and advance to next Monday
      const now = await time.latest();
      const dayOfWeek = ((Math.floor(now / 86400) + 4) % 7); // 0=Sun..6=Sat
      // Days until Monday (1)
      const daysToMon = dayOfWeek <= 1 ? (1 - dayOfWeek) : (8 - dayOfWeek);
      if (daysToMon > 0) await time.increase(daysToMon * 86400);

      await bot.connect(user1).deposit(USDC_AMOUNT);
      await time.increase(86400); // 1 weekday (Mon→Tue)
      const reward = await bot.pendingReward(user1.address);
      expect(reward).to.be.gt(0);
    });

    it("should NOT accrue on weekends (getWeekdaySeconds)", async function () {
      // Jan 1 1970 = Thursday. Day 2 = Saturday, Day 4 = Monday
      const satStart = 2 * 86400;
      const monStart = 4 * 86400;
      const weekdaySecs = await bot.getWeekdaySeconds(satStart, monStart);
      expect(weekdaySecs).to.equal(0);
    });

    it("should count 5 weekday days in a full week", async function () {
      const start = 0;
      const end = 7 * 86400;
      const weekdaySecs = await bot.getWeekdaySeconds(start, end);
      expect(weekdaySecs).to.equal(BigInt(5 * 86400));
    });
  });

  describe("Withdraw", function () {
    it("should withdraw principal + rewards", async function () {
      await bot.connect(user1).deposit(USDC_AMOUNT);
      await time.increase(86400);

      const balBefore = await usdc.balanceOf(user1.address);
      await bot.connect(user1).withdraw(USDC_AMOUNT);
      const balAfter = await usdc.balanceOf(user1.address);

      expect(balAfter - balBefore).to.be.gte(USDC_AMOUNT);
    });

    it("should reject over-withdrawal", async function () {
      await bot.connect(user1).deposit(USDC_AMOUNT);
      await expect(bot.connect(user1).withdraw(USDC_AMOUNT * 2n)).to.be.revertedWith("Insufficient deposited balance");
    });

    it("should reject zero withdrawal", async function () {
      await bot.connect(user1).deposit(USDC_AMOUNT);
      await expect(bot.connect(user1).withdraw(0)).to.be.revertedWith("Amount must be greater than 0");
    });
  });

  describe("Claim Reward", function () {
    it("should claim reward after 24h", async function () {
      await bot.connect(user1).deposit(USDC_AMOUNT);
      await time.increase(86400 + 1);

      const balBefore = await usdc.balanceOf(user1.address);
      await bot.connect(user1).claimReward();
      const balAfter = await usdc.balanceOf(user1.address);
      expect(balAfter).to.be.gt(balBefore);
    });

    it("should reject claim before 24h", async function () {
      await bot.connect(user1).deposit(USDC_AMOUNT);
      await time.increase(3600);
      await expect(bot.connect(user1).claimReward()).to.be.revertedWith("Rewards can only be claimed every 24 hours");
    });
  });

  describe("Owner functions", function () {
    it("should let owner withdraw", async function () {
      await bot.connect(owner).ownerWithdraw(500n * 10n ** 6n);
    });

    it("should reject non-owner withdraw", async function () {
      await expect(bot.connect(user1).ownerWithdraw(100n)).to.be.revertedWith("Not authorized: Owner only");
    });

    it("should let owner deposit", async function () {
      await usdc.mint(owner.address, USDC_AMOUNT);
      await bot.connect(owner).ownerDeposit(USDC_AMOUNT);
    });
  });
});
