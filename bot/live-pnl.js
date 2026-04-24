/**
 * Live PnL updater — edits the Telegram "Trade Opened" caption every 45s
 * with current Pyth price + net PnL. State is persisted to Supabase so a
 * Railway redeploy/restart resumes the loop mid-trade. Every N ticks runs
 * an on-chain phase check so the loop stops even if SignalSettled is missed.
 */

import { createClient } from "@supabase/supabase-js";

const PYTH_XAU_FEED = "0x765d2ba906dbc32ca17cc11f5310a89e9ee1f6420508c63861f2f8ba4ee34bb2";
const UPDATE_INTERVAL_MS = 45_000;
const SAFETY_CHECK_EVERY = 5;
const FEE_RATE = 0.0012;
const TABLE = "live_pnl_state";

const intervals = new Map(); // signalId → intervalId

let _supabase = null;
function supabase() {
  if (_supabase) return _supabase;
  const { SUPABASE_URL, SUPABASE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  _supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  return _supabase;
}

function log(m) { console.log(`[${new Date().toISOString()}] [live-pnl] ${m}`); }
function logError(m, e) { console.error(`[${new Date().toISOString()}] [live-pnl] ERROR: ${m}`, e?.message || e); }

async function saveRow(row) {
  const sb = supabase();
  if (!sb) { logError("no supabase — cannot persist state"); return; }
  const { error } = await sb.from(TABLE).upsert(row, { onConflict: "signal_id" });
  if (error) logError("save state", error);
}

async function deleteRow(signalId) {
  const sb = supabase();
  if (!sb) return;
  const { error } = await sb.from(TABLE).delete().eq("signal_id", String(signalId));
  if (error) logError("delete state", error);
}

async function loadAllRows() {
  const sb = supabase();
  if (!sb) return [];
  const { data, error } = await sb.from(TABLE).select("*");
  if (error) { logError("load state", error); return []; }
  return data || [];
}

async function fetchPythPrice() {
  const res = await fetch(`https://hermes.pyth.network/v2/updates/price/latest?ids[]=${PYTH_XAU_FEED}`);
  if (!res.ok) throw new Error(`Pyth HTTP ${res.status}`);
  const d = await res.json();
  return Number(d.parsed[0].price.price) * Math.pow(10, Number(d.parsed[0].price.expo));
}

function buildCaption(meta, price, elapsed) {
  const { long, leverage, entry, pool, signalId, tpUsd, slUsd, tpPct, slPct } = meta;
  const dir = long ? "LONG" : "SHORT";
  const emoji = long ? "🟢" : "🔴";
  const grossPct = long
    ? ((price - entry) / entry) * leverage * 100
    : ((entry - price) / entry) * leverage * 100;
  const grossUsd = pool * grossPct / 100;
  const posSize = pool * leverage;
  const fees = posSize * FEE_RATE;
  const netUsd = grossUsd - fees;
  const netPct = pool > 0 ? (netUsd / pool) * 100 : grossPct;
  const pnlSign = netUsd >= 0 ? "+" : "";
  const pnlEmoji = netUsd >= 0 ? "🟢" : "🔴";
  const openFor = elapsed < 60 ? `${elapsed}s` : elapsed < 3600 ? `${Math.floor(elapsed / 60)}m` : `${Math.floor(elapsed / 3600)}h ${Math.floor((elapsed % 3600) / 60)}m`;
  const now = new Date();
  const updatedAt = `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}:${String(now.getUTCSeconds()).padStart(2, "0")} UTC`;
  return [
    `📡 <b>Trade Opened #${signalId}</b>`,
    ``,
    `${emoji} <b>${dir}</b> · XAU/USD · <b>${leverage}x</b>`,
    `💰 Total copied: <b>$${pool.toFixed(0)} USDC</b>`,
    `📍 Entry: <b>$${entry.toFixed(2)}</b>`,
    ``,
    `🎯 Target: <b>+${tpPct.toFixed(1)}%</b> (+$${tpUsd.toFixed(2)})`,
    `🛑 Risk: <b>-${slPct.toFixed(1)}%</b> (-$${slUsd.toFixed(2)})`,
    ``,
    `${pnlEmoji} <b>Est. Live PnL: ${pnlSign}${netPct.toFixed(2)}% (${pnlSign}$${netUsd.toFixed(2)})</b>`,
    `📊 Now: $${price.toFixed(2)} · trade open ${openFor} · updated ${updatedAt}`,
  ].join("\n");
}

async function editCaption(botToken, chatId, messageId, caption, replyMarkup) {
  const body = { chat_id: chatId, message_id: messageId, caption, parse_mode: "HTML" };
  if (replyMarkup) body.reply_markup = replyMarkup;
  const res = await fetch(`https://api.telegram.org/bot${botToken}/editMessageCaption`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) {
    if (data.description && data.description.includes("not modified")) return;
    throw new Error(`Telegram edit failed: ${data.description}`);
  }
}

async function safetyCheckSignalOpen(copyTrader, signalId) {
  try {
    const core = await copyTrader.signalCore(signalId);
    return Number(core.phase) === 2;
  } catch (e) {
    logError(`safety check for #${signalId}`, e);
    return true; // fail-open on transient RPC error
  }
}

function startLoop({ signalId, messageId, meta, replyMarkup, botToken, chatId, copyTrader, openedAt }) {
  const sid = String(signalId);
  const existing = intervals.get(sid);
  if (existing) clearInterval(existing);

  let tick = 0;
  const run = async () => {
    try {
      tick++;
      if (tick % SAFETY_CHECK_EVERY === 0) {
        const stillOpen = await safetyCheckSignalOpen(copyTrader, sid);
        if (!stillOpen) {
          log(`Signal #${sid} no longer open (on-chain check), stopping live PnL`);
          stopLivePnl(sid);
          return;
        }
      }
      const price = await fetchPythPrice();
      const elapsed = Math.floor((Date.now() - openedAt) / 1000);
      const caption = buildCaption({ ...meta, signalId: sid }, price, elapsed);
      await editCaption(botToken, chatId, messageId, caption, replyMarkup);
    } catch (e) {
      logError(`edit tick for #${sid}`, e);
    }
  };

  setTimeout(run, 8_000);
  const id = setInterval(run, UPDATE_INTERVAL_MS);
  intervals.set(sid, id);
  log(`Started live PnL for signal #${sid} (message ${messageId})`);
}

/**
 * Start the live PnL edit loop for a signal and persist state to Supabase.
 */
export async function startLivePnl({ signalId, messageId, meta, replyMarkup, botToken, chatId, copyTrader }) {
  const sid = String(signalId);
  const openedAt = meta.openedAt || Date.now();

  await saveRow({
    signal_id: sid,
    message_id: messageId,
    meta,
    reply_markup: replyMarkup || null,
    opened_at: openedAt,
  });

  startLoop({ signalId: sid, messageId, meta, replyMarkup, botToken, chatId, copyTrader, openedAt });
}

export async function stopLivePnl(signalId) {
  const sid = String(signalId);
  const id = intervals.get(sid);
  if (id) {
    clearInterval(id);
    intervals.delete(sid);
  }
  await deleteRow(sid);
  if (id) log(`Stopped live PnL for signal #${sid}`);
  return !!id;
}

/**
 * On bot boot, re-hydrate any active live PnL loops from Supabase. Runs a
 * safety check first so loops aren't started for trades that settled during
 * the downtime.
 */
export async function resumeLivePnl({ botToken, chatId, copyTrader }) {
  const rows = await loadAllRows();
  if (rows.length === 0) return;
  log(`Resuming live PnL for ${rows.length} signal(s): ${rows.map(r => r.signal_id).join(", ")}`);
  for (const row of rows) {
    const sid = row.signal_id;
    const stillOpen = await safetyCheckSignalOpen(copyTrader, sid);
    if (!stillOpen) {
      log(`Signal #${sid} already settled during downtime, clearing state`);
      await deleteRow(sid);
      continue;
    }
    startLoop({
      signalId: sid,
      messageId: row.message_id,
      meta: row.meta,
      replyMarkup: row.reply_markup,
      botToken, chatId, copyTrader,
      openedAt: row.opened_at,
    });
  }
}
