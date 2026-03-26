import sharp from "sharp";

// ===== BRAND COLORS =====
const GOLD = "#D4A843";
const GOLD_LIGHT = "#F5E6A3";
const GOLD_DARK = "#8B6914";
const BG_CARD = "#141420";
const GREEN = "#00E676";
const GREEN_DIM = "#00C853";
const RED = "#FF5252";
const RED_DIM = "#D32F2F";
const WHITE = "#FFFFFF";
const GRAY = "#7A7A8E";
const LIGHT_GRAY = "#A0A0B4";

const W = 800;
const FONT = "'DejaVu Sans', Arial, Helvetica, sans-serif";

// ===== SVG HELPERS =====
function esc(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function defs(extras = "") {
  return `<defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#111119"/>
      <stop offset="100%" stop-color="#08080C"/>
    </linearGradient>
    <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${GOLD_LIGHT}"/>
      <stop offset="50%" stop-color="${GOLD}"/>
      <stop offset="100%" stop-color="${GOLD_DARK}"/>
    </linearGradient>
    <linearGradient id="goldV" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${GOLD_LIGHT}"/>
      <stop offset="100%" stop-color="${GOLD_DARK}"/>
    </linearGradient>
    <linearGradient id="green" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${GREEN_DIM}"/>
      <stop offset="100%" stop-color="#69F0AE"/>
    </linearGradient>
    <linearGradient id="red" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${RED_DIM}"/>
      <stop offset="100%" stop-color="${RED}"/>
    </linearGradient>
    <linearGradient id="greenV" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${GREEN}"/>
      <stop offset="100%" stop-color="${GREEN_DIM}" stop-opacity="0.4"/>
    </linearGradient>
    <linearGradient id="redV" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${RED}"/>
      <stop offset="100%" stop-color="${RED_DIM}" stop-opacity="0.4"/>
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="6" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    ${extras}
  </defs>`;
}

function topBar(gradId = "gold") {
  return `<rect x="0" y="0" width="${W}" height="5" fill="url(#${gradId})"/>`;
}

const LOGO_B64 = "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";

function brandHeader() {
  return `
    <image x="28" y="12" width="36" height="36" href="data:image/png;base64,${LOGO_B64}"/>
    <text x="76" y="36" font-family="${FONT}" font-size="13" fill="${GRAY}" font-weight="600" letter-spacing="3" dominant-baseline="middle">SMART TRADING CLUB</text>
  `;
}

function card(x, y, w, h, stroke = "#1C1C2C") {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${BG_CARD}" stroke="${stroke}" stroke-width="1"/>`;
}

function line(y) {
  return `<line x1="50" y1="${y}" x2="750" y2="${y}" stroke="#1C1C2C" stroke-width="1"/>`;
}

function footerText(y) {
  return `<text x="400" y="${y}" font-family="${FONT}" font-size="12" fill="${GRAY}" text-anchor="middle" letter-spacing="1">smarttradingclub.io</text>`;
}

function ctaButton(y, text, gradId = "gold", textColor = "#0A0A0F") {
  return `
    <rect x="240" y="${y}" width="320" height="52" rx="26" fill="url(#${gradId})"/>
    <text x="400" y="${y + 33}" font-family="${FONT}" font-size="17" fill="${textColor}" font-weight="700" text-anchor="middle" letter-spacing="1">${esc(text)}</text>
  `;
}

// ===== CHART DATA =====
async function fetchGoldCandles() {
  try {
    const url = "https://api.binance.com/api/v3/klines?symbol=PAXGUSDT&interval=5m&limit=40";
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    return data.map(c => ({
      open: parseFloat(c[1]),
      high: parseFloat(c[2]),
      low: parseFloat(c[3]),
      close: parseFloat(c[4]),
    }));
  } catch (err) {
    console.error("[IMG] Failed to fetch gold candles:", err.message);
    return null;
  }
}

// ===== CHART HELPERS =====
function generateCandleChart(entryNum, tpNum, slNum, isLong, chartX, chartY, chartW, chartH, realCandles) {
  let candles;

  if (realCandles && realCandles.length > 0) {
    candles = realCandles;
  } else {
    // Fallback: generate candles if API fails
    const range = Math.abs(tpNum - slNum);
    candles = [];
    let price = entryNum - range * 0.3;
    for (let i = 0; i < 30; i++) {
      const v = range * 0.04;
      const change = Math.sin(i * 0.8) * v + (i < 20 ? 0.3 : isLong ? 0.6 : -0.6) * v;
      price += change;
      const open = price;
      const close = price + Math.sin(i * 1.3) * v * 0.8;
      const high = Math.max(open, close) + Math.abs(Math.sin(i * 2.1)) * v * 0.5;
      const low = Math.min(open, close) - Math.abs(Math.cos(i * 1.7)) * v * 0.5;
      candles.push({ open, close, high, low });
    }
  }

  // Scale to chart area
  const range = Math.abs(tpNum - slNum);
  const allPrices = [tpNum, slNum, ...candles.flatMap(c => [c.high, c.low])];
  const minP = Math.min(...allPrices) - range * 0.05;
  const maxP = Math.max(...allPrices) + range * 0.05;
  const scaleY = (p) => chartY + chartH - ((p - minP) / (maxP - minP)) * chartH;
  const candleW = (chartW / candles.length) * 0.7;
  const gap = chartW / candles.length;

  let svg = "";

  // Grid lines
  for (let i = 0; i <= 4; i++) {
    const y = chartY + (chartH / 4) * i;
    svg += `<line x1="${chartX}" y1="${y}" x2="${chartX + chartW}" y2="${y}" stroke="#1A1A28" stroke-width="0.5"/>`;
  }

  // TP line
  const tpY = scaleY(tpNum);
  svg += `<line x1="${chartX}" y1="${tpY}" x2="${chartX + chartW}" y2="${tpY}" stroke="${GREEN}" stroke-width="1" stroke-dasharray="6,4" opacity="0.7"/>`;
  svg += `<text x="${chartX + chartW + 8}" y="${tpY + 4}" font-family="${FONT}" font-size="10" fill="${GREEN}">TP</text>`;

  // SL line
  const slY = scaleY(slNum);
  svg += `<line x1="${chartX}" y1="${slY}" x2="${chartX + chartW}" y2="${slY}" stroke="${RED}" stroke-width="1" stroke-dasharray="6,4" opacity="0.7"/>`;
  svg += `<text x="${chartX + chartW + 8}" y="${slY + 4}" font-family="${FONT}" font-size="10" fill="${RED}">SL</text>`;

  // Entry line
  const entryY = scaleY(entryNum);
  svg += `<line x1="${chartX}" y1="${entryY}" x2="${chartX + chartW}" y2="${entryY}" stroke="${GOLD}" stroke-width="1.5" stroke-dasharray="4,3" opacity="0.9"/>`;
  svg += `<text x="${chartX + chartW + 8}" y="${entryY + 4}" font-family="${FONT}" font-size="10" fill="${GOLD}">ENTRY</text>`;

  // Candles
  candles.forEach((c, i) => {
    const x = chartX + i * gap + gap * 0.15;
    const bullish = c.close >= c.open;
    const color = bullish ? GREEN : RED;
    const bodyTop = scaleY(Math.max(c.open, c.close));
    const bodyBot = scaleY(Math.min(c.open, c.close));
    const bodyH = Math.max(bodyBot - bodyTop, 1);

    // Wick
    svg += `<line x1="${x + candleW / 2}" y1="${scaleY(c.high)}" x2="${x + candleW / 2}" y2="${scaleY(c.low)}" stroke="${color}" stroke-width="1" opacity="0.6"/>`;
    // Body
    svg += `<rect x="${x}" y="${bodyTop}" width="${candleW}" height="${bodyH}" rx="1" fill="${color}" opacity="${bullish ? 0.8 : 0.6}"/>`;
  });

  // TP/SL zone shading
  svg += `<rect x="${chartX}" y="${tpY}" width="${chartW}" height="${entryY - tpY}" fill="${GREEN}" opacity="0.03"/>`;
  svg += `<rect x="${chartX}" y="${entryY}" width="${chartW}" height="${slY - entryY}" fill="${RED}" opacity="0.03"/>`;

  return svg;
}

// ===== 1. SIGNAL IMAGE =====
export async function signalImage({ signalId, direction, leverage, entry, tp, sl }) {
  const isLong = direction === "LONG";
  const dirColor = isLong ? GREEN : RED;
  const dirGradH = isLong ? "green" : "red";
  const h = 620;

  // Parse prices (remove commas)
  const entryNum = parseFloat(String(entry).replace(/,/g, ""));
  const tpNum = parseFloat(String(tp).replace(/,/g, ""));
  const slNum = parseFloat(String(sl).replace(/,/g, ""));

  // Fetch real 5min gold candles
  const realCandles = await fetchGoldCandles();
  const chartSvg = generateCandleChart(entryNum, tpNum, slNum, isLong, 50, 200, 680, 220, realCandles);

  const svg = `
  <svg width="${W}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    ${defs()}
    <rect width="${W}" height="${h}" fill="url(#bg)" rx="0"/>
    ${topBar(dirGradH)}
    ${brandHeader()}

    <!-- Title section -->
    <text x="400" y="80" font-family="${FONT}" font-size="13" fill="${GRAY}" text-anchor="middle" letter-spacing="3">SIGNAL #${esc(signalId)}</text>
    <text x="400" y="110" font-family="${FONT}" font-size="28" fill="${WHITE}" font-weight="700" text-anchor="middle" letter-spacing="1">NEW TRADE SIGNAL</text>

    <!-- Direction pill -->
    <rect x="250" y="128" width="300" height="42" rx="21" fill="${dirColor}" opacity="0.1" stroke="${dirColor}" stroke-width="1" stroke-opacity="0.3"/>
    <circle cx="288" cy="149" r="6" fill="${dirColor}"/>
    <text x="408" y="156" font-family="${FONT}" font-size="18" fill="${dirColor}" font-weight="700" text-anchor="middle">${esc(direction)}   ·   XAU/USD   ·   ${esc(leverage)}</text>

    ${line(185)}

    <!-- Chart -->
    ${card(40, 192, 720, 240)}
    <text x="60" y="210" font-family="${FONT}" font-size="10" fill="${GRAY}" letter-spacing="1">XAU/USD · 5M</text>
    <text x="740" y="210" font-family="${FONT}" font-size="10" fill="${GRAY}" text-anchor="end">${realCandles ? "LIVE" : ""}${realCandles ? "" : ""}</text>
    ${realCandles ? `<circle cx="726" cy="206" r="3" fill="${GREEN}" opacity="0.8"/>` : ""}
    ${chartSvg}

    <!-- Price cards -->
    ${card(45, 448, 220, 75)}
    <text x="155" y="474" font-family="${FONT}" font-size="11" fill="${LIGHT_GRAY}" text-anchor="middle" letter-spacing="2">ENTRY PRICE</text>
    <text x="155" y="505" font-family="${FONT}" font-size="26" fill="${WHITE}" font-weight="700" text-anchor="middle">$${esc(entry)}</text>

    ${card(290, 448, 220, 75, "#1a3a1a")}
    <text x="400" y="474" font-family="${FONT}" font-size="11" fill="${GREEN}" text-anchor="middle" letter-spacing="2">TAKE PROFIT</text>
    <text x="400" y="505" font-family="${FONT}" font-size="26" fill="${GREEN}" font-weight="700" text-anchor="middle">$${esc(tp)}</text>

    ${card(535, 448, 220, 75, "#3a1a1a")}
    <text x="645" y="474" font-family="${FONT}" font-size="11" fill="${RED}" text-anchor="middle" letter-spacing="2">STOP LOSS</text>
    <text x="645" y="505" font-family="${FONT}" font-size="26" fill="${RED}" font-weight="700" text-anchor="middle">$${esc(sl)}</text>

    <!-- CTA -->
    ${ctaButton(545, "COPY THIS TRADE NOW")}

    ${footerText(h - 8)}
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

// ===== 2. DEPOSIT IMAGE =====
export async function depositImage({ trader, amount, signalId }) {
  const h = 370;

  const svg = `
  <svg width="${W}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    ${defs()}
    <rect width="${W}" height="${h}" fill="url(#bg)" rx="0"/>
    ${topBar()}
    ${brandHeader()}

    <!-- Title -->
    <text x="400" y="82" font-family="${FONT}" font-size="14" fill="${GRAY}" text-anchor="middle" letter-spacing="3">SIGNAL #${esc(signalId)}</text>
    <text x="400" y="115" font-family="${FONT}" font-size="28" fill="${WHITE}" font-weight="700" text-anchor="middle" letter-spacing="1">NEW DEPOSIT</text>

    ${line(135)}

    <!-- Dollar icon circle -->
    <circle cx="400" cy="180" r="28" fill="${GOLD}" opacity="0.1" stroke="${GOLD}" stroke-width="1.5" stroke-opacity="0.4"/>
    <text x="400" y="192" font-family="${FONT}" font-size="28" fill="${GOLD}" font-weight="700" text-anchor="middle">$</text>

    <!-- Big amount -->
    <text x="400" y="248" font-family="${FONT}" font-size="46" fill="url(#gold)" font-weight="700" text-anchor="middle">$${esc(amount)}</text>
    <text x="400" y="275" font-family="${FONT}" font-size="16" fill="${LIGHT_GRAY}" text-anchor="middle">USDC</text>

    <!-- Info bar -->
    ${card(50, 300, 700, 44)}
    <text x="80" y="328" font-family="${FONT}" font-size="13" fill="${LIGHT_GRAY}">Trader: ${esc(trader)}</text>
    <text x="720" y="328" font-family="${FONT}" font-size="13" fill="${GOLD_LIGHT}" text-anchor="end">+1 new copier</text>

    ${footerText(h - 6)}
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

// ===== 3. SIGNAL CLOSED IMAGE =====
export async function signalClosedImage({ signalId, resultPct, direction, leverage }) {
  const pct = Number(resultPct);
  const win = pct >= 0;
  const color = win ? GREEN : RED;
  const dimColor = win ? GREEN_DIM : RED_DIM;
  const gradH = win ? "green" : "red";
  const sign = win ? "+" : "";
  const h = 480;

  // Circular progress ring
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(Math.abs(pct) / 50, 1); // 50% = full ring
  const dashOffset = circumference * (1 - progress);

  const svg = `
  <svg width="${W}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    ${defs()}
    <rect width="${W}" height="${h}" fill="url(#bg)" rx="0"/>
    ${topBar(gradH)}
    ${brandHeader()}

    <!-- Status badge -->
    <rect x="300" y="60" width="200" height="30" rx="15" fill="${color}" opacity="0.1" stroke="${color}" stroke-width="1" stroke-opacity="0.3"/>
    <text x="400" y="80" font-family="${FONT}" font-size="12" fill="${color}" font-weight="700" text-anchor="middle" letter-spacing="2">${win ? "PROFIT" : "LOSS"}</text>

    <!-- Signal info -->
    <text x="400" y="115" font-family="${FONT}" font-size="13" fill="${GRAY}" text-anchor="middle" letter-spacing="1">Signal #${esc(signalId)}${direction ? `  ·  ${esc(direction)}` : ""}${leverage ? `  ·  ${esc(leverage)}` : ""}</text>

    <!-- Result card -->
    <g transform="translate(400, 215)">
      <!-- Outer ring background -->
      <circle cx="0" cy="0" r="${radius}" fill="none" stroke="#1A1A28" stroke-width="6"/>
      <!-- Progress ring -->
      <circle cx="0" cy="0" r="${radius}" fill="none" stroke="${color}" stroke-width="6"
        stroke-dasharray="${circumference}" stroke-dashoffset="${dashOffset}"
        stroke-linecap="round" transform="rotate(-90)" opacity="0.8"/>
      <!-- Glow -->
      <circle cx="0" cy="0" r="${radius}" fill="none" stroke="${color}" stroke-width="2"
        stroke-dasharray="${circumference}" stroke-dashoffset="${dashOffset}"
        stroke-linecap="round" transform="rotate(-90)" opacity="0.15" filter="url(#glow)"/>
      <!-- Inner fill -->
      <circle cx="0" cy="0" r="${radius - 10}" fill="${color}" opacity="0.04"/>
    </g>

    <!-- Percentage (outside ring, centered) -->
    <text x="400" y="210" font-family="${FONT}" font-size="38" fill="${color}" font-weight="700" text-anchor="middle">${sign}${pct.toFixed(2)}%</text>
    <text x="400" y="235" font-family="${FONT}" font-size="13" fill="${GRAY}" text-anchor="middle">RESULT</text>

    <!-- Stats row -->
    ${card(50, 340, 220, 60)}
    <text x="160" y="365" font-family="${FONT}" font-size="10" fill="${GRAY}" text-anchor="middle" letter-spacing="2">STATUS</text>
    <text x="160" y="388" font-family="${FONT}" font-size="18" fill="${color}" font-weight="700" text-anchor="middle">${win ? "CLOSED IN PROFIT" : "CLOSED IN LOSS"}</text>

    ${card(290, 340, 220, 60)}
    <text x="400" y="365" font-family="${FONT}" font-size="10" fill="${GRAY}" text-anchor="middle" letter-spacing="2">SIGNAL</text>
    <text x="400" y="388" font-family="${FONT}" font-size="18" fill="${WHITE}" font-weight="700" text-anchor="middle">#${esc(signalId)}</text>

    ${card(530, 340, 220, 60)}
    <text x="640" y="365" font-family="${FONT}" font-size="10" fill="${GRAY}" text-anchor="middle" letter-spacing="2">TRADE</text>
    <text x="640" y="388" font-family="${FONT}" font-size="18" fill="${WHITE}" font-weight="700" text-anchor="middle">${esc(direction || "XAU/USD")} ${esc(leverage || "")}</text>

    <!-- CTA -->
    ${win
      ? ctaButton(418, "CLAIM YOUR PROFITS")
      : `<text x="400" y="445" font-family="${FONT}" font-size="16" fill="${GRAY}" text-anchor="middle">Next trade will be better</text>`
    }

    ${footerText(h - 8)}
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

// ===== 4. CLAIM IMAGE =====
export async function claimImage({ trader, payout, fee, signalId }) {
  const hasFee = Number(fee) > 0;
  const h = 400;

  const svg = `
  <svg width="${W}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    ${defs()}
    <rect width="${W}" height="${h}" fill="url(#bg)" rx="0"/>
    ${topBar("green")}
    ${brandHeader()}

    <!-- Title -->
    <text x="400" y="82" font-family="${FONT}" font-size="14" fill="${GRAY}" text-anchor="middle" letter-spacing="3">SIGNAL #${esc(signalId)}</text>
    <text x="400" y="115" font-family="${FONT}" font-size="28" fill="${WHITE}" font-weight="700" text-anchor="middle" letter-spacing="1">PROFIT CLAIMED</text>

    ${line(135)}

    <!-- Checkmark circle -->
    <circle cx="400" cy="185" r="30" fill="${GREEN}" opacity="0.1" stroke="${GREEN}" stroke-width="2" stroke-opacity="0.4"/>
    <polyline points="385,185 396,198 418,172" fill="none" stroke="${GREEN}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>

    <!-- Payout -->
    <text x="400" y="258" font-family="${FONT}" font-size="50" fill="${GREEN}" font-weight="700" text-anchor="middle">$${esc(payout)}</text>
    <text x="400" y="285" font-family="${FONT}" font-size="16" fill="${LIGHT_GRAY}" text-anchor="middle">USDC</text>

    <!-- Details card -->
    ${card(50, 310, 700, 50)}
    <text x="80" y="341" font-family="${FONT}" font-size="14" fill="${LIGHT_GRAY}">Trader: ${esc(trader)}</text>
    ${hasFee ? `<text x="720" y="341" font-family="${FONT}" font-size="14" fill="${GRAY}" text-anchor="end">Fee: $${esc(fee)} USDC</text>` : ""}

    ${footerText(h - 8)}
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

// ===== 5. AUTO-CLOSE IMAGE =====
export async function autoCloseImage({ signalId, direction, leverage, resultPct }) {
  const pct = Number(resultPct);
  const win = pct >= 0;
  const color = win ? GREEN : RED;
  const gradH = win ? "green" : "red";
  const sign = win ? "+" : "";
  const h = 400;

  const svg = `
  <svg width="${W}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    ${defs()}
    <rect width="${W}" height="${h}" fill="url(#bg)" rx="0"/>
    ${topBar(gradH)}
    ${brandHeader()}

    <!-- Title -->
    <text x="400" y="80" font-family="${FONT}" font-size="14" fill="${GRAY}" text-anchor="middle" letter-spacing="3">SIGNAL #${esc(signalId)}  ·  ${esc(direction)}  ·  ${esc(leverage)}</text>
    <text x="400" y="112" font-family="${FONT}" font-size="26" fill="${WHITE}" font-weight="700" text-anchor="middle" letter-spacing="1">AUTO-CLOSE TRIGGERED</text>

    ${line(130)}

    <!-- Lightning bolt -->
    <polygon points="390,155 380,190 395,188 388,225 415,180 398,182 408,155" fill="${color}" opacity="0.8"/>

    <!-- Result -->
    <text x="400" y="280" font-family="${FONT}" font-size="54" fill="${color}" font-weight="700" text-anchor="middle" filter="url(#glow)">${sign}${pct.toFixed(2)}%</text>

    <!-- Status pill -->
    <rect x="280" y="300" width="240" height="42" rx="21" fill="${color}" opacity="0.1" stroke="${color}" stroke-width="1" stroke-opacity="0.3"/>
    <text x="400" y="327" font-family="${FONT}" font-size="15" fill="${color}" font-weight="600" text-anchor="middle" letter-spacing="1">${win ? "TP HIT — PROFIT" : "SL HIT — LOSS"}</text>

    ${footerText(h - 10)}
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

// ===== 6. BOT ONLINE IMAGE =====
export async function botOnlineImage() {
  const h = 320;

  const svg = `
  <svg width="${W}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    ${defs()}
    <rect width="${W}" height="${h}" fill="url(#bg)" rx="0"/>
    ${topBar()}
    ${brandHeader()}

    <!-- Center logo -->
    <g transform="translate(340, 70)">
      <polygon points="60,4 112,28 112,98 60,122 8,98 8,28" fill="none" stroke="url(#gold)" stroke-width="2.5"/>
      <rect x="26" y="62" width="14" height="36" rx="3" fill="${GOLD_LIGHT}" opacity="0.6"/>
      <rect x="46" y="44" width="14" height="54" rx="3" fill="${GOLD}" opacity="0.8"/>
      <rect x="66" y="26" width="14" height="72" rx="3" fill="${GOLD_LIGHT}" opacity="0.9"/>
      <polyline points="22,68 44,48 62,58 90,24" fill="none" stroke="${GOLD_LIGHT}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      <polygon points="90,24 82,26 88,34" fill="${GOLD_LIGHT}"/>
    </g>

    <!-- Title -->
    <text x="400" y="228" font-family="${FONT}" font-size="28" fill="${WHITE}" font-weight="700" text-anchor="middle" letter-spacing="2">SMART TRADING BOT</text>

    <!-- Online status -->
    <circle cx="328" cy="264" r="6" fill="${GREEN}"/>
    <circle cx="328" cy="264" r="10" fill="${GREEN}" opacity="0.2"/>
    <text x="348" y="270" font-family="${FONT}" font-size="15" fill="${GREEN}" font-weight="600" letter-spacing="1">Online  ·  Monitoring Trades</text>

    ${footerText(h - 8)}
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}
