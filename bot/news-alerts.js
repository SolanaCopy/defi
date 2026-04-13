/**
 * Forex High-Impact News Alerts
 * Fetches USD news events and warns the community 1 hour before and at event time.
 */

import { pollVotes } from "./telegram-ai.js";

const {
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
} = process.env;

const CHECK_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes
const ALERT_BEFORE = 15; // Alert 15 minutes before
const ALERT_AFTER = 60;  // No-trade zone 60 minutes after

let alertedEvents = new Map(); // Track eventKey -> timestamp of when we alerted
let polling = false;

async function sendTelegram(text, buttons = []) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    const body = {
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    };
    if (buttons.length > 0) {
      body.reply_markup = JSON.stringify({ inline_keyboard: [buttons] });
    }
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error("[NEWS] Telegram error:", err.message);
  }
}

async function fetchForexCalendar() {
  try {
    const res = await fetch("https://nfs.faireconomy.media/ff_calendar_thisweek.json", {
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();

    // Filter: USD only, High impact only
    return data.filter(e =>
      e.country === "USD" &&
      e.impact === "High"
    );
  } catch (err) {
    console.error("[NEWS] Fetch error:", err.message);
    return [];
  }
}

function formatEventTime(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    hour12: false,
  }) + " UTC";
}

function getMinutesUntil(dateStr) {
  const eventTime = new Date(dateStr).getTime();
  const now = Date.now();
  return (eventTime - now) / (1000 * 60);
}

async function checkNews() {
  const events = await fetchForexCalendar();
  if (events.length === 0) return;

  // ===== DAILY OVERVIEW (once per day, at 06:00-06:10 UTC) =====
  const now = new Date();
  const dailyKey = `daily-${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}`;
  if (now.getUTCHours() === 8 && now.getUTCMinutes() < 10 && !alertedEvents.has(dailyKey)) {
    // Get today's events
    const todayStr = now.toISOString().slice(0, 10);
    const todayEvents = events.filter(e => e.date && e.date.startsWith(todayStr));

    if (todayEvents.length > 0) {
      alertedEvents.set(dailyKey, Date.now());
      const lines = [
        ``,
        `\u{1F4C5}  <b>TODAY'S HIGH IMPACT NEWS</b>`,
        ``,
      ];
      todayEvents.forEach(e => {
        lines.push(`\u{1F534} <b>${e.title}</b> — ${formatEventTime(e.date)}`);
        if (e.forecast) lines.push(`   Forecast: ${e.forecast}${e.previous ? ` | Previous: ${e.previous}` : ''}`);
      });
      lines.push(``, `We avoid trading 15 min before and 60 min after each event.`);

      console.log(`[NEWS] Daily overview: ${todayEvents.length} events`);
      await sendTelegram(lines.join("\n"));
    }
  }

  // ===== 15 MIN WARNING (bundled) =====
  const warningEvents = [];
  const clearEvents = [];

  for (const event of events) {
    const minutesUntil = getMinutesUntil(event.date);
    const eventKey = `${event.date}-${event.title}`;

    // 15 min before alert (window: 13-18 min before)
    const preAlertKey = `pre-${eventKey}`;
    if (minutesUntil > 13 && minutesUntil <= 18 && !alertedEvents.has(preAlertKey)) {
      alertedEvents.set(preAlertKey, Date.now());
      warningEvents.push(event);
      console.log(`[NEWS] Alert: ${event.title} in ~15 min`);
    }

    // All-clear alert (1 hour after event, wide window: 55-75 min after)
    const clearKey = `clear-${eventKey}`;
    if (minutesUntil < -55 && minutesUntil > -75 && !alertedEvents.has(clearKey)) {
      alertedEvents.set(clearKey, Date.now());
      clearEvents.push(event.title);
      console.log(`[NEWS] All-clear after: ${event.title}`);
    }
  }

  // Send ONE bundled 15-min warning
  if (warningEvents.length > 0) {
    const lines = [
      ``,
      `\u26A0\uFE0F  <b>HIGH IMPACT NEWS IN 15 MINUTES</b>`,
      ``,
    ];
    warningEvents.forEach(e => {
      lines.push(`\u{1F534} <b>${e.title}</b> — ${formatEventTime(e.date)}`);
      if (e.forecast) lines.push(`   Forecast: ${e.forecast}${e.previous ? ` | Previous: ${e.previous}` : ''}`);
    });
    lines.push(``, `\u{1F6D1} <b>No new signals until 60 min after.</b>`);
    await sendTelegram(lines.join("\n"));
  }

  // Send ONE bundled all-clear message
  if (clearEvents.length > 0) {
    const eventList = clearEvents.map(t => `• ${t}`).join("\n");
    const msg = [
      ``,
      `\u2705  <b>ALL CLEAR — SAFE TO TRADE</b>`,
      ``,
      ``,
      `The no-trade zone has ended for:`,
      eventList,
      ``,
      `Trading signals can resume.`,
    ].join("\n");
    await sendTelegram(msg);
  }

  // Clean old alerts (older than 3 hours)
  const cutoff = Date.now() - 3 * 60 * 60 * 1000;
  for (const [key, ts] of alertedEvents) {
    if (ts < cutoff) alertedEvents.delete(key);
  }
}

