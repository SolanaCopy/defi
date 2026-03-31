const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("GoldCopyTraderV5", function () {
  let contract, usdc, diamond, admin, user1, user2, user3;
  const entry = BigInt(Math.round(4500 * 1e10));
  const tp = BigInt(Math.round(4520 * 1e10));
  const sl = BigInt(Math.round(4480 * 1e10));
  const USDC = (n) => BigInt(n) * 1000000n;

  beforeEach(async function () {
    [admin, user1, user2, user3] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    usdc = await MockUSDC.deploy();

    const MockDiamond = await ethers.getContractFactory("MockDiamond");
    diamond = await MockDiamond.deploy();

    const V5 = await ethers.getContractFactory("GoldCopyTraderV5");
    contract = await V5.deploy(await usdc.getAddress(), await diamond.getAddress());

    for (const u of [admin, user1, user2, user3]) {
      await usdc.mint(u.address, USDC(10000));
      await usdc.connect(u).approve(await contract.getAddress(), ethers.MaxUint256);
    }
  });

  // ===== BASIC FLOW: post → copy → close → claim =====

  it("full flow: postSignal → copySignal → closeSignal → claimProceeds", async function () {
    await contract.postSignal(true, entry, tp, sl, 25000);
    expect(await contract.activeSignalId()).to.equal(1);

    await contract.connect(user1).copySignal(1, USDC(100));
    const meta = await contract.signalMeta(1);
    expect(meta.totalCopied).to.equal(USDC(100));

    // Simulate gTrade returning profit — mint extra USDC to contract
    await usdc.mint(await contract.getAddress(), USDC(25)); // gTrade profit

    // Close with +1% result (100 basis points)
    await contract.closeSignal(1, 100);
    expect(await contract.activeSignalId()).to.equal(0);

    // Claim: col=100, profit = 100*100*25000/(10000*1000) = 25, fee = 25*2000/10000 = 5, payout = 120
    const before = await usdc.balanceOf(user1.address);
    await contract.connect(user1).claimProceeds(1);
    const after = await usdc.balanceOf(user1.address);
    expect(after - before).to.equal(USDC(120));
  });

  it("loss: no fees charged", async function () {
    await contract.postSignal(true, entry, tp, sl, 25000);
    await contract.connect(user1).copySignal(1, USDC(100));
    await contract.closeSignal(1, -100); // -1%

    // Loss = 100*100*25000/(10000*1000) = 25, payout = 75
    const before = await usdc.balanceOf(user1.address);
    await contract.connect(user1).claimProceeds(1);
    const after = await usdc.balanceOf(user1.address);
    expect(after - before).to.equal(USDC(75));
  });

  // ===== CLAIM FOR =====

  it("claimFor: admin claims for user, payout goes to user", async function () {
    await contract.postSignal(true, entry, tp, sl, 25000);
    await contract.connect(user1).copySignal(1, USDC(200));
    await contract.closeSignal(1, 50); // +0.5%

    const adminBefore = await usdc.balanceOf(admin.address);
    const userBefore = await usdc.balanceOf(user1.address);

    await contract.claimFor(user1.address, 1);

    expect(await usdc.balanceOf(admin.address)).to.equal(adminBefore);
    expect(await usdc.balanceOf(user1.address)).to.be.gt(userBefore);
    expect((await contract.positions(user1.address, 1)).claimed).to.be.true;
  });

  it("claimFor: non-admin blocked", async function () {
    await contract.postSignal(true, entry, tp, sl, 25000);
    await contract.connect(user1).copySignal(1, USDC(100));
    await contract.closeSignal(1, 0);

    await expect(contract.connect(user2).claimFor(user1.address, 1))
      .to.be.revertedWith("Not admin");
  });

  it("claimFor: can't claim twice", async function () {
    await contract.postSignal(true, entry, tp, sl, 25000);
    await contract.connect(user1).copySignal(1, USDC(100));
    await contract.closeSignal(1, 0);

    await contract.claimFor(user1.address, 1);
    await expect(contract.claimFor(user1.address, 1)).to.be.revertedWith("Already claimed");
  });

  it("claimFor: user can't claim after admin claimFor", async function () {
    await contract.postSignal(true, entry, tp, sl, 25000);
    await contract.connect(user1).copySignal(1, USDC(100));
    await contract.closeSignal(1, 0);

    await contract.claimFor(user1.address, 1);
    await expect(contract.connect(user1).claimProceeds(1)).to.be.revertedWith("Already claimed");
  });

  it("claimFor: emits correct event", async function () {
    await contract.postSignal(true, entry, tp, sl, 25000);
    await contract.connect(user1).copySignal(1, USDC(100));
    await contract.closeSignal(1, 0); // breakeven

    await expect(contract.claimFor(user1.address, 1))
      .to.emit(contract, "ProceedsClaimed")
      .withArgs(user1.address, 1, USDC(100), 0);
  });

  it("claimFor: all users after signal close", async function () {
    await contract.postSignal(true, entry, tp, sl, 25000);
    await contract.connect(user1).copySignal(1, USDC(100));
    await contract.connect(user2).copySignal(1, USDC(400));
    await contract.connect(user3).copySignal(1, USDC(50));
    await contract.closeSignal(1, 0);

    await contract.claimFor(user1.address, 1);
    await contract.claimFor(user2.address, 1);
    await contract.claimFor(user3.address, 1);

    expect((await contract.positions(user1.address, 1)).claimed).to.be.true;
    expect((await contract.positions(user2.address, 1)).claimed).to.be.true;
    expect((await contract.positions(user3.address, 1)).claimed).to.be.true;
  });

  // ===== AUTO-COPY =====

  it("auto-copy: enable, executeCopyFor, close, claimFor cycle", async function () {
    await contract.connect(user1).enableAutoCopy(USDC(200));
    await contract.connect(user2).enableAutoCopy(USDC(100));

    expect((await contract.autoCopy(user1.address)).enabled).to.be.true;
    expect(await contract.getAutoCopyUserCount()).to.equal(2);

    await contract.postSignal(true, entry, tp, sl, 25000);
    await contract.executeCopyFor(user1.address, 1);
    await contract.executeCopyFor(user2.address, 1);

    const meta = await contract.signalMeta(1);
    expect(meta.totalCopied).to.equal(USDC(300));

    await contract.closeSignal(1, 50); // +0.5%

    // ClaimFor both
    await contract.claimFor(user1.address, 1);
    await contract.claimFor(user2.address, 1);

    // USDC back in wallets — ready for next signal
    expect(await usdc.balanceOf(user1.address)).to.be.gte(USDC(200));
    expect(await usdc.balanceOf(user2.address)).to.be.gte(USDC(100));
  });

  it("auto-copy: 3 signals back-to-back with claimFor", async function () {
    await contract.connect(user1).enableAutoCopy(USDC(100));
    await contract.connect(user2).enableAutoCopy(USDC(50));

    // Signal 1: win
    await contract.postSignal(true, entry, tp, sl, 25000);
    await contract.executeCopyFor(user1.address, 1);
    await contract.executeCopyFor(user2.address, 1);
    await contract.closeSignal(1, 50);
    await contract.claimFor(user1.address, 1);
    await contract.claimFor(user2.address, 1);

    // Signal 2: loss
    await contract.postSignal(false, entry, sl, tp, 25000);
    await contract.executeCopyFor(user1.address, 2);
    await contract.executeCopyFor(user2.address, 2);
    await contract.closeSignal(2, -80);
    await contract.claimFor(user1.address, 2);
    await contract.claimFor(user2.address, 2);

    // Signal 3: users still have USDC to trade
    await contract.postSignal(true, entry, tp, sl, 25000);
    await contract.executeCopyFor(user1.address, 3);
    await contract.executeCopyFor(user2.address, 3);

    expect((await contract.signalMeta(3)).copierCount).to.equal(2);
  });

  it("auto-copy: disable stops copying", async function () {
    await contract.connect(user1).enableAutoCopy(USDC(100));
    await contract.connect(user1).disableAutoCopy();

    await contract.postSignal(true, entry, tp, sl, 25000);
    await expect(contract.executeCopyFor(user1.address, 1))
      .to.be.revertedWith("Auto-copy not enabled");
  });

  // ===== SECURITY =====

  it("can't copy twice", async function () {
    await contract.postSignal(true, entry, tp, sl, 25000);
    await contract.connect(user1).copySignal(1, USDC(100));
    await expect(contract.connect(user1).copySignal(1, USDC(100)))
      .to.be.revertedWith("Already copied");
  });

  it("can't claim before close", async function () {
    await contract.postSignal(true, entry, tp, sl, 25000);
    await contract.connect(user1).copySignal(1, USDC(100));
    await expect(contract.connect(user1).claimProceeds(1))
      .to.be.revertedWith("Not closed");
  });

  it("non-admin can't post signal", async function () {
    await expect(contract.connect(user1).postSignal(true, entry, tp, sl, 25000))
      .to.be.revertedWith("Not admin");
  });

  it("non-admin can't close signal", async function () {
    await contract.postSignal(true, entry, tp, sl, 25000);
    await expect(contract.connect(user1).closeSignal(1, 0))
      .to.be.revertedWith("Not admin");
  });

  it("can't post while active", async function () {
    await contract.postSignal(true, entry, tp, sl, 25000);
    await expect(contract.postSignal(true, entry, tp, sl, 25000))
      .to.be.revertedWith("Close active signal first");
  });

  it("emergency withdraw after 7 days", async function () {
    await contract.postSignal(true, entry, tp, sl, 25000);
    await contract.connect(user1).copySignal(1, USDC(500));

    await expect(contract.connect(user1).emergencyWithdraw(1))
      .to.be.revertedWith("Too early");

    await ethers.provider.send("evm_increaseTime", [7 * 86400 + 1]);
    await ethers.provider.send("evm_mine", []);

    const before = await usdc.balanceOf(user1.address);
    await contract.connect(user1).emergencyWithdraw(1);
    const after = await usdc.balanceOf(user1.address);
    expect(after - before).to.equal(USDC(500));
  });

  // ===== ABI COMPATIBILITY (same as old contract) =====

  it("signalCore returns same format as old contract", async function () {
    await contract.postSignal(true, entry, tp, sl, 25000);
    const core = await contract.signalCore(1);
    expect(core.long).to.be.true;
    expect(core.active).to.be.true;
    expect(core.closed).to.be.false;
    expect(core.entryPrice).to.equal(entry);
    expect(core.leverage).to.equal(25000);
  });

  it("signalMeta returns same format as old contract", async function () {
    await contract.postSignal(true, entry, tp, sl, 25000);
    await contract.connect(user1).copySignal(1, USDC(100));
    const meta = await contract.signalMeta(1);
    expect(meta.totalCopied).to.equal(USDC(100));
    expect(meta.copierCount).to.equal(1);
  });

  it("positions returns same format", async function () {
    await contract.postSignal(true, entry, tp, sl, 25000);
    await contract.connect(user1).copySignal(1, USDC(100));
    const pos = await contract.positions(user1.address, 1);
    expect(pos.collateral).to.equal(USDC(100));
    expect(pos.claimed).to.be.false;
  });

  it("autoCopy returns same format", async function () {
    await contract.connect(user1).enableAutoCopy(USDC(200));
    const config = await contract.autoCopy(user1.address);
    expect(config.amount).to.equal(USDC(200));
    expect(config.enabled).to.be.true;
  });
});
