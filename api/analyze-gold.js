import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const CACHE_MINUTES = 15;
const PYTH_GOLD_URL =
  "https://hermes.pyth.network/v2/updates/price/latest?ids[]=0x765d2ba906dbc32ca17cc11f5310a89e9ee1f6420508c63861f2f8ba4ee34bb2";
const YAHOO_OHLC_URL =
  "https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?interval=1d&range=3mo";
const YAHOO_WEEKLY_URL =
  "https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?interval=1wk&range=2y";
const YAHOO_INTRADAY_URL =
  "https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?interval=1h&range=5d";
const COT_URL =
  "https://publicreporting.cftc.gov/resource/6dca-aqww.json?$where=market_and_exchange_names%20like%20%27%25GOLD%20-%20COMMODITY%20EXCHANGE%20INC%25%27&$order=report_date_as_yyyy_mm_dd%20DESC&$limit=2";
const YAHOO_DXY_URL =
  "https://query1.finance.yahoo.com/v8/finance/chart/DX-Y.NYB?interval=1d&range=5d";
const YAHOO_TNX_URL =
  "https://query1.finance.yahoo.com/v8/finance/chart/%5ETNX?interval=1d&range=5d";
const NEWS_RSS_URL =
  "https://news.google.com/rss/search?q=gold+price+OR+XAU+OR+%22precious+metals%22&hl=en-US&gl=US&ceid=US:en";
const FOREX_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";
const YAHOO_HEADERS = { "User-Agent": "Mozilla/5.0" };

const SYSTEM_PROMPT = `You are a senior gold market analyst writing for retail copy-traders on the Smart Trading Club platform. Audience is non-professional but engaged.

Your job: read the supplied multi-timeframe price data, macro context (DXY, 10Y yield), CFTC speculator positioning, recent headlines, and upcoming events — then output a single JSON verdict for XAU/USD that is either a tradeable setup or an explicit "no trade" signal.

This output may be auto-published as a copy-trade signal when confidence is high enough. Be honest, be specific, and never invent a setup if there isn't one.

Rules:
- verdict: bullish, bearish, or neutral.
- confidence: integer 0-100. Reserve >=75 for high-conviction setups where the multi-timeframe (1W, 1D, 1H) trends align with the verdict. Use 40-65 when signals conflict. Below 40 when contradictions are heavy or news risk is dominant.
- setup_type: pick exactly ONE of:
    "breakout"   — close decisively beyond a recent swing high/low with momentum;
    "retest"     — price returning to a freshly broken level (typical after a breakout);
    "pullback"   — counter-trend dip in an established trend, stalling at a moving-average or prior level;
    "range-fade" — sell at established range top, buy at established range bottom (only when 1D trend is sideways);
    "none"       — no clean setup; do not propose entry/SL/TP.
- entry, stop_loss, take_profit: numeric USD prices. Required when setup_type != "none".
- rr_ratio: numeric reward-to-risk = |TP - entry| / |entry - SL|. Must be >= 2.0 when setup_type != "none". If a clean setup yields R:R < 2, set setup_type = "none" — do not propose the trade.
- Targets must be at least 1.0x ATR(14) away from entry. Never propose entry/SL/TP within fractions of ATR — that is noise, not a setup.
- Setup must be aligned with at least 2 of 3 timeframe trends (1W, 1D, 1H). If only 1 of 3 aligns, setup_type = "none".
- summary: 2-3 sentences, plain English, no fluff, no disclaimers, no emoji.
- technical: short strings. trend = "uptrend"|"downtrend"|"sideways". rsi value as number with one-line note. macd as one-line note.
- multi_timeframe: explicit trend label per timeframe (1W, 1D, 1H).
- fundamental.note: explicitly weave in DXY direction, yields, and any major news. The cot block — speculator net position and weekly change — is a contrarian signal: extreme speculator net longs often precede tops, extreme net shorts often precede bottoms. Mention COT positioning in your reasoning when it adds signal.
- levels: support, resistance, target — all in USD.
- Never recommend specific position sizes or leverage.
- Never claim certainty. Use "likely", "expected", "biased toward".
- Gold is inversely correlated with USD strength and real yields. Reflect this.`;

