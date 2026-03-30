const { ethers } = require("hardhat");

const USDC_ADDRESS = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const GOLD_COPY_TRADER = "0xb09d6B8fA13Cbf757393ECb3E9c616C6BE94cA82";

async function main() {
  const [admin] = await ethers.getSigners();
  const usdc = new ethers.Contract(USDC_ADDRESS, [
    "function transfer(address to, uint256 amount) external returns (bool)",
    "function balanceOf(address) view returns (uint256)",
  ], admin);

  console.log("Wallet USDC:", ethers.formatUnits(await usdc.balanceOf(admin.address), 6));
  console.log("Contract USDC:", ethers.formatUnits(await usdc.balanceOf(GOLD_COPY_TRADER), 6));

  // Send 0.12 USDC to contract
  console.log("\nSending 0.12 USDC to contract...");
  const tx1 = await usdc.transfer(GOLD_COPY_TRADER, 120000n); // 0.12 USDC
  await tx1.wait();
  await new Promise(r => setTimeout(r, 3000));

  console.log("Contract USDC:", ethers.formatUnits(await usdc.balanceOf(GOLD_COPY_TRADER), 6));

  // Now claim
  console.log("\nClaiming signal #1...");
  const trader = new ethers.Contract(GOLD_COPY_TRADER, [
    "function claimProceeds(uint256 _id) external",
  ], admin);

  const tx2 = await trader.claimProceeds(1);
  await tx2.wait();
  console.log("Claimed!");

  console.log("\nFinal wallet USDC:", ethers.formatUnits(await usdc.balanceOf(admin.address), 6));
  console.log("Final contract USDC:", ethers.formatUnits(await usdc.balanceOf(GOLD_COPY_TRADER), 6));
  console.log("Final ETH:", ethers.formatEther(await ethers.provider.getBalance(admin.address)));
}

main().catch(console.error);
