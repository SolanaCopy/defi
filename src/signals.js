import { ethers } from 'ethers';

// Multicall3 is deployed at the same address on every major chain.
const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11';
const MULTICALL_ABI = [
  'function aggregate3((address target, bool allowFailure, bytes callData)[] calls) view returns ((bool success, bytes returnData)[])',
];

// Tried in order when the caller's provider fails. Public endpoints rate-limit
// at random; one refused request used to leave Results showing all zeros.
const FALLBACK_RPCS = [
  'https://arbitrum-one.publicnode.com',
  'https://arb1.arbitrum.io/rpc',
  'https://arbitrum.llamarpc.com',
];

async function readChunk(provider, target, iface, chunk) {
  const mc = new ethers.Contract(MULTICALL3, MULTICALL_ABI, provider);
  const calls = chunk.flatMap((id) => [
    { target, allowFailure: true, callData: iface.encodeFunctionData('signalCore', [id]) },
    { target, allowFailure: true, callData: iface.encodeFunctionData('signalVault', [id]) },
  ]);
  return mc.aggregate3(calls);
}

// Reading history one signal at a time cost two RPC round-trips per signal.
// At 80 signals the public endpoints rate-limited the batch half-way and the
// page showed "0 trades". One aggregate3 call per 100 signals reads the same
// state in a single request.
export async function fetchAllSignals(provider, contract, count) {
  const iface = contract.interface;
  const target = await contract.getAddress();
  const ids = Array.from({ length: count }, (_, i) => count - i); // newest first
  const providers = [provider, ...FALLBACK_RPCS.map((u) => new ethers.JsonRpcProvider(u))];
  const out = [];

  for (let start = 0; start < ids.length; start += 100) {
    const chunk = ids.slice(start, start + 100);
    let res, lastErr;
    for (const p of providers) {
      try { res = await readChunk(p, target, iface, chunk); break; } catch (err) { lastErr = err; }
    }
    if (!res) throw lastErr;
    chunk.forEach((id, i) => {
      const [c, v] = [res[i * 2], res[i * 2 + 1]];
      if (!c.success || !v.success) return;
      out.push({
        id,
        core: iface.decodeFunctionResult('signalCore', c.returnData),
        vault: iface.decodeFunctionResult('signalVault', v.returnData),
      });
    });
  }
  return out;
}
