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
const POLL_INTERVAL = 15_000; // 15s polling fallback
const RECONNECT_DELAY = 5_000;
const ARBISCAN_TX = "https://arbiscan.io/tx/";
const ARBISCAN_ADDR = "https://arbiscan.io/address/";

// ===== ABI FRAGMENTS =====
const COPY_TRADER_ABI = [
  "function closeSignal(uint256 _id, int256 _result) external",
  "function closeTradeMarket(uint32 _index, uint64 _expectedPrice) external",
  "function activeSignalId() view returns (uint256)",
  "function signalCore(uint256) view returns (bool long, bool active, bool closed, uint64 entryPrice, uint64 tp, uint64 sl, uint24 leverage, int256 resultPct, uint256 feeAtCreation)",
  "function admin() view returns (address)",
  "function getAutoCopyUsers() view returns (address[])",
  "function autoCopy(address) view returns (uint256 amount, bool enabled)",
  "function executeCopyFor(address _user, uint256 _signalId) external",
  "event SignalPosted(uint256 indexed signalId, bool long, uint64 entryPrice, uint64 tp, uint64 sl, uint24 leverage)",
  "event SignalClosed(uint256 indexed signalId, int256 resultPct)",
  "event TradeCopied(address indexed user, uint256 indexed signalId, uint256 amount)",
  "event AutoCopied(address indexed user, uint256 indexed signalId, uint256 amount)",
  "event ProceedsClaimed(address indexed user, uint256 indexed signalId, uint256 payout, uint256 fee)",
  "event FeesWithdrawn(uint256 amount)",
  "event AutoCopyEnabled(address indexed user, uint256 amount)",
  "event AutoCopyDisabled(address indexed user)",
  "function getAutoCopyUserCount() view returns (uint256)",
  "function signalCount() view returns (uint256)",
  "function signalMeta(uint256) view returns (uint256 timestamp, uint256 closedAt, uint256 totalCopied, uint32 copierCount)",
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
    this.lastProcessedBlock = 0;
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
    this.logProvider = this.httpProvider;
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

    // Always run polling fallback
    this.startPolling();
  }

  // ===== CONTRACT EVENT LISTENER =====
  listenContractEvents() {
    const provider = this.wsProvider || this.httpProvider;
    const contract = new ethers.Contract(GOLD_COPY_TRADER_ADDRESS, COPY_TRADER_ABI, provider);

    // Buttons defined at module level

    // ── New signal posted ──
    contract.on("SignalPosted", async (signalId, long, entryPrice, tp, sl, leverage, event) => {
      const dir = long ? "LONG" : "SHORT";
      const lev = `${Number(leverage) / 1000}x`;
      log(`SignalPosted #${signalId}`);
      const img = await signalImage({
        signalId: String(signalId), direction: dir, leverage: lev,
        entry: formatPrice(entryPrice), tp: formatPrice(tp), sl: formatPrice(sl),
      });
      await sendTelegramPhoto(img, [
        `📡 <b>New Signal #${signalId}</b>`,
        ``,
        `${long ? "🟢" : "🔴"} <b>${dir}</b> · XAU/USD · <b>${lev}</b>`,
      ].join("\n"), [BTN_COPY, BTN_CONTRACT]);

      // Auto-copy for enabled users
      try {
        const users = await this.copyTrader.getAutoCopyUsers();
        for (const user of users) {
          try {
            const config = await this.copyTrader.autoCopy(user);
            if (config.enabled) {
              log(`Auto-copy for ${user} (${Number(config.amount) / 1e6} USDC)...`);
              const tx = await this.copyTrader.executeCopyFor(user, signalId);
              await tx.wait();
              log(`Auto-copied for ${user}`);
            }
          } catch (err) {
            log(`Auto-copy skip ${user}: ${err.reason || err.message?.substring(0, 60)}`);
          }
        }
      } catch (err) {
        logError("Auto-copy iteration", err);
      }
    });

    // ── User copied a trade — log + whale alert for big deposits ──
    contract.on("TradeCopied", async (user, signalId, amount) => {
      const amtStr = formatUSDC(amount);
      log(`TradeCopied: ${shortAddr(user)} deposited $${amtStr} on signal #${signalId}`);

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

    // ── User claimed proceeds (withdrawal) ──
    contract.on("ProceedsClaimed", async (user, signalId, payout, fee, event) => {
      const tx = event.log?.transactionHash || "";
      const payoutStr = formatUSDC(payout);
      const feeStr = formatUSDC(fee);
      log(`ProceedsClaimed: ${shortAddr(user)} claimed $${payoutStr}`);
      const img = await claimImage({
        trader: shortAddr(user), payout: payoutStr, fee: feeStr, signalId: String(signalId),
      });
      const buttons = [BTN_APP, BTN_TG];
      if (tx) buttons.push(txBtn(tx));
      await sendTelegramPhoto(img, [
        `🏆 <b>Profit Claimed — $${payoutStr} USDC</b>`,
        ``,
        `👤 <a href="${ARBISCAN_ADDR}${user}">${shortAddr(user)}</a>`,
        Number(fee) > 0 ? `📊 Fee: $${feeStr} USDC` : "",
      ].filter(Boolean).join("\n"), buttons);

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
    // Track win streak
    this.winStreak = 0;

    contract.on("SignalClosed", async (signalId, resultPct) => {
      const pct = Number(resultPct) / 100;
      const win = pct >= 0;

      // Get leverage from signal
      let levNum = 50;
      let dir = "XAU/USD";
      try {
        const signal = await this.copyTrader.signalCore(signalId);
        levNum = Number(signal.leverage || signal[6]) / 1000;
        dir = (signal.long || signal[0]) ? "LONG" : "SHORT";
      } catch {}

      const leveragedPct = pct * levNum;
      log(`SignalClosed #${signalId} result=${pct}% x${levNum} = ${leveragedPct.toFixed(1)}%`);

      // Streak tracking
      if (win) {
        this.winStreak++;
      } else {
        this.winStreak = 0;
      }

      const img = await signalClosedImage({
        signalId: String(signalId), resultPct: leveragedPct, direction: dir, leverage: `${levNum}x`,
      });

      await sendTelegramPhoto(img, [
        win ? `✅ <b>Signal #${signalId} Closed — Profit</b>` : `❌ <b>Signal #${signalId} Closed — Loss</b>`,
        ``,
        `📊 Result: <b>${win ? "+" : ""}${leveragedPct.toFixed(1)}%</b> on collateral`,
        `📈 Price move: ${win ? "+" : ""}${pct.toFixed(2)}% × ${levNum}x`,
      ].join("\n"), win ? [BTN_CLAIM, BTN_APP] : [BTN_APP, BTN_TG]);

      // Send streak image at 3, 5, 7, 10, 15, 20, 25...
      if (this.winStreak >= 3 && (this.winStreak <= 10 || this.winStreak % 5 === 0)) {
        try {
          const streakImg = await winStreakImage({
            streak: this.winStreak,
            resultPct: leveragedPct.toFixed(1),
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
    });

    // ── Fees withdrawn by admin ──
    contract.on("FeesWithdrawn", async (amount) => {
      log(`FeesWithdrawn: $${formatUSDC(amount)}`);
      await sendTelegram(`💎 <b>Platform Fees Collected</b>\n\nAmount: <b>$${formatUSDC(amount)} USDC</b>`);
    });

    // ── Track known copiers to avoid duplicate notifications ──
    const knownCopiers = new Set();
    try {
      const existingUsers = await contract.getAutoCopyUsers();
      for (const u of existingUsers) knownCopiers.add(u.toLowerCase());
      log(`Known copiers loaded: ${knownCopiers.size}`);
    } catch {}

    // ── New auto-copier joined ──
    contract.on("AutoCopyEnabled", async (user, amount) => {
      const amtStr = formatUSDC(amount);
      const isNew = !knownCopiers.has(user.toLowerCase());
      knownCopiers.add(user.toLowerCase());

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
      const dayAgo = now - 86400;

      let trades = 0, wins = 0, losses = 0, volume = 0;
      let totalResultPct = 0;

      for (let i = total; i >= 1; i--) {
        const meta = await contract.signalMeta(i);
        const closedAt = Number(meta.closedAt);
        if (closedAt === 0 || closedAt < dayAgo) continue;

        const core = await contract.signalCore(i);
        if (!core.closed) continue;

        trades++;
        const resultPct = Number(core.resultPct) / 100;
        const leverage = Number(core.leverage) / 1000;
        const leveragedPct = resultPct * leverage;
        totalResultPct += leveragedPct;

        if (Number(core.resultPct) >= 0) wins++;
        else losses++;
        volume += parseFloat(ethers.formatUnits(meta.totalCopied, 6));
      }

      const copierCount = Number(await contract.getAutoCopyUserCount());
      const dayProfitPct = trades > 0 ? (totalResultPct / trades).toFixed(2) : "0.00";
      const dayProfitUsd = (volume * totalResultPct / 100).toFixed(2);

      if (trades === 0) {
        log("Daily summary: no trades today, skipping");
        return;
      }

      const img = await dailySummaryImage({
        trades: String(trades),
        wins: String(wins),
        losses: String(losses),
        volume: volume.toFixed(0),
        profit: `${totalResultPct >= 0 ? '+' : ''}${dayProfitPct}%`,
        copiers: String(copierCount),
      });

      await sendTelegramPhoto(img, [
        `📊 <b>Daily Recap</b>`,
        ``,
        `📈 Trades: <b>${trades}</b> (${wins}W / ${losses}L)`,
        `💰 Volume: <b>$${volume.toFixed(0)} USDC</b>`,
        `🎯 Avg result: <b>${totalResultPct >= 0 ? '+' : ''}${dayProfitPct}%</b>`,
        `💵 Profit: <b>${totalResultPct >= 0 ? '+' : ''}$${dayProfitUsd}</b>`,
        `👥 Copiers: <b>${copierCount}</b>`,
      ].join("\n"), [BTN_APP, BTN_TG]);

      log(`Daily summary sent: ${trades} trades, $${volume.toFixed(0)} volume`);
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
        if (!core.closed) continue;

        const vol = parseFloat(ethers.formatUnits(meta.totalCopied, 6));
        const resultPct = Number(core.resultPct) / 100;
        const leverage = Number(core.leverage) / 1000;
        const leveragedPct = resultPct * leverage;

        totalTrades++;
        totalVolume += vol;
        totalResultPct += leveragedPct;

        for (const day of days) {
          if (closedAt >= day.start && closedAt <= day.end) {
            day.trades++;
            day.volume += vol;
            day.resultPct += leveragedPct;
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
        totalVolume += parseFloat(ethers.formatUnits(meta.totalCopied, 6));
      }
      const copierCount = Number(await contract.getAutoCopyUserCount());

      // Also calc current profit
      let initProfit = 0;
      for (let i = 1; i <= total; i++) {
        const meta = await contract.signalMeta(i);
        const vol = parseFloat(ethers.formatUnits(meta.totalCopied, 6));
        const core = await contract.signalCore(i);
        if (core.closed) {
          const resultPct = Number(core.resultPct) / 100;
          const leverage = Number(core.leverage) / 1000;
          initProfit += vol * (resultPct / 100) * leverage;
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

      // Calculate total volume + profit
      let totalVolume = 0;
      let totalProfit = 0;
      for (let i = 1; i <= total; i++) {
        const meta = await contract.signalMeta(i);
        const vol = parseFloat(ethers.formatUnits(meta.totalCopied, 6));
        totalVolume += vol;
        const core = await contract.signalCore(i);
        if (core.closed) {
          const resultPct = Number(core.resultPct) / 100;
          const leverage = Number(core.leverage) / 1000;
          totalProfit += vol * (resultPct / 100) * leverage;
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

  // ===== POLLING FALLBACK =====
  startPolling() {
    log(`Polling every ${POLL_INTERVAL / 1000}s as fallback...`);

    const poll = async () => {
      if (!this.running) return;

      try {
        // Check if there's an active signal
        const activeId = await this.copyTrader.activeSignalId();
        if (Number(activeId) === 0) {
          // No active signal — nothing to watch
          setTimeout(poll, POLL_INTERVAL);
          return;
        }

        // Check recent blocks for close events
        const currentBlock = await this.httpProvider.getBlockNumber();
        let fromBlock = this.lastProcessedBlock > 0
          ? this.lastProcessedBlock + 1
          : currentBlock - 5;

        if (fromBlock > currentBlock) {
          setTimeout(poll, POLL_INTERVAL);
          return;
        }

        const gTradeRead = new ethers.Contract(GTRADE_DIAMOND, GTRADE_ABI, this.logProvider);

        // Process in chunks of 9 blocks (Alchemy free tier limit is 10)
        while (fromBlock <= currentBlock) {
          const toBlock = Math.min(fromBlock + 9, currentBlock);

          try {
            // Query MarketExecuted events
            const marketEvents = await gTradeRead.queryFilter(
              gTradeRead.filters.MarketExecuted(null, GOLD_COPY_TRADER_ADDRESS),
              fromBlock, toBlock
            );

            for (const event of marketEvents) {
              if (!event.args.open) {
                log(`[POLL] MarketExecuted found in block ${event.blockNumber}`);
                await this.handleTradeClose(event.args.percentProfit);
              }
            }

            // Query LimitExecuted events
            const limitEvents = await gTradeRead.queryFilter(
              gTradeRead.filters.LimitExecuted(null, GOLD_COPY_TRADER_ADDRESS),
              fromBlock, toBlock
            );

            for (const event of limitEvents) {
              log(`[POLL] LimitExecuted found in block ${event.blockNumber}`);
              await this.handleTradeClose(event.args.percentProfit);
            }
          } catch (chunkErr) {
            logError(`Polling chunk ${fromBlock}-${toBlock} error`, chunkErr);
          }

          fromBlock = toBlock + 1;
        }

        this.lastProcessedBlock = currentBlock;
      } catch (err) {
        logError("Polling error", err);
      }

      setTimeout(poll, POLL_INTERVAL);
    };

    poll();
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

      // Get signal leverage
      const signal = await this.copyTrader.signalCore(activeId);
      if (!signal.active || signal.closed) {
        log(`Signal #${activeId} already closed`);
        return;
      }

      const leverage = Number(signal.leverage);
      const rawPercent = BigInt(gTradePercentProfit);
      const resultPct = convertPercentProfit(rawPercent, leverage);

      log("═══════════════════════════════════════");
      log(`  Signal #${activeId} — Closing automatically`);
      log(`  Direction: ${signal.long ? "LONG" : "SHORT"}`);
      log(`  Leverage: ${leverage / 1000}x`);
      log(`  gTrade percentProfit (raw): ${rawPercent}`);
      log(`  Contract resultPct (converted): ${resultPct} bps (${Number(resultPct) / 100}%)`);
      log("═══════════════════════════════════════");

      // Send closeSignal transaction
      const tx = await this.copyTrader.closeSignal(activeId, resultPct);
      log(`TX sent: ${tx.hash}`);

      const receipt = await tx.wait();
      log(`TX confirmed in block ${receipt.blockNumber} — Signal #${activeId} closed!`);

      const pct = Number(resultPct) / 100;
      const levNum = leverage / 1000;
      const leveragedPct = pct * levNum;
      const win = pct >= 0;
      const dir = signal.long ? "LONG" : "SHORT";
      const lev = `${levNum}x`;
      const img = await autoCloseImage({
        signalId: String(activeId), direction: dir, leverage: lev, resultPct: leveragedPct,
      });
      await sendTelegramPhoto(img, [
        `⚡ <b>Auto-Close Signal #${activeId}</b>`,
        ``,
        `📊 Result: <b>${win ? "+" : ""}${leveragedPct.toFixed(1)}%</b> on collateral`,
        `📈 Price move: ${win ? "+" : ""}${pct.toFixed(2)}% × ${lev}`,
      ].join("\n"), [
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
