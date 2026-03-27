const { ethers } = require("hardhat");
const GOLD_COPY_TRADER = "0xf41d121DB5841767f403a4Bc59A54B26DecF6b99";
const ABI = [
  "function cancelSignal(uint256 _id) external",
  "function activeSignalId() view returns (uint256)",
];
async function main() {
  const [admin] = await ethers.getSigners();
  const trader = new ethers.Contract(GOLD_COPY_TRADER, ABI, admin);
  const id = await trader.activeSignalId();
  if (Number(id) === 0) { console.log("No active signal"); return; }
  console.log("Cancelling signal", id.toString());
  await (await trader.cancelSignal(id)).wait();
  console.log("Done");
}
main().catch(console.error);
