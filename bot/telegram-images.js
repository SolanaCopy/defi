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
    <image x="28" y="8" width="32" height="32" href="data:image/png;base64,${LOGO_B64}"/>
    <text x="72" y="29" font-family="${FONT}" font-size="13" fill="${GRAY}" font-weight="600" letter-spacing="3" dominant-baseline="middle">SMART TRADING CLUB</text>
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
  const h = 340;

  const svg = `
  <svg width="${W}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    ${defs()}
    <rect width="${W}" height="${h}" fill="url(#bg)" rx="0"/>
    ${topBar()}
    ${brandHeader()}

    <!-- Center logo -->
    <image x="350" y="65" width="100" height="100" href="data:image/png;base64,${LOGO_B64}"/>

    <!-- Title -->
    <text x="400" y="200" font-family="${FONT}" font-size="28" fill="${WHITE}" font-weight="700" text-anchor="middle" letter-spacing="2">SMART TRADING BOT</text>

    <!-- Online status pill (centered) -->
    <rect x="248" y="225" width="304" height="36" rx="18" fill="${GREEN}" opacity="0.06" stroke="${GREEN}" stroke-width="1" stroke-opacity="0.2"/>
    <circle cx="280" cy="243" r="5" fill="${GREEN}"/>
    <text x="410" y="249" font-family="${FONT}" font-size="14" fill="${GREEN}" font-weight="600" text-anchor="middle" letter-spacing="1">Online  ·  Monitoring Trades</text>

    ${footerText(h - 10)}
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}
