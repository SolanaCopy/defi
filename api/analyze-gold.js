import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const CACHE_MINUTES = 15;
const PYTH_GOLD_URL =
  "https://hermes.pyth.network/v2/updates/price/latest?ids[]=0x765d2ba906dbc32ca17cc11f5310a89e9ee1f6420508c63861f2f8ba4ee34bb2";
const YAHOO_URL =
  "https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?interval=1d&range=3mo";
const FOREX_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";

const SYSTEM_PROMPT = `You are a senior gold market analyst writing for retail copy-traders on the Smart Trading Club platform. Audience is non-professional but engaged: they understand bullish/bearish, support/resistance, and basic news impact.

Your job: read the supplied price snapshot, daily OHLC history, and upcoming macro events, and produce a single JSON verdict for XAU/USD (gold).

Rules:
- Always pick exactly one verdict: bullish, bearish, or neutral.
- Confidence is an integer 0-100. Reserve >75 for high-conviction setups; default to 40-65 when signals conflict.
- summary: 2-3 sentences, plain English, no fluff, no disclaimers, no emoji.
- technical: short strings. Trend = "uptrend"|"downtrend"|"sideways". RSI value as number, with one-line interpretation. MACD as one-line interpretation.
- fundamental: list the 1-3 most price-relevant upcoming events and a one-line note per event on directional impact. If nothing material, say so.
- levels: numeric support, resistance, target — all in USD. Target should align with the verdict.
- Never recommend specific position sizes or leverage.
- Never claim certainty. Use "likely", "expected", "biased toward" rather than "will".`;

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
  const ema12 = ema(closes.slice(-26), 12);
  const ema26 = ema(closes.slice(-26), 26);
  const macdLine = ema12 - ema26;
  const recent = closes.slice(-9);
  const signal = ema(recent.map((_, i) => ema(closes.slice(0, closes.length - 8 + i).slice(-26), 12) - ema(closes.slice(0, closes.length - 8 + i).slice(-26), 26)), 9);
  return { macd: macdLine, signal, histogram: macdLine - signal };
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

function levelsFromOHLC(highs, lows, closes) {
  const recent = closes.slice(-30);
  const recentHighs = highs.slice(-30);
  const recentLows = lows.slice(-30);
  const support = Math.min(...recentLows);
  const resistance = Math.max(...recentHighs);
  return { support, resistance, last: recent[recent.length - 1] };
}

async function fetchPythPrice() {
  const r = await fetch(PYTH_GOLD_URL, { signal: AbortSignal.timeout(8000) });
  const d = await r.json();
  const p = d.parsed?.[0]?.price;
  if (!p) return null;
  return Number(p.price) * Math.pow(10, Number(p.expo));
}

async function fetchYahooOHLC() {
  const r = await fetch(YAHOO_URL, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(10000),
  });
  const d = await r.json();
  const result = d.chart?.result?.[0];
  if (!result) return null;
  const ts = result.timestamp;
  const q = result.indicators?.quote?.[0];
  if (!q) return null;
  const rows = ts
    .map((t, i) => ({
      date: new Date(t * 1000).toISOString().slice(0, 10),
      open: q.open[i],
      high: q.high[i],
      low: q.low[i],
      close: q.close[i],
    }))
    .filter((r) => r.close != null);
  return rows;
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

function buildAnalysisPayload(price, ohlc, events) {
  const closes = ohlc.map((r) => r.close);
  const highs = ohlc.map((r) => r.high);
  const lows = ohlc.map((r) => r.low);
  const last30 = ohlc.slice(-30);

  return {
    live_price_usd: price,
    technical: {
      rsi_14: rsi(closes),
      macd: macd(closes),
      trend_50d: trendLabel(closes),
      levels_30d: levelsFromOHLC(highs, lows, closes),
    },
    ohlc_last_30d: last30.map((r) => ({
      d: r.date,
      o: r.open,
      h: r.high,
      l: r.low,
      c: r.close,
    })),
    upcoming_events: events,
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
      return res.status(200).json({ ...latest, cached: true });
    }
  }

  const [price, ohlc, events] = await Promise.all([
    fetchPythPrice(),
    fetchYahooOHLC(),
    fetchForexEvents(),
  ]);

  if (!price || !ohlc || ohlc.length < 35) {
    if (latest) return res.status(200).json({ ...latest, cached: true, stale: true });
    return res.status(503).json({ error: "Unable to fetch market data" });
  }

  const payload = buildAnalysisPayload(price, ohlc, events);

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

  const row = {
    verdict: parsed.verdict,
    confidence: parsed.confidence,
    summary: parsed.summary,
    technical: parsed.technical,
    fundamental: parsed.fundamental,
    levels: parsed.levels,
    price,
  };

  const { data: inserted } = await supabase
    .from("gold_analysis")
    .insert(row)
    .select()
    .single();

  return res.status(200).json({
    ...(inserted ?? row),
    cached: false,
    cache_read_tokens: message.usage?.cache_read_input_tokens ?? 0,
    cache_creation_tokens: message.usage?.cache_creation_input_tokens ?? 0,
  });
}
