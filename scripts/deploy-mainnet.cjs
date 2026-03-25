const { ethers } = require("hardhat");

// Arbitrum One mainnet addresses
const USDC_ADDRESS = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const GTRADE_DIAMOND = "0xFF162c694eAA571f685030649814282eA457f169";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("ETH Balance:", ethers.formatEther(balance), "ETH\n");

  if (balance === 0n) {
    throw new Error("No ETH for gas fees!");
  }

  // Deploy GoldCopyTrader with real USDC + gTrade Diamond
  console.log("Deploying GoldCopyTrader on Arbitrum One...");
  console.log("  USDC:", USDC_ADDRESS);
  console.log("  gTrade Diamond:", GTRADE_DIAMOND);

  const Trader = await ethers.getContractFactory("GoldCopyTrader");
  const trader = await Trader.deploy(USDC_ADDRESS, GTRADE_DIAMOND);
  await trader.waitForDeployment();
  const traderAddr = await trader.getAddress();

  console.log("\n" + "=".repeat(50));
  console.log("DEPLOYMENT COMPLETE");
  console.log("=".repeat(50));
  console.log("Network:         Arbitrum One (mainnet)");
  console.log("GoldCopyTrader: ", traderAddr);
  console.log("Admin:          ", deployer.address);
  console.log("=".repeat(50));
  console.log("\nUpdate your .env:");
  console.log(`  GOLD_COPY_TRADER_ADDRESS=${traderAddr}`);
  console.log("\nUpdate your App.jsx:");
  console.log(`  CONTRACT_ADDRESS = "${traderAddr}";`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
