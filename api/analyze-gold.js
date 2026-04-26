import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const CACHE_MINUTES = 15;
const PYTH_GOLD_URL =
  "https://hermes.pyth.network/v2/updates/price/latest?ids[]=0x765d2ba906dbc32ca17cc11f5310a89e9ee1f6420508c63861f2f8ba4ee34bb2";
const YAHOO_OHLC_URL =
  "https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?interval=1d&range=3mo";
const YAHOO_DXY_URL =
  "https://query1.finance.yahoo.com/v8/finance/chart/DX-Y.NYB?interval=1d&range=5d";
const YAHOO_TNX_URL =
  "https://query1.finance.yahoo.com/v8/finance/chart/%5ETNX?interval=1d&range=5d";
const YAHOO_NEWS_URL =
  "https://query1.finance.yahoo.com/v1/finance/search?q=gold%20price&newsCount=8&quotesCount=0";
const FOREX_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";
const YAHOO_HEADERS = { "User-Agent": "Mozilla/5.0" };

const SYSTEM_PROMPT = `You are a senior gold market analyst writing for retail copy-traders on the Smart Trading Club platform. Audience is non-professional but engaged: they understand bullish/bearish, support/resistance, and basic news impact.

Your job: read the supplied price snapshot, daily OHLC history, dollar-index and 10Y yield context, recent gold-market headlines, and upcoming macro events, and produce a single JSON verdict for XAU/USD (gold).

Rules:
- Always pick exactly one verdict: bullish, bearish, or neutral.
- Confidence is an integer 0-100. Reserve >75 for high-conviction setups; default to 40-65 when signals conflict.
- summary: 2-3 sentences, plain English, no fluff, no disclaimers, no emoji.
- technical: short strings. Trend = "uptrend"|"downtrend"|"sideways". RSI value as number, with one-line interpretation. MACD as one-line interpretation.
- fundamental: list the 1-3 most price-relevant upcoming events and a one-line note per event on directional impact. The "note" field should explicitly weave in DXY direction, real/nominal yields, and any major news headline that moves the gold thesis. If nothing material, say so.
- levels: numeric support, resistance, target — all in USD. Target should align with the verdict.
- Never recommend specific position sizes or leverage.
- Never claim certainty. Use "likely", "expected", "biased toward" rather than "will".
- Gold is inversely correlated with USD strength and real yields. A rising DXY or rising 10Y yield is bearish for gold; falling DXY/yields is bullish. Reflect this in your reasoning.`;

const ANALYSIS_INSTRUCTIONS = `Output ONLY the JSON object matching the schema. No prose before or after.

Schema:
{
  "verdict": "bullish" | "bearish" | "neutral",
  "confidence": integer 0-100,
  "summary": string,
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

function ema(values, period) {
  const k = 2 / (period + 1);
  let e = values[0];
  for (let i = 1; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}

function macd(closes) {
  if (closes.length < 35) return null;
  const slice = closes.slice(-26);
  const ema12 = ema(slice, 12);
  const ema26 = ema(slice, 26);
  const macdLine = ema12 - ema26;
  return { macd: macdLine, signal: null, histogram: null };
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

async function fetchNews() {
  try {
    const r = await fetch(YAHOO_NEWS_URL, {
      headers: YAHOO_HEADERS,
      signal: AbortSignal.timeout(8000),
    });
    const d = await r.json();
    return (d.news || [])
      .slice(0, 5)
      .map((n) => ({
        title: n.title,
        publisher: n.publisher,
        published_at: n.providerPublishTime ? new Date(n.providerPublishTime * 1000).toISOString() : null,
        link: n.link,
      }));
  } catch {
    return [];
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

function buildAnalysisPayload(price, ohlc, events, dxy, yield10y, news) {
  const closes = ohlc.map((r) => r.close);
  const highs = ohlc.map((r) => r.high);
  const lows = ohlc.map((r) => r.low);
  const last30 = ohlc.slice(-30);

  return {
    live_price_usd: price,
    macro: {
      dxy: dxy ? { value: dxy.last.toFixed(2), change_pct: dxy.changePct.toFixed(2) } : null,
      us_10y_yield: yield10y ? { value: yield10y.last.toFixed(2), change_pct: yield10y.changePct.toFixed(2) } : null,
    },
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

  const [price, ohlc, events, dxy, yield10y, news] = await Promise.all([
    fetchPythPrice(),
    fetchYahooOHLC(),
    fetchForexEvents(),
    fetchYahooClose(YAHOO_DXY_URL),
    fetchYahooClose(YAHOO_TNX_URL),
    fetchNews(),
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

  const payload = buildAnalysisPayload(price, ohlc, events, dxy, yield10y, news);

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
