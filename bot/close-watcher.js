/**
 * GoldBot Auto-Close Watcher
 *
 * Monitors gTrade events on Arbitrum and automatically closes signals
 * when a trade hits TP, SL, or gets liquidated.
 *
 * Usage: node bot/close-watcher.js
 */

import "dotenv/config";
import { ethers } from "ethers";
import { createClient } from "@supabase/supabase-js";
import { signalImage, depositImage, signalClosedImage, claimImage, autoCloseImage, botOnlineImage, newCopierImage, dailySummaryImage, weeklyRecapImage, milestoneImage, winStreakImage } from "./telegram-images.js";
import { startTelegramAI, stopTelegramAI } from "./telegram-ai.js";
import { startNewsAlerts, stopNewsAlerts } from "./news-alerts.js";

// ===== CONFIG =====
const {
  ARBITRUM_RPC_WSS,
  ARBITRUM_RPC_HTTPS,
  ADMIN_PRIVATE_KEY,
  GOLD_COPY_TRADER_ADDRESS,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
  SUPABASE_URL,
  SUPABASE_KEY,
} = process.env;

// ===== SUPABASE =====
const supabase = (SUPABASE_URL && SUPABASE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

const REFERRAL_REWARD_PCT = 50; // 50% of fee goes to referrer

const GTRADE_DIAMOND = "0xFF162c694eAA571f685030649814282eA457f169";
const TRADE_MONITOR_INTERVAL = 30_000; // 30s trade check when signal active
const RECONNECT_DELAY = 5_000;
const ARBISCAN_TX = "https://arbiscan.io/tx/";
const ARBISCAN_ADDR = "https://arbiscan.io/address/";

// ===== ABI FRAGMENTS =====
const COPY_TRADER_ABI = [
  "function cancelSignal() external",
  "function closeTradeMarket(uint32 _index, uint64 _expectedPrice) external",
  "function activeSignalId() view returns (uint256)",
  "function admin() view returns (address)",
  "function getAutoCopyUsers() view returns (address[])",
  "function autoCopy(address) view returns (uint256 amount, bool enabled)",
  "function executeCopyFor(address _user, uint256 _signalId) external",
  "event SignalPosted(uint256 indexed signalId, bool long, uint64 entryPrice, uint64 tp, uint64 sl, uint24 leverage)",
  "event SignalOpened(uint256 indexed signalId, uint256 totalDeposited, uint32 gTradeIndex)",
  "event SignalSettled(uint256 indexed signalId, uint256 totalDeposited, uint256 totalReturned, int256 resultPct)",
  "event UserDeposited(address indexed user, uint256 indexed signalId, uint256 amount)",
  "event AutoCopied(address indexed user, uint256 indexed signalId, uint256 amount)",
  "event UserClaimed(address indexed user, uint256 indexed signalId, uint256 payout, uint256 fee)",
  "event FeesWithdrawn(uint256 amount)",
  "event AutoCopyEnabled(address indexed user, uint256 amount)",
  "event AutoCopyDisabled(address indexed user)",
  "function getAutoCopyUserCount() view returns (uint256)",
  "function signalCount() view returns (uint256)",
  "function signalCore(uint256) view returns (bool long, uint8 phase, uint64 entryPrice, uint64 tp, uint64 sl, uint24 leverage, uint256 feeAtCreation, uint32 gTradeIndex)",
  "function signalMeta(uint256) view returns (uint256 timestamp, uint256 closedAt, uint256 totalDeposited, uint256 totalReturned, uint256 copierCount, uint256 originalDeposited, uint256 totalEmergencyWithdrawn, uint256 totalClaimed, uint256 balanceAtOpen)",
  "function claimFor(address _user, uint256 _signalId) external",
  "function positions(address, uint256) view returns (uint256 deposit, bool claimed)",
  "function getUserSignalIds(address) view returns (uint256[])",
  "function getActiveSignalId() view returns (uint256)",
  "function settleSignal(uint256 _totalReturned) external",
  "function closeTrade(uint32 _index, uint64 _expectedPrice) external",
  "function openTrade(uint32 _gTradeIndex) external",
];

// gTrade events — we only need the fields we care about
// MarketExecuted: emitted when a market order executes (open or close)
// LimitExecuted: emitted when TP/SL/LIQ triggers
const GTRADE_ABI = [
  `event MarketExecuted(
    uint256 indexed orderId,
    address indexed user,
    uint32 indexed index,
    tuple(address user, uint32 index, uint16 pairIndex, uint24 leverage, bool long, bool isOpen, uint8 collateralIndex, uint8 tradeType, uint120 collateralAmount, uint64 openPrice, uint64 tp, uint64 sl, uint120 positionSizeToken, bool isCounterTrade) t,
    bool open,
    uint64 oraclePrice,
    uint64 marketPrice,
    uint64 liqPrice,
    uint256 priceImpact,
    int256 percentProfit,
    uint256 amountSentToTrader,
    uint256 collateralPriceUsd
  )`,
  `event LimitExecuted(
    uint256 indexed orderId,
    address indexed user,
    uint32 indexed index,
    uint32 limitIndex,
    tuple(address user, uint32 index, uint16 pairIndex, uint24 leverage, bool long, bool isOpen, uint8 collateralIndex, uint8 tradeType, uint120 collateralAmount, uint64 openPrice, uint64 tp, uint64 sl, uint120 positionSizeToken, bool isCounterTrade) t,
    address triggerCaller,
    uint8 orderType,
    uint64 oraclePrice,
    uint64 marketPrice,
    uint64 liqPrice,
    uint256 priceImpact,
    int256 percentProfit,
    uint256 amountSentToTrader,
    uint256 collateralPriceUsd,
    bool exactExecution
  )`,
];

// ===== HELPERS =====
function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function logError(msg, err) {
  console.error(`[${new Date().toISOString()}] ERROR: ${msg}`, err?.message || err);
}

// ===== TELEGRAM =====
async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      logError("Telegram send failed", err);
    }
  } catch (err) {
    logError("Telegram send error", err);
  }
}

