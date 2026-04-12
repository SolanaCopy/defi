/**
 * One-time script to claim stuck funds from cancelled signals #14 and #15.
 * Usage: node bot/claim-stuck.js
 */
import "dotenv/config";
import { ethers } from "ethers";

const { ARBITRUM_RPC_HTTPS, ADMIN_PRIVATE_KEY } = process.env;
// Use the contract address from the running bot (Railway), not the local .env
const GOLD_COPY_TRADER_ADDRESS = "0xbE1E770670a0186772594ED381F573B3161029a2";

const ABI = [
  "function claimFor(address _user, uint256 _signalId) external",
  "function positions(address, uint256) view returns (uint256 deposit, bool claimed)",
  "function getAutoCopyUsers() view returns (address[])",
];

const provider = new ethers.JsonRpcProvider(ARBITRUM_RPC_HTTPS || "https://arb1.arbitrum.io/rpc");
const wallet = new ethers.Wallet(ADMIN_PRIVATE_KEY.trim(), provider);
const contract = new ethers.Contract(GOLD_COPY_TRADER_ADDRESS, ABI, wallet);

const SIGNALS = [27];

// Skip this address — excluded by admin
const SKIP = new Set([
  "0xADa3abe97B3c5b03AaF3756bbfc99a5722611927".toLowerCase(),
]);

async function main() {
  console.log(`Wallet: ${wallet.address}`);
  console.log(`Contract: ${GOLD_COPY_TRADER_ADDRESS}`);

  const users = await contract.getAutoCopyUsers();
  console.log(`Auto-copy users: ${users.length}`);

  let nonce = await wallet.getNonce();

  for (const signalId of SIGNALS) {
    console.log(`\nSignal #${signalId}:`);

    for (const user of users) {
      try {
        if (SKIP.has(user.toLowerCase())) continue;
        const pos = await contract.positions(user, signalId);
        if (pos.deposit > 0n && !pos.claimed) {
          const short = user.slice(0, 6) + "..." + user.slice(-4);
          console.log(`  Claiming for ${short} ($${Number(pos.deposit) / 1e6}) on signal #${signalId}...`);
          const tx = await contract.claimFor(user, signalId, { nonce });
          nonce++;
          await tx.wait();
          console.log(`  ✅ Done: ${tx.hash}`);
        }
      } catch (err) {
        console.log(`  ⚠️ Failed for ${user.slice(0, 6)}...${user.slice(-4)}: ${err.reason || err.message?.slice(0, 100)}`);
        nonce = await wallet.getNonce();
      }
    }
  }

  console.log("\nKlaar!");
}

main().catch(console.error);
