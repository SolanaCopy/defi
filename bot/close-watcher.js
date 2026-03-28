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
import { signalImage, depositImage, signalClosedImage, claimImage, autoCloseImage, botOnlineImage } from "./telegram-images.js";
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
} = process.env;

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
    uint32 indexed limitIndex,
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
    this.wallet = new ethers.Wallet(key, this.httpProvider);
    this.copyTrader = new ethers.Contract(GOLD_COPY_TRADER_ADDRESS, COPY_TRADER_ABI, this.wallet);

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

    const BTN_COPY = { text: "💰 Copy Now", url: `${WEBSITE}?tab=dashboard` };
    const BTN_APP = { text: "🚀 Open App", url: `${WEBSITE}?tab=dashboard` };
    const BTN_CLAIM = { text: "🏆 Claim Profits", url: `${WEBSITE}?tab=dashboard` };
    const BTN_CONTRACT = { text: "📄 Contract", url: `${ARBISCAN_ADDR}${GOLD_COPY_TRADER_ADDRESS}` };
    const BTN_TG = { text: "💬 Community", url: "https://t.me/SmartTradingClubDapp" };
    const txBtn = (hash) => ({ text: "🔗 View TX", url: `${ARBISCAN_TX}${hash}` });

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

    // ── User copied a trade (deposit) ──
    contract.on("TradeCopied", async (user, signalId, amount, event) => {
      const tx = event.log?.transactionHash || "";
      const amtStr = formatUSDC(amount);
      log(`TradeCopied: ${shortAddr(user)} deposited $${amtStr}`);
      const img = await depositImage({
        trader: shortAddr(user), amount: amtStr, signalId: String(signalId),
      });
      const buttons = [BTN_COPY, BTN_TG];
      if (tx) buttons.push(txBtn(tx));
      await sendTelegramPhoto(img, [
        `💵 <b>New Deposit — $${amtStr} USDC</b>`,
        ``,
        `👤 <a href="${ARBISCAN_ADDR}${user}">${shortAddr(user)}</a> · Signal #${signalId}`,
      ].join("\n"), buttons);
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
    });

    // ── Signal closed (trade result) ──
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

      const img = await signalClosedImage({
        signalId: String(signalId), resultPct: leveragedPct, direction: dir, leverage: `${levNum}x`,
      });
      await sendTelegramPhoto(img, [
        win ? `✅ <b>Signal #${signalId} Closed — Profit</b>` : `❌ <b>Signal #${signalId} Closed — Loss</b>`,
        ``,
        `📊 Result: <b>${win ? "+" : ""}${leveragedPct.toFixed(1)}%</b> on collateral`,
        `📈 Price move: ${win ? "+" : ""}${pct.toFixed(2)}% × ${levNum}x`,
      ].join("\n"), win ? [BTN_CLAIM, BTN_APP] : [BTN_APP, BTN_TG]);
    });

    // ── Fees withdrawn by admin ──
    contract.on("FeesWithdrawn", async (amount) => {
      log(`FeesWithdrawn: $${formatUSDC(amount)}`);
      await sendTelegram(`💎 <b>Platform Fees Collected</b>\n\nAmount: <b>$${formatUSDC(amount)} USDC</b>`);
    });

    log("Contract event listeners active");
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
        const fromBlock = this.lastProcessedBlock > 0
          ? this.lastProcessedBlock + 1
          : currentBlock - 100; // look back ~100 blocks (~25s on Arbitrum)

        if (fromBlock > currentBlock) {
          setTimeout(poll, POLL_INTERVAL);
          return;
        }

        const gTradeRead = new ethers.Contract(GTRADE_DIAMOND, GTRADE_ABI, this.httpProvider);

        // Query MarketExecuted events
        const marketFilter = gTradeRead.filters.MarketExecuted(null, GOLD_COPY_TRADER_ADDRESS);
        const marketEvents = await gTradeRead.queryFilter(marketFilter, fromBlock, currentBlock);

        for (const event of marketEvents) {
          if (!event.args.open) {
            log(`[POLL] MarketExecuted found in block ${event.blockNumber}`);
            await this.handleTradeClose(event.args.percentProfit);
          }
        }

        // Query LimitExecuted events
        const limitFilter = gTradeRead.filters.LimitExecuted(null, GOLD_COPY_TRADER_ADDRESS);
        const limitEvents = await gTradeRead.queryFilter(limitFilter, fromBlock, currentBlock);

        for (const event of limitEvents) {
          log(`[POLL] LimitExecuted found in block ${event.blockNumber}`);
          await this.handleTradeClose(event.args.percentProfit);
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

process.on("unhandledRejection", (err) => {
  logError("Unhandled rejection", err);
});

bot.start().catch((err) => {
  logError("Bot failed to start", err);
  process.exit(1);
});
