import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const CACHE_MINUTES = 5;
const PYTH_GOLD_URL =
  "https://hermes.pyth.network/v2/updates/price/latest?ids[]=0x765d2ba906dbc32ca17cc11f5310a89e9ee1f6420508c63861f2f8ba4ee34bb2";
const YAHOO_DAILY_URL =
  "https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?interval=1d&range=1mo";
const YAHOO_4H_URL =
  "https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?interval=60m&range=30d";
const YAHOO_1H_URL =
  "https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?interval=60m&range=10d";
const YAHOO_15M_URL =
  "https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?interval=15m&range=5d";
const YAHOO_5M_URL =
  "https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?interval=5m&range=2d";
const YAHOO_DXY_URL =
  "https://query1.finance.yahoo.com/v8/finance/chart/DX-Y.NYB?interval=1d&range=5d";
const YAHOO_TNX_URL =
  "https://query1.finance.yahoo.com/v8/finance/chart/%5ETNX?interval=1d&range=5d";
const NEWS_RSS_URL =
  "https://news.google.com/rss/search?q=gold+price+OR+XAU+OR+%22precious+metals%22&hl=en-US&gl=US&ceid=US:en";
const FOREX_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";
const YAHOO_HEADERS = { "User-Agent": "Mozilla/5.0" };

const SYSTEM_PROMPT = `You are a scalp/intraday trader for XAU/USD (gold) signaling for the Smart Trading Club copy-trading platform. You produce setups intended to be held for MINUTES TO HOURS, not days.

You read 5m / 15m / 1H / 4H price data, the current trading session (Asia/London/NY/off-hours), session VWAP and ATR, recent headlines, and imminent macro events — then output one JSON verdict that is either an immediately-tradeable scalp setup with a hard time-window, or an explicit "no trade".

This output may be auto-published as a copy-trade signal. Be honest. Never invent a setup.

Rules — scalp specifics:
- verdict: bullish, bearish, or neutral.
- confidence: 0-100. Reserve >=75 for high-conviction setups where 4H, 1H, and 15m alignment is clean. Use 40-65 when signals conflict.
- setup_type: pick ONE of:
    "session_breakout" — break of session high/low (London or NY open ranges) with momentum, expecting follow-through.
    "trend_pullback"   — 1H/4H trend is clear, price has pulled back to an intraday MA or recent S/R, looking to rejoin trend.
    "level_reject"     — clean rejection at a key intraday level (round number, prev session high/low) with wick/divergence.
    "range_fade"       — tight intraday range, fade the edges (only when 4H trend is sideways).
    "none"             — no clean setup. DEFAULT TO THIS when signals are mixed.
- entry, stop_loss, take_profit: USD prices. Required when setup_type != "none".
- rr_ratio: |TP - entry| / |entry - SL|. Must be >= 1.5 for scalp (lower than swing because hold-times are shorter and slippage is smaller). Below that: setup_type = "none".
- Stop distance must be 0.4x to 1.5x atr_1h. Targets must be 0.6x to 2.5x atr_1h. NEVER propose targets > 3x atr_1h on a scalp — that is a swing trade, not a scalp.
- valid_for_hours: integer 1 to 4. How long this setup remains valid before re-evaluation. Default 2.
- Setup must align with at least 2 of 3 timeframes (4H, 1H, 15m). If only 1 of 3 aligns, setup_type = "none". Use 1D as a context veto only — do not require alignment with it (intraday traders often fade daily moves).
- During off-hours / Asia session with thin volume: be very cautious; default to "none" unless the setup is exceptional.
- During the 30 minutes before/after a high-impact macro event listed in upcoming_events: setup_type = "none". Don't trade the news — wait for it to settle.
- summary: 1-2 sentences, plain English, no fluff, no disclaimers.
- technical: trend = "uptrend"|"downtrend"|"sideways" (this is the 1H trend), rsi (1H) with one-line note, macd_note (1H) one line.
- multi_timeframe: explicit trend label per timeframe (1H, 15m, 4H).
- fundamental.note: weave in DXY/yields direction and any market-moving news. Skip macroeconomic philosophy — focus on what matters in the next few hours.
- levels: support, resistance, target — intraday levels.
- Never recommend leverage or position size.
- Never claim certainty.`;

