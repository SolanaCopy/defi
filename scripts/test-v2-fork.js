import { ethers } from "ethers";
import { readFileSync } from "fs";

const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
const USDC_ADDR = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const DIAMOND = "0xFF162c694eAA571f685030649814282eA457f169";

// Use fresh Hardhat accounts (no nonce issues)
const keys = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
];

const artifact = JSON.parse(readFileSync("artifacts/contracts/GoldCopyTraderV2.sol/GoldCopyTraderV2.json", "utf8"));
const uAbi = ["function approve(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"];

const entry = BigInt(Math.round(4390 * 1e10));
const tp = BigInt(Math.round(4430 * 1e10));
const sl = BigInt(Math.round(4370 * 1e10));

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log("PASSED: " + name);
  } catch (e) {
    failed++;
    console.log("FAILED: " + name + " — " + (e.reason || e.shortMessage || e.message).substring(0, 120));
  }
}

async function freshDeploy() {
  const admin = new ethers.Wallet(keys[0], provider);
  const user1 = new ethers.Wallet(keys[1], provider);
  const user2 = new ethers.Wallet(keys[2], provider);

  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, admin);
  const contract = await factory.deploy(USDC_ADDR, DIAMOND);
  await contract.waitForDeployment();
  const addr = await contract.getAddress();

  // Mint USDC via storage slot
  async function setUSDC(address, amount) {
    const slot = ethers.solidityPackedKeccak256(["uint256", "uint256"], [address, 9]);
    await provider.send("hardhat_setStorageAt", [USDC_ADDR, slot, ethers.zeroPadValue(ethers.toBeHex(amount), 32)]);
  }
  await setUSDC(user1.address, 10000000000n); // 10,000 USDC
  await setUSDC(user2.address, 10000000000n);
  await setUSDC(admin.address, 10000000000n);

  const c = new ethers.Contract(addr, artifact.abi, admin);
  const c1 = new ethers.Contract(addr, artifact.abi, user1);
  const c2 = new ethers.Contract(addr, artifact.abi, user2);

  // Approve
  const u1 = new ethers.Contract(USDC_ADDR, uAbi, user1);
  const u2 = new ethers.Contract(USDC_ADDR, uAbi, user2);
  const uA = new ethers.Contract(USDC_ADDR, uAbi, admin);
  await (await u1.approve(addr, ethers.MaxUint256)).wait();
  await (await u2.approve(addr, ethers.MaxUint256)).wait();
  await (await uA.approve(addr, ethers.MaxUint256)).wait();

  return { admin, user1, user2, c, c1, c2, u1, u2, uA, addr };
}

