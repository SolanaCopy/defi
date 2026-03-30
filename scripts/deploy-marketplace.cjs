require("dotenv").config();
const hre = require("hardhat");

async function main() {
  const USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
  const GTRADE_DIAMOND = "0xFF162c694eAA571f685030649814282eA457f169";

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying StrategyMarketplace with account:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("ETH balance:", hre.ethers.formatEther(balance), "ETH");

  const Contract = await hre.ethers.getContractFactory("StrategyMarketplace");
  const contract = await Contract.deploy(USDC, GTRADE_DIAMOND);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("StrategyMarketplace deployed to:", address);

  // Register deployer as first provider
  const tx = await contract.registerProvider();
  await tx.wait();
  console.log("Admin registered as provider");

  // Verify
  const admin = await contract.admin();
  const providerCount = await contract.getProviderCount();
  const provider = await contract.providers(deployer.address);
  console.log("Admin:", admin);
  console.log("Provider count:", Number(providerCount));
  console.log("Provider registered:", provider.registered);
  console.log("\nDone! Update CONTRACT_ADDRESS in App.jsx and bot to:", address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
