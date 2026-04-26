// Admin-side handler for the inline buttons attached to DM signal alerts.
//
// approveAndOpenSignal: re-anchors entry to live Pyth, preserves SL/TP
// distance, calls postSignal() on V5, edits the DM with the result.
// The existing SignalPosted listener in close-watcher.js then handles
// the auto-copy + public group notification path.
//
// dismissSignal: edits the DM to mark dismissed; no on-chain action.

import { ethers } from "ethers";
import { createClient } from "@supabase/supabase-js";

const RPC = process.env.ARBITRUM_RPC_HTTPS;
const COPY_TRADER = process.env.GOLD_COPY_TRADER_ADDRESS;
const ADMIN_KEY = process.env.ADMIN_PRIVATE_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const PRICE_PREC = 10n ** 10n;
const LEV_PREC = 1000n;
const DEFAULT_LEVERAGE = 25;

const PYTH_GOLD_URL =
  "https://hermes.pyth.network/v2/updates/price/latest?ids[]=0x765d2ba906dbc32ca17cc11f5310a89e9ee1f6420508c63861f2f8ba4ee34bb2";

const COPY_TRADER_ABI = [
  "function postSignal(bool _long, uint64 _entry, uint64 _tp, uint64 _sl, uint24 _lev) external",
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

function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error("Supabase env missing");
  return createClient(SUPABASE_URL, SUPABASE_KEY);
}

async function fetchPythPrice() {
  const r = await fetch(PYTH_GOLD_URL, { signal: AbortSignal.timeout(6000) });
  const d = await r.json();
  const p = d.parsed?.[0]?.price;
  if (!p) throw new Error("Pyth price unavailable");
  return Number(p.price) * Math.pow(10, Number(p.expo));
}

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

export async function approveAndOpenSignal({ signalRowId, chatId, messageId, callbackQueryId }) {
  try {
    const supabase = getSupabase();
    const { data: row } = await supabase
      .from("gold_analysis")
      .select("id, verdict, setup_type, entry, stop_loss, take_profit, rr_ratio, confidence, summary, valid_until")
      .eq("id", signalRowId)
      .maybeSingle();

    if (!row) {
      await answerCallback(callbackQueryId, "Signal not found", true);
      return;
    }
    if (row.setup_type === "none" || !row.entry || !row.stop_loss || !row.take_profit) {
      await answerCallback(callbackQueryId, "No setup to open", true);
      return;
    }
    if (row.verdict !== "bullish" && row.verdict !== "bearish") {
      await answerCallback(callbackQueryId, "Verdict must be bullish or bearish to open a trade", true);
      return;
    }
    if (row.valid_until && new Date(row.valid_until).getTime() < Date.now()) {
      await answerCallback(callbackQueryId, "Signal expired — re-run analysis", true);
      return;
    }

    await answerCallback(callbackQueryId, "Opening trade…");

    // Re-anchor entry to live Pyth, preserve SL/TP distances so R:R is unchanged.
    const liveNow = await fetchPythPrice();
    const isLong = row.verdict === "bullish";
    const riskDist = Math.abs(Number(row.entry) - Number(row.stop_loss));
    const rewardDist = Math.abs(Number(row.take_profit) - Number(row.entry));
    const newEntry = liveNow;
    const newSL = isLong ? newEntry - riskDist : newEntry + riskDist;
    const newTP = isLong ? newEntry + rewardDist : newEntry - rewardDist;

    const entryBig = BigInt(Math.round(newEntry * 1e10));
    const tpBig = BigInt(Math.round(newTP * 1e10));
    const slBig = BigInt(Math.round(newSL * 1e10));
    const levBig = BigInt(DEFAULT_LEVERAGE) * LEV_PREC;

    const c = getContract();
    console.log(`[SIGNAL-ACTION] approve id=${row.id} ${isLong ? "LONG" : "SHORT"} entry=${newEntry.toFixed(2)} sl=${newSL.toFixed(2)} tp=${newTP.toFixed(2)} lev=${DEFAULT_LEVERAGE}x`);

    const tx = await c.postSignal(isLong, entryBig, tpBig, slBig, levBig);
    const receipt = await tx.wait();
    const ev = receipt.logs
      .map((l) => { try { return c.interface.parseLog(l); } catch { return null; } })
      .find((e) => e && e.name === "SignalPosted");
    const onchainSignalId = ev ? Number(ev.args.id) : null;

    await editMessage(chatId, messageId, [
      `✅  <b>APPROVED & OPENED</b>`,
      ``,
      `<b>${isLong ? "LONG" : "SHORT"}</b> XAU/USD · ${row.setup_type.replace(/_/g, " ")}`,
      `Entry: $${newEntry.toFixed(2)}  ·  SL: $${newSL.toFixed(2)}  ·  TP: $${newTP.toFixed(2)}`,
      `Leverage: ${DEFAULT_LEVERAGE}x  ·  R:R ${Number(row.rr_ratio).toFixed(2)}:1`,
      ``,
      onchainSignalId != null ? `On-chain signal #${onchainSignalId}` : `Tx: <code>${tx.hash}</code>`,
      `<a href="https://arbiscan.io/tx/${tx.hash}">View on Arbiscan</a>`,
      ``,
      `Auto-copy is now executing for all enabled copiers.`,
    ].join("\n"));

    return { ok: true, txHash: tx.hash, onchainSignalId };
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