export function isInNewsBlackout(events) {
  // Check if we're currently in a no-trade zone
  if (!events) return false;
  for (const event of events) {
    const minutesUntil = getMinutesUntil(event.date);
    if (minutesUntil > -ALERT_AFTER && minutesUntil < ALERT_BEFORE) {
      return true;
    }
  }
  return false;
}

// ===== WEEKLY MARKET CLOSE =====
let lastWeekendAlert = "";

async function checkWeekendClose() {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun, 5=Fri
  const hour = now.getUTCHours();
  const minute = now.getUTCMinutes();
  const weekKey = `${now.getUTCFullYear()}-W${Math.ceil(now.getUTCDate() / 7)}`;

  // Friday 21:00-21:30 UTC (= 22:00-22:30 CET)
  if (day === 5 && hour === 21 && minute < 35 && lastWeekendAlert !== weekKey) {
    lastWeekendAlert = weekKey;

    const msg = [
      "",
      "\u{1F319}  <b>MARKET CLOSING SOON</b>",
      "",
      "",
      "The gold market closes in less than 1 hour.",
      "No new signals will be opened until Sunday evening.",
      "",
      "\u{1F3C6} <b>Great week of trading!</b>",
      "Enjoy your weekend and recharge for next week.",
      "",
      "\u{1F4C5} Market reopens: <b>Sunday 23:00 CET</b>",
      "\u{1F514} You\u2019ll be notified when trading resumes.",
      "",
      "See you Monday! \u{1F44B}",
    ].join("\n");

    console.log("[NEWS] Weekend market close alert sent");
    await sendTelegram(msg);
  }
}

// ===== SUNDAY MARKET OPEN =====
let lastSundayAlert = "";

async function checkSundayOpen() {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun
  const hour = now.getUTCHours();
  const minute = now.getUTCMinutes();
  const weekKey = `open-${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}`;

  // Sunday 20:00-20:30 UTC (= 21:00-21:30 CET)
  if (day === 0 && hour === 20 && minute < 35 && lastSundayAlert !== weekKey) {
    lastSundayAlert = weekKey;

    const msg = [
      "",
      "\u{1F680}  <b>MARKET OPENS SOON</b>",
      "",
      "",
      "The gold market reopens in about 2 hours!",
      "Get ready for a new week of trading.",
      "",
      "\u{1F4B0} Make sure you have <b>USDC</b> ready in your wallet",
      "\u26FD Have some <b>ETH</b> for gas on Arbitrum",
      "\u{1F514} Turn on notifications so you don\u2019t miss signals",
      "",
      "\u{1F4C8} <b>New week, new opportunities!</b>",
      "First signal can drop at any moment after market open.",
      "",
      "Let\u2019s get it! \u{1F4AA}",
    ].join("\n");

    console.log("[NEWS] Sunday market open alert sent");
    await sendTelegram(msg, [
      { text: "\u{1F680} Open App", url: "https://www.smarttradingclub.io?tab=dashboard" },
      { text: "\u{1F4AC} Community", url: "https://t.me/SmartTradingClubDapp" },
    ]);
  }
}

export async function startNewsAlerts() {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log("[NEWS] No Telegram config — news alerts disabled");
    return;
  }

  polling = true;
  console.log("[NEWS] Forex news alerts started — checking every 30 minutes");

  // On startup: only mark "now" and "clear" events as already alerted
  // Do NOT mark pre-alerts — better to send a duplicate than miss an alert
  const bootEvents = await fetchForexCalendar();
  for (const event of bootEvents) {
    const minutesUntil = getMinutesUntil(event.date);
    const eventKey = `${event.date}-${event.title}`;
    if (minutesUntil > -15 && minutesUntil <= 15) alertedEvents.set(`now-${eventKey}`, Date.now());
    if (minutesUntil < -45 && minutesUntil > -90) alertedEvents.set(`clear-${eventKey}`, Date.now());
  }
  console.log(`[NEWS] Pre-populated ${alertedEvents.size} events to prevent duplicate alerts`);

  // Initial check
  await checkNews();

  // Poll loop
  const loop = async () => {
    if (!polling) return;
    await checkNews();
    await checkWeekendClose();
    await checkSundayOpen();
    await checkDailyPoll();
    setTimeout(loop, CHECK_INTERVAL);
  };
  setTimeout(loop, CHECK_INTERVAL);
}

