// XAU/USD from gTrade's pricing backend, the price our trades execute against.
// Pyth's public Hermes endpoint started answering 401 in 2026, which silently
// broke every price read in the bot. Same source as src/goldPrice.js.
const GTRADE_PRICING = "https://backend-pricing.eu.gains.trade/charts";
const XAU_PAIR = 90;

export async function fetchGoldPrice() {
  const r = await fetch(GTRADE_PRICING, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`gTrade pricing HTTP ${r.status}`);
  const d = await r.json();
  const p = Number(d.closes?.[XAU_PAIR]);
  if (!(p > 0)) throw new Error("gTrade XAU price unavailable");
  return p;
}

// Candles since a moment: [{ t, o, h, l, c }] (resolution in minutes).
export async function fetchGoldBarsSince(fromSec, resolution = 5) {
  const to = Math.floor(Date.now() / 1000);
  const r = await fetch(`${GTRADE_PRICING}/${XAU_PAIR}/${Math.floor(fromSec)}/${to}/${resolution}`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error(`gTrade bars HTTP ${r.status}`);
  const d = await r.json();
  return (d.table || []).map((b) => ({ t: b.time, o: b.open, h: b.high, l: b.low, c: b.close }));
}
