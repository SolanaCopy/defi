// XAU/USD from gTrade's own pricing backend — the price our trades actually
// execute against. Pyth's public Hermes endpoint started answering 401 in
// 2026, which silently blanked every price on the site; gTrade's backend is
// open (Access-Control-Allow-Origin: *) and needs no key.
const GTRADE_PRICING = 'https://backend-pricing.eu.gains.trade/charts';
export const GTRADE_XAU_PAIR = 90;

export async function fetchGoldPrice() {
  const r = await fetch(GTRADE_PRICING, { signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`pricing ${r.status}`);
  const d = await r.json();
  const p = d.closes?.[GTRADE_XAU_PAIR];
  if (!p) throw new Error('no XAU price');
  return Number(p);
}

// 15-minute candles for the last 24h: [{ t, o, h, l, c }]
export async function fetchGoldBars(hours = 24, resolution = 15) {
  const to = Math.floor(Date.now() / 1000);
  const from = to - hours * 3600;
  const r = await fetch(`${GTRADE_PRICING}/${GTRADE_XAU_PAIR}/${from}/${to}/${resolution}`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`bars ${r.status}`);
  const d = await r.json();
  return (d.table || []).map((b) => ({ t: b.time, o: b.open, h: b.high, l: b.low, c: b.close }));
}