const ANALYSIS_INSTRUCTIONS = `Output ONLY the JSON object matching the schema. No prose before or after.

Schema:
{
  "verdict": "bullish" | "bearish" | "neutral",
  "confidence": integer 0-100,
  "setup_type": "session_breakout" | "trend_pullback" | "level_reject" | "range_fade" | "none",
  "entry": number | null,
  "stop_loss": number | null,
  "take_profit": number | null,
  "rr_ratio": number | null,
  "valid_for_hours": integer 1-4,
  "summary": string,
  "multi_timeframe": {
    "trend_4h": "uptrend" | "downtrend" | "sideways",
    "trend_1h": "uptrend" | "downtrend" | "sideways",
    "trend_15m": "uptrend" | "downtrend" | "sideways",
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

async function fetchYahooBars(url) {
  try {
    const r = await fetch(url, {
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
        time: t * 1000,
        date: new Date(t * 1000).toISOString(),
        open: q.open[i],
        high: q.high[i],
        low: q.low[i],
        close: q.close[i],
      }))
      .filter((row) => row.close != null);
  } catch {
    return null;
  }
}

// Aggregate hourly bars into 4H bars (UTC-aligned at 0/4/8/12/16/20).
function aggregateTo4H(hourlyBars) {
  if (!hourlyBars || hourlyBars.length === 0) return [];
  const buckets = new Map();
  for (const bar of hourlyBars) {
    const d = new Date(bar.time);
    const bucketHour = Math.floor(d.getUTCHours() / 4) * 4;
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}-${bucketHour}`;
    if (!buckets.has(key)) {
      buckets.set(key, { time: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), bucketHour), open: bar.open, high: bar.high, low: bar.low, close: bar.close });
    } else {
      const b = buckets.get(key);
      b.high = Math.max(b.high, bar.high);
      b.low = Math.min(b.low, bar.low);
      b.close = bar.close;
    }
  }
  return [...buckets.values()].sort((a, b) => a.time - b.time);
}

function summarizeBars(bars, label) {
  if (!bars || bars.length < 20) return null;
  const closes = bars.map((b) => b.close);
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  const macdData = macd(closes);
  return {
    bars: bars.length,
    label,
    last_close: closes[closes.length - 1],
    trend: trendLabel(closes),
    rsi_14: rsi(closes, 14),
    macd: macdData
      ? {
          line: Number(macdData.macd.toFixed(3)),
          signal: Number(macdData.signal.toFixed(3)),
          histogram: Number(macdData.histogram.toFixed(3)),
          state:
            macdData.histogram > 0 && macdData.macd > macdData.signal
              ? "bullish"
              : macdData.histogram < 0 && macdData.macd < macdData.signal
                ? "bearish"
                : "neutral",
        }
      : null,
    atr_14: atr(highs, lows, closes, 14),
    last_5: bars.slice(-5).map((b) => ({ t: b.date, o: b.open, h: b.high, l: b.low, c: b.close })),
  };
}

// Shift every OHLC value in a bar series by a constant. Used when Yahoo
// intraday is stale vs Pyth — we anchor everything to the live price so
// RSI/MACD shape is preserved (translation-invariant) but levels and
// support/resistance values land in the trader's actual price world.
function shiftBars(bars, delta) {
  if (!bars || !delta) return bars;
  return bars.map((b) => ({
    ...b,
    open: b.open + delta,
    high: b.high + delta,
    low: b.low + delta,
    close: b.close + delta,
  }));
}

// Determine session: Asia (00-07 UTC), London (07-13 UTC), NY (13-20 UTC), off-hours (20-24 UTC)
function currentSession() {
  const h = new Date().getUTCHours();
  if (h >= 0 && h < 7) return "asia";
  if (h >= 7 && h < 13) return "london";
  if (h >= 13 && h < 20) return "ny";
  return "off-hours";
}

// Session VWAP from hourly bars over the last N hours (rough approximation)
function sessionVWAP(hourlyBars, sessionStartHourUTC) {
  if (!hourlyBars || hourlyBars.length === 0) return null;
  const now = new Date();
  const sessionStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), sessionStartHourUTC));
  const inSession = hourlyBars.filter((b) => b.time >= sessionStart.getTime() && b.time <= now.getTime());
  if (inSession.length === 0) return null;
  let pv = 0, vol = 0;
  for (const b of inSession) {
    const typical = (b.high + b.low + b.close) / 3;
    pv += typical;
    vol += 1; // we don't have real volume — approximation, equal weight
  }
  return pv / vol;
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


