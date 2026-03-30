const { ethers } = require("hardhat");

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Address:", signer.address);
  console.log("ETH:", ethers.formatEther(await ethers.provider.getBalance(signer.address)));

  // Check USDC balance
  const usdc = await ethers.getContractAt("contracts/GoldCopyTrader.sol:IERC20", "0xaf88d065e77c8cC2239327C5EDb3A432268e5831");
  const usdcBal = await usdc.balanceOf(signer.address);
  console.log("USDC:", ethers.formatUnits(usdcBal, 6));
}

main().catch(console.error);
