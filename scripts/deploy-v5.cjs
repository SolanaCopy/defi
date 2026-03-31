const { ethers } = require("hardhat");

const USDC_ADDRESS = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const GTRADE_DIAMOND = "0xFF162c694eAA571f685030649814282eA457f169";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying GoldCopyTraderV5 with:", deployer.address);

  const V5 = await ethers.getContractFactory("GoldCopyTraderV5");
  console.log("Deploying...");

  const contract = await V5.deploy(USDC_ADDRESS, GTRADE_DIAMOND);
  await contract.waitForDeployment();

  const addr = await contract.getAddress();
  console.log("\n✅ GoldCopyTraderV5 deployed at:", addr);
  console.log("Admin:", await contract.admin());
  console.log("\nVerify:");
  console.log(`npx hardhat verify --network arbitrum ${addr} ${USDC_ADDRESS} ${GTRADE_DIAMOND}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
