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
  "function activeSignalId() view returns (uint256)",
  "function admin() view returns (address)",
  "function getAutoCopyUsers() view returns (address[])",
  "function autoCopy(address) view returns (uint256 amount, bool enabled)",
  "function executeCopyFor(address _user, uint256 _signalId) external",
  "event SignalPosted(uint256 indexed signalId, bool long, uint64 entryPrice, uint64 tp, uint64 sl, uint24 leverage)",
  "event SignalOpened(uint256 indexed signalId, uint256 totalDeposited)",
  "event SignalSettled(uint256 indexed signalId, uint256 totalDeposited, uint256 totalReturned, int256 resultPct)",
  "event UserDeposited(address indexed user, uint256 indexed signalId, uint256 amount)",
  "event AutoCopied(address indexed user, uint256 indexed signalId, uint256 amount)",
  "event UserClaimed(address indexed user, uint256 indexed signalId, uint256 payout, uint256 fee)",
  "event FeesWithdrawn(uint256 amount)",
  "event AutoCopyEnabled(address indexed user, uint256 amount)",
  "event AutoCopyDisabled(address indexed user)",
  "function getAutoCopyUserCount() view returns (uint256)",
  "function signalCount() view returns (uint256)",
  "function signalCore(uint256) view returns (bool long, uint8 phase, uint64 entryPrice, uint64 tp, uint64 sl, uint24 leverage, uint256 feeAtCreation)",
  "function signalVault(uint256) view returns (uint256 timestamp, uint256 closedAt, uint256 totalDeposited, uint256 originalDeposited, uint256 realizedReturned, uint256 totalClaimed, uint256 copierCount, uint256 vaultBalance, bool gTradePending, bool closePending, uint256 balanceSnapshot, uint32 tradeIndex)",
  "function claimFor(address _user, uint256 _signalId) external",
  "function positions(address, uint256) view returns (uint256 deposit, bool claimed, uint256 paidOut, uint256 feesPaid)",
  "function getUserSignalIds(address) view returns (uint256[])",
  "function getActiveSignalId() view returns (uint256)",
  "function settleSignal() external",
  "function closeTrade(uint64 _expectedPrice) external",
  "function openTrade() external",
  "function confirmGTradeOpen(uint32 _tradeIndex) external",
  "function confirmClose() external",
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
      const rows = Array.isArray(buttons[0]) ? buttons : [buttons];
      form.append("reply_markup", JSON.stringify({
        inline_keyboard: rows,
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

// V3: calculate result % from vault (realizedReturned vs originalDeposited)
function calcResultPct(vault) {
  const returned = BigInt(vault.realizedReturned);
  const original = BigInt(vault.originalDeposited);
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
const BTN_LIVE_PNL = { text: "📊 Live PnL", url: `${WEBSITE}?tab=dashboard` };
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
    this.autoCopyInProgress = false; // lock — trade-monitor skips openTrade while this is true
  }

  // Runs a full auto-copy round for the given signalId. Idempotent: users already
  // deposited are skipped. Retries failed-but-eligible users up to 2 extra times
  // so transient RPC errors or nonce conflicts don't drop users from the pool.
  async runAutoCopyRound(signalId) {
    this.autoCopyInProgress = true;
    try {
      const users = await this.copyTrader.getAutoCopyUsers();
      const MAX_PASSES = 3;

      for (let pass = 1; pass <= MAX_PASSES; pass++) {
        let nonce = await this.wallet.getNonce();
        const failures = [];

        for (const user of users) {
          try {
            const config = await this.copyTrader.autoCopy(user);
            if (!config.enabled) continue;
            const amount = Number(config.amount) / 1e6;

            const pos = await this.copyTrader.positions(user, signalId);
            if (Number(pos.deposit) > 0) continue; // already in

            const userBal = await this.usdc.balanceOf(user);
            const balNum = Number(userBal) / 1e6;
            if (balNum < amount) {
              if (pass === 1) log(`Auto-copy skip ${shortAddr(user)}: balance $${balNum.toFixed(2)} < $${amount.toFixed(2)}`);
              continue; // genuinely can't copy — don't retry
            }

            if (pass > 1) log(`Auto-copy RETRY (pass ${pass}) for ${shortAddr(user)} ($${amount})...`);
            else log(`Auto-copy for ${shortAddr(user)} ($${amount})...`);
            const tx = await this.copyTrader.executeCopyFor(user, signalId, { nonce });
            nonce++;
            await tx.wait();
            log(`Auto-copied for ${shortAddr(user)}`);
          } catch (err) {
            const reason = err.reason || err.message?.substring(0, 60) || 'unknown';
            log(`Auto-copy skip ${shortAddr(user)} (pass ${pass}): ${reason}`);
            failures.push(user);
            try { nonce = await this.wallet.getNonce(); } catch {}
          }
        }

        if (failures.length === 0) break; // everyone eligible is in
        if (pass < MAX_PASSES) {
          log(`${failures.length} user(s) failed on pass ${pass} — retrying in 3s...`);
          await new Promise(r => setTimeout(r, 3000));
        } else {
          log(`WARN: ${failures.length} eligible user(s) still missing after ${MAX_PASSES} passes: ${failures.map(shortAddr).join(', ')}`);
        }
      }
    } catch (err) {
      logError("Auto-copy iteration", err);
    } finally {
      this.autoCopyInProgress = false;
    }
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
    this.httpProvider = new ethers.JsonRpcProvider(httpRpc, undefined, {
      staticNetwork: true,
      pollingInterval: 30_000, // 30s instead of default 4s — prevents Infura rate limits
    });
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
      // Wait 30s after startup before checking — give gTrade time to stabilize
      log("Startup: waiting 30s before checking for stuck trades...");
      await new Promise(r => setTimeout(r, 30000));

      const activeId = await this.copyTrader.activeSignalId();
      if (Number(activeId) === 0) return;

      const signal = await this.copyTrader.signalCore(activeId);
      if (Number(signal.phase) !== 2) return; // not TRADING (enum: 0=NONE, 1=COLLECTING, 2=TRADING, 3=SETTLED)

      const vault = await this.copyTrader.signalVault(activeId);
      if (Number(vault.originalDeposited) === 0) return; // openTrade not completed

      // Check if gTrade position still exists
      const gTrade = new ethers.Contract(GTRADE_DIAMOND, [
        "function getTrades(address) view returns (tuple(address,uint32,uint16,uint24,bool,bool,uint8,uint8,uint120,uint64,uint64,uint64,bool,uint160,uint24)[])",
      ], this.httpProvider);
      const trades = await gTrade.getTrades(GOLD_COPY_TRADER_ADDRESS);

      if (trades.length === 0) {
        log("STARTUP: Signal #" + activeId + " active but no gTrade position — letting safety net handle it");
        return;
      } else {
        log("Startup: Signal #" + activeId + " has " + trades.length + " open gTrade position(s) — monitoring");
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
      await this.runAutoCopyRound(signalId);

      // Auto-open trade on gTrade after deposits
      try {
        const vault = await this.copyTrader.signalVault(signalId);
        const deposited = Number(vault.totalDeposited);
        if (deposited === 0) {
          log(`No deposits for signal #${signalId} — skipping openTrade`);
          return;
        }

        const lev = Number(leverage) / 1000;
        const posSize = (deposited / 1e6) * lev;
        // gTrade's current XAU/USD min position is $800 — old $3000 check was stale
        if (posSize < 800) {
          log(`Position size $${posSize.toFixed(0)} under $800 minimum — cannot open`);
          return;
        }

        try {
          log(`Opening trade on gTrade...`);
          const openTx = await this.copyTrader.openTrade();
          const receipt = await openTx.wait();
          log(`openTrade TX confirmed: ${openTx.hash}`);

          // Find gTrade index — same approach as proven V2 bot:
          // 1. Snapshot trades BEFORE open (to know what's new)
          // 2. After open TX confirms, read trades again
          // 3. Compare to find the newly opened trade
          // 4. If not found, poll up to 30s (gTrade pending order)
          const gTradeRead = new ethers.Contract(GTRADE_DIAMOND, [
            "function getTrades(address) view returns (tuple(address,uint32,uint16,uint24,bool,bool,uint8,uint8,uint120,uint64,uint64,uint64,bool,uint160,uint24)[])",
          ], this.httpProvider);

          // Snapshot existing trades BEFORE open (in case there are old stuck ones)
          let tradesBefore = [];
          try {
            tradesBefore = await gTradeRead.getTrades(GOLD_COPY_TRADER_ADDRESS);
          } catch {}
          const indexesBefore = new Set(tradesBefore.map(t => Number(t[1])));

          let tradeIndex = null;

          // Poll for new trade (max 30s)
          for (let attempt = 1; attempt <= 6; attempt++) {
            try {
              await new Promise(r => setTimeout(r, 5000));
              const tradesAfter = await gTradeRead.getTrades(GOLD_COPY_TRADER_ADDRESS);

              // Find the NEW trade (not in before snapshot)
              for (const t of tradesAfter) {
                const idx = Number(t[1]);
                if (!indexesBefore.has(idx)) {
                  tradeIndex = idx;
                  log(`  New gTrade trade found! index=${tradeIndex} (attempt ${attempt})`);
                  break;
                }
              }

              if (tradeIndex !== null) break;

              // Fallback: if before was empty and after has trades, use the last one
              if (tradesBefore.length === 0 && tradesAfter.length > 0) {
                tradeIndex = Number(tradesAfter[tradesAfter.length - 1][1]);
                log(`  gTrade trade found (first trade): index=${tradeIndex}`);
                break;
              }

              log(`  Attempt ${attempt}/6: no new gTrade trade yet — waiting...`);
            } catch (err) {
              logError(`getTrades attempt ${attempt}`, err);
            }
          }

          if (tradeIndex === null) {
            log(`⚠️ Could not find gTrade trade after 30s — NOT confirming.`);
            log(`  gTradePending stays true. MarketExecuted event or safety net will confirm later.`);
            // DON'T confirm with wrong index!
            return;
          }

          // Confirm with the REAL index from gTrade
          try {
            const confirmTx = await this.copyTrader.confirmGTradeOpen(tradeIndex);
            await confirmTx.wait();
            log(`  confirmGTradeOpen(${tradeIndex}) confirmed`);
          } catch (err) {
            logError("confirmGTradeOpen", err);
          }
        } catch (err) {
          logError("openTrade", err);
        }
      } catch (err) {
        logError("Auto-open trade", err);
      }
    });

    // ── Trade opened on gTrade — send Telegram with real gTrade entry price ──
    contract.on("SignalOpened", async (signalId, totalDeposited, event) => {
      log(`SignalOpened #${signalId} — $${Number(totalDeposited) / 1e6} USDC`);
      const core = await this.copyTrader.signalCore(signalId);
      const long = core.long;
      const dir = long ? "LONG" : "SHORT";
      const levNum = Number(core.leverage) / 1000;
      const lev = `${levNum}x`;
      const pool = Number(totalDeposited) / 1e6;
      const tp = Number(core.tp) / 1e10;
      const sl = Number(core.sl) / 1e10;

      // Wait a moment for gTrade to fill, then read actual entry price
      let realEntry = Number(core.entryPrice) / 1e10; // fallback to signal entry
      try {
        await new Promise(r => setTimeout(r, 5000));
        const gTradeRead = new ethers.Contract(GTRADE_DIAMOND, [
          "function getTrades(address) view returns (tuple(address,uint32,uint16,uint24,bool,bool,uint8,uint8,uint120,uint64,uint64,uint64,bool,uint160,uint24)[])",
        ], this.httpProvider);
        const trades = await gTradeRead.getTrades(GOLD_COPY_TRADER_ADDRESS);
        if (trades.length > 0) {
          realEntry = Number(trades[trades.length - 1][9]) / 1e10;
          log(`  Real gTrade entry: $${realEntry.toFixed(2)} (signal: $${(Number(core.entryPrice) / 1e10).toFixed(2)})`);
        }
      } catch (err) {
        log(`  Could not read gTrade entry, using signal entry: ${err.message?.slice(0, 60)}`);
      }

      const tpPctGross = long ? ((tp - realEntry) / realEntry) * levNum * 100 : ((realEntry - tp) / realEntry) * levNum * 100;
      const slPctGross = long ? ((realEntry - sl) / realEntry) * levNum * 100 : ((sl - realEntry) / realEntry) * levNum * 100;
      const posSize = pool * levNum;
      const estFees = posSize * 0.0012;
      const tpUsd = Math.max(0, pool * tpPctGross / 100 - estFees);
      const slUsd = pool * slPctGross / 100 + estFees;
      // Show net % (after fees) so it matches tpUsd/slUsd and the final Result % at close
      const tpPct = pool > 0 ? (tpUsd / pool) * 100 : tpPctGross;
      const slPct = pool > 0 ? (slUsd / pool) * 100 : slPctGross;

      const img = await signalImage({
        signalId: String(signalId), direction: dir, leverage: lev,
        entry: realEntry.toFixed(2), tp: formatPrice(core.tp), sl: formatPrice(core.sl),
      });

      await sendTelegramPhoto(img, [
        `📡 <b>Trade Opened #${signalId}</b>`,
        ``,
        `${long ? "🟢" : "🔴"} <b>${dir}</b> · XAU/USD · <b>${lev}</b>`,
        `💰 Total copied: <b>$${pool.toFixed(0)} USDC</b>`,
        `📍 Entry: <b>$${realEntry.toFixed(2)}</b>`,
        ``,
        `🎯 Target: <b>+${tpPct.toFixed(1)}%</b> (+$${tpUsd.toFixed(2)})`,
        `🛑 Risk: <b>-${slPct.toFixed(1)}%</b> (-$${slUsd.toFixed(2)})`,
        ``,
        `💎 Copy now to join this trade`,
      ].join("\n"), [[BTN_LIVE_PNL], [BTN_COPY, BTN_CONTRACT]]);
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
                .eq('referred', user.toLowerCase());
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
          const meta = await contract.signalVault(i);
          const pct = calcResultPct(meta);
          // Skip cancelled signals (full refund)
          const dep = BigInt(meta.originalDeposited);
          const ret = BigInt(meta.realizedReturned);
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
      // resultPct is the ACTUAL on-chain PnL (basis points) — reflects real fees + slippage,
      // not idealized TP/SL hit math. Matches what copiers see in their wallets.
      const pct = Number(resultPct) / 100;
      const win = pct >= 0;

      let dir = "XAU/USD";
      let levNum = 25;
      let isLong = true;
      try {
        const signal = await this.copyTrader.signalCore(signalId);
        levNum = Number(signal.leverage) / 1000;
        isLong = signal.long;
        dir = isLong ? "LONG" : "SHORT";
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
            `💰 Copied: $${poolIn.toFixed(0)} → $${poolOut.toFixed(0)} USDC`,
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

      // ── Auto-claim for all users with positions (3-pass retry) ──
      try {
        const users = await this.copyTrader.getAutoCopyUsers();
        const MAX_PASSES = 3;
        for (let pass = 1; pass <= MAX_PASSES; pass++) {
          let nonce = await this.wallet.getNonce();
          const failures = [];
          for (const user of users) {
            try {
              const pos = await this.copyTrader.positions(user, signalId);
              if (pos.deposit > 0n && !pos.claimed) {
                if (pass > 1) log(`  Auto-claim RETRY (pass ${pass}) for ${shortAddr(user)} on #${signalId}...`);
                else log(`  Auto-claiming for ${shortAddr(user)} on signal #${signalId}...`);
                const tx = await this.copyTrader.claimFor(user, signalId, { nonce });
                nonce++;
                await tx.wait();
                log(`  ✅ Claimed for ${shortAddr(user)}`);
              }
            } catch (err) {
              log(`  ⚠️ claimFor ${shortAddr(user)} (pass ${pass}) failed: ${err.message?.slice(0, 100)}`);
              failures.push(user);
              try { nonce = await this.wallet.getNonce(); } catch {}
            }
          }
          if (failures.length === 0) break;
          if (pass < MAX_PASSES) {
            log(`  ${failures.length} claim(s) failed pass ${pass} — retrying in 3s...`);
            await new Promise(r => setTimeout(r, 3000));
          } else {
            log(`  WARN: ${failures.length} claim(s) still missing after ${MAX_PASSES} passes: ${failures.map(shortAddr).join(', ')}`);
          }
        }
        log(`  Auto-claim complete for signal #${signalId}`);
      } catch (err) {
        log(`  ⚠️ Auto-claim error: ${err.message?.slice(0, 100)}`);
      }
    });

    // ── Fees withdrawn by admin ── (silent — no Telegram notif)
    contract.on("FeesWithdrawn", async (amount) => {
      log(`FeesWithdrawn: $${formatUSDC(amount)}`);
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
        const meta = await contract.signalVault(i);
        const closedAt = Number(meta.closedAt);

        // EARLY EXIT: signals are sequential, so if we go past midnight, all earlier are too
        if (closedAt > 0 && closedAt < utcMidnight) break;

        const core = await contract.signalCore(i);
        const dep = Number(meta.originalDeposited);
        const ret = Number(meta.realizedReturned);

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
        const meta = await contract.signalVault(i);
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
        profit: d.trades > 0 ? `${d.resultPct >= 0 ? '+' : ''}${(d.resultPct / d.trades).toFixed(2)}%` : '—',
      }));

      const avgPct = (totalResultPct / totalTrades).toFixed(2);
      const totalRetPct = Number(totalResultPct.toFixed(2));

      const img = await weeklyRecapImage({
        days: daysData,
        totalTrades: String(totalTrades),
        totalProfit: `${totalResultPct >= 0 ? '+' : ''}${avgPct}%`,
        copiers: String(copierCount),
      });

      await sendTelegramPhoto(img, [
        `📊 <b>Weekly Recap — Mon to Fri</b>`,
        ``,
        ...daysData.map(d => d.trades > 0 ? `${d.name}: <b>${d.profit}</b> (${d.trades} trades)` : `${d.name}: No trades`),
        ``,
        `📈 Avg result per trade: <b>${totalResultPct >= 0 ? '+' : ''}${avgPct}%</b>`,
        `🎯 Total trades: <b>${totalTrades}</b>`,
        `👥 Copiers: <b>${copierCount}</b>`,
        ...(totalRetPct > 0 ? [``, `💡 A copier making $100 trades gained ~<b>$${totalRetPct.toFixed(0)} USDC</b> this week.`] : []),
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
        const meta = await contract.signalVault(i);
        totalVolume += parseFloat(ethers.formatUnits(meta.totalDeposited, 6));
      }
      const copierCount = Number(await contract.getAutoCopyUserCount());

      // Also calc current profit (returned - deposited for settled signals)
      let initProfit = 0;
      for (let i = 1; i <= total; i++) {
        const meta = await contract.signalVault(i);
        const core = await contract.signalCore(i);
        if (Number(core.phase) === 3) { // SETTLED
          const dep = Number(meta.originalDeposited);
          const ret = Number(meta.realizedReturned);
          if (dep > 0 && ret > 0 && dep !== ret) {
            initProfit += (ret - dep) / 1e6;
          }
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
    setInterval(() => this.checkMilestones(), 3600_000); // check every 1 hour (was 5 min)
    log("Milestone tracker started");
  }

  async checkMilestones() {
    try {
      const contract = this.copyTrader;
      const total = Number(await contract.signalCount());

      // Cache settled signals — they don't change anymore
      if (!this.settledCache) this.settledCache = new Map();
      let cachedProfit = this.cachedProfit || 0;

      // Calculate real volume (unclaimed collateral) + profit
      let totalVolume = 0;
      const users = await contract.getAutoCopyUsers();
      // Use volume from auto-copy config (much cheaper than iterating positions)
      for (const user of users) {
        const config = await contract.autoCopy(user);
        if (config.enabled) totalVolume += Number(config.amount) / 1e6;
      }

      // Only read signals that are NOT yet cached as settled
      let totalProfit = cachedProfit;
      for (let i = 1; i <= total; i++) {
        if (this.settledCache.has(i)) continue; // already counted

        const core = await contract.signalCore(i);
        if (Number(core.phase) === 3) { // SETTLED
          const vault = await contract.signalVault(i);
          const dep = Number(vault.originalDeposited);
          const ret = Number(vault.realizedReturned);
          if (dep > 0 && ret > 0 && dep !== ret) {
            const pnl = (ret - dep) / 1e6;
            totalProfit += pnl;
            this.settledCache.set(i, pnl);
          } else {
            this.settledCache.set(i, 0); // mark as counted
          }
        }
      }
      this.cachedProfit = totalProfit;

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
      // Clean up previous WS listeners to prevent duplicates on reconnect
      if (this.gTradeDiamond) {
        this.gTradeDiamond.removeAllListeners();
        log("Cleaned up previous gTrade listeners");
      }
      if (this.wsProvider) {
        try { this.wsProvider.destroy(); } catch {}
      }

      log("Connecting WebSocket...");
      this.wsProvider = new ethers.WebSocketProvider(ARBITRUM_RPC_WSS);
      this.gTradeDiamond = new ethers.Contract(GTRADE_DIAMOND, GTRADE_ABI, this.wsProvider);

      // Filter: only events where user == our contract
      const contractAddr = GOLD_COPY_TRADER_ADDRESS;

      // MarketExecuted (trade opened or closed via market order)
      this.gTradeDiamond.on("MarketExecuted", async (...args) => {
        try {
          const event = args[args.length - 1];
          const decoded = event.args;
          const user = decoded.user;
          const open = decoded.open;

          if (user.toLowerCase() !== contractAddr.toLowerCase()) return;

          if (open) {
            // TRADE OPENED on gTrade — confirm the index on our contract
            const index = Number(decoded.index);
            log(`MarketExecuted OPEN detected! index=${index}`);

            try {
              const activeId = await this.copyTrader.activeSignalId();
              if (activeId > 0n) {
                const vault = await this.copyTrader.signalVault(activeId);
                if (vault.gTradePending) {
                  const tx = await this.copyTrader.confirmGTradeOpen(index);
                  await tx.wait();
                  log(`  confirmGTradeOpen(${index}) via MarketExecuted event`);
                } else {
                  log(`  gTrade already confirmed — skipping`);
                }
              }
            } catch (err) {
              logError("confirmGTradeOpen via event", err);
            }
            return;
          }

          // TRADE CLOSED
          log(`MarketExecuted CLOSE detected! user=${user}, percentProfit=${decoded.percentProfit}`);
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

        // Phase 1 (COLLECTING): deposits came in but openTrade not yet called
        if (Number(signal.phase) === 1) {
          // Don't race the SignalPosted handler
          if (this.autoCopyInProgress) {
            setTimeout(check, MONITOR_INTERVAL);
            return;
          }
          // Catch any stragglers (bot restart, missed event, race, etc.) BEFORE openTrade
          await this.runAutoCopyRound(activeId);

          const vault = await this.copyTrader.signalVault(activeId);
          const deposited = Number(vault.totalDeposited) / 1e6;
          const levNum = Number(signal.leverage) / 1000;
          const posSize = deposited * levNum;
          if (posSize >= 3000) {
            log(`Trade monitor: Signal #${activeId} has $${deposited.toFixed(0)} × ${levNum}x = $${posSize.toFixed(0)} — opening trade`);
            try {
              const openTx = await this.copyTrader.openTrade();
              await openTx.wait();
              log(`  openTrade confirmed: ${openTx.hash}`);
            } catch (err) {
              log(`  openTrade retry failed: ${err.reason || err.message?.slice(0, 80)}`);
            }
          }
          setTimeout(check, MONITOR_INTERVAL);
          return;
        }

        if (Number(signal.phase) !== 2) { // Not in TRADING phase (enum: 0=NONE, 1=COLLECTING, 2=TRADING, 3=SETTLED)
          setTimeout(check, MONITOR_INTERVAL);
          return;
        }

        // Make sure openTrade actually completed (originalDeposited gets set in openTrade)
        const vault0 = await this.copyTrader.signalVault(activeId);
        if (Number(vault0.originalDeposited) === 0) {
          setTimeout(check, MONITOR_INTERVAL);
          return;
        }

        // Check if gTrade trades still exist
        const gTrade = new ethers.Contract(GTRADE_DIAMOND, [
          "function getTrades(address) view returns (tuple(address,uint32,uint16,uint24,bool,bool,uint8,uint8,uint120,uint64,uint64,uint64,bool,uint160,uint24)[])",
        ], this.httpProvider);
        const trades = await gTrade.getTrades(GOLD_COPY_TRADER_ADDRESS);

        // SAFETY NET: auto-confirm gTrade if still pending
        if (vault0.gTradePending && trades.length > 0) {
          const tradeIndex = Number(trades[trades.length - 1][1]);
          log(`  Safety net: confirming gTrade index ${tradeIndex} (was pending)`);
          try {
            const tx = await this.copyTrader.confirmGTradeOpen(tradeIndex);
            await tx.wait();
            log(`  confirmGTradeOpen(${tradeIndex}) confirmed via safety net`);
          } catch (err) {
            log(`  confirmGTradeOpen failed: ${err.reason || err.message?.slice(0, 60)}`);
          }
          setTimeout(check, MONITOR_INTERVAL);
          return;
        }

        if (trades.length === 0) {
          log("⚠️  SAFETY NET: gTrade trades gone but signal still active! Auto-closing...");

          try {
            this.autoClosedSignals.add(Number(activeId));

            // Wait for gTrade to finalize USDC transfer
            await new Promise(r => setTimeout(r, 5000));

            // V3: confirmClose only if closePending is true
            // When gTrade auto-closes (TP/SL/LIQ), closePending is false — skip confirmClose.
            try {
              const safetyVault = await this.copyTrader.signalVault(activeId);
              if (safetyVault.closePending) {
                const confirmTx = await this.copyTrader.confirmClose();
                await confirmTx.wait();
                log(`  confirmClose confirmed`);
              } else {
                log(`  closePending=false — skipping confirmClose`);
              }
            } catch (err) {
              log(`  confirmClose check skipped: ${err.reason || err.message?.slice(0, 60)}`);
            }

            // Settle with retry — USDC may not have arrived yet
            let settled = false;
            let settleReceipt = null;
            for (let attempt = 1; attempt <= 3; attempt++) {
              try {
                const stx = await this.copyTrader.settleSignal();
                settleReceipt = await stx.wait();
                log(`  Signal #${activeId} settled via safety net!`);
                settled = true;
                break;
              } catch (settleErr) {
                if (settleErr.reason?.includes("No return detected") || settleErr.message?.includes("No return detected")) {
                  log(`  Safety net attempt ${attempt}/3: USDC not yet back — will retry next cycle`);
                  break; // let the 30s timer retry
                }
                throw settleErr;
              }
            }
            if (!settled) { setTimeout(check, MONITOR_INTERVAL); return; } // retry in 30s

            // Authoritative values from the SignalSettled event — avoids stale RPC reads
            // that previously made the bot post -100% when the chain had the correct PnL.
            const settledEvt = settleReceipt?.logs
              ?.map(l => { try { return this.copyTrader.interface.parseLog(l); } catch { return null; } })
              ?.find(l => l?.name === "SignalSettled" && l.args.signalId.toString() === activeId.toString());
            const levNum = Number(signal.leverage) / 1000;
            const poolIn = settledEvt ? Number(settledEvt.args.totalDeposited) / 1e6 : 0;
            const poolOut = settledEvt ? Number(settledEvt.args.totalReturned) / 1e6 : 0;
            if (!settledEvt) {
              log(`  ⚠️ SignalSettled event missing from receipt — aborting notif to avoid wrong PnL`);
              return;
            }
            const pnlUsd = poolOut - poolIn;
            const pct = poolIn > 0 ? ((poolOut - poolIn) / poolIn) * 100 : 0;
            const win = pct >= 0;

            const img = await autoCloseImage({
              signalId: String(activeId), direction: signal.long ? "LONG" : "SHORT",
              leverage: `${levNum}x`, resultPct: pct,
            });
            const autoCloseLines = [
              `⚡ <b>Auto-Close Signal #${activeId}</b>`,
              ``,
              `📊 Result: <b>${win ? "+" : ""}${pct.toFixed(1)}%</b> on collateral`,
              `💵 PnL: <b>${pnlUsd >= 0 ? "+" : ""}$${pnlUsd.toFixed(2)} USDC</b>`,
            ];
            autoCloseLines.push(``, `💬 <i>${win ? getRandomWinMessage() : getRandomLossMessage()}</i>`);
            await sendTelegramPhoto(img, autoCloseLines.join("\n"), [
              win ? BTN_CLAIM : BTN_APP,
            ]);
          } catch (err) {
            if (err.message?.includes("Not trading")) {
              log("  Signal already settled by another handler");
            } else {
              logError("Safety net settle failed", err);
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
      if (Number(signal.phase) !== 2) {
        log(`Signal #${activeId} not in trading phase (phase=${signal.phase})`);
        return;
      }

      const levNum = Number(signal.leverage) / 1000;

      log("═══════════════════════════════════════");
      log(`  Signal #${activeId} — Settling automatically`);
      log(`  Direction: ${signal.long ? "LONG" : "SHORT"}`);
      log(`  Leverage: ${levNum}x`);
      log("═══════════════════════════════════════");

      this.autoClosedSignals.add(Number(activeId));

      // V3: confirmClose (if needed) + settleSignal — contract auto-calculates returned
      // closePending is only true if bot called closeTrade() manually.
      // For TP/SL/LIQ auto-triggers by gTrade, closePending is false — skip confirmClose.
      try {
        const vault = await this.copyTrader.signalVault(activeId);
        if (vault.closePending) {
          const confirmTx = await this.copyTrader.confirmClose();
          await confirmTx.wait();
          log(`  confirmClose confirmed`);
        } else {
          log(`  closePending=false (gTrade auto-closed) — skipping confirmClose`);
        }
      } catch (err) {
        log(`  confirmClose skipped: ${err.reason || err.message?.slice(0, 60)}`);
      }

      // settleSignal with retry — gTrade may not have returned USDC yet
      let settled = false;
      for (let attempt = 1; attempt <= 5; attempt++) {
        try {
          const tx = await this.copyTrader.settleSignal();
          log(`  settleSignal TX sent: ${tx.hash}`);
          var settleReceipt2 = await tx.wait();
          log(`  TX confirmed in block ${settleReceipt2.blockNumber} — Signal #${activeId} settled!`);
          settled = true;
          break;
        } catch (settleErr) {
          const reason = settleErr.reason || settleErr.message?.slice(0, 100);
          if (reason?.includes("No return detected")) {
            log(`  Attempt ${attempt}/5: USDC not yet received from gTrade — waiting 10s...`);
            await new Promise(r => setTimeout(r, 10000));
          } else {
            throw settleErr; // different error — don't retry
          }
        }
      }
      if (!settled) {
        log(`  ⚠️ settleSignal failed after 5 attempts — safety net will retry in 30s`);
        return;
      }

      // Authoritative values from the SignalSettled event — avoids stale RPC reads
      // that previously made the bot post -100% when the chain had the correct PnL.
      const settledEvt = settleReceipt2?.logs
        ?.map(l => { try { return this.copyTrader.interface.parseLog(l); } catch { return null; } })
        ?.find(l => l?.name === "SignalSettled" && l.args.signalId.toString() === activeId.toString());
      if (!settledEvt) {
        log(`  ⚠️ SignalSettled event missing from receipt — aborting notif to avoid wrong PnL`);
        return;
      }
      const poolIn = Number(settledEvt.args.totalDeposited) / 1e6;
      const poolOut = Number(settledEvt.args.totalReturned) / 1e6;
      const pnlUsd = poolOut - poolIn;
      const resultPctRaw = poolIn > 0 ? ((poolOut - poolIn) / poolIn) * 100 : 0;
      const win = resultPctRaw >= 0;
      const dir = signal.long ? "LONG" : "SHORT";
      const lev = `${levNum}x`;

      const img = await autoCloseImage({
        signalId: String(activeId), direction: dir, leverage: lev, resultPct: resultPctRaw,
      });
      const closeLines = [
        `⚡ <b>Auto-Close Signal #${activeId}</b>`,
        ``,
        `📊 Result: <b>${win ? "+" : ""}${resultPctRaw.toFixed(1)}%</b> on collateral`,
        `💵 PnL: <b>${pnlUsd >= 0 ? "+" : ""}$${pnlUsd.toFixed(2)} USDC</b>`,
        `💰 Copied: $${poolIn.toFixed(0)} → $${poolOut.toFixed(0)} USDC`,
      ];
      closeLines.push(``, `💬 <i>${win ? getRandomWinMessage() : getRandomLossMessage()}</i>`);
      await sendTelegramPhoto(img, closeLines.join("\n"), [
        win ? { text: "🏆 Claim Profits", url: WEBSITE } : { text: "🚀 Open App", url: WEBSITE },
        { text: "🔗 View TX", url: `${ARBISCAN_TX}${tx.hash}` },
      ]);
    } catch (err) {
      if (err.message?.includes("Not active signal") || err.message?.includes("Not trading")) {
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
