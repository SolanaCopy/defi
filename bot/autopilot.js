// Autopilot: posts Scalp AI's tradeable verdicts on-chain with no human tap.
//
// Every tick during market hours it asks the site to refresh the analysis,
// reads the current tradeable signal and, if every guard passes, posts it
// through the same postSignalFromAnalysis() the Approve button uses. From
// there close-watcher.js does what it always did: auto-copy, open on gTrade,
// settle, pay out.
//
// Guards, all configurable by env:
//   AUTOPILOT                     "on" to start enabled (default off)
//   AUTOPILOT_DRY_RUN             "1" = paper trading: nothing goes on-chain or to
//                                 the group; each signal is followed on gTrade's
//                                 candles and its would-be result sent to the admin
//   AUTOPILOT_LEVERAGE            leverage for every auto signal (default 25)
//   AUTOPILOT_MIN_CONFIDENCE      minimum Scalp AI confidence (default 75)
//   AUTOPILOT_MAX_TRADES_PER_DAY  executed trades per UTC day (default 4)
//   AUTOPILOT_MAX_LOSSES_PER_DAY  stop for the day after this many losses (default 2)
//   AUTOPILOT_COOLDOWN_MIN        minutes to wait after a losing trade (default 60)
// The admin can flip it at runtime with /autopilot on|off|status in the bot DM;
// that choice is persisted and survives restarts.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";
import { postSignalFromAnalysis, loadAnalysisRow, describePosted, DEFAULT_LEVERAGE } from "./signal-actions.js";
import { fetchGoldBarsSince } from "./gold-price.js";

const SITE = "https://www.smarttradingclub.io";
const TICK_MS = 5 * 60_000;
const REFRESH_EVERY_MS = 15 * 60_000;

const cfg = {
  dryRun: process.env.AUTOPILOT_DRY_RUN === "1",
  leverage: Number(process.env.AUTOPILOT_LEVERAGE) || DEFAULT_LEVERAGE,
  minConfidence: Number(process.env.AUTOPILOT_MIN_CONFIDENCE) || 75,
  maxTradesPerDay: Number(process.env.AUTOPILOT_MAX_TRADES_PER_DAY) || 4,
  maxLossesPerDay: Number(process.env.AUTOPILOT_MAX_LOSSES_PER_DAY) || 2,
  cooldownMin: Number(process.env.AUTOPILOT_COOLDOWN_MIN) || 60,
};

// ---------- persisted state (next to poll-state on the Railway volume) ----------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(
  process.env.POLL_STATE_PATH ? path.dirname(process.env.POLL_STATE_PATH) : __dirname,
  "autopilot-state.json",
);
function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch { return {}; }
}
const state = { enabled: process.env.AUTOPILOT === "on", handledRowId: null, lastRefresh: 0, paper: { open: null, closed: [] }, ...loadState() };
state.paper ||= { open: null, closed: [] };
function saveState() {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(state)); } catch (e) { console.error("[AUTOPILOT] save failed:", e.message); }
}

// ---------- helpers ----------
const log = (m) => console.log(`[AUTOPILOT] ${m}`);

export async function dmAdmin(text) {
  const chat = process.env.ADMIN_TELEGRAM_CHAT_ID;
  if (!chat || !process.env.TELEGRAM_BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true }),
    });
  } catch {}
}

// Gold trades Sun 23:00 UTC – Fri 22:00 UTC with a 22:00–23:00 daily break.
// Same rule as getGoldMarketStatus() in src/App.jsx.
export function goldMarketOpen(now = new Date()) {
  const d = now.getUTCDay();
  const t = now.getUTCHours() + now.getUTCMinutes() / 60;
  if (d === 6) return false;
  if (d === 0 && t < 23) return false;
  if (d === 5 && t >= 22) return false;
  if (t >= 22 && t < 23) return false;
  return true;
}