const ANALYSIS_INSTRUCTIONS = `Output ONLY the JSON object matching the schema. No prose before or after.

Schema:
{
  "verdict": "bullish" | "bearish" | "neutral",
  "confidence": integer 0-100,
  "setup_type": "breakout" | "retest" | "pullback" | "range-fade" | "none",
  "entry": number | null,
  "stop_loss": number | null,
  "take_profit": number | null,
  "rr_ratio": number | null,
  "summary": string,
  "multi_timeframe": {
    "trend_1w": "uptrend" | "downtrend" | "sideways",
    "trend_1d": "uptrend" | "downtrend" | "sideways",
    "trend_1h": "uptrend" | "downtrend" | "sideways",
    "alignment_note": string
  },
  "technical": {
    "trend": "uptrend" | "downtrend" | "sideways",
    "rsi": number,
    "rsi_note": string,
    "macd_note": string
  },
  "fundamental": {
    "events": [
      { "event": string, "when": string, "impact": string }
    ],
    "note": string
  },
  "levels": {
    "support": number,
    "resistance": number,
    "target": number
  }
}`;

function rsi(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function emaSeries(values, period) {
  const k = 2 / (period + 1);
  const out = new Array(values.length);
  out[0] = values[0];
  for (let i = 1; i < values.length; i++) out[i] = values[i] * k + out[i - 1] * (1 - k);
  return out;
}

function macd(closes) {
  if (closes.length < 35) return null;
  const ema12 = emaSeries(closes, 12);
  const ema26 = emaSeries(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = emaSeries(macdLine, 9);
  const last = macdLine.length - 1;
  return {
    macd: macdLine[last],
    signal: signalLine[last],
    histogram: macdLine[last] - signalLine[last],
  };
}

function atr(highs, lows, closes, period = 14) {
  if (closes.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < closes.length; i++) {
    trs.push(
      Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1]),
      ),
    );
  }
  const recent = trs.slice(-period);
  return recent.reduce((a, b) => a + b, 0) / recent.length;
}

function trendLabel(closes) {
  if (closes.length < 50) return "sideways";
  const sma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const sma50 = closes.slice(-50).reduce((a, b) => a + b, 0) / 50;
  const last = closes[closes.length - 1];
  if (last > sma20 && sma20 > sma50) return "uptrend";
  if (last < sma20 && sma20 < sma50) return "downtrend";
  return "sideways";
}

function levelsFromOHLC(highs, lows) {
  const recentHighs = highs.slice(-30);
  const recentLows = lows.slice(-30);
  return {
    support: Math.min(...recentLows),
    resistance: Math.max(...recentHighs),
  };
}

async function fetchPythPrice() {
  const r = await fetch(PYTH_GOLD_URL, { signal: AbortSignal.timeout(8000) });
  const d = await r.json();
  const p = d.parsed?.[0]?.price;
  if (!p) return null;
  return Number(p.price) * Math.pow(10, Number(p.expo));
}

async function fetchYahooClose(url) {
  try {
    const r = await fetch(url, {
      headers: YAHOO_HEADERS,
      signal: AbortSignal.timeout(8000),
    });
    const d = await r.json();
    const result = d.chart?.result?.[0];
    if (!result) return null;
    const closes = result.indicators?.quote?.[0]?.close?.filter((v) => v != null) ?? [];
    if (!closes.length) return null;
    const last = closes[closes.length - 1];
    const prev = closes.length > 1 ? closes[closes.length - 2] : last;
    return { last, prev, change: last - prev, changePct: ((last - prev) / prev) * 100 };
  } catch {
    return null;
  }
}

async function fetchYahooOHLC() {
  const r = await fetch(YAHOO_OHLC_URL, {
    headers: YAHOO_HEADERS,
    signal: AbortSignal.timeout(10000),
  });
  const d = await r.json();
  const result = d.chart?.result?.[0];
  if (!result) return null;
  const ts = result.timestamp;
  const q = result.indicators?.quote?.[0];
  if (!q) return null;
  return ts
    .map((t, i) => ({
      date: new Date(t * 1000).toISOString().slice(0, 10),
      open: q.open[i],
      high: q.high[i],
      low: q.low[i],
      close: q.close[i],
    }))
    .filter((row) => row.close != null);
}

