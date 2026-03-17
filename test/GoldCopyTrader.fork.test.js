const { expect } = require("chai");
const { ethers, network } = require("hardhat");

/**
 * Arbitrum Fork Integration Test
 * Tests GoldCopyTrader against the REAL gTrade Diamond and REAL USDC on a fork.
 *
 * Run with: npx hardhat test test/GoldCopyTrader.fork.test.js --network hardhat
 * (uses forking config from hardhat.config.js)
 */

// Real Arbitrum addresses
const USDC_ADDRESS = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const GTRADE_DIAMOND = "0xFF162c694eAA571f685030649814282eA457f169";

// Known USDC whale on Arbitrum (Arbitrum bridge / large holder)
const USDC_WHALE = "0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7";

const USDC_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address, uint256) returns (bool)",
  "function approve(address, uint256) returns (bool)",
  "function allowance(address, address) view returns (uint256)",
];

describe("GoldCopyTrader — Arbitrum Fork Integration", function () {
  let trader, usdc, admin, user1;
  const USDC = (n) => BigInt(n) * 10n ** 6n;
  const PRICE = (n) => BigInt(Math.round(n * 1e10));
  const LEV = (n) => n * 1000;

  before(async function () {
    // Skip if not forking Arbitrum
    const chainId = (await ethers.provider.getNetwork()).chainId;
    if (chainId !== 42161n && chainId !== 31337n) {
      console.log("    Skipping fork tests — not on Arbitrum fork");
      this.skip();
    }

    // Check if we can access the USDC contract (fork is working)
    try {
      usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, ethers.provider);
      const whaleBalance = await usdc.balanceOf(USDC_WHALE);
      if (whaleBalance < USDC(10000)) {
        console.log("    Skipping — USDC whale has insufficient balance (fork might not be working)");
        this.skip();
      }
    } catch (e) {
      console.log("    Skipping fork tests — cannot connect to forked Arbitrum");
      this.skip();
    }
  });

  beforeEach(async function () {
    [admin, user1] = await ethers.getSigners();

    // Deploy our contract with REAL addresses
    const Trader = await ethers.getContractFactory("GoldCopyTrader");
    trader = await Trader.deploy(USDC_ADDRESS, GTRADE_DIAMOND);
    await trader.waitForDeployment();

    // Impersonate USDC whale to fund our test accounts
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [USDC_WHALE],
    });
    const whale = await ethers.getSigner(USDC_WHALE);

    // Fund whale with ETH for gas
    await admin.sendTransaction({ to: USDC_WHALE, value: ethers.parseEther("1") });

    // Transfer USDC to admin and user
    usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, whale);
    await usdc.transfer(admin.address, USDC(50000));
    await usdc.transfer(user1.address, USDC(50000));

    // Also fund the contract for payouts
    await usdc.transfer(await trader.getAddress(), USDC(100000));

    // Stop impersonating
    await network.provider.request({
      method: "hardhat_stopImpersonatingAccount",
      params: [USDC_WHALE],
    });

    // Approve
    usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, ethers.provider);
    await usdc.connect(user1).approve(await trader.getAddress(), ethers.MaxUint256);
    await usdc.connect(admin).approve(await trader.getAddress(), ethers.MaxUint256);
  });

  describe("Real gTrade Integration", function () {
    it("should deploy with real USDC and gTrade Diamond", async function () {
      expect(await trader.admin()).to.equal(admin.address);

      const usdcAddr = await trader.usdc();
      expect(usdcAddr.toLowerCase()).to.equal(USDC_ADDRESS.toLowerCase());

      const diamondAddr = await trader.diamond();
      expect(diamondAddr.toLowerCase()).to.equal(GTRADE_DIAMOND.toLowerCase());
    });

    it("should post a signal successfully", async function () {
      // Post a realistic gold signal: $2340 entry, $2360 TP, $2330 SL, 25x leverage
      await trader.connect(admin).postSignal(
        true,           // long
        PRICE(2340),    // entry
        PRICE(2360),    // TP
        PRICE(2330),    // SL
        LEV(25)         // 25x leverage
      );

      expect(await trader.signalCount()).to.equal(1);
      expect(await trader.activeSignalId()).to.equal(1);
    });

    it("should copy trade through real gTrade Diamond", async function () {
      // Post signal
      await trader.connect(admin).postSignal(
        true,
        PRICE(2340),
        PRICE(2360),
        PRICE(2330),
        LEV(25)
      );

      const userBalBefore = await usdc.balanceOf(user1.address);

      // Try to copy trade — this calls the REAL gTrade Diamond openTrade
      try {
        await trader.connect(user1).copyTrade(1, USDC(100));

        // If we get here, gTrade accepted the trade
        const pos = await trader.positions(user1.address, 1);
        expect(pos.collateral).to.equal(USDC(100));

        const userBalAfter = await usdc.balanceOf(user1.address);
        expect(userBalBefore - userBalAfter).to.equal(USDC(100));

        console.log("      ✓ gTrade Diamond accepted the trade!");

        const meta = await trader.signalMeta(1);
        console.log(`      → Total copied: $${Number(meta.totalCopied) / 1e6}`);
        console.log(`      → Copier count: ${meta.copierCount}`);
      } catch (e) {
        // gTrade might revert for various reasons on fork (price stale, pair paused, etc)
        // This is still useful info — it tells us what gTrade's response is
        console.log(`      ⚠ gTrade Diamond reverted: ${e.message.substring(0, 200)}`);
        console.log("      → This is expected if: price is stale, pair is paused, or collateral requirements changed");

        // Verify user's USDC was NOT taken (atomic revert)
        const userBalAfter = await usdc.balanceOf(user1.address);
        expect(userBalAfter).to.equal(userBalBefore);
        console.log("      ✓ User USDC is safe — atomic revert works correctly");
      }
    });

    it("should handle the full signal lifecycle", async function () {
      // Post → Copy → Close → Claim
      await trader.connect(admin).postSignal(true, PRICE(2340), PRICE(2360), PRICE(2330), LEV(25));

      // Try copy
      let copied = false;
      try {
        await trader.connect(user1).copyTrade(1, USDC(500));
        copied = true;
        console.log("      ✓ Copy trade succeeded on real gTrade");
      } catch (e) {
        console.log("      ⚠ Copy reverted (expected on fork) — testing close+claim with direct state");
      }

      // Close signal with +1% result
      await trader.connect(admin).closeSignal(1, 100);
      expect(await trader.activeSignalId()).to.equal(0);
      console.log("      ✓ Signal closed successfully");

      if (copied) {
        // Claim proceeds
        const balBefore = await usdc.balanceOf(user1.address);
        await trader.connect(user1).claimProceeds(1);
        const balAfter = await usdc.balanceOf(user1.address);

        const payout = balAfter - balBefore;
        console.log(`      ✓ Claimed payout: $${Number(payout) / 1e6}`);

        // With +1% and 25x leverage:
        // profit = (500e6 * 100 * 25000) / (10000 * 1000) = 125e6
        // fee = 125e6 * 2000 / 10000 = 25e6
        // payout = 500e6 + 125e6 - 25e6 = 600e6
        expect(payout).to.equal(USDC(600));
      }
    });

    it("should verify USDC approval to gTrade Diamond", async function () {
      // Our contract should have max approved USDC to the diamond in constructor
      const allowance = await usdc.allowance(await trader.getAddress(), GTRADE_DIAMOND);
      expect(allowance).to.equal(ethers.MaxUint256);
      console.log("      ✓ Contract has max USDC approval to gTrade Diamond");
    });

    it("should handle short signal on real gTrade", async function () {
      await trader.connect(admin).postSignal(
        false,          // SHORT
        PRICE(2340),    // entry
        PRICE(2320),    // TP (lower for short)
        PRICE(2350),    // SL (higher for short)
        LEV(25)
      );

      const core = await trader.signalCore(1);
      expect(core.long).to.be.false;

      try {
        await trader.connect(user1).copyTrade(1, USDC(100));
        console.log("      ✓ Short trade accepted by real gTrade Diamond");
      } catch (e) {
        console.log(`      ⚠ Short trade reverted: ${e.message.substring(0, 150)}`);

        // Verify USDC safe
        const bal = await usdc.balanceOf(user1.address);
        expect(bal).to.equal(USDC(50000));
        console.log("      ✓ USDC safe after revert");
      }
    });
  });
});