const VAULT_ABI = [
  "function signalCount() view returns (uint256)",
  "function signalVault(uint256) view returns (uint256 timestamp, uint256 closedAt, uint256 totalDeposited, uint256 originalDeposited, uint256 realizedReturned, uint256 totalClaimed, uint256 copierCount, uint256 vaultBalance, bool gTradePending, bool closePending, uint256 balanceSnapshot, uint32 tradeIndex)",
];

// Today's executed trades, read from the chain rather than remembered, so a
// restart cannot reset the daily limits. Refunded signals are not trades.
export async function todaysRecord(provider, address, now = new Date()) {
  const c = new ethers.Contract(address, VAULT_ABI, provider);
  const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000;
  const count = Number(await c.signalCount());
  let trades = 0, losses = 0, lastLossAt = 0;
  for (let id = count; id >= 1 && id > count - 20; id--) {
    const v = await c.signalVault(id);
    if (Number(v.timestamp) < dayStart) break;
    if (Number(v.closedAt) === 0) continue; // still running
    const dep = v.originalDeposited, ret = v.realizedReturned;
    if (dep === 0n) continue;
    if (Number(v.tradeIndex) === 0 && ret === dep) continue; // cancelled + refunded
    trades++;
    if (ret < dep) { losses++; lastLossAt = Math.max(lastLossAt, Number(v.closedAt)); }
  }
  return { trades, losses, lastLossAt };
}

// USDC the enabled auto-copiers can actually put in right now. A signal with
// nothing behind it is posted, never opens, and gets cancelled — gas for nothing.
const USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const MIN_POSITION_USD = 800; // gTrade's XAU/USD minimum position size
export async function fundedPool(provider, address) {
  const c = new ethers.Contract(address, [
    "function getAutoCopyUsers() view returns (address[])",
    "function autoCopy(address) view returns (uint256 amount, bool enabled)",
  ], provider);
  const usdc = new ethers.Contract(USDC, [
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address,address) view returns (uint256)",
  ], provider);
  let total = 0n;
  for (const u of await c.getAutoCopyUsers()) {
    const ac = await c.autoCopy(u);
    if (!ac.enabled) continue;
    const [bal, allow] = await Promise.all([usdc.balanceOf(u), usdc.allowance(u, address)]);
    if (bal >= ac.amount && allow >= ac.amount) total += ac.amount;
  }
  return Number(total) / 1e6;
}

// ---------- paper trading ----------
// Same cost model as research/backtest.py: gTrade XAU 0.035% each way plus
// 0.01% slippage each way, 0.001%/h borrowing + funding, 20% fee on winners.
const PAPER_COST_RT = 0.0009;
const PAPER_HOLD_H = 0.00001;
const PAPER_PERF_FEE = 0.2;
const PAPER_TIME_STOP_H = 24;

function paperToday(now = new Date()) {
  const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const today = state.paper.closed.filter((t) => t.openedAt >= dayStart);
  const losses = today.filter((t) => t.result < 0);
  return {
    trades: today.length + (state.paper.open ? 1 : 0),
    losses: losses.length,
    lastLossAt: losses.length ? Math.max(...losses.map((t) => t.closedAt)) / 1000 : 0,
  };
}

export function paperTally() {
  const c = state.paper.closed;
  const total = c.reduce((a, t) => a + t.result, 0);
  const wins = c.filter((t) => t.result > 0).length;
  return { trades: c.length, wins, total, open: state.paper.open };
}

