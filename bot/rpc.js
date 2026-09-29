// Arbitrum HTTP provider for the bot.
//
// ARBITRUM_RPC_HTTPS may hold one URL or several separated by commas. With
// several, calls go through a FallbackProvider: each read is sent to one node
// and moves on to the next when that node rate-limits or stalls. Free public
// nodes each throttle this bot within minutes; spread over five they hold.
import { ethers } from "ethers";

const ARBITRUM = 42161;

function single(url) {
  return new ethers.JsonRpcProvider(url, ARBITRUM, {
    staticNetwork: true,
    pollingInterval: 30_000, // 30s instead of the 4s default — fewer rate limits
    // One request per call. Public nodes mishandle ethers' JSON-RPC batches:
    // a batched call could wait forever, which froze the trade monitor.
    batchMaxCount: 1,
  });
}

export function makeProvider(env = process.env.ARBITRUM_RPC_HTTPS || "https://arb1.arbitrum.io/rpc") {
  const urls = env.split(",").map((u) => u.trim()).filter(Boolean);
  if (urls.length === 1) return single(urls[0]);
  const fallback = new ethers.FallbackProvider(
    urls.map((u, i) => ({ provider: single(u), priority: 1, weight: 1, stallTimeout: 2500 + i * 100 })),
    ARBITRUM,
    { quorum: 1, pollingInterval: 30_000 },
  );
  return fallback;
}
