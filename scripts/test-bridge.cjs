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
  "function symbol() view returns (string)",
];

async function main() {
  const provider = new ethers.JsonRpcProvider(BSC_RPC);
  const wallet = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY, provider);

  console.log("Address:", wallet.address);
  console.log("BNB:", ethers.formatEther(await provider.getBalance(wallet.address)));

  const usdt = new ethers.Contract(BSC_USDT, ERC20_ABI, wallet);
  const usdtBal = await usdt.balanceOf(wallet.address);
  console.log("USDT:", ethers.formatUnits(usdtBal, 18));

  if (usdtBal === 0n) {
    console.log("No USDT on BSC!");
    return;
  }

  // Use 1 USDT for test (small amount)
  const testAmount = "1000000000000000000"; // 1 USDT (18 decimals)

  // Step 1: Get quote
  console.log("\n[1] Getting Li.Fi quote (1 USDT BSC → USDC Arb)...");
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
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.log("Quote FAILED:", err);
    return;
  }
  const quote = await res.json();
  console.log("Quote OK:", {
    tool: quote.tool,
    toAmount: quote.estimate?.toAmount,
    approvalAddr: quote.estimate?.approvalAddress,
    steps: quote.includedSteps?.map(s => `${s.type}: ${s.tool}`),
    txTo: quote.transactionRequest?.to,
    gasLimit: quote.transactionRequest?.gasLimit,
    gasPrice: quote.transactionRequest?.gasPrice,
  });

  // Step 2: Approve
  console.log("\n[2] Checking approval...");
  const approvalAddr = quote.estimate?.approvalAddress;
  const allowance = await usdt.allowance(wallet.address, approvalAddr);
  console.log("Current allowance:", ethers.formatUnits(allowance, 18));

  if (allowance < BigInt(testAmount)) {
    if (allowance > 0n) {
      console.log("Resetting allowance to 0...");
      const resetTx = await usdt.approve(approvalAddr, 0);
      await resetTx.wait();
    }
    console.log("Approving max...");
    const approveTx = await usdt.approve(approvalAddr, ethers.MaxUint256);
    await approveTx.wait();
    console.log("Approved!");
  } else {
    console.log("Already approved");
  }

  // Step 3: Simulate tx first (staticCall equivalent)
  console.log("\n[3] Simulating bridge tx...");
  const txReq = quote.transactionRequest;
  try {
    const result = await provider.call({
      from: wallet.address,
      to: txReq.to,
      data: txReq.data,
      value: txReq.value || "0x0",
      gasLimit: txReq.gasLimit,
      gasPrice: txReq.gasPrice,
    });
    console.log("Simulation OK! Result:", result.slice(0, 66));
  } catch (e) {
    console.log("Simulation FAILED:", e.message?.slice(0, 300));
    console.log("Error data:", e.data || "none");

    // Try without gasLimit/gasPrice
    console.log("\nRetrying simulation without gas params...");
    try {
      const result2 = await provider.call({
        from: wallet.address,
        to: txReq.to,
        data: txReq.data,
        value: txReq.value || "0x0",
      });
      console.log("Simulation OK without gas params! Result:", result2.slice(0, 66));
    } catch (e2) {
      console.log("Still failed:", e2.message?.slice(0, 300));
    }
    return;
  }

  // Step 4: Send real tx
  console.log("\n[4] Sending bridge tx...");
  try {
    const tx = await wallet.sendTransaction({
      to: txReq.to,
      data: txReq.data,
      value: txReq.value || "0x0",
      gasLimit: txReq.gasLimit,
      gasPrice: txReq.gasPrice,
    });
    console.log("Tx hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("Status:", receipt.status === 1 ? "SUCCESS" : "FAILED");
    console.log("Gas used:", receipt.gasUsed.toString());
  } catch (e) {
    console.log("Tx FAILED:", e.message?.slice(0, 300));
  }
}

main().catch(console.error);
