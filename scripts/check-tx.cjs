const { ethers } = require("hardhat");

async function main() {
  const [admin] = await ethers.getSigners();
  const provider = admin.provider;

  // Check the copyTrade tx
  const txHash = "0x7b965409d086afe2f211ab12e4005af9f8625a0c5883f2ffb3268592bfdc93d7";
  const receipt = await provider.getTransactionReceipt(txHash);

  console.log("=== CopyTrade Transaction ===");
  console.log("Status:", receipt.status === 1 ? "SUCCESS" : "FAILED");
  console.log("Block:", receipt.blockNumber);
  console.log("Gas used:", receipt.gasUsed.toString());
  console.log("Logs:", receipt.logs.length);

  // Decode known events
  const iface = new ethers.Interface([
    "event TradeCopied(address indexed user, uint256 indexed signalId, uint256 amount)",
    "event Transfer(address indexed from, address indexed to, uint256 value)",
    "event Approval(address indexed owner, address indexed spender, uint256 value)",
  ]);

  for (const log of receipt.logs) {
    console.log(`\n  Log from ${log.address}:`);
    try {
      const parsed = iface.parseLog({ topics: log.topics, data: log.data });
      console.log(`    Event: ${parsed.name}`);
      console.log(`    Args:`, parsed.args.toString());
    } catch {
      console.log(`    Topics: ${log.topics[0]?.slice(0, 10)}...`);
      console.log(`    Data: ${log.data.slice(0, 66)}...`);
    }
  }

  // Check balances
  const usdc = new ethers.Contract("0xaf88d065e77c8cC2239327C5EDb3A432268e5831", [
    "function balanceOf(address) view returns (uint256)",
  ], admin);

  const CONTRACT = "0xb09d6B8fA13Cbf757393ECb3E9c616C6BE94cA82";
  console.log("\n=== Current Balances ===");
  console.log("Admin USDC:", ethers.formatUnits(await usdc.balanceOf(admin.address), 6));
  console.log("Contract USDC:", ethers.formatUnits(await usdc.balanceOf(CONTRACT), 6));
  console.log("Admin ETH:", ethers.formatEther(await provider.getBalance(admin.address)));
}

main().catch(console.error);
