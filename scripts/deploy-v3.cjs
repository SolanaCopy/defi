const { ethers } = require("hardhat");

const USDC_ADDRESS = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const GTRADE_DIAMOND = "0xFF162c694eAA571f685030649814282eA457f169";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying GoldCopyTraderV3 with:", deployer.address);

  const bal = await ethers.provider.getBalance(deployer.address);
  console.log("ETH balance:", ethers.formatEther(bal));

  if (bal === 0n) {
    console.error("No ETH for gas! Send some ETH to", deployer.address);
    process.exit(1);
  }

  const V3 = await ethers.getContractFactory("GoldCopyTraderV3");
  console.log("Deploying...");

  const contract = await V3.deploy(USDC_ADDRESS, GTRADE_DIAMOND);
  await contract.waitForDeployment();

  const addr = await contract.getAddress();
  console.log("\n✅ GoldCopyTraderV3 deployed at:", addr);
  console.log("Admin:", await contract.admin());
  console.log("USDC:", USDC_ADDRESS);
  console.log("gTrade Diamond:", GTRADE_DIAMOND);
  console.log("\nUpdate .env:");
  console.log(`GOLD_COPY_TRADER_ADDRESS=${addr}`);
  console.log("\nVerify on Arbiscan:");
  console.log(`npx hardhat verify --network arbitrum ${addr} ${USDC_ADDRESS} ${GTRADE_DIAMOND}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
