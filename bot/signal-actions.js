// Turns a Scalp AI verdict (a gold_analysis row) into an on-chain signal.
//
// postSignalFromAnalysis: the one path that posts. It re-anchors entry to the
// live gTrade price, keeps the SL/TP distances, applies the R:R gate and calls
// postSignal(). Both callers go through it:
//   - approveAndOpenSignal: the admin's Approve button on a DM alert
//   - autopilot.js: the unattended loop
// The SignalPosted listener in close-watcher.js then runs auto-copy and opens
// the trade on gTrade.
//
// dismissSignal: edits the DM to mark dismissed; no on-chain action.

import { ethers } from "ethers";
import { createClient } from "@supabase/supabase-js";
import { fetchGoldPrice } from "./gold-price.js";

const RPC = process.env.ARBITRUM_RPC_HTTPS;
const COPY_TRADER = process.env.GOLD_COPY_TRADER_ADDRESS;
const ADMIN_KEY = process.env.ADMIN_PRIVATE_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
// Railway only has SUPABASE_KEY; requiring the service-role name made every
// approval die on "Supabase env missing".
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

const LEV_PREC = 1000n;
export const DEFAULT_LEVERAGE = 25;

// ===== RISK / REWARD GATE =====
// Mirrors the gate in src/App.jsx.
//
// gTrade takes 0.06% of position size in and 0.06% out. Against the price move
// that is a flat 0.12%, since payoff and fee both scale with leverage.
const GTRADE_ROUNDTRIP_FEE = 0.0012;
// Break-even R:R at the observed 46% win rate over the first 72 trades.
const RR_HARD_FLOOR = 1.36;

function netRiskReward({ entry, tp, sl }) {
  const rewardMove = Math.abs(tp - entry) / entry;
  const riskMove = Math.abs(entry - sl) / entry;
  if (!(riskMove > 0)) return null;
  const netReward = rewardMove - GTRADE_ROUNDTRIP_FEE;
  if (netReward <= 0) return { netRR: 0, riskMove, feeDragPct: 100 };
  return {
    netRR: netReward / (riskMove + GTRADE_ROUNDTRIP_FEE),
    riskMove,
    feeDragPct: (GTRADE_ROUNDTRIP_FEE / riskMove) * 100,
  };
}

const COPY_TRADER_ABI = [
  "function postSignal(bool _long, uint64 _entry, uint64 _tp, uint64 _sl, uint24 _lev) external",
  "function activeSignalId() view returns (uint256)",
  "event SignalPosted(uint256 indexed id, bool long, uint64 entry, uint64 tp, uint64 sl, uint24 leverage)",
];

let _provider, _wallet, _contract;
function getContract() {
  if (!RPC || !COPY_TRADER || !ADMIN_KEY) {
    throw new Error("Missing env: ARBITRUM_RPC_HTTPS, GOLD_COPY_TRADER_ADDRESS, or ADMIN_PRIVATE_KEY");
  }
  if (!_contract) {
    _provider = new ethers.JsonRpcProvider(RPC);
    _wallet = new ethers.Wallet(ADMIN_KEY, _provider);
    _contract = new ethers.Contract(COPY_TRADER, COPY_TRADER_ABI, _wallet);
  }
  return _contract;
}

export function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error("Supabase env missing");
  return createClient(SUPABASE_URL, SUPABASE_KEY);
}

export async function loadAnalysisRow(id) {
  const { data } = await getSupabase()
    .from("gold_analysis")
    .select("id, verdict, setup_type, entry, stop_loss, take_profit, rr_ratio, confidence, summary, valid_until")
    .eq("id", id)
    .maybeSingle();
  return data;
}

// Returns { ok: true, ... } when posted (or would be, with dryRun), otherwise
// { ok: false, reason, detail }. Never throws for an ordinary "no".
export async function postSignalFromAnalysis(row, { leverage = DEFAULT_LEVERAGE, dryRun = false } = {}) {
  if (!row) return { ok: false, reason: "not_found", detail: "Signal not found" };
  if (row.setup_type === "none" || !row.entry || !row.stop_loss || !row.take_profit) {
    return { ok: false, reason: "no_setup", detail: "No setup to open" };
  }
  if (row.verdict !== "bullish" && row.verdict !== "bearish") {
    return { ok: false, reason: "no_direction", detail: "Verdict must be bullish or bearish to open a trade" };
  }
  if (row.valid_until && new Date(row.valid_until).getTime() < Date.now()) {
    return { ok: false, reason: "expired", detail: "Signal expired — re-run analysis" };
  }

  // postSignal reverts while another signal is active; say so plainly instead
  // of paying gas to find out.
  const c = getContract();
  if (Number(await c.activeSignalId()) !== 0) {
    return { ok: false, reason: "busy", detail: "Another signal is still active" };
  }

  // Re-anchor entry to the live price, preserve SL/TP distances.
  const liveNow = await fetchGoldPrice();
  const isLong = row.verdict === "bullish";
  const riskDist = Math.abs(Number(row.entry) - Number(row.stop_loss));
  const rewardDist = Math.abs(Number(row.take_profit) - Number(row.entry));
  const entry = liveNow;
  const sl = isLong ? entry - riskDist : entry + riskDist;
  const tp = isLong ? entry + rewardDist : entry - rewardDist;

  // Gate on the re-anchored numbers: the distances are kept but the entry
  // moved, so the ratio shifts.
  const rr = netRiskReward({ entry, tp, sl });
  if (!rr || rr.netRR < RR_HARD_FLOOR) {
    return {
      ok: false, reason: "rr", netRR: rr ? rr.netRR : null, feeDragPct: rr ? rr.feeDragPct : null,
      entry, detail: `Net R:R ${rr ? rr.netRR.toFixed(2) : "n/a"} below ${RR_HARD_FLOOR}`,
    };
  }

  const plan = { isLong, entry, sl, tp, leverage, netRR: rr.netRR };
  console.log(`[SIGNAL] ${dryRun ? "DRY-RUN " : ""}post row=${row.id} ${isLong ? "LONG" : "SHORT"} entry=${entry.toFixed(2)} sl=${sl.toFixed(2)} tp=${tp.toFixed(2)} lev=${leverage}x netRR=${rr.netRR.toFixed(2)}`);
  if (dryRun) return { ok: true, dryRun: true, ...plan };

  const tx = await c.postSignal(
    isLong,
    BigInt(Math.round(entry * 1e10)),
    BigInt(Math.round(tp * 1e10)),
    BigInt(Math.round(sl * 1e10)),
    BigInt(leverage) * LEV_PREC,
  );
  const receipt = await tx.wait();
  const ev = receipt.logs
    .map((l) => { try { return c.interface.parseLog(l); } catch { return null; } })
    .find((e) => e && e.name === "SignalPosted");
  return { ok: true, txHash: tx.hash, onchainSignalId: ev ? Number(ev.args.id) : null, ...plan };
}