async function sendTelegramPhoto(pngBuffer, caption = "", buttons = []) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`;
    const file = new File([pngBuffer], "notification.png", { type: "image/png" });
    const form = new FormData();
    form.append("chat_id", TELEGRAM_CHAT_ID);
    form.append("photo", file);
    if (caption) {
      form.append("caption", caption);
      form.append("parse_mode", "HTML");
    }
    if (buttons.length > 0) {
      form.append("reply_markup", JSON.stringify({
        inline_keyboard: [buttons],
      }));
    }
    const res = await fetch(url, { method: "POST", body: form });
    if (!res.ok) {
      const err = await res.text();
      logError("Telegram photo failed", err);
    }
  } catch (err) {
    logError("Telegram photo error", err);
  }
}

function shortAddr(addr) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatUSDC(amount) {
  const num = Number(amount) / 1e6;
  return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPrice(price) {
  const num = Number(price) / 1e10;
  return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// V2: calculate result % from meta (totalReturned vs originalDeposited)
function calcResultPct(meta) {
  const returned = BigInt(meta.totalReturned);
  const original = BigInt(meta.originalDeposited);
  if (original === 0n) return 0;
  if (returned >= original) {
    return Number((returned - original) * 10000n / original) / 100;
  } else {
    return -Number((original - returned) * 10000n / original) / 100;
  }
}

const WIN_MESSAGES = [
  "TP — job done, moving on.",
  "Easy TP — next setup loading.",
  "TP hit — rinse and repeat.",
  "Collected — on to the next.",
  "TP in the pocket. What's next?",
  "TP hit team — we eat together.",
  "Take Profit — trust the process.",
  "TP reached — discipline wins again.",
  "Target secured — consistency is king.",
  "TP hit — this is what preparation looks like.",
  "Profit locked — no greed, just rules.",
  "TP taken — the plan works when you follow it.",
  "Another TP — stay sharp, stay humble.",
  "TP secured — let the results speak.",
  "TP hit — we don't hope, we execute.",
  "TP hit — money moves.",
  "Target reached — textbook trade.",
  "TP locked in — smooth execution.",
  "Profit taken — easy work.",
  "TP hit — patience pays off.",
  "Target hit — clean entry, clean exit.",
  "TP secured — the system delivers.",
  "Another one in the bag.",
  "Cashed out — precision trading.",
  "TP hit — like clockwork.",
];
function getRandomWinMessage() {
  return WIN_MESSAGES[Math.floor(Math.random() * WIN_MESSAGES.length)];
}

const LOSS_MESSAGES = [
  "Stoploss hit. Part of the plan. Risk managed, on to the next one.",
  "SL hit. All according to plan, risk under control. Staying consistent.",
  "Stoploss taken. No emotion, just business. Next opportunity is coming.",
  "Stoploss hit. Risk controlled, process intact.",
  "SL taken. Capital protected, focus stays sharp.",
  "Stoploss. Part of the game. No stress.",
  "One against us. Structure remains solid.",
  "SL hit team. All according to plan — waiting for the next setup.",
  "Stoploss hit. Risk managed. We'll catch the next one together.",
  "Losses are part of the game. We keep building.",
  "Loss taken within the rules. Everything under control.",
  "SL hit. Daily risk safe.",
  "SL hit, rules followed. That's what counts.",
  "Capital first, profits follow.",
  "Stoploss is not a mistake, it's protection. On to the next one.",
  "SL hit. This is why we have risk management.",
  "We follow rules, not emotions.",
  "This is why we work with fixed risk.",
  "SL prevents major damage. No SL, no long-term success.",
];
function getRandomLossMessage() {
  return LOSS_MESSAGES[Math.floor(Math.random() * LOSS_MESSAGES.length)];
}

const LINE = "";
const WEBSITE = "https://www.smarttradingclub.io";
const BTN_COPY = { text: "💰 Copy Now", url: `${WEBSITE}?tab=dashboard` };
const BTN_APP = { text: "🚀 Open App", url: `${WEBSITE}?tab=dashboard` };
const BTN_CLAIM = { text: "🏆 Claim Profits", url: `${WEBSITE}?tab=dashboard` };
const BTN_CONTRACT = { text: "📄 Contract", url: `${ARBISCAN_ADDR}${GOLD_COPY_TRADER_ADDRESS}` };
const BTN_TG = { text: "💬 Community", url: "https://t.me/SmartTradingClubDapp" };
const txBtn = (hash) => ({ text: "🔗 View TX", url: `${ARBISCAN_TX}${hash}` });

/**
 * Convert gTrade's percentProfit to contract's resultPct.
 *
 * gTrade percentProfit: in 1e10 precision, already leveraged
 *   → 1e10 = 100% profit on collateral
 *   → 5e9  = 50% profit on collateral
 *
 * Contract resultPct: in basis points, raw price movement (before leverage)
 *   → 100 = 1% price move
 *   → Contract then multiplies: profit = col * resultPct * leverage / (10000 * 1000)
 *
 * Formula: contractResultPct = gTradePercentProfit / (1000 * leverage)
 *   where leverage is in contract units (50000 = 50x)
 */
function convertPercentProfit(gTradePercent, leverage) {
  const result = gTradePercent / (1000n * BigInt(leverage));

  // Clamp to MAX_RESULT_PCT range (-5000 to 5000)
  if (result > 5000n) return 5000n;
  if (result < -5000n) return -5000n;
  return result;
}

// ===== MAIN BOT =====
class CloseWatcher {
  constructor() {
    this.running = false;
    this.processing = false; // prevent double-close
  }

  async start() {
    // Validate env
    if (!ADMIN_PRIVATE_KEY || !GOLD_COPY_TRADER_ADDRESS) {
      throw new Error("Missing ADMIN_PRIVATE_KEY or GOLD_COPY_TRADER_ADDRESS in .env");
    }
    if (!ARBITRUM_RPC_WSS && !ARBITRUM_RPC_HTTPS) {
      throw new Error("Need at least ARBITRUM_RPC_WSS or ARBITRUM_RPC_HTTPS in .env");
    }

    this.running = true;
    log("Starting GoldBot Close Watcher...");
    log(`Contract: ${GOLD_COPY_TRADER_ADDRESS}`);
    log(`gTrade Diamond: ${GTRADE_DIAMOND}`);

    // Debug: log key format (not the key itself)
    const key = ADMIN_PRIVATE_KEY?.trim();
    log(`Private key length: ${key?.length}, starts with 0x: ${key?.startsWith("0x")}, has spaces: ${key !== ADMIN_PRIVATE_KEY}`);

    // Set up HTTP provider for transactions (always needed)
    const httpRpc = ARBITRUM_RPC_HTTPS || "https://arb1.arbitrum.io/rpc";
    this.httpProvider = new ethers.JsonRpcProvider(httpRpc);
    // Use same provider for logs — limit block range to 10 for Alchemy free tier
    this.wallet = new ethers.Wallet(key, this.httpProvider);
    this.copyTrader = new ethers.Contract(GOLD_COPY_TRADER_ADDRESS, COPY_TRADER_ABI, this.wallet);
    this.usdc = new ethers.Contract(
      "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      ["function transfer(address to, uint256 amount) returns (bool)", "function balanceOf(address) view returns (uint256)"],
      this.wallet
    );

    // Verify admin
    const adminAddr = await this.copyTrader.admin();
    if (adminAddr.toLowerCase() !== this.wallet.address.toLowerCase()) {
      throw new Error(`Wallet ${this.wallet.address} is not admin (admin is ${adminAddr})`);
    }
    log(`Admin wallet: ${this.wallet.address}`);

    // Telegram status
    if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
      log("Telegram notifications enabled");
    } else {
      log("Telegram not configured — notifications disabled");
    }

    // Listen for contract events (deposits, claims, signals)
    this.listenContractEvents();

    // Start AI assistant (answers questions in Telegram)
    startTelegramAI();

    // Start forex news alerts
    startNewsAlerts();

    // Try WebSocket for real-time events
    if (ARBITRUM_RPC_WSS) {
      this.connectWebSocket();
    }

    // Trade monitor: checks gTrade every 30s when signal active (replaces heavy event polling)
    this.startTradeMonitor();

    // IMMEDIATE: check for stuck trades on startup (trade closed while bot was down)
    this.checkStuckTradeOnStartup();
  }

  async checkStuckTradeOnStartup() {
    try {
      const activeId = await this.copyTrader.activeSignalId();
      if (Number(activeId) === 0) return;

      const signal = await this.copyTrader.signalCore(activeId);
      if (Number(signal.phase) !== 2) return; // not TRADING (enum: 0=NONE, 1=COLLECTING, 2=TRADING, 3=SETTLED)

      const meta = await this.copyTrader.signalMeta(activeId);
      if (Number(meta.originalDeposited) === 0) return; // openTrade not completed

      // Check if gTrade position still exists
      const gTrade = new ethers.Contract(GTRADE_DIAMOND, [
        "function getTrades(address) view returns (tuple(address,uint32,uint16,uint24,bool,bool,uint8,uint8,uint120,uint64,uint64,uint64,bool,uint160,uint24)[])",
      ], this.httpProvider);
      const trades = await gTrade.getTrades(GOLD_COPY_TRADER_ADDRESS);

      if (trades.length === 0) {
        log("STARTUP: Found stuck trade! Signal #" + activeId + " — gTrade position gone, settling...");

        const contractBalance = await this.usdc.balanceOf(this.copyTrader.target);
        const collateral = Number(meta.originalDeposited);
        const balanceAtOpen = Number(meta.balanceAtOpen);
        const returned = BigInt(contractBalance) - (BigInt(balanceAtOpen) - BigInt(collateral));

        if (returned > 0n && returned <= BigInt(contractBalance)) {
          log("  Settling with $" + (Number(returned) / 1e6).toFixed(2) + " (from balance)");
          const tx = await this.copyTrader.settleSignal(returned);
          await tx.wait();
          log("  Signal #" + activeId + " settled on startup!");

          // Send notification
          const entry = Number(signal.entryPrice) / 1e10;
          const tp = Number(signal.tp) / 1e10;
          const sl = Number(signal.sl) / 1e10;
          const lev = Number(signal.leverage) / 1000;
          const isWin = Number(returned) > collateral;
          const closePrice = isWin ? tp : sl;
          const pctMove = ((closePrice - entry) / entry) * 100 * (signal.long ? 1 : -1);
          const pct = pctMove * lev;
          const poolIn = collateral / 1e6;
          const poolOut = Number(returned) / 1e6;
          const pnlUsd = poolOut - poolIn;
          const win = pct >= 0;
          const dir = signal.long ? "LONG" : "SHORT";

          const img = await autoCloseImage({
            signalId: String(activeId), direction: dir, leverage: `${lev}x`, resultPct: pct,
          });
          await sendTelegramPhoto(img, [
            win ? `✅ <b>Signal #${activeId} Closed — Profit</b>` : `❌ <b>Signal #${activeId} Closed — Loss</b>`,
            ``,
            `📊 Result: <b>${win ? "+" : ""}${pct.toFixed(1)}%</b>`,
            `💵 PnL: <b>${pnlUsd >= 0 ? "+" : ""}$${pnlUsd.toFixed(2)} USDC</b>`,
            `💰 Pool: $${poolIn.toFixed(0)} → $${poolOut.toFixed(0)} USDC`,
            ``,
            `💬 <i>${win ? getRandomWinMessage() : getRandomLossMessage()}</i>`,
          ].join("\n"), [
            win ? { text: "🏆 Claim Profits", url: WEBSITE } : { text: "🚀 Open App", url: WEBSITE },
          ]);
        } else {
          log("  Balance method failed, returned=" + Number(returned) / 1e6 + " — waiting for safety net");
        }
      } else {
        log("Startup: Signal #" + activeId + " still has " + trades.length + " open gTrade position(s) — monitoring");
      }
    } catch (err) {
      logError("Startup stuck trade check", err);
    }
  }

  // ===== CONTRACT EVENT LISTENER =====
  listenContractEvents() {
    const provider = this.wsProvider || this.httpProvider;
    const contract = new ethers.Contract(GOLD_COPY_TRADER_ADDRESS, COPY_TRADER_ABI, provider);

    // Buttons defined at module level

    // ── New signal posted — auto-copy only, no Telegram notification yet ──
    contract.on("SignalPosted", async (signalId, long, entryPrice, tp, sl, leverage, event) => {
      log(`SignalPosted #${signalId} — running auto-copy deposits`);

      // Auto-copy for enabled users (sequential with nonce management)
      try {
        const users = await this.copyTrader.getAutoCopyUsers();
        let nonce = await this.wallet.getNonce();
        for (const user of users) {
          try {
            const config = await this.copyTrader.autoCopy(user);
            if (!config.enabled) continue;
            log(`Auto-copy for ${shortAddr(user)} ($${Number(config.amount) / 1e6})...`);
            const tx = await this.copyTrader.executeCopyFor(user, signalId, { nonce });
            nonce++;
            await tx.wait();
            log(`Auto-copied for ${shortAddr(user)}`);
          } catch (err) {
            log(`Auto-copy skip ${shortAddr(user)}: ${err.reason || err.message?.substring(0, 60)}`);
            try { nonce = await this.wallet.getNonce(); } catch {}
          }
        }
      } catch (err) {
        logError("Auto-copy iteration", err);
      }

      // Auto-open trade on gTrade after deposits
      try {
        const meta = await this.copyTrader.signalMeta(signalId);
        const deposited = Number(meta.totalDeposited);
        if (deposited === 0) {
          log(`No deposits for signal #${signalId} — skipping openTrade`);
          return;
        }

        const lev = Number(leverage) / 1000;
        const posSize = (deposited / 1e6) * lev;
        if (posSize < 3000) {
          log(`Position size $${posSize.toFixed(0)} under $3000 minimum — cannot open`);
          return;
        }

        // Find next available gTrade index by checking existing trades
        try {
          const gTrade = new ethers.Contract(GTRADE_DIAMOND, [
            "function getTrades(address) view returns (tuple(address,uint32,uint16,uint24,bool,bool,uint8,uint8,uint120,uint64,uint64,uint64,bool,uint160,uint24)[])",
            "function getCounters(address) view returns (uint32)",
          ], this.httpProvider);

          // Get the counter (next trade index) for our contract
          let nextIndex = 0;
          try {
            const trades = await gTrade.getTrades(GOLD_COPY_TRADER_ADDRESS);
            // Next index = highest existing index + 1, or 0 if no trades
            if (trades.length > 0) {
              const maxIdx = Math.max(...trades.map(t => Number(t[1])));
              nextIndex = maxIdx + 1;
            }
          } catch {
            // Fallback: try indices 0-20
          }

          // Try the predicted index first, then scan nearby
          const indicesToTry = [nextIndex];
          for (let i = 0; i <= 20; i++) {
            if (i !== nextIndex) indicesToTry.push(i);
          }

          let opened = false;
          for (const i of indicesToTry) {
            try {
              log(`Opening trade with gTrade index ${i}...`);
              const openTx = await this.copyTrader.openTrade(i);
              await openTx.wait();

              // Verify: check what index gTrade actually assigned
              const tradesAfter = await gTrade.getTrades(GOLD_COPY_TRADER_ADDRESS);
              if (tradesAfter.length > 0) {
                const actualIndex = Number(tradesAfter[tradesAfter.length - 1][1]);
                log(`Trade OPEN! Stored index ${i}, gTrade actual index ${actualIndex}`);
                if (actualIndex !== i) {
                  log(`⚠️ Index mismatch! closeTrade will not work — trade will close at TP/SL`);
                }
              } else {
                log(`Trade OPEN! gTrade index ${i}`);
              }
              opened = true;
              break;
            } catch (err) {
              log(`Index ${i} failed: ${err.reason || err.shortMessage || err.message?.slice(0, 120) || 'reverted'}`);
            }
          }
          if (!opened) log(`Failed to open trade on any index`);
        } catch (err) {
          logError("gTrade index lookup", err);
        }
      } catch (err) {
        logError("Auto-open trade", err);
      }
    });

    // ── Trade opened on gTrade — NOW send Telegram notification ──
    contract.on("SignalOpened", async (signalId, totalDeposited, gTradeIndex, event) => {
      log(`SignalOpened #${signalId} — $${Number(totalDeposited) / 1e6} USDC, gTrade index ${gTradeIndex}`);
      const core = await this.copyTrader.signalCore(signalId);
      const long = core.long;
      const dir = long ? "LONG" : "SHORT";
      const lev = `${Number(core.leverage) / 1000}x`;
      const img = await signalImage({
        signalId: String(signalId), direction: dir, leverage: lev,
        entry: formatPrice(core.entryPrice), tp: formatPrice(core.tp), sl: formatPrice(core.sl),
      });
      const pool = Number(totalDeposited) / 1e6;
      const levNum = Number(core.leverage) / 1000;
      const entry = Number(core.entryPrice) / 1e10;
      const tp = Number(core.tp) / 1e10;
      const sl = Number(core.sl) / 1e10;
      const tpPct = long ? ((tp - entry) / entry) * levNum * 100 : ((entry - tp) / entry) * levNum * 100;
      const slPct = long ? ((entry - sl) / entry) * levNum * 100 : ((sl - entry) / entry) * levNum * 100;
      const tpUsd = pool * tpPct / 100;
      const slUsd = pool * slPct / 100;

      await sendTelegramPhoto(img, [
        `📡 <b>Trade Opened #${signalId}</b>`,
        ``,
        `${long ? "🟢" : "🔴"} <b>${dir}</b> · XAU/USD · <b>${lev}</b>`,
        `💰 Pool: <b>$${pool.toFixed(0)} USDC</b>`,
        ``,
        `🎯 Target: <b>+${tpPct.toFixed(1)}%</b> (+$${tpUsd.toFixed(2)})`,
        `🛑 Risk: <b>-${slPct.toFixed(1)}%</b> (-$${slUsd.toFixed(2)})`,
        ``,
        `💎 Copy now to join this trade`,
      ].join("\n"), [BTN_COPY, BTN_CONTRACT]);
    });

    // ── User deposited — log + whale alert for big deposits ──
    contract.on("UserDeposited", async (user, signalId, amount) => {
      const amtStr = formatUSDC(amount);
      log(`UserDeposited: ${shortAddr(user)} deposited $${amtStr} on signal #${signalId}`);

      // Whale alert for deposits >= $500
      if (Number(amount) >= 500_000_000) { // 500 USDC in 6 decimals
        await sendTelegram([
          `🐋 <b>Whale Alert!</b>`,
          ``,
          `💰 <b>$${amtStr} USDC</b> deposit on Signal #${signalId}`,
          `👤 <a href="${ARBISCAN_ADDR}${user}">${shortAddr(user)}</a>`,
        ].join("\n"));
      }
    });

    // ── User claimed — no Telegram notification, just log + referral ──
    contract.on("UserClaimed", async (user, signalId, payout, fee, event) => {
      const payoutStr = formatUSDC(payout);
      const feeStr = formatUSDC(fee);
      log(`UserClaimed: ${shortAddr(user)} claimed $${payoutStr} (fee: $${feeStr})`);

      // ── Referral reward payout ──
      if (supabase && Number(fee) > 0) {
        try {
          const { data } = await supabase
            .from('referrals')
            .select('referrer')
            .eq('referred', user.toLowerCase())
            .eq('signal_id', Number(signalId))
            .limit(1);

          if (data && data.length > 0) {
            const referrerAddr = data[0].referrer;
            const reward = (Number(fee) * REFERRAL_REWARD_PCT) / 100;
            if (reward >= 10000) { // min 0.01 USDC (6 decimals)
              log(`Referral reward: ${formatUSDC(BigInt(Math.floor(reward)))} USDC to ${shortAddr(referrerAddr)}`);
              const rewardTx = await this.usdc.transfer(referrerAddr, BigInt(Math.floor(reward)));
              await rewardTx.wait();
              log(`Referral reward sent: tx ${rewardTx.hash}`);

              // Update referral record with reward
              await supabase
                .from('referrals')
                .update({ reward_paid: true, reward_amount: reward / 1e6 })
                .eq('referred', user.toLowerCase())
                .eq('signal_id', Number(signalId));
            }
          }
        } catch (err) {
          log(`Referral reward error: ${err.message}`);
        }
      }
    });

    // ── Signal closed (trade result) ──
    // Calculate current win streak from contract history on startup
    this.winStreak = 0;
    contract.signalCount().then(async (count) => {
      const total = Number(count);
      for (let i = total; i >= 1; i--) {
        try {
          const core = await contract.signalCore(i);
          if (Number(core.phase) !== 3) continue; // only SETTLED (enum: 0=NONE, 1=COLLECTING, 2=TRADING, 3=SETTLED)
          const meta = await contract.signalMeta(i);
          const pct = calcResultPct(meta);
          // Skip cancelled signals (full refund)
          const dep = BigInt(meta.originalDeposited);
          const ret = BigInt(meta.totalReturned);
          if (dep > 0n && ret === dep) continue;
          if (dep === 0n) continue;
          if (pct > 0) this.winStreak++;
          else break;
        } catch { break; }
      }
      if (this.winStreak > 0) log(`Current win streak: ${this.winStreak}`);
    }).catch(() => {});

    this.autoClosedSignals = new Set(); // Track signals closed by auto-close to prevent duplicate notifications

    contract.on("SignalSettled", async (signalId, totalDeposited, totalReturned, resultPct) => {
      const onChainPct = Number(resultPct) / 100;
      const win = onChainPct >= 0;

      // Get direction and calculate tradePct (price × leverage, like the terminal)
      let dir = "XAU/USD";
      let levNum = 25;
      let pct = onChainPct;
      let isLong = true;
      try {
        const signal = await this.copyTrader.signalCore(signalId);
        levNum = Number(signal.leverage) / 1000;
        isLong = signal.long;
        dir = isLong ? "LONG" : "SHORT";
        const entry = Number(signal.entryPrice) / 1e10;
        const closePrice = win ? Number(signal.tp) / 1e10 : Number(signal.sl) / 1e10;
        const pctMove = ((closePrice - entry) / entry) * 100 * (isLong ? 1 : -1);
        pct = pctMove * levNum;
      } catch {}

      log(`SignalSettled #${signalId} result=${pct.toFixed(1)}% deposited=$${Number(totalDeposited) / 1e6} returned=$${Number(totalReturned) / 1e6}`);

      // Cancelled signal (full refund, resultPct = 0) — skip notification but still auto-claim
      const isCancelled = Number(resultPct) === 0 && totalDeposited === totalReturned;
      if (isCancelled) {
        log(`  Signal #${signalId} was cancelled — no notification`);
      }

      if (!isCancelled) {
        // Streak tracking
        if (win) {
          this.winStreak++;
        } else {
          this.winStreak = 0;
        }

        // Skip notification if already sent by auto-close handler
        if (this.autoClosedSignals.has(Number(signalId))) {
          this.autoClosedSignals.delete(Number(signalId));
          log(`  Skipping SignalSettled notification — already sent by auto-close`);
        } else {
          const img = await signalClosedImage({
            signalId: String(signalId), resultPct: pct, direction: dir, leverage: `${levNum}x`,
          });

          const poolIn = Number(totalDeposited) / 1e6;
          const poolOut = Number(totalReturned) / 1e6;
          const pnlUsd = poolOut - poolIn;
          const lines = [
            win ? `✅ <b>Signal #${signalId} Closed — Profit</b>` : `❌ <b>Signal #${signalId} Closed — Loss</b>`,
            ``,
            `📊 Result: <b>${win ? "+" : ""}${pct.toFixed(1)}%</b> on collateral`,
            `💵 PnL: <b>${pnlUsd >= 0 ? "+" : ""}$${pnlUsd.toFixed(2)} USDC</b>`,
            `💰 Pool: $${poolIn.toFixed(0)} → $${poolOut.toFixed(0)} USDC`,
          ];
          lines.push(``, `💬 <i>${win ? getRandomWinMessage() : getRandomLossMessage()}</i>`);
          await sendTelegramPhoto(img, lines.join("\n"), win ? [BTN_CLAIM, BTN_APP] : [BTN_APP, BTN_TG]);
        }

        // Send streak image at 3, 5, 7, 10, 15, 20, 25...
        if (this.winStreak >= 3 && (this.winStreak <= 10 || this.winStreak % 5 === 0)) {
          try {
            const streakImg = await winStreakImage({
              streak: this.winStreak,
              resultPct: pct.toFixed(1),
              signalId: String(signalId),
            });
            await sendTelegramPhoto(streakImg, [
              `🔥 <b>${this.winStreak} WIN STREAK!</b>`,
              ``,
              `${this.winStreak} profitable trades without a single loss!`,
            ].join("\n"), [BTN_APP, BTN_TG]);
          } catch (err) {
            log(`Streak image error: ${err.message}`);
          }
        }
      }

      // ── Auto-claim for all users with positions ──
      try {
        const users = await this.copyTrader.getAutoCopyUsers();
        let nonce = await this.wallet.getNonce();
        for (const user of users) {
          try {
            const pos = await this.copyTrader.positions(user, signalId);
            if (pos.deposit > 0n && !pos.claimed) {
              log(`  Auto-claiming for ${shortAddr(user)} on signal #${signalId}...`);
              const tx = await this.copyTrader.claimFor(user, signalId, { nonce });
              nonce++;
              await tx.wait();
              log(`  ✅ Claimed for ${shortAddr(user)}`);
            }
          } catch (err) {
            log(`  ⚠️ claimFor ${shortAddr(user)} failed: ${err.message?.slice(0, 100)}`);
            try { nonce = await this.wallet.getNonce(); } catch {}
          }
        }
        log(`  Auto-claim complete for signal #${signalId}`);
      } catch (err) {
        log(`  ⚠️ Auto-claim error: ${err.message?.slice(0, 100)}`);
      }
    });

    // ── Fees withdrawn by admin ──
    contract.on("FeesWithdrawn", async (amount) => {
      log(`FeesWithdrawn: $${formatUSDC(amount)}`);
      await sendTelegram(`💎 <b>Platform Fees Collected</b>\n\nAmount: <b>$${formatUSDC(amount)} USDC</b>`);
    });

    // ── Track known copiers + amounts to avoid duplicate notifications ──
    const knownCopiers = new Map();
    contract.getAutoCopyUsers().then(async (existingUsers) => {
      for (const u of existingUsers) {
        try {
          const config = await contract.autoCopy(u);
          knownCopiers.set(u.toLowerCase(), Number(config.amount));
        } catch {}
      }
      log(`Known copiers loaded: ${knownCopiers.size}`);
    }).catch(() => {});

    // ── New auto-copier joined ──
    contract.on("AutoCopyEnabled", async (user, amount) => {
      const amtStr = formatUSDC(amount);
      const prevAmount = knownCopiers.get(user.toLowerCase()) || 0;
      const isNew = prevAmount === 0;
      const isIncrease = Number(amount) > prevAmount && !isNew;
      knownCopiers.set(user.toLowerCase(), Number(amount));

      if (isNew) {
        log(`NEW AutoCopier: ${shortAddr(user)} with $${amtStr}/trade`);
        try {
          const totalCopiers = await contract.getAutoCopyUserCount();
          const img = await newCopierImage({
            trader: shortAddr(user),
            amount: amtStr,
            totalCopiers: String(totalCopiers),
          });
          await sendTelegramPhoto(img, [
            `🤖 <b>New Auto-Copier Joined!</b>`,
            ``,
            `👤 <a href="${ARBISCAN_ADDR}${user}">${shortAddr(user)}</a>`,
            `💰 <b>$${amtStr} USDC</b> per trade`,
            `👥 Total copiers: <b>${totalCopiers}</b>`,
          ].join("\n"), [BTN_APP, BTN_TG]);
        } catch (err) {
          log(`AutoCopy image error: ${err.message}`);
          await sendTelegram(`🤖 <b>New Auto-Copier!</b>\n\n👤 ${shortAddr(user)}\n💰 $${amtStr} USDC/trade`);
        }
      } else if (isIncrease) {
        log(`AutoCopy increased: ${shortAddr(user)} now $${amtStr}/trade`);
        await sendTelegram([
          `📈 <b>Copier Increased Amount</b>`,
          ``,
          `👤 <a href="${ARBISCAN_ADDR}${user}">${shortAddr(user)}</a>`,
          `💰 Now copying <b>$${amtStr} USDC</b> per trade`,
        ].join("\n"));
      } else {
        log(`AutoCopy updated: ${shortAddr(user)} now $${amtStr}/trade (no notification)`);
      }
    });

    log("Contract event listeners active");

    // Start daily/weekly summary + milestone tracking
    this.startDailySummary();
    this.startWeeklySummary();
    this.startMilestoneTracker();
  }

  // ===== DAILY SUMMARY (every day at 22:00 UTC) =====
  startDailySummary() {
    const scheduleNext = () => {
      const now = new Date();
      const next = new Date(now);
      next.setUTCHours(22, 0, 0, 0);
      if (now >= next) next.setUTCDate(next.getUTCDate() + 1);
      const ms = next - now;
      log(`Daily summary scheduled in ${Math.round(ms / 3600000)}h ${Math.round((ms % 3600000) / 60000)}m`);
      setTimeout(() => {
        this.sendDailySummary();
        scheduleNext();
      }, ms);
    };
    scheduleNext();
  }

  async sendDailySummary() {
    try {
      const contract = this.copyTrader;
      const total = Number(await contract.signalCount());
      const now = Math.floor(Date.now() / 1000);
      const utcNow = new Date();
      const utcMidnight = Math.floor(Date.UTC(utcNow.getUTCFullYear(), utcNow.getUTCMonth(), utcNow.getUTCDate()) / 1000);

      let trades = 0, wins = 0, losses = 0, volume = 0;
      let totalTradePct = 0;

      for (let i = total; i >= 1; i--) {
        const meta = await contract.signalMeta(i);
        const core = await contract.signalCore(i);
        const closedAt = Number(meta.closedAt);
        const dep = Number(meta.originalDeposited);
        const ret = Number(meta.totalReturned);

        // Skip if not settled (enum: 0=NONE, 1=COLLECTING, 2=TRADING, 3=SETTLED)
        if (Number(core.phase) !== 3) continue;
        if (dep === 0 || ret === 0) continue;
        if (dep === ret) continue; // cancelled / full refund

        // Use closedAt if available, otherwise use timestamp as fallback
        const tradeTime = closedAt > 0 ? closedAt : Number(meta.timestamp);
        if (tradeTime < utcMidnight) continue;

        trades++;
        // Calculate tradePct (price × leverage) like the terminal
        const entry = Number(core.entryPrice) / 1e10;
        const tp = Number(core.tp) / 1e10;
        const sl = Number(core.sl) / 1e10;
        const lev = Number(core.leverage) / 1000;
        const isWin = ret > dep;
        const closePrice = isWin ? tp : sl;
        const pctMove = ((closePrice - entry) / entry) * 100 * (core.long ? 1 : -1);
        const tradePct = pctMove * lev;

        totalTradePct += tradePct;
        if (tradePct > 0) wins++;
        else losses++;
        volume += dep / 1e6;
      }

      const copierCount = Number(await contract.getAutoCopyUserCount());
      const dayProfitPct = trades > 0 ? totalTradePct.toFixed(1) : "0.0";

      // Calculate active auto-copy volume (USDC ready to copy next signal)
      let activeCopyVolume = 0;
      try {
        const users = await contract.getAutoCopyUsers();
        for (const u of users) {
          const config = await contract.autoCopy(u);
          if (config.enabled) activeCopyVolume += Number(config.amount) / 1e6;
        }
      } catch {}

      if (trades === 0) {
        log("Daily summary: no trades today, skipping");
        return;
      }

      const img = await dailySummaryImage({
        trades: String(trades),
        wins: String(wins),
        losses: String(losses),
        volume: Math.round(activeCopyVolume).toString(),
        profit: `${totalTradePct >= 0 ? '+' : ''}${dayProfitPct}%`,
        copiers: String(copierCount),
      });

      await sendTelegramPhoto(img, [
        `📊 <b>Daily Recap</b> (00:00 — 00:00 UTC)`,
        ``,
        `📈 Trades: <b>${trades}</b> (${wins}W / ${losses}L)`,
        `🎯 Performance: <b>${totalTradePct >= 0 ? '+' : ''}${dayProfitPct}%</b>`,
        `💰 Active copying: <b>$${Math.round(activeCopyVolume)} USDC</b>`,
        `👥 Copiers: <b>${copierCount}</b>`,
      ].join("\n"), [BTN_APP, BTN_TG]);

      log(`Daily summary sent: ${trades} trades, $${Math.round(activeCopyVolume)} active copying`);
    } catch (err) {
      log(`Daily summary error: ${err.message}`);
    }
  }

  // ===== MILESTONE TRACKER =====
  // ===== WEEKLY SUMMARY (every Sunday at 20:00 UTC) =====
  startWeeklySummary() {
    const scheduleNext = () => {
      const now = new Date();
      const next = new Date(now);
      // Find next Sunday
      const daysUntilSunday = (7 - now.getUTCDay()) % 7 || 7;
      next.setUTCDate(now.getUTCDate() + daysUntilSunday);
      next.setUTCHours(20, 0, 0, 0);
      if (now >= next) next.setUTCDate(next.getUTCDate() + 7);
      const ms = next - now;
      log(`Weekly summary scheduled in ${Math.round(ms / 86400000)}d ${Math.round((ms % 86400000) / 3600000)}h`);
      setTimeout(() => {
        this.sendWeeklySummary();
        scheduleNext();
      }, ms);
    };
    scheduleNext();
  }

  async sendWeeklySummary() {
    try {
      const contract = this.copyTrader;
      const total = Number(await contract.signalCount());

      const now = new Date();
      const dayOfWeek = now.getUTCDay();
      const monday = new Date(now);
      monday.setUTCDate(now.getUTCDate() - ((dayOfWeek + 6) % 7));
      monday.setUTCHours(0, 0, 0, 0);

      const dayNames = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
      const days = dayNames.map((name, idx) => {
        const dayStart = new Date(monday);
        dayStart.setUTCDate(monday.getUTCDate() + idx);
        dayStart.setUTCHours(0, 0, 0, 0);
        const dayEnd = new Date(dayStart);
        dayEnd.setUTCHours(23, 59, 59, 999);
        return { name, start: Math.floor(dayStart.getTime() / 1000), end: Math.floor(dayEnd.getTime() / 1000), trades: 0, volume: 0, resultPct: 0 };
      });

      let totalTrades = 0, totalVolume = 0, totalResultPct = 0;

      for (let i = total; i >= 1; i--) {
        const meta = await contract.signalMeta(i);
        const closedAt = Number(meta.closedAt);
        if (closedAt === 0 || closedAt < days[0].start) continue;
        if (closedAt > days[4].end) continue;

        const core = await contract.signalCore(i);
        if (Number(core.phase) !== 3) continue;

        const vol = parseFloat(ethers.formatUnits(meta.totalDeposited, 6));
        const resultPct = calcResultPct(meta);

        totalTrades++;
        totalVolume += vol;
        totalResultPct += resultPct;

        for (const day of days) {
          if (closedAt >= day.start && closedAt <= day.end) {
            day.trades++;
            day.volume += vol;
            day.resultPct += resultPct;
            break;
          }
        }
      }

      const copierCount = Number(await contract.getAutoCopyUserCount());

      if (totalTrades === 0) {
        log("Weekly summary: no trades this week, skipping");
        return;
      }

      const daysData = days.map(d => ({
        name: d.name,
        trades: d.trades,
        volume: `$${d.volume.toFixed(0)}`,
        profit: d.trades > 0 ? `${d.resultPct >= 0 ? '+' : ''}${(d.resultPct / d.trades).toFixed(2)}%` : '—',
      }));

      const avgPct = (totalResultPct / totalTrades).toFixed(2);

      const img = await weeklyRecapImage({
        days: daysData,
        totalVolume: `$${totalVolume.toFixed(0)}`,
        totalProfit: `${totalResultPct >= 0 ? '+' : ''}${avgPct}%`,
        copiers: String(copierCount),
      });

      await sendTelegramPhoto(img, [
        `📊 <b>Weekly Recap — Mon to Fri</b>`,
        ``,
        ...daysData.map(d => d.trades > 0 ? `${d.name}: <b>${d.profit}</b> (${d.trades} trades, ${d.volume})` : `${d.name}: No trades`),
        ``,
        `📈 Avg result: <b>${totalResultPct >= 0 ? '+' : ''}${avgPct}%</b>`,
        `💰 Volume: <b>$${totalVolume.toFixed(0)} USDC</b>`,
        `👥 Copiers: <b>${copierCount}</b>`,
        ``,
        `See you next week! 🚀`,
      ].join("\n"), [BTN_APP, BTN_TG]);

      log(`Weekly summary sent: ${totalTrades} trades, $${totalVolume.toFixed(0)} volume`);
    } catch (err) {
      log(`Weekly summary error: ${err.message}`);
    }
  }

  async startMilestoneTracker() {
    // Read current state so we don't re-fire milestones on restart
    try {
      const contract = this.copyTrader;
      const total = Number(await contract.signalCount());
      let totalVolume = 0;
      for (let i = 1; i <= total; i++) {
        const meta = await contract.signalMeta(i);
        totalVolume += parseFloat(ethers.formatUnits(meta.totalDeposited, 6));
      }
      const copierCount = Number(await contract.getAutoCopyUserCount());

      // Also calc current profit
      let initProfit = 0;
      for (let i = 1; i <= total; i++) {
        const meta = await contract.signalMeta(i);
        const vol = parseFloat(ethers.formatUnits(meta.totalDeposited, 6));
        const core = await contract.signalCore(i);
        if (Number(core.phase) === 3) {
          const resultPct = calcResultPct(meta);
          initProfit += vol * (resultPct / 100);
        }
      }

      this.lastVolumeMilestone = totalVolume;
      this.lastCopierMilestone = copierCount;
      this.lastTradeMilestone = total;
      this.lastProfitMilestone = initProfit;
      log(`Milestones initialized: vol=$${totalVolume.toFixed(0)}, copiers=${copierCount}, trades=${total}, profit=$${initProfit.toFixed(0)}`);
    } catch (err) {
      this.lastVolumeMilestone = 0;
      this.lastCopierMilestone = 0;
      this.lastTradeMilestone = 0;
      this.lastProfitMilestone = 0;
      log(`Milestone init error: ${err.message}`);
    }
    setInterval(() => this.checkMilestones(), 300_000); // check every 5 min
    log("Milestone tracker started");
  }

  async checkMilestones() {
    try {
      const contract = this.copyTrader;
      const total = Number(await contract.signalCount());

      // Calculate real volume (unclaimed collateral) + profit
      let totalVolume = 0;
      let totalProfit = 0;
      const users = await contract.getAutoCopyUsers();
      for (const user of users) {
        const ids = await contract.getUserSignalIds(user);
        for (const id of ids) {
          const pos = await contract.positions(user, id);
          if (Number(pos.deposit) > 0 && !pos.claimed) {
            totalVolume += parseFloat(ethers.formatUnits(pos.deposit, 6));
          }
        }
      }
      for (let i = 1; i <= total; i++) {
        const core = await contract.signalCore(i);
        if (Number(core.phase) === 3) {
          const meta = await contract.signalMeta(i);
          const vol = parseFloat(ethers.formatUnits(meta.totalDeposited, 6));
          const resultPct = calcResultPct(meta);
          totalProfit += vol * (resultPct / 100);
        }
      }

      const copierCount = Number(await contract.getAutoCopyUserCount());

      // Volume milestones
      const volumeMilestones = [100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000];
      for (const m of volumeMilestones) {
        if (totalVolume >= m && this.lastVolumeMilestone < m) {
          this.lastVolumeMilestone = m;
          const label = m >= 1000000 ? `$${m / 1000000}M` : m >= 1000 ? `$${m / 1000}K` : `$${m}`;
          log(`Milestone: volume ${label}`);
          const img = await milestoneImage({
            milestone: `Total copy volume reached ${label} USDC`,
            value: `${label}`,
            label: 'TOTAL VOLUME',
          });
          await sendTelegramPhoto(img, [
            `🏆 <b>Milestone Reached!</b>`,
            ``,
            `💰 Total volume: <b>${label} USDC</b>`,
            `📈 Keep growing!`,
          ].join("\n"), [BTN_APP, BTN_TG]);
        }
      }

      // Copier milestones
      const copierMilestones = [2, 3, 5, 10, 15, 25, 50, 100, 250, 500, 1000];
      for (const m of copierMilestones) {
        if (copierCount >= m && this.lastCopierMilestone < m) {
          this.lastCopierMilestone = m;
          log(`Milestone: ${m} copiers`);
          const img = await milestoneImage({
            milestone: `We now have ${m} auto-copy traders!`,
            value: `${m}`,
            label: 'TOTAL COPIERS',
          });
          await sendTelegramPhoto(img, [
            `🏆 <b>Milestone Reached!</b>`,
            ``,
            `👥 Total copiers: <b>${m}</b>`,
            `🚀 Growing fast!`,
          ].join("\n"), [BTN_APP, BTN_TG]);
        }
      }

      // Trade milestones
      const tradeMilestones = [5, 10, 15, 25, 50, 100, 250, 500, 1000];
      for (const m of tradeMilestones) {
        if (total >= m && this.lastTradeMilestone < m) {
          this.lastTradeMilestone = m;
          log(`Milestone: ${m} signals`);
          const img = await milestoneImage({
            milestone: `${m} trade signals posted and executed!`,
            value: `${m}`,
            label: 'TOTAL SIGNALS',
          });
          await sendTelegramPhoto(img, [
            `🏆 <b>Milestone Reached!</b>`,
            ``,
            `📡 Total signals: <b>${m}</b>`,
          ].join("\n"), [BTN_APP, BTN_TG]);
        }
      }
      // Profit milestones
      const profitMilestones = [50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];
      for (const m of profitMilestones) {
        if (totalProfit >= m && this.lastProfitMilestone < m) {
          this.lastProfitMilestone = m;
          const label = m >= 1000 ? `$${m / 1000}K` : `$${m}`;
          log(`Milestone: profit ${label}`);
          const img = await milestoneImage({
            milestone: `Our traders have earned ${label} USDC in profit!`,
            value: `${label}`,
            label: 'TOTAL PROFIT',
          });
          await sendTelegramPhoto(img, [
            `🏆 <b>Milestone Reached!</b>`,
            ``,
            `💰 Total profit generated: <b>${label} USDC</b>`,
            `🔥 Profitable trading!`,
          ].join("\n"), [BTN_APP, BTN_TG]);
        }
      }
    } catch (err) {
      log(`Milestone check error: ${err.message}`);
    }
  }

  // ===== WEBSOCKET (real-time) =====
  connectWebSocket() {
    try {
      log("Connecting WebSocket...");
      this.wsProvider = new ethers.WebSocketProvider(ARBITRUM_RPC_WSS);
      this.gTradeDiamond = new ethers.Contract(GTRADE_DIAMOND, GTRADE_ABI, this.wsProvider);

      // Filter: only events where user == our contract
      const contractAddr = GOLD_COPY_TRADER_ADDRESS;

      // MarketExecuted (trade closed via market order)
      this.gTradeDiamond.on("MarketExecuted", async (...args) => {
        try {
          const event = args[args.length - 1]; // last arg is the event object
          const decoded = event.args;
          const user = decoded.user;
          const open = decoded.open;

          if (user.toLowerCase() !== contractAddr.toLowerCase()) return;
          if (open) return; // only care about closes

          log(`MarketExecuted detected! user=${user}, percentProfit=${decoded.percentProfit}`);
          await this.handleTradeClose(decoded.percentProfit);
        } catch (err) {
          logError("MarketExecuted handler", err);
        }
      });

      // LimitExecuted (TP/SL/LIQ hit)
      this.gTradeDiamond.on("LimitExecuted", async (...args) => {
        try {
          const event = args[args.length - 1];
          const decoded = event.args;
          const user = decoded.user;

          if (user.toLowerCase() !== contractAddr.toLowerCase()) return;

          const orderTypes = ["TP", "SL", "LIQ"];
          const type = orderTypes[decoded.orderType] || `type=${decoded.orderType}`;
          log(`LimitExecuted detected! ${type}, user=${user}, percentProfit=${decoded.percentProfit}`);
          await this.handleTradeClose(decoded.percentProfit);
        } catch (err) {
          logError("LimitExecuted handler", err);
        }
      });

      // Handle disconnect
      this.wsProvider.websocket?.on?.("close", () => {
        log("WebSocket disconnected. Reconnecting...");
        setTimeout(() => this.connectWebSocket(), RECONNECT_DELAY);
      });

      log("WebSocket connected — listening for gTrade events");
    } catch (err) {
      logError("WebSocket connection failed", err);
      log(`Falling back to HTTP polling only. Retrying WebSocket in ${RECONNECT_DELAY / 1000}s...`);
      setTimeout(() => this.connectWebSocket(), RECONNECT_DELAY);
    }
  }

  // ===== TRADE MONITOR: Check if gTrade trades are still open =====
  startTradeMonitor() {
    const MONITOR_INTERVAL = TRADE_MONITOR_INTERVAL;

    const check = async () => {
      if (!this.running) return;

      try {
        const activeId = await this.copyTrader.activeSignalId();
        if (Number(activeId) === 0) {
          setTimeout(check, MONITOR_INTERVAL);
          return;
        }

        const signal = await this.copyTrader.signalCore(activeId);
        if (Number(signal.phase) !== 2) { // Not in TRADING phase (enum: 0=NONE, 1=COLLECTING, 2=TRADING, 3=SETTLED)
          setTimeout(check, MONITOR_INTERVAL);
          return;
        }

        // Make sure openTrade actually completed (originalDeposited gets set in openTrade)
        const meta0 = await this.copyTrader.signalMeta(activeId);
        if (Number(meta0.originalDeposited) === 0) {
          setTimeout(check, MONITOR_INTERVAL);
          return;
        }

        // Check if gTrade trades still exist
        const gTrade = new ethers.Contract(GTRADE_DIAMOND, [
          "function getTrades(address) view returns (tuple(address,uint32,uint16,uint24,bool,bool,uint8,uint8,uint120,uint64,uint64,uint64,bool,uint160,uint24)[])",
        ], this.httpProvider);
        const trades = await gTrade.getTrades(GOLD_COPY_TRADER_ADDRESS);

        if (trades.length === 0) {
          log("⚠️  SAFETY NET: gTrade trades gone but signal still active! Auto-closing...");

          // Determine result from TP/SL
          const entry = Number(signal.entryPrice) / 1e10;
          const tp = Number(signal.tp) / 1e10;
          const sl = Number(signal.sl) / 1e10;

          // Use TP price if trade was profitable direction, SL otherwise
          // Check current price to determine which was hit
          let closePrice;
          try {
            const res = await fetch("https://hermes.pyth.network/v2/updates/price/latest?ids[]=0x765d2ba906dbc32ca17cc11f5310a89e9ee1f6420508c63861f2f8ba4ee34bb2");
            const data = await res.json();
            const p = data.parsed[0].price;
            closePrice = Number(p.price) * Math.pow(10, p.expo);
          } catch { closePrice = entry; }

          // gTrade position is gone — determine if TP or SL was hit
          // If price is between TP and SL, check which is closer
          let resultPrice;
          if (signal.long) {
            if (closePrice >= tp) resultPrice = tp;
            else if (closePrice <= sl) resultPrice = sl;
            else {
              // Price between TP and SL — gTrade closed it, so pick closest
              resultPrice = (tp - closePrice) < (closePrice - sl) ? tp : sl;
            }
          } else {
            if (closePrice <= tp) resultPrice = tp;
            else if (closePrice >= sl) resultPrice = sl;
            else {
              resultPrice = (closePrice - tp) < (sl - closePrice) ? tp : sl;
            }
          }

          const resultBps = signal.long
            ? Math.round(((resultPrice - entry) / entry) * 10000)
            : Math.round(((entry - resultPrice) / entry) * 10000);

          log(`  Entry: ${entry}, Close: ${resultPrice}, Result: ${resultBps} bps`);

          try {
            this.autoClosedSignals.add(Number(activeId));

            // V2: calculate expected return from price movement, not balance
            const meta = await this.copyTrader.signalMeta(activeId);
            const collateral = Number(meta.originalDeposited) || Number(meta.totalDeposited);
            const leverage = Number(signal.leverage) / 1000;
            const posSize = collateral * leverage;
            const fees = posSize * 0.0006; // ~0.06% gTrade fees

            let totalReturned;
            if (resultBps >= 0) {
              // Profit: collateral + (collateral * pricePct * leverage) - fees
              const profit = (collateral * Math.abs(resultBps) * leverage) / 10000;
              totalReturned = BigInt(Math.round(Math.max(0, collateral + profit - fees)));
            } else {
              // Loss: collateral - (collateral * pricePct * leverage) - fees
              const loss = (collateral * Math.abs(resultBps) * leverage) / 10000;
              totalReturned = BigInt(Math.round(Math.max(0, collateral - loss - fees)));
            }

            // Use actual balance method: returned = balance - (balanceAtOpen - originalDeposited)
            const contractBalance = await this.usdc.balanceOf(this.copyTrader.target);
            const balanceAtOpen = Number(meta.balanceAtOpen);
            const actualReturned = BigInt(contractBalance) - (BigInt(balanceAtOpen) - BigInt(collateral));

            // Use balance-based if available, otherwise fall back to price-based
            if (actualReturned > 0n && actualReturned <= BigInt(contractBalance)) {
              totalReturned = actualReturned;
              log(`  Settling: returned=$${Number(totalReturned) / 1e6} (from balance)`);
            } else {
              // Sanity: cap to contract balance and 3x collateral
              if (totalReturned > BigInt(contractBalance)) totalReturned = BigInt(contractBalance);
              if (totalReturned > BigInt(collateral) * 3n) totalReturned = BigInt(collateral) * 3n;
              log(`  Settling: returned=$${Number(totalReturned) / 1e6} (calculated from price)`);
            }
            const tx = await this.copyTrader.settleSignal(totalReturned);
            await tx.wait();
            log(`  Signal #${activeId} settled via safety net!`);

            // Send notification — use tradePct (price × leverage) like the terminal
            const tradePct = Math.abs(resultBps / 100) * leverage;
            const pct = resultBps >= 0 ? tradePct : -tradePct;
            const win = pct >= 0;
            const img = await autoCloseImage({
              signalId: String(activeId), direction: signal.long ? "LONG" : "SHORT",
              leverage: `${leverage}x`, resultPct: pct,
            });
            // Determine if TP or SL was actually hit based on price
            let closeReason = "Trade closed.";
            if (signal.long) {
              if (closePrice >= tp) closeReason = "TP hit!";
              else if (closePrice <= sl) closeReason = "SL hit.";
            } else {
              if (closePrice <= tp) closeReason = "TP hit!";
              else if (closePrice >= sl) closeReason = "SL hit.";
            }

            const poolIn = Number(meta.originalDeposited) / 1e6;
            const poolOut = Number(totalReturned) / 1e6;
            const pnlUsd = poolOut - poolIn;
            const autoCloseLines = [
              `⚡ <b>Auto-Close Signal #${activeId}</b>`,
              ``,
              `📊 Result: <b>${win ? "+" : ""}${pct.toFixed(1)}%</b> on collateral`,
              `💵 PnL: <b>${pnlUsd >= 0 ? "+" : ""}$${pnlUsd.toFixed(2)} USDC</b>`,
              `📈 ${closeReason}`,
            ];
            autoCloseLines.push(``, `💬 <i>${win ? getRandomWinMessage() : getRandomLossMessage()}</i>`);
            await sendTelegramPhoto(img, autoCloseLines.join("\n"), [
              win ? { text: "🏆 Claim Profits", url: "https://www.smarttradingclub.io?tab=dashboard" } : { text: "🚀 Open App", url: "https://www.smarttradingclub.io?tab=dashboard" },
            ]);
          } catch (err) {
            if (err.message?.includes("Not trading")) {
              log("  Signal already settled by another handler");
            } else {
              // Retry with balance-based method
              log(`  First settle attempt failed: ${err.reason || err.shortMessage || err.message?.slice(0, 100)}`);
              try {
                const retryBalance = await this.usdc.balanceOf(this.copyTrader.target);
                const retryMeta = await this.copyTrader.signalMeta(activeId);
                const retryCollateral = Number(retryMeta.originalDeposited) || Number(retryMeta.totalDeposited);
                const retryBalAtOpen = Number(retryMeta.balanceAtOpen);
                const retryReturned = BigInt(retryBalance) - (BigInt(retryBalAtOpen) - BigInt(retryCollateral));
                const safeReturned = retryReturned > 0n ? retryReturned : 0n;
                log(`  Retry settle with balance method: returned=$${Number(safeReturned) / 1e6}`);
                const retryTx = await this.copyTrader.settleSignal(safeReturned);
                await retryTx.wait();
                log(`  Signal #${activeId} settled via safety net (retry)!`);
              } catch (retryErr) {
                logError("Safety net settle retry also failed", retryErr);
              }
            }
          }
        }
      } catch (err) {
        logError("Trade monitor error", err);
      }

      setTimeout(check, MONITOR_INTERVAL);
    };

    log("Trade monitor started — checking gTrade every 30s when signal active");
    check();
  }

  // ===== HANDLE TRADE CLOSE =====
  async handleTradeClose(gTradePercentProfit) {
    if (this.processing) {
      log("Already processing a close — skipping duplicate");
      return;
    }
    this.processing = true;

    try {
      // Get active signal
      const activeId = await this.copyTrader.activeSignalId();
      if (Number(activeId) === 0) {
        log("No active signal to close (already closed?)");
        return;
      }

      // Get signal info
      const signal = await this.copyTrader.signalCore(activeId);
      if (Number(signal.phase) !== 2) { // Not in TRADING phase (enum: 0=NONE, 1=COLLECTING, 2=TRADING, 3=SETTLED)
        log(`Signal #${activeId} not in trading phase (phase=${signal.phase})`);
        return;
      }

      const leverage = Number(signal.leverage);
      const levNum = leverage / 1000;

      log("═══════════════════════════════════════");
      log(`  Signal #${activeId} — Settling automatically`);
      log(`  Direction: ${signal.long ? "LONG" : "SHORT"}`);
      log(`  Leverage: ${levNum}x`);
      log("═══════════════════════════════════════");

      // V2: calculate expected return from price movement
      this.autoClosedSignals.add(Number(activeId));

      const meta = await this.copyTrader.signalMeta(activeId);
      const collateral = Number(meta.originalDeposited);
      const posSize = collateral * levNum;
      const fees = posSize * 0.002;

      // Get current price to calculate result
      let closePrice;
      try {
        const res = await fetch("https://hermes.pyth.network/v2/updates/price/latest?ids[]=0x765d2ba906dbc32ca17cc11f5310a89e9ee1f6420508c63861f2f8ba4ee34bb2");
        const data = await res.json();
        const p = data.parsed[0].price;
        closePrice = Number(p.price) * Math.pow(10, p.expo);
      } catch { closePrice = Number(signal.entryPrice) / 1e10; }

      const entry = Number(signal.entryPrice) / 1e10;
      const tp = Number(signal.tp) / 1e10;
      const sl = Number(signal.sl) / 1e10;

      // gTrade closed the position — determine if TP or SL was hit
      let resultPrice;
      if (signal.long) {
        if (closePrice >= tp) resultPrice = tp;
        else if (closePrice <= sl) resultPrice = sl;
        else resultPrice = (tp - closePrice) < (closePrice - sl) ? tp : sl;
      } else {
        if (closePrice <= tp) resultPrice = tp;
        else if (closePrice >= sl) resultPrice = sl;
        else resultPrice = (closePrice - tp) < (sl - closePrice) ? tp : sl;
      }

      const pricePct = signal.long
        ? ((resultPrice - entry) / entry)
        : ((entry - resultPrice) / entry);
      const pnlAmount = collateral * pricePct * levNum;

      let totalReturned;
      if (pnlAmount >= 0) {
        totalReturned = BigInt(Math.round(Math.max(0, collateral + pnlAmount - fees)));
      } else {
        totalReturned = BigInt(Math.round(Math.max(0, collateral + pnlAmount - fees)));
      }

      // Use actual balance method (most accurate)
      const contractBalance = await this.usdc.balanceOf(this.copyTrader.target);
      const balanceAtOpen = Number(meta.balanceAtOpen);
      const actualReturned = BigInt(contractBalance) - (BigInt(balanceAtOpen) - BigInt(collateral));

      if (actualReturned > 0n && actualReturned <= BigInt(contractBalance)) {
        totalReturned = actualReturned;
        log(`  Settling: returned=$${Number(totalReturned) / 1e6} (from balance)`);
      } else {
        // Fallback: cap price-based to contract balance
        if (totalReturned > BigInt(contractBalance)) totalReturned = BigInt(contractBalance);
        if (totalReturned > BigInt(collateral) * 3n) totalReturned = BigInt(collateral) * 3n;
        log(`  Settling: returned=$${Number(totalReturned) / 1e6} (calculated from price)`);
      }
      const tx = await this.copyTrader.settleSignal(totalReturned);
      log(`TX sent: ${tx.hash}`);

      const receipt = await tx.wait();
      log(`TX confirmed in block ${receipt.blockNumber} — Signal #${activeId} settled!`);

      // Use tradePct (price × leverage) for display, like the terminal
      const resultBps = signal.long
        ? Math.round(((resultPrice - entry) / entry) * 10000)
        : Math.round(((entry - resultPrice) / entry) * 10000);
      const tradePctVal = Math.abs(resultBps / 100) * levNum;
      const pct = resultBps >= 0 ? tradePctVal : -tradePctVal;
      const win = pct >= 0;
      const dir = signal.long ? "LONG" : "SHORT";
      const lev = `${levNum}x`;
      const img = await autoCloseImage({
        signalId: String(activeId), direction: dir, leverage: lev, resultPct: pct,
      });
      const poolIn2 = Number(meta.originalDeposited) / 1e6;
      const poolOut2 = Number(totalReturned) / 1e6;
      const pnlUsd2 = poolOut2 - poolIn2;
      const closeLines2 = [
        `⚡ <b>Auto-Close Signal #${activeId}</b>`,
        ``,
        `📊 Result: <b>${win ? "+" : ""}${pct.toFixed(1)}%</b> on collateral`,
        `💵 PnL: <b>${pnlUsd2 >= 0 ? "+" : ""}$${pnlUsd2.toFixed(2)} USDC</b>`,
        `💰 Pool: $${poolIn2.toFixed(0)} → $${poolOut2.toFixed(0)} USDC`,
      ];
      closeLines2.push(``, `💬 <i>${win ? getRandomWinMessage() : getRandomLossMessage()}</i>`);
      await sendTelegramPhoto(img, closeLines2.join("\n"), [
        win ? { text: "🏆 Claim Profits", url: WEBSITE } : { text: "🚀 Open App", url: WEBSITE },
        { text: "🔗 View TX", url: `${ARBISCAN_TX}${tx.hash}` },
      ]);
    } catch (err) {
      if (err.message?.includes("Not active signal") || err.message?.includes("Invalid")) {
        log("Signal already closed (contract rejected) — no action needed");
      } else {
        logError("handleTradeClose failed", err);
      }
    } finally {
      this.processing = false;
    }
  }

  stop() {
    this.running = false;
    if (this.wsProvider) {
      this.wsProvider.destroy();
    }
    stopTelegramAI();
    stopNewsAlerts();
    log("Bot stopped.");
  }
}

// ===== RUN =====
const bot = new CloseWatcher();

process.on("SIGINT", () => {
  log("Shutting down...");
  bot.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  log("Terminated...");
  bot.stop();
  process.exit(0);
});

process.on("unhandledRejection", (err) => {
  logError("Unhandled rejection", err);
});

process.on("uncaughtException", async (err) => {
  logError("Uncaught exception", err);
  await sendTelegram("🔴 <b>Bot crashed</b>\n\nRestarting automatically...");
});

bot.start().catch(async (err) => {
  logError("Bot failed to start", err);
  await sendTelegram("🔴 <b>Bot failed to start</b>\n\n" + (err.message || "Unknown error").substring(0, 100));
  process.exit(1);
});
