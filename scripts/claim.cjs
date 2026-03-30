const { ethers } = require("hardhat");

const USDC_ADDRESS = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const GOLD_COPY_TRADER = "0xb09d6B8fA13Cbf757393ECb3E9c616C6BE94cA82";

async function main() {
  const [admin] = await ethers.getSigners();
  const usdc = new ethers.Contract(USDC_ADDRESS, [
    "function balanceOf(address) view returns (uint256)",
  ], admin);

  const contractBal = await usdc.balanceOf(GOLD_COPY_TRADER);
  const walletBal = await usdc.balanceOf(admin.address);
  console.log("Contract USDC:", ethers.formatUnits(contractBal, 6));
  console.log("Wallet USDC:", ethers.formatUnits(walletBal, 6));
  console.log("ETH:", ethers.formatEther(await ethers.provider.getBalance(admin.address)));

  if (contractBal < 12800000n) {
    console.log("\nContract needs at least 12.8 USDC, has", ethers.formatUnits(contractBal, 6));
    console.log("Still need:", ethers.formatUnits(12800000n - contractBal, 6), "USDC");
    return;
  }

  console.log("\nClaiming proceeds for signal #1...");
  const trader = new ethers.Contract(GOLD_COPY_TRADER, [
    "function claimProceeds(uint256 _id) external",
  ], admin);

  const tx = await trader.claimProceeds(1);
  await tx.wait();
  console.log("Claimed!");

  console.log("Wallet USDC:", ethers.formatUnits(await usdc.balanceOf(admin.address), 6));
  console.log("Contract USDC:", ethers.formatUnits(await usdc.balanceOf(GOLD_COPY_TRADER), 6));
}

main().catch(console.error);