// ===== Telegram helpers =====
async function tg(method, body) {
  const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

async function answerCallback(callbackQueryId, text, showAlert = false) {
  return tg("answerCallbackQuery", { callback_query_id: callbackQueryId, text, show_alert: showAlert });
}

async function editMessage(chatId, messageId, text) {
  return tg("editMessageText", { chat_id: chatId, message_id: messageId, text, parse_mode: "HTML", disable_web_page_preview: true });
}

export function describePosted(res, row) {
  return [
    `<b>${res.isLong ? "LONG" : "SHORT"}</b> XAU/USD · ${(row.setup_type || "").replace(/_/g, " ")}`,
    `Entry: $${res.entry.toFixed(2)}  ·  SL: $${res.sl.toFixed(2)}  ·  TP: $${res.tp.toFixed(2)}`,
    `Leverage: ${res.leverage}x  ·  net R:R ${res.netRR.toFixed(2)}:1  ·  confidence ${row.confidence}%`,
    ``,
    res.onchainSignalId != null ? `On-chain signal #${res.onchainSignalId}` : res.txHash ? `Tx: <code>${res.txHash}</code>` : `(dry run — nothing sent)`,
    res.txHash ? `<a href="https://arbiscan.io/tx/${res.txHash}">View on Arbiscan</a>` : ``,
  ].join("\n");
}

export async function approveAndOpenSignal({ signalRowId, chatId, messageId, callbackQueryId }) {
  try {
    const row = await loadAnalysisRow(signalRowId);
    await answerCallback(callbackQueryId, "Opening trade…");
    const res = await postSignalFromAnalysis(row);

    if (!res.ok && res.reason === "rr") {
      await editMessage(
        chatId, messageId,
        `🚫 <b>Signal blocked</b>\n\n` +
        `Risk/reward is <b>${res.netRR != null ? res.netRR.toFixed(2) : "n/a"}</b> net of fees — below the ${RR_HARD_FLOOR} break-even floor.\n\n` +
        `Fees eat ${res.feeDragPct != null ? res.feeDragPct.toFixed(0) : "?"}% of the stop distance.\n\n` +
        `Widen the take profit, or move the stop <b>further out</b> — a tighter stop ` +
        `makes this worse, since the fee is fixed and a smaller risk budget gives it ` +
        `a bigger share. On gold you need roughly ` +
        `${Math.round((GTRADE_ROUNDTRIP_FEE / 0.15) * res.entry)} points of stop to keep fees under 15% of risk.`
      );
      return res;
    }
    if (!res.ok) {
      await editMessage(chatId, messageId, `🚫 <b>Not opened</b> — ${res.detail}`);
      return res;
    }

    await editMessage(chatId, messageId, [
      `✅  <b>APPROVED & OPENED</b>`,
      ``,
      describePosted(res, row),
      ``,
      `Auto-copy is now executing for all enabled copiers.`,
    ].join("\n"));
    return res;
  } catch (err) {
    console.error("[SIGNAL-ACTION] approve failed:", err);
    try {
      await answerCallback(callbackQueryId, `Failed: ${err.message?.slice(0, 100) || "unknown"}`, true);
      await editMessage(chatId, messageId, `❌ <b>OPEN FAILED</b>\n\n${err.shortMessage || err.message?.slice(0, 250) || "unknown error"}`);
    } catch {}
    return { ok: false, error: err.message };
  }
}

export async function dismissSignal({ signalRowId, chatId, messageId, callbackQueryId }) {
  try {
    await answerCallback(callbackQueryId, "Dismissed");
    await editMessage(chatId, messageId, `❌ <b>DISMISSED</b> — signal #${signalRowId} not opened.`);
    console.log(`[SIGNAL-ACTION] dismiss id=${signalRowId}`);
    return { ok: true };
  } catch (err) {
    console.error("[SIGNAL-ACTION] dismiss failed:", err);
    return { ok: false, error: err.message };
  }
}
