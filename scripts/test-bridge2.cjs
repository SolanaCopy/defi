require("dotenv").config();
const { ethers } = require("ethers");

const BSC_RPC = "https://bsc-dataseed.binance.org/";
const LIFI_API = "https://li.quest/v1";
const BSC_USDT = "0x55d398326f99059fF775485246999027B3197955";
const ARB_USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address, address) view returns (uint256)",
  "function approve(address, uint256) returns (bool)",
];

async function main() {
  const provider = new ethers.JsonRpcProvider(BSC_RPC);
  const wallet = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY, provider);

  const usdt = new ethers.Contract(BSC_USDT, ERC20_ABI, wallet);
  const usdtBal = await usdt.balanceOf(wallet.address);
  console.log("USDT balance:", ethers.formatUnits(usdtBal, 18));

  // Test with ~13 USDT (similar to what user tries)
  const testAmount = "13000000000000000000"; // 13 USDT

  console.log("\n=== Test: 13 USDT BSC → USDC Arb ===");

  // Get quote
  const params = new URLSearchParams({
    fromChain: "56",
    toChain: "42161",
    fromToken: BSC_USDT,
    toToken: ARB_USDC,
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
  console.log("Gas limit:", quote.transactionRequest?.gasLimit);

  // Simulate
  console.log("\nSimulating...");
  try {
    await provider.call({
      from: wallet.address,
      to: quote.transactionRequest.to,
      data: quote.transactionRequest.data,
      value: quote.transactionRequest.value || "0x0",
    });
    console.log("Simulation: OK");
  } catch (e) {
    console.log("Simulation FAILED:", e.message?.slice(0, 200));

    // Try getting quote with specific bridges
    console.log("\n=== Retry with different bridges ===");
    for (const bridge of ["across", "stargate", "cbridge", "hop"]) {
      try {
        const params2 = new URLSearchParams({
          fromChain: "56", toChain: "42161",
          fromToken: BSC_USDT, toToken: ARB_USDC,
          fromAmount: testAmount, fromAddress: wallet.address,
          slippage: "0.05", allowBridges: bridge,
        });
        const res2 = await fetch(`${LIFI_API}/quote?${params2}`);
        const quote2 = await res2.json();
        if (quote2.message) {
          console.log(`${bridge}: no route - ${quote2.message}`);
          continue;
        }
        console.log(`${bridge}: method=${quote2.transactionRequest?.data?.slice(0, 10)}, steps=${quote2.includedSteps?.map(s => s.tool)}`);

        // Simulate this route
        await provider.call({
          from: wallet.address,
          to: quote2.transactionRequest.to,
          data: quote2.transactionRequest.data,
          value: quote2.transactionRequest.value || "0x0",
        });
        console.log(`${bridge}: simulation OK! ✓`);

        // Send it
        console.log(`\nSending via ${bridge}...`);
        const allowance = await usdt.allowance(wallet.address, quote2.estimate.approvalAddress);
        if (BigInt(allowance) < BigInt(testAmount)) {
          if (BigInt(allowance) > 0n) await (await usdt.approve(quote2.estimate.approvalAddress, 0)).wait();
          await (await usdt.approve(quote2.estimate.approvalAddress, ethers.MaxUint256)).wait();
        }

        const tx = await wallet.sendTransaction({
          to: quote2.transactionRequest.to,
          data: quote2.transactionRequest.data,
          value: quote2.transactionRequest.value || "0x0",
          gasLimit: quote2.transactionRequest.gasLimit,
          gasPrice: quote2.transactionRequest.gasPrice,
        });
        console.log("Tx:", tx.hash);
        const receipt = await tx.wait();
        console.log("Status:", receipt.status === 1 ? "SUCCESS ✓" : "FAILED ✗");
        return;
      } catch (e2) {
        console.log(`${bridge}: failed - ${e2.message?.slice(0, 100)}`);
      }
    }
    return;
  }

  // If default simulation works, send it
  console.log("\nSending...");
  const tx = await wallet.sendTransaction({
    to: quote.transactionRequest.to,
    data: quote.transactionRequest.data,
    value: quote.transactionRequest.value || "0x0",
    gasLimit: quote.transactionRequest.gasLimit,
    gasPrice: quote.transactionRequest.gasPrice,
  });
  console.log("Tx:", tx.hash);
  const receipt = await tx.wait();
  console.log("Status:", receipt.status === 1 ? "SUCCESS ✓" : "FAILED ✗");
}

main().catch(console.error);