// ===== DAILY GOLD POLL (12:00 UTC) + RESULT (21:00 UTC) =====
let lastPollDate = "";
let lastResultDate = "";
let pollOpenPrice = null;

const PYTH_GOLD_URL = "https://hermes.pyth.network/v2/updates/price/latest?ids[]=0x765d2ba906dbc32ca17cc11f5310a89e9ee1f6420508c63861f2f8ba4ee34bb2";

async function fetchGoldPrice() {
  try {
    const res = await fetch(PYTH_GOLD_URL, { signal: AbortSignal.timeout(10000) });
    const data = await res.json();
    const p = data.parsed?.[0]?.price;
    if (p) return Number(p.price) * Math.pow(10, Number(p.expo));
    return null;
  } catch { return null; }
}

async function checkDailyPoll() {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return; // Skip weekends

  const hour = now.getUTCHours();
  const minute = now.getUTCMinutes();
  const dateKey = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}`;

  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

  // 12:00-12:10 UTC — Send poll + save price
  if (hour === 12 && minute < 10 && lastPollDate !== dateKey) {
    lastPollDate = dateKey;
    pollOpenPrice = await fetchGoldPrice();

    try {
      const body = {
        chat_id: TELEGRAM_CHAT_ID,
        question: "Where do you think gold is heading today? 🪙",
        options: JSON.stringify(["📈 Bullish — Going up", "📉 Bearish — Going down", "➡️ Sideways — No big move"]),
        is_anonymous: false,
      };
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPoll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      console.log(`[NEWS] Daily gold poll sent — price at poll: $${pollOpenPrice?.toFixed(2)}`);
    } catch (err) {
      console.error("[NEWS] Poll error:", err.message);
    }
  }

  // 21:00-21:10 UTC — Send result
  if (hour === 21 && minute < 10 && lastResultDate !== dateKey && pollOpenPrice) {
    lastResultDate = dateKey;

    const closePrice = await fetchGoldPrice();
    if (!closePrice) return;

    const change = closePrice - pollOpenPrice;
    const changePct = (change / pollOpenPrice) * 100;
    const winnerOption = change > 5 ? 0 : change < -5 ? 1 : 2; // 0=Bullish, 1=Bearish, 2=Sideways
    const direction = ["📈 BULLISH", "📉 BEARISH", "➡️ SIDEWAYS"][winnerOption];
    const winnerLabel = ["Bullish", "Bearish", "Sideways"][winnerOption];

    // Get winners from pollVotes
    const winners = pollVotes.get(winnerOption) || [];
    const totalVoters = [...pollVotes.values()].reduce((sum, v) => sum + v.length, 0);

    const lines = [
      ``,
      `🏆  <b>DAILY POLL RESULT</b>`,
      ``,
      `Gold moved from <b>$${pollOpenPrice.toFixed(2)}</b> to <b>$${closePrice.toFixed(2)}</b>`,
      `${direction} — <b>${change >= 0 ? "+" : ""}${change.toFixed(2)}</b> (${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%)`,
      ``,
      `✅ Correct answer: <b>${winnerLabel}</b>`,
    ];

    if (winners.length > 0) {
      lines.push(``, `🎯 <b>${winners.length}/${totalVoters} got it right:</b>`);
      winners.forEach(w => lines.push(`  • ${w.firstName}`));
      lines.push(``, `Well played! 👏`);
    } else if (totalVoters > 0) {
      lines.push(``, `Nobody got it right this time! 😅`);
    } else {
      lines.push(``, `No votes today — vote tomorrow! 🗳`);
    }

    await sendTelegram(lines.join("\n"));
    console.log(`[NEWS] Poll result: $${pollOpenPrice.toFixed(2)} → $${closePrice.toFixed(2)} (${direction}) — ${winners.length}/${totalVoters} correct`);

    // Clear votes for next day
    pollVotes.clear();
    pollOpenPrice = null;
  }
}

export function stopNewsAlerts() {
  polling = false;
}
