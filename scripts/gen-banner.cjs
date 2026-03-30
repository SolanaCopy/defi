const sharp = require('sharp');
const fs = require('fs');

const FONT = "'DejaVu Sans', Arial, Helvetica, sans-serif";
const GOLD = '#D4A843';
const GOLD_LIGHT = '#F5E6A3';
const GOLD_DARK = '#8B6914';
const WHITE = '#FFFFFF';
const GRAY = '#7A7A8E';
const GREEN = '#00E676';
const PURPLE = '#8B5CF6';

// Massive bullish candle data - dramatic uptrend
const candles = [];
for (let i = 0; i < 60; i++) {
  const x = i * 25;
  const base = 450 - (i * i * 0.08); // exponential rise
  const noise = Math.sin(i * 0.7) * 20 + Math.cos(i * 1.1) * 10;
  const bodyTop = Math.round(Math.max(50, base + noise));
  const bodyH = 12 + (i % 4) * 6 + (i > 40 ? 8 : 0); // bigger candles at the end
  const bull = i % 4 !== 2;
  const wickTop = bodyTop - 6 - (i % 3) * 4;
  const wickBot = bodyTop + bodyH + 4 + (i % 2) * 3;
  const fill = bull ? GOLD : GOLD_DARK;
  const opacity = 0.08 + (i / 60) * 0.35;
  candles.push(`
    <line x1="${x}" y1="${wickTop}" x2="${x}" y2="${wickBot}" stroke="${fill}" stroke-width="1.2" opacity="${opacity.toFixed(2)}"/>
    <rect x="${x - 6}" y="${bodyTop}" width="12" height="${bodyH}" rx="1.5" fill="${fill}" opacity="${(opacity + 0.05).toFixed(2)}"/>
  `);
}

// Smooth profit curve
const profitPts = Array.from({ length: 150 }, (_, i) => {
  const x = i * 10;
  const y = Math.round(460 - (i * i * 0.015) - Math.sin(i * 0.08) * 15);
  return `${x},${Math.max(30, y)}`;
}).join(' ');

// Sparkle positions
const sparkles = Array.from({ length: 12 }, (_, i) => {
  const x = 900 + Math.random() * 550;
  const y = 50 + Math.random() * 200;
  const size = 1 + Math.random() * 2;
  return `<circle cx="${Math.round(x)}" cy="${Math.round(y)}" r="${size.toFixed(1)}" fill="${GOLD}" opacity="${(0.2 + Math.random() * 0.4).toFixed(2)}"/>`;
}).join('');

