const { ethers } = require("hardhat");
const GOLD_COPY_TRADER = "0x1E34452cbD7Ea6Af3D9282D9C95AC625298221b6";
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