async function main() {
  console.log("Deploying fresh contract for each test...\n");

  // TEST 1: Deposit + Cancel + Claim (full refund)
  await test("Deposit + Cancel + Claim", async () => {
    const { c, c1, c2, u1, u2, user1, user2 } = await freshDeploy();
    await (await c.postSignal(true, entry, tp, sl, 50000)).wait();
    await (await c1.deposit(1000000000n)).wait();
    await (await c2.deposit(500000000n)).wait();
    await (await c.cancelSignal()).wait();

    const p1 = Number(await c.getExpectedPayout(user1.address, 1)) / 1e6;
    const p2 = Number(await c.getExpectedPayout(user2.address, 1)) / 1e6;
    if (p1 !== 1000 || p2 !== 500) throw new Error("Wrong payouts: " + p1 + ", " + p2);

    await (await c1.claim(1)).wait();
    await (await c2.claim(1)).wait();

    const b1 = Number(await u1.balanceOf(user1.address)) / 1e6;
    const b2 = Number(await u2.balanceOf(user2.address)) / 1e6;
    if (b1 !== 10000 || b2 !== 10000) throw new Error("Wrong balances: " + b1 + ", " + b2);
  });

  // TEST 2: WithdrawDeposit
  await test("WithdrawDeposit", async () => {
    const { c, c1, u1, user1 } = await freshDeploy();
    await (await c.postSignal(true, entry, tp, sl, 50000)).wait();
    await (await c1.deposit(500000000n)).wait();

    const before = Number(await u1.balanceOf(user1.address)) / 1e6;
    await (await c1.withdrawDeposit(1)).wait();
    const after = Number(await u1.balanceOf(user1.address)) / 1e6;

    if (after - before !== 500) throw new Error("Didn't get 500 back: " + (after - before));
    await (await c.cancelSignal()).wait();
  });

  // TEST 3: User Cancel Expired Signal
  await test("User Cancel Expired Signal", async () => {
    const { c, c1, u1, user1 } = await freshDeploy();
    await (await c.postSignal(true, entry, tp, sl, 50000)).wait();
    await (await c1.deposit(300000000n)).wait();

    await provider.send("evm_increaseTime", [90000]); // 25 hours
    await provider.send("evm_mine", []);

    await (await c1.userCancelExpiredSignal(1)).wait();
    await (await c1.claim(1)).wait();

    const bal = Number(await u1.balanceOf(user1.address)) / 1e6;
    if (bal !== 10000) throw new Error("Wrong balance: " + bal);
  });

  // TEST 4: TP/SL Validation
  await test("TP/SL Validation (LONG: TP must > entry > SL)", async () => {
    const { c } = await freshDeploy();
    try {
      await (await c.postSignal(true, entry, sl, tp, 50000)).wait(); // wrong order
      throw new Error("Should have reverted");
    } catch (e) {
      if (!e.reason?.includes("Long: TP>entry>SL") && !e.shortMessage?.includes("Long: TP>entry>SL")) {
        if (e.message === "Should have reverted") throw e;
      }
    }
  });

  // TEST 5: SHORT TP/SL Validation
  await test("TP/SL Validation (SHORT: TP must < entry < SL)", async () => {
    const { c } = await freshDeploy();
    try {
      await (await c.postSignal(false, entry, tp, sl, 50000)).wait(); // wrong for SHORT
      throw new Error("Should have reverted");
    } catch (e) {
      if (!e.reason?.includes("Short") && !e.shortMessage?.includes("Short")) {
        if (e.message === "Should have reverted") throw e;
      }
    }
    // Correct SHORT should work
    await (await c.postSignal(false, entry, sl, tp, 50000)).wait();
  });

  // TEST 6: Admin blocked from deposit()
  await test("Admin blocked from deposit()", async () => {
    const { c } = await freshDeploy();
    await (await c.postSignal(true, entry, tp, sl, 50000)).wait();
    try {
      await (await c.deposit(100000000n)).wait();
      throw new Error("Should have reverted");
    } catch (e) {
      if (e.message === "Should have reverted") throw e;
    }
  });

  // TEST 7: Double deposit blocked
  await test("Double deposit blocked", async () => {
    const { c, c1 } = await freshDeploy();
    await (await c.postSignal(true, entry, tp, sl, 50000)).wait();
    await (await c1.deposit(100000000n)).wait();
    try {
      await (await c1.deposit(100000000n)).wait();
      throw new Error("Should have reverted");
    } catch (e) {
      if (e.message === "Should have reverted") throw e;
    }
  });

  // TEST 8: Min deposit enforced
  await test("Min deposit enforced (< 5 USDC blocked)", async () => {
    const { c, c1 } = await freshDeploy();
    await (await c.postSignal(true, entry, tp, sl, 50000)).wait();
    try {
      await (await c1.deposit(1000000n)).wait(); // 1 USDC
      throw new Error("Should have reverted");
    } catch (e) {
      if (e.message === "Should have reverted") throw e;
    }
  });

  // TEST 9: Max deposit enforced
  await test("Max deposit enforced (> 50000 USDC blocked)", async () => {
    const { c, c1, user1 } = await freshDeploy();
    // Give user enough
    const slot = ethers.solidityPackedKeccak256(["uint256", "uint256"], [user1.address, 9]);
    await provider.send("hardhat_setStorageAt", [USDC_ADDR, slot, ethers.zeroPadValue(ethers.toBeHex(100000000000n), 32)]);

    await (await c.postSignal(true, entry, tp, sl, 50000)).wait();
    try {
      await (await c1.deposit(60000000000n)).wait(); // 60000 USDC
      throw new Error("Should have reverted");
    } catch (e) {
      if (e.message === "Should have reverted") throw e;
    }
  });

  // TEST 10: AdminDeposit + AdminWithdrawDeposit
  await test("AdminDeposit + AdminWithdrawDeposit", async () => {
    const { c, uA, admin, addr } = await freshDeploy();
    const usdcCheck = new ethers.Contract(USDC_ADDR, uAbi, admin);

    await (await c.adminDeposit(1000000000n)).wait();
    let contractBal = Number(await usdcCheck.balanceOf(addr)) / 1e6;
    if (contractBal !== 1000) throw new Error("Contract should have 1000: " + contractBal);

    await (await c.adminWithdrawDeposit(1000000000n)).wait();
    contractBal = Number(await usdcCheck.balanceOf(addr)) / 1e6;
    if (contractBal !== 0) throw new Error("Contract should have 0: " + contractBal);
  });

  // TEST 11: Can't close active signal before posting new one
  await test("Only one active signal at a time", async () => {
    const { c } = await freshDeploy();
    await (await c.postSignal(true, entry, tp, sl, 50000)).wait();
    try {
      await (await c.postSignal(true, entry, tp, sl, 50000)).wait();
      throw new Error("Should have reverted");
    } catch (e) {
      if (e.message === "Should have reverted") throw e;
    }
  });

  // TEST 12: Re-deposit after withdrawDeposit blocked
  await test("Re-deposit after withdrawDeposit blocked", async () => {
    const { c, c1 } = await freshDeploy();
    await (await c.postSignal(true, entry, tp, sl, 50000)).wait();
    await (await c1.deposit(100000000n)).wait();
    await (await c1.withdrawDeposit(1)).wait();
    try {
      await (await c1.deposit(100000000n)).wait();
      throw new Error("Should have reverted");
    } catch (e) {
      if (e.message === "Should have reverted") throw e;
    }
  });

  // TEST 13: Fee percent capped at 20%
  await test("Fee percent max 20%", async () => {
    const { c } = await freshDeploy();
    try {
      await (await c.setFeePercent(3000)).wait(); // 30%
      throw new Error("Should have reverted");
    } catch (e) {
      if (e.message === "Should have reverted") throw e;
    }
    await (await c.setFeePercent(1000)).wait(); // 10% should work
  });

  // TEST 14: Pause blocks deposits
  await test("Pause blocks deposits", async () => {
    const { c, c1 } = await freshDeploy();
    await (await c.postSignal(true, entry, tp, sl, 50000)).wait();
    await (await c.setPaused(true)).wait();
    try {
      await (await c1.deposit(100000000n)).wait();
      throw new Error("Should have reverted");
    } catch (e) {
      if (e.message === "Should have reverted") throw e;
    }
  });

  // TEST 15: Two-step admin transfer
  await test("Two-step admin transfer", async () => {
    const { c, user1 } = await freshDeploy();
    const c1Admin = new ethers.Contract(await c.getAddress(), artifact.abi, user1);

    await (await c.transferAdmin(user1.address)).wait();
    await (await c1Admin.acceptAdmin()).wait();

    const newAdmin = await c.admin();
    if (newAdmin !== user1.address) throw new Error("Admin not transferred");
  });

  // RESULTS
  console.log("\n========================================");
  console.log("  RESULTS: " + passed + "/" + (passed + failed) + " PASSED");
  if (failed === 0) {
    console.log("  ALL TESTS PASSED");
  } else {
    console.log("  " + failed + " TESTS FAILED");
  }
  console.log("========================================");
}

main().catch(console.error);
