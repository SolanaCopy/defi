async function main() {
  const { ethers } = require("hardhat");
  try {
    const usdc = await ethers.getContractAt(
      ["function balanceOf(address) view returns (uint256)"],
      "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"
    );
    const bal = await usdc.balanceOf("0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7");
    console.log("Whale USDC:", ethers.formatUnits(bal, 6));
    console.log("Fork is working!");
  } catch (e) {
    console.log("Fork error:", e.message.slice(0, 300));
  }
}
main();
