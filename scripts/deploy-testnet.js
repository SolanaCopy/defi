const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

  // 1. Deploy MockUSDC
  console.log("1/3 Deploying MockUSDC...");
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy();
  await usdc.waitForDeployment();
  const usdcAddr = await usdc.getAddress();
  console.log("   MockUSDC:", usdcAddr);

  // Mint 1M USDC to deployer for testing
  await usdc.mint(deployer.address, 1000000n * 10n ** 6n);
  console.log("   Minted 1,000,000 USDC to deployer\n");

  // 2. Deploy MockDiamond (simulates gTrade)
  console.log("2/3 Deploying MockDiamond (gTrade simulator)...");
  const MockDiamond = await ethers.getContractFactory("MockDiamond");
  const diamond = await MockDiamond.deploy();
  await diamond.waitForDeployment();
  const diamondAddr = await diamond.getAddress();
  console.log("   MockDiamond:", diamondAddr, "\n");

  // 3. Deploy GoldCopyTrader
  console.log("3/3 Deploying GoldCopyTrader...");
  const Trader = await ethers.getContractFactory("GoldCopyTrader");
  const trader = await Trader.deploy(usdcAddr, diamondAddr);
  await trader.waitForDeployment();
  const traderAddr = await trader.getAddress();
  console.log("   GoldCopyTrader:", traderAddr, "\n");

  // 4. Fund contract with USDC for payouts
  console.log("Funding contract with 500,000 USDC for payouts...");
  await usdc.approve(traderAddr, ethers.MaxUint256);
  await usdc.transfer(traderAddr, 500000n * 10n ** 6n);
  console.log("Done!\n");

  // Summary
  console.log("=".repeat(50));
  console.log("DEPLOYMENT COMPLETE");
  console.log("=".repeat(50));
  console.log("Network:         Arbitrum Sepolia");
  console.log("MockUSDC:       ", usdcAddr);
  console.log("MockDiamond:    ", diamondAddr);
  console.log("GoldCopyTrader: ", traderAddr);
  console.log("=".repeat(50));
  console.log("\nUpdate these in your App.js:");
  console.log(`  CONTRACT_ADDRESS = "${traderAddr}";`);
  console.log(`  USDC_ADDRESS     = "${usdcAddr}";`);
  console.log(`  ARBITRUM_CHAIN_ID = "0x66eee"; // 421614 (Arbitrum Sepolia)`);
  console.log("\nTo mint test USDC for users, call:");
  console.log(`  MockUSDC.mint(userAddress, amount)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
