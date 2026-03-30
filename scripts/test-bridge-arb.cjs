require("dotenv").config();
const { ethers } = require("ethers");

const ARB_RPC = process.env.ARBITRUM_RPC_HTTPS || "https://arb1.arbitrum.io/rpc";
const LIFI_API = "https://li.quest/v1";
const ARB_USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const BSC_USDT = "0x55d398326f99059fF775485246999027B3197955";

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address, address) view returns (uint256)",
  "function approve(address, uint256) returns (bool)",
];

async function main() {
  const provider = new ethers.JsonRpcProvider(ARB_RPC);
  const wallet = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY, provider);

  const usdc = new ethers.Contract(ARB_USDC, ERC20_ABI, wallet);
  const usdcBal = await usdc.balanceOf(wallet.address);
  console.log("Address:", wallet.address);
  console.log("ETH:", ethers.formatEther(await provider.getBalance(wallet.address)));
  console.log("USDC:", ethers.formatUnits(usdcBal, 6));

  // Test: 1 USDC Arb → BSC USDT
  const testAmount = "1000000"; // 1 USDC (6 decimals)

  console.log("\n=== Quote: 1 USDC Arb → USDT BSC ===");
  const params = new URLSearchParams({
    fromChain: "42161",
    toChain: "56",
    fromToken: ARB_USDC,
    toToken: BSC_USDT,
    fromAmount: testAmount,
    fromAddress: wallet.address,
    slippage: "0.05",
  });

  const res = await fetch(`${LIFI_API}/quote?${params}`);
  const quote = await res.json();

  if (quote.message) {
    console.log("Quote error:", quote.message);
    return;
  }

  console.log("Route:", quote.tool);
  console.log("Method:", quote.transactionRequest?.data?.slice(0, 10));
  console.log("Steps:", quote.includedSteps?.map(s => `${s.type}: ${s.tool}`));
  console.log("Approval addr:", quote.estimate?.approvalAddress);
  console.log("To:", quote.transactionRequest?.to);

  // Check approval
  const approvalAddr = quote.estimate?.approvalAddress;
  if (approvalAddr) {
    const allowance = await usdc.allowance(wallet.address, approvalAddr);
    console.log("\nAllowance:", ethers.formatUnits(allowance, 6), "USDC");
    if (BigInt(allowance) < BigInt(testAmount)) {
      console.log("Approving...");
      if (BigInt(allowance) > 0n) await (await usdc.approve(approvalAddr, 0)).wait();
      await (await usdc.approve(approvalAddr, ethers.MaxUint256)).wait();
      console.log("Approved!");
    }
  }

  // Simulate
  console.log("\nSimulating...");
  try {
    await provider.call({
      from: wallet.address,
      to: quote.transactionRequest.to,
      data: quote.transactionRequest.data,
      value: quote.transactionRequest.value || "0x0",
    });
    console.log("Simulation: OK ✓");
  } catch (e) {
    console.log("Simulation FAILED:", e.message?.slice(0, 300));
    console.log("Error data:", e.data || "none");
    return;
  }

  // Send
  console.log("\nSending...");
  const tx = await wallet.sendTransaction({
    to: quote.transactionRequest.to,
    data: quote.transactionRequest.data,
    value: quote.transactionRequest.value || "0x0",
    gasLimit: quote.transactionRequest.gasLimit,
  });
  console.log("Tx:", tx.hash);
  const receipt = await tx.wait();
  console.log("Status:", receipt.status === 1 ? "SUCCESS ✓" : "FAILED ✗");
  console.log("Gas used:", receipt.gasUsed.toString());
}

main().catch(console.error);