const svg = `
<svg width="1500" height="500" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#04060A"/>
      <stop offset="100%" stop-color="#0A0D14"/>
    </linearGradient>
    <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${GOLD_LIGHT}"/>
      <stop offset="50%" stop-color="${GOLD}"/>
      <stop offset="100%" stop-color="${GOLD_DARK}"/>
    </linearGradient>
    <linearGradient id="greenUp" x1="0%" y1="100%" x2="0%" y2="0%">
      <stop offset="0%" stop-color="${GREEN}" stop-opacity="0"/>
      <stop offset="100%" stop-color="${GREEN}" stop-opacity="0.2"/>
    </linearGradient>
    <linearGradient id="goldDiag" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${GOLD}" stop-opacity="0"/>
      <stop offset="50%" stop-color="${GOLD}" stop-opacity="0.04"/>
      <stop offset="100%" stop-color="${GOLD}" stop-opacity="0.12"/>
    </linearGradient>
    <radialGradient id="spotGold" cx="80%" cy="30%" r="35%">
      <stop offset="0%" stop-color="${GOLD}" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="${GOLD}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="spotPurple" cx="15%" cy="70%" r="30%">
      <stop offset="0%" stop-color="${PURPLE}" stop-opacity="0.06"/>
      <stop offset="100%" stop-color="${PURPLE}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="spotGreen" cx="95%" cy="80%" r="25%">
      <stop offset="0%" stop-color="${GREEN}" stop-opacity="0.1"/>
      <stop offset="100%" stop-color="${GREEN}" stop-opacity="0"/>
    </radialGradient>
    <filter id="blur">
      <feGaussianBlur in="SourceGraphic" stdDeviation="2"/>
    </filter>
  </defs>

  <!-- Background layers -->
  <rect width="1500" height="500" fill="url(#bg)"/>
  <rect width="1500" height="500" fill="url(#goldDiag)"/>
  <rect width="1500" height="500" fill="url(#spotGold)"/>
  <rect width="1500" height="500" fill="url(#spotPurple)"/>
  <rect width="1500" height="500" fill="url(#spotGreen)"/>

  <!-- Diagonal gold accent beam -->
  <polygon points="800,0 1500,0 1500,300" fill="${GOLD}" opacity="0.02"/>
  <polygon points="900,500 1500,200 1500,500" fill="${GREEN}" opacity="0.015"/>

  <!-- Top accent line -->
  <rect x="0" y="0" width="1500" height="3" fill="url(#gold)"/>

  <!-- Candlesticks -->
  ${candles.join('')}

  <!-- Green area under profit line -->
  <polygon points="${profitPts},1500,500 0,500" fill="url(#greenUp)" opacity="0.4"/>

  <!-- Profit line glow -->
  <polyline points="${profitPts}" fill="none" stroke="${GREEN}" stroke-width="4" opacity="0.15" filter="url(#blur)"/>
  <!-- Profit line -->
  <polyline points="${profitPts}" fill="none" stroke="${GREEN}" stroke-width="2" opacity="0.7"/>

  <!-- Sparkles -->
  ${sparkles}

  <!-- ====== LEFT CONTENT ====== -->

  <!-- Main title -->
  <text x="80" y="130" font-family="${FONT}" font-size="18" fill="${GOLD}" font-weight="600" letter-spacing="5">COPY TRADING PLATFORM</text>

  <text x="80" y="195" font-family="${FONT}" font-size="68" fill="${WHITE}" font-weight="700" letter-spacing="-1">Smart Trading</text>
  <text x="80" y="270" font-family="${FONT}" font-size="68" fill="url(#gold)" font-weight="700" letter-spacing="-1">Club.</text>

  <!-- Tagline with green accent -->
  <text x="80" y="320" font-family="${FONT}" font-size="20" fill="${WHITE}" opacity="0.9">Copy gold trades.</text>
  <text x="290" y="320" font-family="${FONT}" font-size="20" fill="${GREEN}" font-weight="700"> One click. Auto-pilot.</text>

  <!-- CTA button -->
  <rect x="80" y="350" width="280" height="52" rx="26" fill="url(#gold)"/>
  <text x="220" y="382" font-family="${FONT}" font-size="16" fill="#0A0A0F" font-weight="700" text-anchor="middle" letter-spacing="1">START COPY TRADING</text>

  <!-- Secondary pills -->
  <rect x="380" y="355" width="90" height="40" rx="20" fill="${WHITE}" opacity="0.04" stroke="${WHITE}" stroke-width="1" stroke-opacity="0.08"/>
  <text x="425" y="380" font-family="${FONT}" font-size="13" fill="${GOLD}" font-weight="600" text-anchor="middle">GOLD</text>

  <rect x="480" y="355" width="110" height="40" rx="20" fill="${WHITE}" opacity="0.04" stroke="${WHITE}" stroke-width="1" stroke-opacity="0.08"/>
  <text x="535" y="380" font-family="${FONT}" font-size="13" fill="#28A0F0" font-weight="600" text-anchor="middle">Arbitrum</text>

  <rect x="600" y="355" width="100" height="40" rx="20" fill="${WHITE}" opacity="0.04" stroke="${WHITE}" stroke-width="1" stroke-opacity="0.08"/>
  <text x="650" y="380" font-family="${FONT}" font-size="13" fill="${GREEN}" font-weight="600" text-anchor="middle">USDC</text>

  <!-- ====== RIGHT: LIVE TERMINAL ====== -->

  <!-- Terminal card -->
  <rect x="920" y="80" width="520" height="320" rx="20" fill="#0C0E16" opacity="0.7" stroke="${GOLD}" stroke-width="1" stroke-opacity="0.15"/>

  <!-- Terminal header -->
  <rect x="920" y="80" width="520" height="44" rx="20" fill="${GOLD}" opacity="0.04"/>
  <rect x="920" y="104" width="520" height="20" fill="#0C0E16"/> <!-- cover bottom radius -->
  <circle cx="950" cy="102" r="5" fill="${GREEN}" opacity="0.8"/>
  <text x="970" y="107" font-family="${FONT}" font-size="12" fill="${GREEN}" font-weight="600" letter-spacing="1">LIVE</text>
  <text x="1180" y="107" font-family="${FONT}" font-size="13" fill="${GRAY}" text-anchor="middle">XAU/USD</text>
  <text x="1410" y="107" font-family="${FONT}" font-size="12" fill="${GOLD}" text-anchor="end" font-weight="600">gTrade</text>

  <!-- Price -->
  <text x="960" y="170" font-family="${FONT}" font-size="48" fill="${WHITE}" font-weight="700">$3,024.50</text>
  <rect x="1280" y="142" width="130" height="36" rx="18" fill="${GREEN}" opacity="0.1" stroke="${GREEN}" stroke-width="1" stroke-opacity="0.3"/>
  <text x="1345" y="166" font-family="${FONT}" font-size="18" fill="${GREEN}" font-weight="700" text-anchor="middle">+1.24%</text>

  <!-- Mini chart inside terminal -->
  <polyline points="960,230 990,240 1020,220 1050,235 1080,210 1110,225 1140,200 1170,215 1200,195 1230,205 1260,185 1290,195 1320,175 1350,188 1380,170 1410,180" fill="none" stroke="${GREEN}" stroke-width="2" opacity="0.6"/>
  <polygon points="960,230 990,240 1020,220 1050,235 1080,210 1110,225 1140,200 1170,215 1200,195 1230,205 1260,185 1290,195 1320,175 1350,188 1380,170 1410,180 1410,260 960,260" fill="${GREEN}" opacity="0.05"/>

  <!-- Terminal stats row -->
  <line x1="940" y1="270" x2="1420" y2="270" stroke="${WHITE}" stroke-width="0.5" opacity="0.06"/>

  <text x="960" y="295" font-family="${FONT}" font-size="10" fill="${GRAY}" letter-spacing="1">SIGNAL</text>
  <text x="960" y="315" font-family="${FONT}" font-size="16" fill="${WHITE}" font-weight="700">#5 LONG</text>

  <text x="1100" y="295" font-family="${FONT}" font-size="10" fill="${GRAY}" letter-spacing="1">COPIERS</text>
  <text x="1100" y="315" font-family="${FONT}" font-size="16" fill="${PURPLE}" font-weight="700">Active</text>

  <text x="1240" y="295" font-family="${FONT}" font-size="10" fill="${GRAY}" letter-spacing="1">MODE</text>
  <text x="1240" y="315" font-family="${FONT}" font-size="16" fill="${GREEN}" font-weight="700">Auto-Copy</text>

  <text x="1370" y="295" font-family="${FONT}" font-size="10" fill="${GRAY}" letter-spacing="1">FEE</text>
  <text x="1370" y="315" font-family="${FONT}" font-size="16" fill="${GOLD}" font-weight="700">20%</text>

  <!-- Terminal status pill -->
  <rect x="960" y="340" width="450" height="36" rx="18" fill="${GREEN}" opacity="0.06" stroke="${GREEN}" stroke-width="1" stroke-opacity="0.15"/>
  <circle cx="985" cy="358" r="4" fill="${GREEN}"/>
  <text x="1185" y="363" font-family="${FONT}" font-size="12" fill="${GREEN}" font-weight="600" text-anchor="middle" letter-spacing="1">Monitoring gold market — Auto-copy active</text>

  <!-- Bottom bar -->
  <text x="80" y="465" font-family="${FONT}" font-size="14" fill="${GRAY}" letter-spacing="2">smarttradingclub.io</text>
  <text x="400" y="465" font-family="${FONT}" font-size="13" fill="${PURPLE}" font-weight="600">50% Referral Rewards</text>
  <text x="700" y="465" font-family="${FONT}" font-size="13" fill="${GREEN}" font-weight="600">Fully On-Chain</text>
  <text x="900" y="465" font-family="${FONT}" font-size="13" fill="${GOLD}" font-weight="600">Verified Contract</text>

  <rect x="0" y="497" width="1500" height="3" fill="url(#gold)"/>
</svg>`;

sharp(Buffer.from(svg)).png().toBuffer().then(buf => {
  fs.writeFileSync('twitter-banner.png', buf);
  console.log('Banner saved:', buf.length, 'bytes');
});