// Score scalp setups by replaying 5m OHLC bars from signal time to valid_until
// and detecting which level was hit first (TP, SL, or neither).
// Conservative tie-breaker: if a single bar's range contains both TP and SL,
// assume SL hit first.
async function processPendingOutcomes(supabase, currentPrice) {
  const now = new Date().toISOString();
  const { data: pending } = await supabase
    .from("gold_analysis")
    .select("id, created_at, valid_until, setup_type, entry, stop_loss, take_profit, verdict, price")
    .lte("valid_until", now)
    .is("outcome_correct", null)
    .not("valid_until", "is", null)
    .order("created_at", { ascending: false })
    .limit(20);

  if (!pending?.length) return;

  for (const row of pending) {
    try {
      // "none" setups: no entry/SL/TP to score against. Mark as timeout/no-trade.
      if (
        row.setup_type === "none" ||
        row.entry == null ||
        row.stop_loss == null ||
        row.take_profit == null
      ) {
        await supabase
          .from("gold_analysis")
          .update({
            outcome_type: "no-trade",
            outcome_correct: null, // explicitly excluded from accuracy stats
            outcome_checked_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        continue;
      }

      const fromSec = Math.floor(new Date(row.created_at).getTime() / 1000);
      const toSec = Math.floor(new Date(row.valid_until).getTime() / 1000);
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?interval=5m&period1=${fromSec}&period2=${toSec}`;
      const r = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(8000),
      });
      const d = await r.json();
      const result = d.chart?.result?.[0];
      if (!result || !result.timestamp) continue;
      const ts = result.timestamp;
      const q = result.indicators?.quote?.[0];
      if (!q) continue;
      const bars = ts
        .map((t, i) => ({ time: t * 1000, high: q.high[i], low: q.low[i], close: q.close[i] }))
        .filter((b) => b.high != null && b.low != null);
      if (!bars.length) continue;

      const isLong = row.verdict === "bullish";
      let outcomeType = "timeout";
      let outcomePrice = bars[bars.length - 1].close;

      for (const bar of bars) {
        if (isLong) {
          // Long: SL is below entry, TP is above entry.
          // Conservative: check SL first; if both inside same bar, SL wins.
          if (bar.low <= row.stop_loss) {
            outcomeType = "sl";
            outcomePrice = row.stop_loss;
            break;
          }
          if (bar.high >= row.take_profit) {
            outcomeType = "tp";
            outcomePrice = row.take_profit;
            break;
          }
        } else {
          // Short: SL above entry, TP below.
          if (bar.high >= row.stop_loss) {
            outcomeType = "sl";
            outcomePrice = row.stop_loss;
            break;
          }
          if (bar.low <= row.take_profit) {
            outcomeType = "tp";
            outcomePrice = row.take_profit;
            break;
          }
        }
      }

      const correct = outcomeType === "tp" ? true : outcomeType === "sl" ? false : null; // timeout = excluded

      await supabase
        .from("gold_analysis")
        .update({
          outcome_type: outcomeType,
          outcome_price: outcomePrice,
          outcome_correct: correct,
          outcome_checked_at: new Date().toISOString(),
        })
        .eq("id", row.id);
    } catch {
      // skip — try again next run
    }
  }
}

async function fetchRecentSignals(supabase) {
  // Last 10 rows that proposed an actual trade (setup_type != "none").
  const { data } = await supabase
    .from("gold_analysis")
    .select(
      "id, created_at, valid_until, verdict, setup_type, entry, stop_loss, take_profit, rr_ratio, confidence, outcome_type, outcome_correct, outcome_price",
    )
    .neq("setup_type", "none")
    .not("setup_type", "is", null)
    .order("created_at", { ascending: false })
    .limit(10);
  return data || [];
}

// Hit rate = TP hits / (TP hits + SL hits). Timeouts and "none" rows excluded.
// Also breaks down by setup_type so we can see which patterns work.
async function fetchAccuracyStats(supabase) {
  const { data } = await supabase
    .from("gold_analysis")
    .select("outcome_correct, outcome_type, setup_type")
    .not("outcome_correct", "is", null)
    .order("created_at", { ascending: false })
    .limit(50);
  if (!data?.length) return { total: 0, correct: 0, pct: null, by_setup: {} };
  const correct = data.filter((r) => r.outcome_correct).length;
  const bySetup = {};
  for (const r of data) {
    const k = r.setup_type || "unknown";
    bySetup[k] = bySetup[k] || { total: 0, correct: 0 };
    bySetup[k].total++;
    if (r.outcome_correct) bySetup[k].correct++;
  }
  for (const k of Object.keys(bySetup)) {
    bySetup[k].pct = Math.round((bySetup[k].correct / bySetup[k].total) * 100);
  }
  return {
    total: data.length,
    correct,
    pct: Math.round((correct / data.length) * 100),
    by_setup: bySetup,
  };
}

function buildAnalysisPayload({ price, daily, h1, h4, m15, m5, dxy, yield10y, events, news }) {
  const session = currentSession();
  const sessionStart = session === "asia" ? 0 : session === "london" ? 7 : session === "ny" ? 13 : 20;
  const vwap = sessionVWAP(h1, sessionStart);

  // Imminent macro events (next 4 hours)
  const now = Date.now();
  const cutoff = now + 4 * 60 * 60 * 1000;
  const imminentEvents = (events || []).filter((e) => {
    const t = new Date(e.date).getTime();
    return t >= now - 30 * 60 * 1000 && t <= cutoff && e.impact === "High";
  });

  const m5Closes = m5?.map((b) => b.close) ?? [];
  const m15Closes = m15?.map((b) => b.close) ?? [];
  const dailyCloses = daily?.map((b) => b.close) ?? [];
  const dailyHighs = daily?.map((b) => b.high) ?? [];
  const dailyLows = daily?.map((b) => b.low) ?? [];

  return {
    live_price_usd: price,
    session,
    session_vwap: vwap != null ? Number(vwap.toFixed(2)) : null,
    daily_context: daily && daily.length > 0
      ? {
          trend: trendLabel(dailyCloses),
          rsi_14: rsi(dailyCloses),
          atr_14: atr(dailyHighs, dailyLows, dailyCloses, 14),
          last_close: dailyCloses[dailyCloses.length - 1],
        }
      : null,
    multi_timeframe: {
      h4: summarizeBars(h4, "4H"),
      h1: summarizeBars(h1, "1H"),
      m15: summarizeBars(m15, "15m"),
      m5: m5
        ? {
            bars: m5.length,
            last_close: m5Closes[m5Closes.length - 1],
            change_15m: m5.length >= 4 ? m5Closes[m5Closes.length - 1] - m5Closes[m5Closes.length - 4] : null,
            rsi_14: rsi(m5Closes, 14),
          }
        : null,
    },
    macro: {
      dxy: dxy ? { value: dxy.last.toFixed(2), change_pct: dxy.changePct.toFixed(2) } : null,
      us_10y_yield: yield10y ? { value: yield10y.last.toFixed(2), change_pct: yield10y.changePct.toFixed(2) } : null,
    },
    intraday_levels: h1 && h1.length > 0
      ? {
          last_24h_high: Math.max(...h1.slice(-24).map((b) => b.high)),
          last_24h_low: Math.min(...h1.slice(-24).map((b) => b.low)),
          atr_1h: atr(h1.map((b) => b.high), h1.map((b) => b.low), h1.map((b) => b.close), 14),
        }
      : null,
    imminent_high_impact_events: imminentEvents,
    upcoming_events: events,
    recent_headlines: (news || []).map((n) => ({ title: n.title, publisher: n.publisher, when: n.published_at })),
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
      const [accuracy, recentSignals] = await Promise.all([
        fetchAccuracyStats(supabase),
        fetchRecentSignals(supabase),
      ]);
      return res.status(200).json({ ...latest, accuracy, recent_signals: recentSignals, cached: true });
    }
  }

  const [price, daily, h1, m15, m5, events, dxy, yield10y, news] = await Promise.all([
    fetchPythPrice(),
    fetchYahooBars(YAHOO_DAILY_URL),
    fetchYahooBars(YAHOO_1H_URL),
    fetchYahooBars(YAHOO_15M_URL),
    fetchYahooBars(YAHOO_5M_URL),
    fetchForexEvents(),
    fetchYahooClose(YAHOO_DXY_URL),
    fetchYahooClose(YAHOO_TNX_URL),
    fetchNews(),
  ]);

  if (!price || !h1 || h1.length < 24 || !m15 || m15.length < 50) {
    if (latest) {
      const [accuracy, recentSignals] = await Promise.all([
        fetchAccuracyStats(supabase),
        fetchRecentSignals(supabase),
      ]);
      return res.status(200).json({ ...latest, accuracy, recent_signals: recentSignals, cached: true, stale: true });
    }
    return res.status(503).json({ error: "Unable to fetch intraday data" });
  }

  // Pyth vs Yahoo sanity check. Pyth is real-time; Yahoo intraday can lag
  // by minutes during fast markets. When the gap is meaningful we shift
  // every Yahoo bar by `signedDelta` so the last close aligns with Pyth.
  // RSI/MACD/trend are translation-invariant under this shift, so the
  // technical structure is preserved — but support/resistance and level
  // values now sit in Pyth's price world rather than Yahoo's stale one.
  const yahooLast = h1[h1.length - 1].close;
  const signedDelta = price - yahooLast;
  const dataDelta = Math.abs(signedDelta);
  const shouldShift = dataDelta > 3;
  const dataQuality = shouldShift
    ? { ok: false, note: `Yahoo intraday lagged Pyth by $${dataDelta.toFixed(2)} — bars shifted to align with live price`, pyth: price, yahoo: yahooLast, delta_usd: Number(dataDelta.toFixed(2)) }
    : { ok: true, pyth: price, yahoo: yahooLast, delta_usd: Number(dataDelta.toFixed(2)) };

  // Apply shift to every Yahoo-derived series so the AI sees Pyth-anchored levels.
  let dailyAdj = daily, h1Adj = h1, m15Adj = m15, m5Adj = m5;
  if (shouldShift) {
    dailyAdj = shiftBars(daily, signedDelta);
    h1Adj = shiftBars(h1, signedDelta);
    m15Adj = shiftBars(m15, signedDelta);
    m5Adj = shiftBars(m5, signedDelta);
  }

  // 4H bars aggregated from (possibly shifted) 1H
  const h4Adj = aggregateTo4H(h1Adj);

  // Process older rows in parallel — non-blocking outcome scoring.
  processPendingOutcomes(supabase, price).catch(() => {});

  const payload = buildAnalysisPayload({ price, daily: dailyAdj, h1: h1Adj, h4: h4Adj, m15: m15Adj, m5: m5Adj, dxy, yield10y, events, news });

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

  // Chart data: last 48 hours of 1H bars for the frontend SVG. Use the
  // Pyth-aligned series so the chart matches the live price marker.
  const chartBars = h1Adj.slice(-48).map((b) => ({
    t: b.time,
    o: b.open,
    h: b.high,
    l: b.low,
    c: b.close,
  }));

  const validForHours = Math.max(1, Math.min(4, parseInt(parsed.valid_for_hours, 10) || 2));
  const validUntil = new Date(Date.now() + validForHours * 60 * 60 * 1000).toISOString();

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
    ohlc_30d: chartBars,
    setup_type: parsed.setup_type ?? "none",
    entry: parsed.entry ?? null,
    stop_loss: parsed.stop_loss ?? null,
    take_profit: parsed.take_profit ?? null,
    rr_ratio: parsed.rr_ratio ?? null,
    valid_until: validUntil,
    session: payload.session,
    trend_4h: parsed.multi_timeframe?.trend_4h ?? null,
    trend_1h: parsed.multi_timeframe?.trend_1h ?? null,
    trend_15m: parsed.multi_timeframe?.trend_15m ?? null,
  };

  const { data: inserted } = await supabase
    .from("gold_analysis")
    .insert(row)
    .select()
    .single();

  const [accuracy, recentSignals] = await Promise.all([
    fetchAccuracyStats(supabase),
    fetchRecentSignals(supabase),
  ]);

  return res.status(200).json({
    ...(inserted ?? row),
    accuracy,
    recent_signals: recentSignals,
    data_quality: dataQuality,
    cached: false,
    cache_read_tokens: message.usage?.cache_read_input_tokens ?? 0,
    cache_creation_tokens: message.usage?.cache_creation_input_tokens ?? 0,
  });
}
