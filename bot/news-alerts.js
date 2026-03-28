/**
 * Forex High-Impact News Alerts
 * Fetches USD news events and warns the community 1 hour before and at event time.
 */

const {
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
} = process.env;

const CHECK_INTERVAL = 30 * 60 * 1000; // Check every 30 minutes
const ALERT_BEFORE = 60; // Alert 60 minutes before
const ALERT_AFTER = 60;  // No-trade zone 60 minutes after

let alertedEvents = new Set(); // Track which events we already alerted
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

  for (const event of events) {
    const minutesUntil = getMinutesUntil(event.date);
    const eventKey = `${event.date}-${event.title}`;

    // 1 hour before alert (wide window: 45-90 min before)
    const preAlertKey = `pre-${eventKey}`;
    if (minutesUntil > 45 && minutesUntil <= 90 && !alertedEvents.has(preAlertKey)) {
      alertedEvents.add(preAlertKey);

      const msg = [
        ``,
        `\u26A0\uFE0F  <b>HIGH IMPACT NEWS IN 1 HOUR</b>`,
        ``,
        ``,
        `\u{1F4C5} <b>${event.title}</b>`,
        `\u{1F553} ${formatEventTime(event.date)}`,
        `\u{1F4B5} Currency: USD`,
        `\u{1F534} Impact: <b>HIGH</b>`,
        event.forecast ? `\u{1F4CA} Forecast: ${event.forecast}` : "",
        event.previous ? `\u{1F4C8} Previous: ${event.previous}` : "",
        ``,
        `\u{1F6D1} <b>No-trade zone: 1 hour before and after this event.</b>`,
        `We will not open any signals during this time.`,
      ].filter(Boolean).join("\n");

      console.log(`[NEWS] Alert: ${event.title} in ~1 hour`);
      await sendTelegram(msg);
    }

    // Event happening now alert (wide window: -15 to +15 min)
    const nowAlertKey = `now-${eventKey}`;
    if (minutesUntil > -15 && minutesUntil <= 15 && !alertedEvents.has(nowAlertKey)) {
      alertedEvents.add(nowAlertKey);

      const msg = [
        ``,
        `\u{1F534}  <b>HIGH IMPACT NEWS NOW</b>`,
        ``,
        ``,
        `\u{1F4C5} <b>${event.title}</b>`,
        `\u{1F4B5} USD | <b>HIGH IMPACT</b>`,
        event.forecast ? `\u{1F4CA} Forecast: ${event.forecast}` : "",
        event.previous ? `\u{1F4C8} Previous: ${event.previous}` : "",
        ``,
        `\u{1F6D1} <b>Do NOT trade for the next 60 minutes.</b>`,
        `Expect high volatility on XAU/USD.`,
      ].filter(Boolean).join("\n");

      console.log(`[NEWS] Alert: ${event.title} happening NOW`);
      await sendTelegram(msg);
    }

    // All-clear alert (1 hour after event, wide window: 45-90 min after)
    const clearKey = `clear-${eventKey}`;
    if (minutesUntil < -45 && minutesUntil > -90 && !alertedEvents.has(clearKey)) {
      alertedEvents.add(clearKey);

      const msg = [
        ``,
        `\u2705  <b>ALL CLEAR — SAFE TO TRADE</b>`,
        ``,
        ``,
        `The no-trade zone for <b>${event.title}</b> has ended.`,
        `Trading signals can resume.`,
      ].join("\n");

      console.log(`[NEWS] All-clear after: ${event.title}`);
      await sendTelegram(msg);
    }
  }

  // Clean old events from alertedEvents (older than 2 hours)
  // This prevents memory leak over time
  if (alertedEvents.size > 100) {
    alertedEvents.clear();
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

  // Initial check
  await checkNews();

  // Poll loop
  const loop = async () => {
    if (!polling) return;
    await checkNews();
    await checkWeekendClose();
    await checkSundayOpen();
    setTimeout(loop, CHECK_INTERVAL);
  };
  setTimeout(loop, CHECK_INTERVAL);
}

export function stopNewsAlerts() {
  polling = false;
}