// Walk 5-minute candles since entry. Stop and target in the same candle count
// as the stop, as in the backtest.
export async function resolvePaper() {
  const t = state.paper.open;
  if (!t) return;
  const bars = await fetchGoldBarsSince(t.openedAt / 1000, 5);
  let exit = null, reason = null, at = null;
  for (const b of bars) {
    if (b.t < t.openedAt) continue;
    const hitSl = t.isLong ? b.l <= t.sl : b.h >= t.sl;
    const hitTp = t.isLong ? b.h >= t.tp : b.l <= t.tp;
    if (hitSl) { exit = t.sl; reason = "stop-loss"; at = b.t; break; }
    if (hitTp) { exit = t.tp; reason = "take-profit"; at = b.t; break; }
  }
  const ageH = (Date.now() - t.openedAt) / 3.6e6;
  if (exit == null && ageH >= PAPER_TIME_STOP_H && bars.length) {
    exit = bars[bars.length - 1].c; reason = "24h time stop"; at = Date.now();
  }
  if (exit == null) return;

  const hours = Math.max(1, (at - t.openedAt) / 3.6e6);
  const move = ((exit - t.entry) / t.entry) * (t.isLong ? 1 : -1);
  let result = Math.max((move - PAPER_COST_RT - PAPER_HOLD_H * hours) * t.leverage, -1);
  if (result > 0) result *= 1 - PAPER_PERF_FEE;
  state.paper.closed.push({ ...t, exit, reason, closedAt: at, result });
  state.paper.open = null;
  saveState();

  const tally = paperTally();
  await dmAdmin([
    `📄 <b>PAPER TRADE CLOSED</b> — ${reason}`,
    ``,
    `${t.isLong ? "LONG" : "SHORT"} XAU/USD · entry $${t.entry.toFixed(2)} → exit $${exit.toFixed(2)}`,
    `Result for a copier: <b>${result >= 0 ? "+" : ""}${(result * 100).toFixed(1)}%</b> of the amount copied (${t.leverage}x, after fees)`,
    ``,
    `Paper record: ${tally.trades} trades, ${tally.wins} won, total ${tally.total >= 0 ? "+" : ""}${(tally.total * 100).toFixed(1)}% of one stake`,
  ].join("\n"));
}

// ---------- the loop ----------
let timer = null;
let provider = null;

