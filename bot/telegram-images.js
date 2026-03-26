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

function brandHeader() {
  return `
    <g transform="translate(32, 18)">
      <polygon points="15,1 27,7 27,24 15,30 3,24 3,7" fill="none" stroke="${GOLD}" stroke-width="1.5"/>
      <rect x="7" y="16" width="4" height="10" rx="1" fill="${GOLD_LIGHT}" opacity="0.7"/>
      <rect x="12.5" y="11" width="4" height="15" rx="1" fill="${GOLD}"/>
      <rect x="18" y="6" width="4" height="20" rx="1" fill="${GOLD_LIGHT}" opacity="0.9"/>
    </g>
    <text x="66" y="35" font-family="${FONT}" font-size="13" fill="${GRAY}" font-weight="600" letter-spacing="3">SMART TRADING CLUB</text>
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

// ===== 1. SIGNAL IMAGE =====
export async function signalImage({ signalId, direction, leverage, entry, tp, sl }) {
  const isLong = direction === "LONG";
  const dirColor = isLong ? GREEN : RED;
  const dirGradH = isLong ? "green" : "red";
  const h = 450;

  const svg = `
  <svg width="${W}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    ${defs()}
    <rect width="${W}" height="${h}" fill="url(#bg)" rx="0"/>
    ${topBar(dirGradH)}
    ${brandHeader()}

    <!-- Title section -->
    <text x="400" y="85" font-family="${FONT}" font-size="14" fill="${GRAY}" text-anchor="middle" letter-spacing="3">SIGNAL #${esc(signalId)}</text>
    <text x="400" y="118" font-family="${FONT}" font-size="30" fill="${WHITE}" font-weight="700" text-anchor="middle" letter-spacing="1">NEW TRADE SIGNAL</text>

    <!-- Direction pill -->
    <rect x="250" y="140" width="300" height="46" rx="23" fill="${dirColor}" opacity="0.1" stroke="${dirColor}" stroke-width="1" stroke-opacity="0.3"/>
    <circle cx="290" cy="163" r="7" fill="${dirColor}"/>
    <text x="410" y="170" font-family="${FONT}" font-size="20" fill="${dirColor}" font-weight="700" text-anchor="middle">${esc(direction)}   ·   XAU/USD   ·   ${esc(leverage)}</text>

    ${line(205)}

    <!-- Price cards -->
    ${card(45, 222, 220, 90)}
    <text x="155" y="253" font-family="${FONT}" font-size="12" fill="${LIGHT_GRAY}" text-anchor="middle" letter-spacing="2">ENTRY PRICE</text>
    <text x="155" y="290" font-family="${FONT}" font-size="28" fill="${WHITE}" font-weight="700" text-anchor="middle">$${esc(entry)}</text>

    ${card(290, 222, 220, 90, "#1a3a1a")}
    <text x="400" y="253" font-family="${FONT}" font-size="12" fill="${GREEN}" text-anchor="middle" letter-spacing="2">TAKE PROFIT</text>
    <text x="400" y="290" font-family="${FONT}" font-size="28" fill="${GREEN}" font-weight="700" text-anchor="middle">$${esc(tp)}</text>

    ${card(535, 222, 220, 90, "#3a1a1a")}
    <text x="645" y="253" font-family="${FONT}" font-size="12" fill="${RED}" text-anchor="middle" letter-spacing="2">STOP LOSS</text>
    <text x="645" y="290" font-family="${FONT}" font-size="28" fill="${RED}" font-weight="700" text-anchor="middle">$${esc(sl)}</text>

    <!-- CTA -->
    ${ctaButton(345, "COPY THIS TRADE NOW")}

    ${footerText(435)}
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
  const gradH = win ? "green" : "red";
  const gradV = win ? "greenV" : "redV";
  const sign = win ? "+" : "";
  const h = 450;
  const barCount = Math.min(Math.ceil(Math.abs(pct) / 2.5), 14);

  const bars = Array.from({ length: 14 }, (_, i) => {
    const filled = i < barCount;
    const bh = 14 + i * 5;
    const y = 310 - bh;
    const x = 130 + i * 40;
    return `<rect x="${x}" y="${y}" width="26" height="${bh}" rx="5" fill="${filled ? `url(#${gradV})` : '#1A1A28'}" opacity="${filled ? (0.5 + i * 0.035) : 0.25}"/>`;
  }).join("");

  const svg = `
  <svg width="${W}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    ${defs()}
    <rect width="${W}" height="${h}" fill="url(#bg)" rx="0"/>
    ${topBar(gradH)}
    ${brandHeader()}

    <!-- Title -->
    <text x="400" y="80" font-family="${FONT}" font-size="14" fill="${GRAY}" text-anchor="middle" letter-spacing="3">SIGNAL #${esc(signalId)}${direction ? `  ·  ${esc(direction)}` : ""}${leverage ? `  ·  ${esc(leverage)}` : ""}</text>
    <text x="400" y="112" font-family="${FONT}" font-size="26" fill="${WHITE}" font-weight="700" text-anchor="middle" letter-spacing="1">${win ? "SIGNAL CLOSED — PROFIT" : "SIGNAL CLOSED — LOSS"}</text>

    <!-- Big percentage -->
    <text x="400" y="178" font-family="${FONT}" font-size="60" fill="${color}" font-weight="700" text-anchor="middle" filter="url(#glow)">${sign}${pct.toFixed(2)}%</text>

    <!-- Bar chart -->
    ${bars}

    <!-- Bottom section -->
    ${win
      ? ctaButton(345, "CLAIM YOUR PROFITS")
      : `<text x="400" y="375" font-family="${FONT}" font-size="17" fill="${GRAY}" text-anchor="middle">Next trade will be better</text>`
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