async function fetchForexEvents() {
  try {
    const r = await fetch(FOREX_URL, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return [];
    const all = await r.json();
    const now = Date.now();
    const cutoff = now + 7 * 24 * 60 * 60 * 1000;
    return all
      .filter((e) => {
        const t = new Date(e.date).getTime();
        return t >= now && t <= cutoff && (e.impact === "High" || e.impact === "Medium");
      })
      .filter((e) => ["USD", "EUR", "CNY", "ALL"].includes(e.country))
      .slice(0, 12)
      .map((e) => ({
        title: e.title,
        country: e.country,
        date: e.date,
        impact: e.impact,
        forecast: e.forecast,
        previous: e.previous,
      }));
  } catch {
    return [];
  }
}

function decodeHtml(s) {
  return s
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

async function fetchNews() {
  try {
    const r = await fetch(NEWS_RSS_URL, {
      headers: YAHOO_HEADERS,
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return [];
    const xml = await r.text();
    const items = [];
    const itemRe = /<item>([\s\S]*?)<\/item>/g;
    let m;
    while ((m = itemRe.exec(xml)) !== null) {
      const block = m[1];
      const titleRaw = (block.match(/<title>([\s\S]*?)<\/title>/) || [])[1];
      const link = (block.match(/<link>([\s\S]*?)<\/link>/) || [])[1];
      const pub = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1];
      const sourceRaw = (block.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1];
      if (!titleRaw) continue;
      const title = decodeHtml(titleRaw);
      // Google News titles are formatted "Article Title - Publisher Name"
      const dash = title.lastIndexOf(" - ");
      const cleanTitle = dash > 0 ? title.slice(0, dash) : title;
      const publisher = sourceRaw ? decodeHtml(sourceRaw) : (dash > 0 ? title.slice(dash + 3) : "");
      items.push({
        title: cleanTitle,
        publisher,
        published_at: pub ? new Date(pub).toISOString() : null,
        link: link?.trim(),
      });
      if (items.length >= 8) break;
    }
    return items;
  } catch {
    return [];
  }
}

async function fetchYahooWeekly() {
  try {
    const r = await fetch(YAHOO_WEEKLY_URL, {
      headers: YAHOO_HEADERS,
      signal: AbortSignal.timeout(10000),
    });
    const d = await r.json();
    const result = d.chart?.result?.[0];
    if (!result) return null;
    const ts = result.timestamp;
    const q = result.indicators?.quote?.[0];
    if (!q) return null;
    const bars = ts
      .map((t, i) => ({
        date: new Date(t * 1000).toISOString().slice(0, 10),
        open: q.open[i],
        high: q.high[i],
        low: q.low[i],
        close: q.close[i],
      }))
      .filter((row) => row.close != null);
    if (bars.length < 50) return null;
    const closes = bars.map((b) => b.close);
    return {
      bars_count: bars.length,
      trend: trendLabel(closes),
      rsi_14_w: rsi(closes, 14),
      last_close: closes[closes.length - 1],
      change_4w_pct: ((closes[closes.length - 1] - closes[Math.max(0, closes.length - 5)]) /
        closes[Math.max(0, closes.length - 5)]) * 100,
    };
  } catch {
    return null;
  }
}

async function fetchCOT() {
  try {
    const r = await fetch(COT_URL, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return null;
    const data = await r.json();
    if (!Array.isArray(data) || data.length < 1) return null;
    // CFTC sometimes returns multiple gold contracts (futures, options-and-futures combined).
    // Pick the first row whose market name starts with "GOLD - COMMODITY".
    const goldRow = data.find((r) => /^GOLD - COMMODITY EXCHANGE/i.test(r.market_and_exchange_names));
    if (!goldRow) return null;
    const long = parseInt(goldRow.noncomm_positions_long_all, 10) || 0;
    const short = parseInt(goldRow.noncomm_positions_short_all, 10) || 0;
    const net = long - short;
    // Try to find the previous week for the same contract
    const prev = data.find(
      (r) =>
        /^GOLD - COMMODITY EXCHANGE/i.test(r.market_and_exchange_names) &&
        r.report_date_as_yyyy_mm_dd !== goldRow.report_date_as_yyyy_mm_dd,
    );
    let change = null;
    if (prev) {
      const prevNet =
        (parseInt(prev.noncomm_positions_long_all, 10) || 0) -
        (parseInt(prev.noncomm_positions_short_all, 10) || 0);
      change = net - prevNet;
    }
    return {
      report_date: goldRow.report_date_as_yyyy_mm_dd?.slice(0, 10),
      specs_long: long,
      specs_short: short,
      specs_net: net,
      specs_net_change_wow: change,
      commercials_long: parseInt(goldRow.comm_positions_long_all, 10) || 0,
      commercials_short: parseInt(goldRow.comm_positions_short_all, 10) || 0,
    };
  } catch {
    return null;
  }
}

async function fetchYahooIntraday() {
  try {
    const r = await fetch(YAHOO_INTRADAY_URL, {
      headers: YAHOO_HEADERS,
      signal: AbortSignal.timeout(10000),
    });
    const d = await r.json();
    const result = d.chart?.result?.[0];
    if (!result) return null;
    const ts = result.timestamp;
    const q = result.indicators?.quote?.[0];
    if (!q) return null;
    const bars = ts
      .map((t, i) => ({
        time: new Date(t * 1000).toISOString(),
        open: q.open[i],
        high: q.high[i],
        low: q.low[i],
        close: q.close[i],
      }))
      .filter((row) => row.close != null);
    if (bars.length < 24) return null;
    const closes = bars.map((b) => b.close);
    const highs = bars.map((b) => b.high);
    const lows = bars.map((b) => b.low);
    const last24h = bars.slice(-24);
    const last24Closes = last24h.map((b) => b.close);
    return {
      bars_count: bars.length,
      trend: trendLabel(closes),
      last_close: closes[closes.length - 1],
      change_24h_pct: ((closes[closes.length - 1] - closes[Math.max(0, closes.length - 24)]) /
        closes[Math.max(0, closes.length - 24)]) * 100,
      high_24h: Math.max(...last24h.map((b) => b.high)),
      low_24h: Math.min(...last24h.map((b) => b.low)),
      rsi_14_1h: rsi(closes, 14),
    };
  } catch {
    return null;
  }
}

// Mark outcome on rows older than 24h that don't have one yet.
// Outcome = correct if price moved >= 0.3% in the predicted direction within 24h.
async function processPendingOutcomes(supabase, currentPrice) {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: pending } = await supabase
    .from("gold_analysis")
    .select("id, verdict, price, created_at")
    .lte("created_at", cutoff)
    .is("outcome_price", null)
    .order("created_at", { ascending: false })
    .limit(50);

  if (!pending?.length) return;

  for (const row of pending) {
    if (!row.price) continue;
    const pctMove = ((currentPrice - row.price) / row.price) * 100;
    let correct = null;
    if (row.verdict === "bullish") correct = pctMove >= 0.3;
    else if (row.verdict === "bearish") correct = pctMove <= -0.3;
    else correct = Math.abs(pctMove) < 0.5; // neutral verdict: counts if price stayed inside ±0.5%

    await supabase
      .from("gold_analysis")
      .update({
        outcome_price: currentPrice,
        outcome_checked_at: new Date().toISOString(),
        outcome_correct: correct,
      })
      .eq("id", row.id);
  }
}

async function fetchAccuracyStats(supabase) {
  const { data } = await supabase
    .from("gold_analysis")
    .select("outcome_correct")
    .not("outcome_correct", "is", null)
    .order("created_at", { ascending: false })
    .limit(30);
  if (!data?.length) return { total: 0, correct: 0, pct: null };
  const correct = data.filter((r) => r.outcome_correct).length;
  return { total: data.length, correct, pct: Math.round((correct / data.length) * 100) };
}

function buildAnalysisPayload(price, ohlc, events, dxy, yield10y, news, intraday, weekly, cot) {
  const closes = ohlc.map((r) => r.close);
  const highs = ohlc.map((r) => r.high);
  const lows = ohlc.map((r) => r.low);
  const last30 = ohlc.slice(-30);
  const atr14 = atr(highs, lows, closes, 14);

  return {
    live_price_usd: price,
    atr_14: atr14 != null ? Number(atr14.toFixed(2)) : null,
    multi_timeframe: {
      weekly: weekly,
      daily: { trend: trendLabel(closes), rsi_14: rsi(closes), bars: closes.length },
      hourly: intraday,
    },
    macro: {
      dxy: dxy ? { value: dxy.last.toFixed(2), change_pct: dxy.changePct.toFixed(2) } : null,
      us_10y_yield: yield10y ? { value: yield10y.last.toFixed(2), change_pct: yield10y.changePct.toFixed(2) } : null,
    },
    cot,
    technical: {
      rsi_14: rsi(closes),
      macd: macd(closes),
      trend_50d: trendLabel(closes),
      levels_30d: levelsFromOHLC(highs, lows),
    },
    ohlc_last_30d: last30.map((r) => ({
      d: r.date,
      o: r.open,
      h: r.high,
      l: r.low,
      c: r.close,
    })),
    upcoming_events: events,
    recent_headlines: news.map((n) => ({ title: n.title, publisher: n.publisher, when: n.published_at })),
    generated_at: new Date().toISOString(),
  };
}

export default async function handler(req, res) {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const { data: latest } = await supabase
    .from("gold_analysis")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const force = req.query?.refresh === "1";
  if (latest && !force) {
    const ageMs = Date.now() - new Date(latest.created_at).getTime();
    if (ageMs < CACHE_MINUTES * 60 * 1000) {
      const accuracy = await fetchAccuracyStats(supabase);
      return res.status(200).json({ ...latest, accuracy, cached: true });
    }
  }

  const [price, ohlc, events, dxy, yield10y, news, intraday, weekly, cot] = await Promise.all([
    fetchPythPrice(),
    fetchYahooOHLC(),
    fetchForexEvents(),
    fetchYahooClose(YAHOO_DXY_URL),
    fetchYahooClose(YAHOO_TNX_URL),
    fetchNews(),
    fetchYahooIntraday(),
    fetchYahooWeekly(),
    fetchCOT(),
  ]);

  if (!price || !ohlc || ohlc.length < 35) {
    if (latest) {
      const accuracy = await fetchAccuracyStats(supabase);
      return res.status(200).json({ ...latest, accuracy, cached: true, stale: true });
    }
    return res.status(503).json({ error: "Unable to fetch market data" });
  }

  // Process older rows in parallel — they don't block the response if it's slow.
  processPendingOutcomes(supabase, price).catch(() => {});

  const payload = buildAnalysisPayload(price, ohlc, events, dxy, yield10y, news, intraday, weekly, cot);

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
      {
        type: "text",
        text: ANALYSIS_INSTRUCTIONS,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Live data:\n\n${JSON.stringify(payload)}`,
      },
    ],
  });

  const text = message.content.find((b) => b.type === "text")?.text ?? "";
  let parsed;
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
  } catch (e) {
    return res.status(502).json({ error: "Model returned non-JSON", raw: text });
  }

  const ohlc30 = ohlc.slice(-30).map((r) => ({ d: r.date, o: r.open, h: r.high, l: r.low, c: r.close }));

  const row = {
    verdict: parsed.verdict,
    confidence: parsed.confidence,
    summary: parsed.summary,
    technical: parsed.technical,
    fundamental: parsed.fundamental,
    levels: parsed.levels,
    price,
    dxy: dxy?.last ?? null,
    yield_10y: yield10y?.last ?? null,
    headlines: news,
    ohlc_30d: ohlc30,
    setup_type: parsed.setup_type ?? "none",
    entry: parsed.entry ?? null,
    stop_loss: parsed.stop_loss ?? null,
    take_profit: parsed.take_profit ?? null,
    rr_ratio: parsed.rr_ratio ?? null,
    cot_specs_net: cot?.specs_net ?? null,
    cot_specs_change: cot?.specs_net_change_wow ?? null,
    cot_report_date: cot?.report_date ?? null,
    trend_1w: parsed.multi_timeframe?.trend_1w ?? null,
    trend_1h: parsed.multi_timeframe?.trend_1h ?? null,
  };

  const { data: inserted } = await supabase
    .from("gold_analysis")
    .insert(row)
    .select()
    .single();

  const accuracy = await fetchAccuracyStats(supabase);

  return res.status(200).json({
    ...(inserted ?? row),
    accuracy,
    cached: false,
    cache_read_tokens: message.usage?.cache_read_input_tokens ?? 0,
    cache_creation_tokens: message.usage?.cache_creation_input_tokens ?? 0,
  });
}