async function tick() {
  try {
    if (!state.enabled) return;
    if (cfg.dryRun) {
      try { await resolvePaper(); } catch (e) { log(`paper resolve failed: ${e.message}`); }
      if (state.paper.open) return; // one paper position at a time
    }
    if (!goldMarketOpen()) return;

    // Keep the analysis fresh; the site only regenerates for an authorized caller.
    const secret = process.env.ANALYSIS_REFRESH_SECRET;
    if (secret && Date.now() - state.lastRefresh > REFRESH_EVERY_MS) {
      state.lastRefresh = Date.now();
      saveState();
      try {
        const r = await fetch(`${SITE}/api/analyze-gold?refresh=1`, {
          headers: { "x-refresh-secret": secret },
          signal: AbortSignal.timeout(90_000),
        });
        log(`analysis refresh → HTTP ${r.status}`);
      } catch (e) {
        log(`analysis refresh failed: ${e.message}`);
      }
    }

    const r = await fetch(`${SITE}/api/signals-active`, { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return;
    const data = await r.json();
    if (!data.active || !data.signal) return;
    const s = data.signal;
    if (s.id === state.handledRowId) return;
    if (Number(s.confidence) < cfg.minConfidence) return;

    const rec = cfg.dryRun ? paperToday() : await todaysRecord(provider, process.env.GOLD_COPY_TRADER_ADDRESS);
    if (rec.trades >= cfg.maxTradesPerDay) return log(`skip row ${s.id}: ${rec.trades} trades today (max ${cfg.maxTradesPerDay})`);
    if (rec.losses >= cfg.maxLossesPerDay) return log(`skip row ${s.id}: ${rec.losses} losses today — done for the day`);
    const sinceLoss = (Date.now() / 1000 - rec.lastLossAt) / 60;
    if (rec.lastLossAt && sinceLoss < cfg.cooldownMin) return log(`skip row ${s.id}: cooling down, last loss ${sinceLoss.toFixed(0)}m ago`);

    const pool = cfg.dryRun ? Infinity : await fundedPool(provider, process.env.GOLD_COPY_TRADER_ADDRESS);
    if (pool * cfg.leverage < MIN_POSITION_USD) {
      return log(`skip row ${s.id}: funded auto-copy pool $${pool.toFixed(0)} × ${cfg.leverage}x is under gTrade's $${MIN_POSITION_USD} minimum`);
    }

    const row = await loadAnalysisRow(s.id);
    const res = await postSignalFromAnalysis(row, { leverage: cfg.leverage, dryRun: cfg.dryRun });
    if (!res.ok) {
      // "busy" means a signal is still running: try this row again next tick.
      if (res.reason !== "busy") { state.handledRowId = s.id; saveState(); }
      return log(`row ${s.id} not posted: ${res.detail}`);
    }
    state.handledRowId = s.id;
    if (cfg.dryRun) {
      state.paper.open = { rowId: s.id, isLong: res.isLong, entry: res.entry, sl: res.sl, tp: res.tp, leverage: res.leverage, openedAt: Date.now() };
    }
    saveState();
    await dmAdmin([
      cfg.dryRun ? `📄 <b>PAPER TRADE OPENED</b> — not on-chain, not in the group` : `🤖 <b>AUTOPILOT POSTED</b>`,
      ``,
      describePosted(res, row),
      ``,
      `Today: ${rec.trades} trades, ${rec.losses} losses before this one.`,
      `Stop it any time: /autopilot off`,
    ].join("\n"));
  } catch (err) {
    console.error("[AUTOPILOT] tick error:", err);
  }
}

export function startAutopilot(httpProvider) {
  provider = httpProvider;
  log(`started — ${state.enabled ? "ENABLED" : "disabled"}${cfg.dryRun ? " (dry run)" : ""}; lev ${cfg.leverage}x, conf ≥${cfg.minConfidence}, ≤${cfg.maxTradesPerDay} trades/day, stop after ${cfg.maxLossesPerDay} losses, ${cfg.cooldownMin}m cooldown`);
  tick();
  timer = setInterval(tick, TICK_MS);
}

export function stopAutopilot() {
  if (timer) clearInterval(timer);
  timer = null;
}

// Admin DM command: /autopilot on | off | status
export async function handleAutopilotCommand(arg) {
  if (arg === "on") { state.enabled = true; saveState(); }
  if (arg === "off") { state.enabled = false; saveState(); }
  let today = "";
  try {
    const rec = await todaysRecord(provider, process.env.GOLD_COPY_TRADER_ADDRESS);
    today = `\nToday: ${rec.trades}/${cfg.maxTradesPerDay} trades, ${rec.losses}/${cfg.maxLossesPerDay} losses`;
  } catch {}
  try {
    const pool = await fundedPool(provider, process.env.GOLD_COPY_TRADER_ADDRESS);
    today += `
Funded auto-copy pool: $${pool.toFixed(2)} (needs $${(MIN_POSITION_USD / cfg.leverage).toFixed(0)}+ to trade)`;
  } catch {}
  if (cfg.dryRun) {
    const p = paperTally();
    today += `\nPaper record: ${p.trades} trades, ${p.wins} won, total ${p.total >= 0 ? "+" : ""}${(p.total * 100).toFixed(1)}% of one stake` +
      (p.open ? `\nOpen: ${p.open.isLong ? "LONG" : "SHORT"} from $${p.open.entry.toFixed(2)} (SL $${p.open.sl.toFixed(2)}, TP $${p.open.tp.toFixed(2)})` : "");
  }
  return [
    `🤖 Autopilot is <b>${state.enabled ? "ON" : "OFF"}</b>${cfg.dryRun ? " — PAPER mode (nothing on-chain, nothing in the group)" : " — LIVE"}`,
    `Market ${goldMarketOpen() ? "open" : "closed"} · leverage ${cfg.leverage}x · min confidence ${cfg.minConfidence}%`,
    `Cooldown after a loss: ${cfg.cooldownMin}m${today}`,
  ].join("\n");
}
