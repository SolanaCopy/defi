const { expect } = require("chai");
const hre = require("hardhat");

describe("StrategyMarketplace", function () {
  let marketplace, usdc, owner, provider1, provider2, follower1, follower2;
  const USDC_DECIMALS = 6;
  const parseUSDC = (n) => hre.ethers.parseUnits(n.toString(), USDC_DECIMALS);
  const formatUSDC = (n) => parseFloat(hre.ethers.formatUnits(n, USDC_DECIMALS));

  // Mock gTrade diamond that just accepts trades
  async function deployMockDiamond() {
    const MockDiamond = await hre.ethers.getContractFactory("MockDiamond");
    return await MockDiamond.deploy();
  }

  // Mock USDC
  async function deployMockUSDC() {
    const MockUSDC = await hre.ethers.getContractFactory("MockUSDC");
    return await MockUSDC.deploy();
  }

  beforeEach(async function () {
    [owner, provider1, provider2, follower1, follower2] = await hre.ethers.getSigners();

    usdc = await deployMockUSDC();
    const diamond = await deployMockDiamond();

    const Marketplace = await hre.ethers.getContractFactory("StrategyMarketplace");
    marketplace = await Marketplace.deploy(await usdc.getAddress(), await diamond.getAddress());

    // Fund accounts with USDC
    await usdc.mint(owner.address, parseUSDC(100000));
    await usdc.mint(provider1.address, parseUSDC(10000));
    await usdc.mint(provider2.address, parseUSDC(10000));
    await usdc.mint(follower1.address, parseUSDC(10000));
    await usdc.mint(follower2.address, parseUSDC(10000));

    // Admin deposits USDC for payouts
    await usdc.connect(owner).approve(await marketplace.getAddress(), parseUSDC(50000));
    await marketplace.connect(owner).adminDeposit(parseUSDC(5000));
  });

  describe("Provider Registration", function () {
    it("should allow anyone to register as provider", async function () {
      await marketplace.connect(provider1).registerProvider();
      const p = await marketplace.providers(provider1.address);
      expect(p.registered).to.be.true;
    });

    it("should not allow double registration", async function () {
      await marketplace.connect(provider1).registerProvider();
      await expect(marketplace.connect(provider1).registerProvider()).to.be.revertedWith("Already registered");
    });

    it("should track provider list", async function () {
      await marketplace.connect(provider1).registerProvider();
      await marketplace.connect(provider2).registerProvider();
      expect(await marketplace.getProviderCount()).to.equal(2);
      const list = await marketplace.getProviderList();
      expect(list[0]).to.equal(provider1.address);
      expect(list[1]).to.equal(provider2.address);
    });
  });

  describe("Post Signal", function () {
    beforeEach(async function () {
      await marketplace.connect(provider1).registerProvider();
    });

    it("should allow provider to post signal", async function () {
      const entry = BigInt(3000) * BigInt(1e10);
      const tp = BigInt(3010) * BigInt(1e10);
      const sl = BigInt(2990) * BigInt(1e10);
      const leverage = 50000; // 50x

      await expect(marketplace.connect(provider1).postSignal(true, entry, tp, sl, leverage))
        .to.emit(marketplace, "SignalPosted")
        .withArgs(1, provider1.address, true, entry, tp, sl, leverage);

      const core = await marketplace.signalCore(1);
      expect(core.provider).to.equal(provider1.address);
      expect(core.long).to.be.true;
      expect(core.active).to.be.true;
      expect(core.closed).to.be.false;
    });

    it("should not allow non-provider to post signal", async function () {
      const entry = BigInt(3000) * BigInt(1e10);
      await expect(marketplace.connect(follower1).postSignal(true, entry, entry, entry, 50000))
        .to.be.revertedWith("Not a provider");
    });

    it("should reject invalid leverage", async function () {
      const entry = BigInt(3000) * BigInt(1e10);
      await expect(marketplace.connect(provider1).postSignal(true, entry, entry, entry, 500))
        .to.be.revertedWith("Leverage 2x-250x");
    });

    it("should increment signal count per provider", async function () {
      const entry = BigInt(3000) * BigInt(1e10);
      await marketplace.connect(provider1).postSignal(true, entry, entry, entry, 50000);
      await marketplace.connect(provider1).postSignal(false, entry, entry, entry, 50000);
      const p = await marketplace.providers(provider1.address);
      expect(p.signalCount).to.equal(2);
      expect(await marketplace.globalSignalCount()).to.equal(2);
    });
  });

  describe("Copy Signal", function () {
    beforeEach(async function () {
      await marketplace.connect(provider1).registerProvider();
      const entry = BigInt(3000) * BigInt(1e10);
      const tp = BigInt(3010) * BigInt(1e10);
      const sl = BigInt(2990) * BigInt(1e10);
      await marketplace.connect(provider1).postSignal(true, entry, tp, sl, 50000);
    });

    it("should allow follower to copy signal", async function () {
      await usdc.connect(follower1).approve(await marketplace.getAddress(), parseUSDC(100));

      await expect(marketplace.connect(follower1).copySignal(1, parseUSDC(20)))
        .to.emit(marketplace, "TradeCopied")
        .withArgs(follower1.address, 1, parseUSDC(20));

      const pos = await marketplace.positions(follower1.address, 1);
      expect(pos.collateral).to.equal(parseUSDC(20));
    });

    it("should not allow copying below minimum", async function () {
      await usdc.connect(follower1).approve(await marketplace.getAddress(), parseUSDC(100));
      await expect(marketplace.connect(follower1).copySignal(1, parseUSDC(3)))
        .to.be.revertedWith("Min $5 USDC");
    });

    it("should not allow double copy", async function () {
      await usdc.connect(follower1).approve(await marketplace.getAddress(), parseUSDC(100));
      await marketplace.connect(follower1).copySignal(1, parseUSDC(20));
      await expect(marketplace.connect(follower1).copySignal(1, parseUSDC(20)))
        .to.be.revertedWith("Already copied");
    });

    it("should track copier count and volume", async function () {
      await usdc.connect(follower1).approve(await marketplace.getAddress(), parseUSDC(100));
      await usdc.connect(follower2).approve(await marketplace.getAddress(), parseUSDC(100));
      await marketplace.connect(follower1).copySignal(1, parseUSDC(20));
      await marketplace.connect(follower2).copySignal(1, parseUSDC(50));

      const meta = await marketplace.signalMeta(1);
      expect(meta.copierCount).to.equal(2);
      expect(meta.totalCopied).to.equal(parseUSDC(70));
    });
  });

  describe("Close Signal & Claim", function () {
    beforeEach(async function () {
      await marketplace.connect(provider1).registerProvider();
      const entry = BigInt(3000) * BigInt(1e10);
      const tp = BigInt(3010) * BigInt(1e10);
      const sl = BigInt(2990) * BigInt(1e10);
      await marketplace.connect(provider1).postSignal(true, entry, tp, sl, 50000);

      await usdc.connect(follower1).approve(await marketplace.getAddress(), parseUSDC(100));
      await marketplace.connect(follower1).copySignal(1, parseUSDC(100));
    });

    it("should allow provider to close signal", async function () {
      await expect(marketplace.connect(provider1).closeSignal(1, 50)) // +0.50%
        .to.emit(marketplace, "SignalClosed")
        .withArgs(1, provider1.address, 50);

      const core = await marketplace.signalCore(1);
      expect(core.closed).to.be.true;
      expect(core.active).to.be.false;
    });

    it("should allow admin to close signal", async function () {
      await marketplace.connect(owner).closeSignal(1, 50);
      const core = await marketplace.signalCore(1);
      expect(core.closed).to.be.true;
    });

    it("should not allow random to close signal", async function () {
      await expect(marketplace.connect(follower1).closeSignal(1, 50))
        .to.be.revertedWith("Not authorized");
    });

    it("should calculate correct payout with fee split on profit", async function () {
      // Close with +0.50% price move, 50x leverage = +25% profit
      await marketplace.connect(provider1).closeSignal(1, 50);

      // $100 collateral, +25% profit = $25 profit
      // Provider fee: 15% of $25 = $3.75
      // Platform fee: 5% of $25 = $1.25
      // Payout: $100 + $25 - $3.75 - $1.25 = $120.00

      const balBefore = await usdc.balanceOf(follower1.address);
      await marketplace.connect(follower1).claimProceeds(1);
      const balAfter = await usdc.balanceOf(follower1.address);
      const received = formatUSDC(balAfter - balBefore);

      expect(received).to.equal(120);

      // Check provider fees
      const p = await marketplace.providers(provider1.address);
      expect(formatUSDC(p.feesUnclaimed)).to.equal(3.75);
      expect(formatUSDC(p.totalFeesEarned)).to.equal(3.75);

      // Check platform fees
      expect(formatUSDC(await marketplace.platformFeesCollected())).to.equal(1.25);
    });

    it("should handle loss correctly (no fees)", async function () {
      // Close with -0.30% price move, 50x leverage = -15% loss
      await marketplace.connect(provider1).closeSignal(1, -30);

      // $100 collateral, -15% = $15 loss, payout = $85
      const balBefore = await usdc.balanceOf(follower1.address);
      await marketplace.connect(follower1).claimProceeds(1);
      const balAfter = await usdc.balanceOf(follower1.address);
      const received = formatUSDC(balAfter - balBefore);

      expect(received).to.equal(85);

      // No fees on loss
      const p = await marketplace.providers(provider1.address);
      expect(p.feesUnclaimed).to.equal(0);
      expect(await marketplace.platformFeesCollected()).to.equal(0);
    });

    it("should handle full liquidation", async function () {
      // Close with -2% price move, 50x leverage = -100%
      await marketplace.connect(provider1).closeSignal(1, -200);

      const balBefore = await usdc.balanceOf(follower1.address);
      await marketplace.connect(follower1).claimProceeds(1);
      const balAfter = await usdc.balanceOf(follower1.address);

      expect(balAfter - balBefore).to.equal(0);
    });

    it("should not allow double claim", async function () {
      await marketplace.connect(provider1).closeSignal(1, 50);
      await marketplace.connect(follower1).claimProceeds(1);
      await expect(marketplace.connect(follower1).claimProceeds(1))
        .to.be.revertedWith("Already claimed");
    });
  });

  describe("Follow System", function () {
    beforeEach(async function () {
      await marketplace.connect(provider1).registerProvider();
      await marketplace.connect(provider2).registerProvider();
    });

    it("should allow following a provider", async function () {
      await expect(marketplace.connect(follower1).followProvider(provider1.address, parseUSDC(25)))
        .to.emit(marketplace, "FollowEnabled")
        .withArgs(follower1.address, provider1.address, parseUSDC(25));

      const fc = await marketplace.follows(follower1.address, provider1.address);
      expect(fc.enabled).to.be.true;
      expect(fc.amountPerTrade).to.equal(parseUSDC(25));
    });

    it("should not allow following yourself", async function () {
      await expect(marketplace.connect(provider1).followProvider(provider1.address, parseUSDC(25)))
        .to.be.revertedWith("Cannot follow yourself");
    });

    it("should not allow following non-provider", async function () {
      await expect(marketplace.connect(follower1).followProvider(follower2.address, parseUSDC(25)))
        .to.be.revertedWith("Not a provider");
    });

    it("should allow unfollowing", async function () {
      await marketplace.connect(follower1).followProvider(provider1.address, parseUSDC(25));
      await expect(marketplace.connect(follower1).unfollowProvider(provider1.address))
        .to.emit(marketplace, "FollowDisabled");

      const fc = await marketplace.follows(follower1.address, provider1.address);
      expect(fc.enabled).to.be.false;
    });

    it("should track follower lists", async function () {
      await marketplace.connect(follower1).followProvider(provider1.address, parseUSDC(25));
      await marketplace.connect(follower2).followProvider(provider1.address, parseUSDC(50));
      await marketplace.connect(follower1).followProvider(provider2.address, parseUSDC(10));

      const p1followers = await marketplace.getProviderFollowers(provider1.address);
      expect(p1followers.length).to.equal(2);

      const f1providers = await marketplace.getFollowerProviders(follower1.address);
      expect(f1providers.length).to.equal(2);
    });

    it("should allow following multiple providers", async function () {
      await marketplace.connect(follower1).followProvider(provider1.address, parseUSDC(25));
      await marketplace.connect(follower1).followProvider(provider2.address, parseUSDC(50));

      const providers = await marketplace.getFollowerProviders(follower1.address);
      expect(providers.length).to.equal(2);
    });
  });

  describe("Auto-Copy (executeCopyFor)", function () {
    beforeEach(async function () {
      await marketplace.connect(provider1).registerProvider();
      await marketplace.connect(follower1).followProvider(provider1.address, parseUSDC(20));
      await usdc.connect(follower1).approve(await marketplace.getAddress(), hre.ethers.MaxUint256);

      const entry = BigInt(3000) * BigInt(1e10);
      await marketplace.connect(provider1).postSignal(true, entry, entry, entry, 50000);
    });

    it("should auto-copy for follower", async function () {
      await expect(marketplace.connect(owner).executeCopyFor(follower1.address, 1))
        .to.emit(marketplace, "TradeCopied")
        .withArgs(follower1.address, 1, parseUSDC(20));
    });

    it("should skip if not following provider", async function () {
      await expect(marketplace.connect(owner).executeCopyFor(follower2.address, 1))
        .to.be.revertedWith("Not following this provider");
    });

    it("should skip silently if insufficient balance", async function () {
      // Drain follower's USDC
      const bal = await usdc.balanceOf(follower1.address);
      await usdc.connect(follower1).transfer(owner.address, bal);

      // Should not revert, just skip
      await marketplace.connect(owner).executeCopyFor(follower1.address, 1);
      const pos = await marketplace.positions(follower1.address, 1);
      expect(pos.collateral).to.equal(0); // not copied
    });
  });

  describe("Fee Claims", function () {
    beforeEach(async function () {
      await marketplace.connect(provider1).registerProvider();
      const entry = BigInt(3000) * BigInt(1e10);
      await marketplace.connect(provider1).postSignal(true, entry, entry, entry, 50000);

      await usdc.connect(follower1).approve(await marketplace.getAddress(), parseUSDC(200));
      await marketplace.connect(follower1).copySignal(1, parseUSDC(100));

      // Close with profit
      await marketplace.connect(provider1).closeSignal(1, 50); // +25% with 50x
      await marketplace.connect(follower1).claimProceeds(1);
    });

    it("should allow provider to claim fees", async function () {
      const balBefore = await usdc.balanceOf(provider1.address);
      await marketplace.connect(provider1).claimProviderFees();
      const balAfter = await usdc.balanceOf(provider1.address);

      expect(formatUSDC(balAfter - balBefore)).to.equal(3.75); // 15% of $25
    });

    it("should allow admin to withdraw platform fees", async function () {
      const balBefore = await usdc.balanceOf(owner.address);
      await marketplace.connect(owner).withdrawPlatformFees();
      const balAfter = await usdc.balanceOf(owner.address);

      expect(formatUSDC(balAfter - balBefore)).to.equal(1.25); // 5% of $25
    });

    it("should reset unclaimed after claim", async function () {
      await marketplace.connect(provider1).claimProviderFees();
      const p = await marketplace.providers(provider1.address);
      expect(p.feesUnclaimed).to.equal(0);
      expect(formatUSDC(p.totalFeesEarned)).to.equal(3.75);
    });
  });

  describe("Cancel Signal", function () {
    beforeEach(async function () {
      await marketplace.connect(provider1).registerProvider();
      const entry = BigInt(3000) * BigInt(1e10);
      await marketplace.connect(provider1).postSignal(true, entry, entry, entry, 50000);
    });

    it("should allow provider to cancel", async function () {
      await expect(marketplace.connect(provider1).cancelSignal(1))
        .to.emit(marketplace, "SignalCancelled");
      const core = await marketplace.signalCore(1);
      expect(core.closed).to.be.true;
      expect(core.resultPct).to.equal(0);
    });

    it("should allow claiming after cancel (0% result = return collateral)", async function () {
      await usdc.connect(follower1).approve(await marketplace.getAddress(), parseUSDC(100));
      await marketplace.connect(follower1).copySignal(1, parseUSDC(50));
      await marketplace.connect(provider1).cancelSignal(1);

      const balBefore = await usdc.balanceOf(follower1.address);
      await marketplace.connect(follower1).claimProceeds(1);
      const balAfter = await usdc.balanceOf(follower1.address);

      expect(formatUSDC(balAfter - balBefore)).to.equal(50); // full refund
    });
  });

  describe("Pause", function () {
    it("should block signals when paused", async function () {
      await marketplace.connect(provider1).registerProvider();
      await marketplace.connect(owner).setPaused(true);
      const entry = BigInt(3000) * BigInt(1e10);
      await expect(marketplace.connect(provider1).postSignal(true, entry, entry, entry, 50000))
        .to.be.revertedWith("Paused");
    });
  });

  describe("Emergency Withdraw", function () {
    it("should allow emergency withdraw after 7 days", async function () {
      await marketplace.connect(provider1).registerProvider();
      const entry = BigInt(3000) * BigInt(1e10);
      await marketplace.connect(provider1).postSignal(true, entry, entry, entry, 50000);

      await usdc.connect(follower1).approve(await marketplace.getAddress(), parseUSDC(100));
      await marketplace.connect(follower1).copySignal(1, parseUSDC(50));

      // Fast forward 7 days + 1
      await hre.network.provider.send("evm_increaseTime", [7 * 24 * 3600 + 1]);
      await hre.network.provider.send("evm_mine");

      const balBefore = await usdc.balanceOf(follower1.address);
      await marketplace.connect(follower1).emergencyWithdraw(1);
      const balAfter = await usdc.balanceOf(follower1.address);

      expect(formatUSDC(balAfter - balBefore)).to.equal(50);
    });

    it("should reject emergency withdraw before 7 days", async function () {
      await marketplace.connect(provider1).registerProvider();
      const entry = BigInt(3000) * BigInt(1e10);
      await marketplace.connect(provider1).postSignal(true, entry, entry, entry, 50000);

      await usdc.connect(follower1).approve(await marketplace.getAddress(), parseUSDC(100));
      await marketplace.connect(follower1).copySignal(1, parseUSDC(50));

      await expect(marketplace.connect(follower1).emergencyWithdraw(1))
        .to.be.revertedWith("Too early");
    });
  });
});
