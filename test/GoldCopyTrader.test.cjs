const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("GoldCopyTrader", function () {
  let trader, usdc, diamond, admin, user1, user2;
  const USDC = (n) => BigInt(n) * 10n ** 6n;
  const PRICE = (n) => BigInt(Math.round(n * 1e10));
  const LEV = (n) => n * 1000;

  beforeEach(async function () {
    [admin, user1, user2] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    usdc = await MockUSDC.deploy();

    const MockDiamond = await ethers.getContractFactory("MockDiamond");
    diamond = await MockDiamond.deploy();

    const Trader = await ethers.getContractFactory("GoldCopyTrader");
    trader = await Trader.deploy(await usdc.getAddress(), await diamond.getAddress());

    await usdc.mint(user1.address, USDC(100000));
    await usdc.mint(user2.address, USDC(100000));
    await usdc.mint(await trader.getAddress(), USDC(1000000));

    await usdc.connect(user1).approve(await trader.getAddress(), ethers.MaxUint256);
    await usdc.connect(user2).approve(await trader.getAddress(), ethers.MaxUint256);
    await usdc.connect(admin).approve(await trader.getAddress(), ethers.MaxUint256);
  });

  async function postLongSignal() {
    await trader.connect(admin).postSignal(true, PRICE(2340), PRICE(2380), PRICE(2320), LEV(50));
  }

  async function postShortSignal() {
    await trader.connect(admin).postSignal(false, PRICE(2340), PRICE(2300), PRICE(2360), LEV(50));
  }

  describe("Post Signal", function () {
    it("should post a long signal", async function () {
      await postLongSignal();
      expect(await trader.signalCount()).to.equal(1);
      expect(await trader.activeSignalId()).to.equal(1);
      const core = await trader.signalCore(1);
      expect(core.long).to.be.true;
      expect(core.active).to.be.true;
      expect(core.leverage).to.equal(LEV(50));
    });

    it("should post a short signal", async function () {
      await postShortSignal();
      const core = await trader.signalCore(1);
      expect(core.long).to.be.false;
    });

    it("should reject non-admin", async function () {
      await expect(
        trader.connect(user1).postSignal(true, PRICE(2340), PRICE(2380), PRICE(2320), LEV(50))
      ).to.be.revertedWith("Not admin");
    });

    it("should reject second signal while one is active", async function () {
      await postLongSignal();
      await expect(postLongSignal()).to.be.revertedWith("Close active signal first");
    });

    it("should reject invalid leverage (<2x)", async function () {
      await expect(
        trader.connect(admin).postSignal(true, PRICE(2340), PRICE(2380), PRICE(2320), 999)
      ).to.be.revertedWith("Lev 2x-250x");
    });

    it("should reject invalid leverage (>250x)", async function () {
      await expect(
        trader.connect(admin).postSignal(true, PRICE(2340), PRICE(2380), PRICE(2320), 251000)
      ).to.be.revertedWith("Lev 2x-250x");
    });

    it("should reject zero prices", async function () {
      await expect(
        trader.connect(admin).postSignal(true, 0, PRICE(2380), PRICE(2320), LEV(50))
      ).to.be.revertedWith("Bad prices");
    });
  });

  describe("Copy Trade", function () {
    beforeEach(async function () {
      await postLongSignal();
    });

    it("should copy a trade", async function () {
      await trader.connect(user1).copyTrade(1, USDC(100));
      const pos = await trader.positions(user1.address, 1);
      expect(pos.collateral).to.equal(USDC(100));
      const meta = await trader.signalMeta(1);
      expect(meta.totalCopied).to.equal(USDC(100));
      expect(meta.copierCount).to.equal(1);
    });

    it("should call gTrade diamond openTrade", async function () {
      await trader.connect(user1).copyTrade(1, USDC(100));
      expect(await diamond.getTradeCount()).to.equal(1);
      const trade = await diamond.trades(0);
      expect(trade.pairIndex).to.equal(90);
      expect(trade.long).to.be.true;
      expect(trade.leverage).to.equal(LEV(50));
    });

    it("should reject duplicate copy", async function () {
      await trader.connect(user1).copyTrade(1, USDC(100));
      await expect(trader.connect(user1).copyTrade(1, USDC(100))).to.be.revertedWith("Already copied");
    });

    it("should reject below minimum (1 USDC)", async function () {
      await expect(trader.connect(user1).copyTrade(1, USDC(0))).to.be.revertedWith("Min 1 USDC");
    });

    it("should reject copy on inactive signal", async function () {
      await trader.connect(admin).closeSignal(1, 500);
      await expect(trader.connect(user1).copyTrade(1, USDC(100))).to.be.revertedWith("Not active");
    });

    it("should revert if gTrade reverts (USDC safe)", async function () {
      await diamond.setShouldRevert(true);
      await expect(trader.connect(user1).copyTrade(1, USDC(100))).to.be.revertedWith("MockDiamond: forced revert");
      const pos = await trader.positions(user1.address, 1);
      expect(pos.collateral).to.equal(0);
    });

    it("should allow multiple users to copy same signal", async function () {
      await trader.connect(user1).copyTrade(1, USDC(100));
      await trader.connect(user2).copyTrade(1, USDC(200));
      const meta = await trader.signalMeta(1);
      expect(meta.copierCount).to.equal(2);
      expect(meta.totalCopied).to.equal(USDC(300));
    });

    it("should reject when paused", async function () {
      await trader.connect(admin).setPaused(true);
      await expect(trader.connect(user1).copyTrade(1, USDC(100))).to.be.revertedWith("Paused");
    });
  });

  describe("Close Signal", function () {
    beforeEach(async function () {
      await postLongSignal();
    });

    it("should close with profit", async function () {
      await trader.connect(admin).closeSignal(1, 500);
      const core = await trader.signalCore(1);
      expect(core.active).to.be.false;
      expect(core.closed).to.be.true;
      expect(core.resultPct).to.equal(500);
      expect(await trader.activeSignalId()).to.equal(0);
    });

    it("should close with loss", async function () {
      await trader.connect(admin).closeSignal(1, -300);
      const core = await trader.signalCore(1);
      expect(core.resultPct).to.equal(-300);
    });

    it("should reject result > 50%", async function () {
      await expect(trader.connect(admin).closeSignal(1, 5001)).to.be.revertedWith("Result out of range");
    });

    it("should reject result < -50%", async function () {
      await expect(trader.connect(admin).closeSignal(1, -5001)).to.be.revertedWith("Result out of range");
    });

    it("should allow new signal after close", async function () {
      await trader.connect(admin).closeSignal(1, 100);
      await postLongSignal();
      expect(await trader.signalCount()).to.equal(2);
    });
  });

  describe("Cancel Signal", function () {
    it("should cancel and set result to 0", async function () {
      await postLongSignal();
      await trader.connect(admin).cancelSignal(1);
      const core = await trader.signalCore(1);
      expect(core.closed).to.be.true;
      expect(core.resultPct).to.equal(0);
      expect(await trader.activeSignalId()).to.equal(0);
    });
  });

  describe("Claim Proceeds", function () {
    it("should payout profit minus 20% fee", async function () {
      await postLongSignal();
      await trader.connect(user1).copyTrade(1, USDC(1000));
      await trader.connect(admin).closeSignal(1, 200); // +2%

      const balBefore = await usdc.balanceOf(user1.address);
      await trader.connect(user1).claimProceeds(1);
      const balAfter = await usdc.balanceOf(user1.address);

      // profit = (1000e6 * 200 * 50000) / (10000 * 1000) = 1000e6
      // fee = 1000e6 * 2000 / 10000 = 200e6
      // payout = 1000e6 + 1000e6 - 200e6 = 1800e6
      expect(balAfter - balBefore).to.equal(USDC(1800));
      expect(await trader.totalFeesCollected()).to.equal(USDC(200));
    });

    it("should return 0 on total loss", async function () {
      await postLongSignal();
      await trader.connect(user1).copyTrade(1, USDC(1000));
      await trader.connect(admin).closeSignal(1, -200); // -2% * 50x = -100% = wipeout

      const balBefore = await usdc.balanceOf(user1.address);
      await trader.connect(user1).claimProceeds(1);
      const balAfter = await usdc.balanceOf(user1.address);
      expect(balAfter - balBefore).to.equal(0);
    });

    it("should payout partial loss correctly", async function () {
      await postLongSignal();
      await trader.connect(user1).copyTrade(1, USDC(1000));
      await trader.connect(admin).closeSignal(1, -100); // -1% * 50x = -50%

      // loss = (1000e6 * 100 * 50000) / (10000 * 1000) = 500e6
      // payout = 1000e6 - 500e6 = 500e6
      const balBefore = await usdc.balanceOf(user1.address);
      await trader.connect(user1).claimProceeds(1);
      const balAfter = await usdc.balanceOf(user1.address);
      expect(balAfter - balBefore).to.equal(USDC(500));
    });

    it("should reject double claim", async function () {
      await postLongSignal();
      await trader.connect(user1).copyTrade(1, USDC(100));
      await trader.connect(admin).closeSignal(1, 0);
      await trader.connect(user1).claimProceeds(1);
      await expect(trader.connect(user1).claimProceeds(1)).to.be.revertedWith("Claimed");
    });

    it("should reject claim on open signal", async function () {
      await postLongSignal();
      await trader.connect(user1).copyTrade(1, USDC(100));
      await expect(trader.connect(user1).claimProceeds(1)).to.be.revertedWith("Not closed");
    });

    it("should reject claim without position", async function () {
      await postLongSignal();
      await trader.connect(admin).closeSignal(1, 0);
      await expect(trader.connect(user1).claimProceeds(1)).to.be.revertedWith("No position");
    });

    it("should give full refund on cancelled signal", async function () {
      await postLongSignal();
      await trader.connect(user1).copyTrade(1, USDC(1000));
      await trader.connect(admin).cancelSignal(1);

      const balBefore = await usdc.balanceOf(user1.address);
      await trader.connect(user1).claimProceeds(1);
      const balAfter = await usdc.balanceOf(user1.address);
      expect(balAfter - balBefore).to.equal(USDC(1000));
    });
  });

  describe("Admin Functions", function () {
    it("should update fee", async function () {
      await trader.connect(admin).setFeePercent(1000);
      expect(await trader.feePercent()).to.equal(1000);
    });

    it("should reject fee > 20%", async function () {
      await expect(trader.connect(admin).setFeePercent(2001)).to.be.revertedWith("Max 20%");
    });

    it("should withdraw collected fees", async function () {
      await postLongSignal();
      await trader.connect(user1).copyTrade(1, USDC(1000));
      await trader.connect(admin).closeSignal(1, 200);
      await trader.connect(user1).claimProceeds(1);

      const fees = await trader.totalFeesCollected();
      expect(fees).to.be.gt(0);
      await usdc.mint(await trader.getAddress(), fees);
      await trader.connect(admin).withdrawFees();
      expect(await trader.totalFeesCollected()).to.equal(0);
    });

    it("should do two-step admin transfer", async function () {
      await trader.connect(admin).transferAdmin(user1.address);
      expect(await trader.pendingAdmin()).to.equal(user1.address);
      expect(await trader.admin()).to.equal(admin.address);
      await trader.connect(user1).acceptAdmin();
      expect(await trader.admin()).to.equal(user1.address);
    });

    it("should reject non-pending admin", async function () {
      await trader.connect(admin).transferAdmin(user1.address);
      await expect(trader.connect(user2).acceptAdmin()).to.be.revertedWith("Not pending admin");
    });

    it("should allow admin deposit", async function () {
      await usdc.mint(admin.address, USDC(5000));
      await trader.connect(admin).adminDeposit(USDC(5000));
    });
  });

  describe("View Functions", function () {
    it("should return user signal IDs", async function () {
      await postLongSignal();
      await trader.connect(user1).copyTrade(1, USDC(100));
      await trader.connect(admin).closeSignal(1, 0);
      await postLongSignal();
      await trader.connect(user1).copyTrade(2, USDC(200));
      const ids = await trader.getUserSignalIds(user1.address);
      expect(ids.length).to.equal(2);
    });

    it("should calculate expected payout", async function () {
      await postLongSignal();
      await trader.connect(user1).copyTrade(1, USDC(1000));
      await trader.connect(admin).closeSignal(1, 100);
      const payout = await trader.getExpectedPayout(user1.address, 1);
      expect(payout).to.be.gt(USDC(1000));
    });
  });

  describe("Edge Cases", function () {
    it("should handle breakeven (0%)", async function () {
      await postLongSignal();
      await trader.connect(user1).copyTrade(1, USDC(1000));
      await trader.connect(admin).closeSignal(1, 0);
      const balBefore = await usdc.balanceOf(user1.address);
      await trader.connect(user1).claimProceeds(1);
      const balAfter = await usdc.balanceOf(user1.address);
      expect(balAfter - balBefore).to.equal(USDC(1000));
    });

    it("should handle minimum collateral (1 USDC)", async function () {
      await postLongSignal();
      await trader.connect(user1).copyTrade(1, USDC(1));
      const pos = await trader.positions(user1.address, 1);
      expect(pos.collateral).to.equal(USDC(1));
    });

    it("should handle max result (+50%)", async function () {
      await postLongSignal();
      await trader.connect(user1).copyTrade(1, USDC(100));
      await trader.connect(admin).closeSignal(1, 5000);
      const core = await trader.signalCore(1);
      expect(core.resultPct).to.equal(5000);
    });
  });
});
