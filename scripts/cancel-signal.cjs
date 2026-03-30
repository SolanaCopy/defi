const { ethers } = require("hardhat");

const GOLD_COPY_TRADER = "0xb09d6B8fA13Cbf757393ECb3E9c616C6BE94cA82";
const ABI = [
  "function cancelSignal(uint256 _id) external",
  "function activeSignalId() view returns (uint256)",
];

async function main() {
  const [admin] = await ethers.getSigners();
  const trader = new ethers.Contract(GOLD_COPY_TRADER, ABI, admin);

  const activeId = await trader.activeSignalId();
  if (activeId === 0n) {
    console.log("No active signal to cancel.");
    return;
  }

  console.log("Cancelling signal", activeId.toString(), "...");
  const tx = await trader.cancelSignal(activeId);
  await tx.wait();
  console.log("Signal cancelled!");
}

main().catch(console.error);
