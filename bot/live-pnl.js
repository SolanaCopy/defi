/**
 * Live PnL updater — edits the Telegram "Trade Opened" caption every 45s
 * with current Pyth price + net PnL. Persists state to disk so a bot restart
 * resumes the loop; polls on-chain signal status as safety so the loop stops
 * even if SignalSettled event is missed.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, "live-pnl-state.json");

const PYTH_XAU_FEED = "0x765d2ba906dbc32ca17cc11f5310a89e9ee1f6420508c63861f2f8ba4ee34bb2";
const UPDATE_INTERVAL_MS = 45_000;
const SAFETY_CHECK_EVERY = 5; // every 5 edits, verify on-chain signal is still open
const FEE_RATE = 0.0012; // matches close-watcher.js fee estimate

const intervals = new Map(); // signalId → intervalId

function log(m) { console.log(`[${new Date().toISOString()}] [live-pnl] ${m}`); }
function logError(m, e) { console.error(`[${new Date().toISOString()}] [live-pnl] ERROR: ${m}`, e?.message || e); }

function loadState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return {};
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch (e) {
    logError("Failed to load state", e);
    return {};
  }
}

function saveState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    logError("Failed to save state", e);
  }
}

async function fetchPythPrice() {
  const res = await fetch(`https://hermes.pyth.network/v2/updates/price/latest?ids[]=${PYTH_XAU_FEED}`);
  if (!res.ok) throw new Error(`Pyth HTTP ${res.status}`);
  const d = await res.json();
  return Number(d.parsed[0].price.price) * Math.pow(10, Number(d.parsed[0].price.expo));
}

function buildCaption(meta, price, elapsed) {
  const { long, leverage, entry, pool, tp, sl, signalId, tpUsd, slUsd, tpPct, slPct } = meta;
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
  const ago = elapsed < 60 ? `${elapsed}s ago` : `${Math.floor(elapsed / 60)}m ago`;
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
    `📊 Now: $${price.toFixed(2)} · updated ${ago}`,
  ].join("\n");
}

async function editCaption(botToken, chatId, messageId, caption, replyMarkup) {
  const body = {
    chat_id: chatId,
    message_id: messageId,
    caption,
    parse_mode: "HTML",
  };
  if (replyMarkup) body.reply_markup = replyMarkup;
  const res = await fetch(`https://api.telegram.org/bot${botToken}/editMessageCaption`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) {
    // "message is not modified" is harmless — shouldn't happen since we include ago-timer but safe to ignore
    if (data.description && data.description.includes("not modified")) return;
    throw new Error(`Telegram edit failed: ${data.description}`);
  }
}

async function safetyCheckSignalOpen(copyTrader, signalId) {
  try {
    // phase: 0=none, 1=posted, 2=open, 3=closed/settled
    const core = await copyTrader.signalCore(signalId);
    const phase = Number(core.phase);
    return phase === 2; // still open
  } catch (e) {
    logError(`safety check for #${signalId}`, e);
    return true; // fail-open: don't stop the loop on a transient RPC error
  }
}

/**
 * Start the live PnL edit loop for a signal.
 * @param params.signalId - signal id
 * @param params.messageId - Telegram message id of the "Trade Opened" photo
 * @param params.meta - { long, leverage, entry, pool, tp, sl, tpUsd, slUsd, tpPct, slPct, openedAt }
 * @param params.replyMarkup - inline_keyboard markup to preserve on edits
 * @param params.botToken / chatId / copyTrader
 */
export function startLivePnl({ signalId, messageId, meta, replyMarkup, botToken, chatId, copyTrader }) {
  const sid = String(signalId);
  stopLivePnl(sid); // guard against duplicate intervals

  // persist
  const state = loadState();
  state[sid] = { signalId: sid, messageId, meta, replyMarkup, openedAt: meta.openedAt || Date.now() };
  saveState(state);

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
      const elapsed = Math.floor((Date.now() - (meta.openedAt || Date.now())) / 1000);
      const caption = buildCaption({ ...meta, signalId: sid }, price, elapsed);
      await editCaption(botToken, chatId, messageId, caption, replyMarkup);
    } catch (e) {
      logError(`edit tick for #${sid}`, e);
    }
  };

  // fire first update quickly so users see live PnL within seconds, not 45s later
  setTimeout(run, 8_000);
  const id = setInterval(run, UPDATE_INTERVAL_MS);
  intervals.set(sid, id);
  log(`Started live PnL for signal #${sid} (message ${messageId})`);
}

export function stopLivePnl(signalId, finalEdit = null) {
  const sid = String(signalId);
  const id = intervals.get(sid);
  if (id) {
    clearInterval(id);
    intervals.delete(sid);
  }
  const state = loadState();
  if (state[sid]) {
    delete state[sid];
    saveState(state);
  }
  if (id) log(`Stopped live PnL for signal #${sid}`);
  return !!id;
}

/**
 * On bot boot, re-hydrate any active live PnL loops from the state file.
 * Immediately runs a safety check so we don't resume a loop for a trade
 * that settled while the bot was down.
 */
export async function resumeLivePnl({ botToken, chatId, copyTrader }) {
  const state = loadState();
  const sids = Object.keys(state);
  if (sids.length === 0) return;
  log(`Resuming live PnL for ${sids.length} signal(s): ${sids.join(", ")}`);
  for (const sid of sids) {
    const stillOpen = await safetyCheckSignalOpen(copyTrader, sid);
    if (!stillOpen) {
      log(`Signal #${sid} already settled during downtime, clearing state`);
      stopLivePnl(sid);
      continue;
    }
    const { messageId, meta, replyMarkup } = state[sid];
    startLivePnl({ signalId: sid, messageId, meta, replyMarkup, botToken, chatId, copyTrader });
  }
}
