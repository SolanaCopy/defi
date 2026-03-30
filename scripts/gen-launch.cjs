const sharp = require('sharp');
const fs = require('fs');

const FONT = "'DejaVu Sans', Arial, Helvetica, sans-serif";
const GOLD = '#D4A843';
const GOLD_LIGHT = '#F5E6A3';
const GOLD_DARK = '#8B6914';
const WHITE = '#FFFFFF';
const GREEN = '#00E676';
const PURPLE = '#8B5CF6';
const W = 1200;
const H = 675;

const LOGO_B64 = fs.readFileSync('bot/telegram-images.js', 'utf8').match(/const LOGO_B64 = "([^"]+)"/)?.[1] || '';

const svg = `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#02030A"/>
      <stop offset="50%" stop-color="#080A14"/>
      <stop offset="100%" stop-color="#04050C"/>
    </linearGradient>
    <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${GOLD_LIGHT}"/>
      <stop offset="50%" stop-color="${GOLD}"/>
      <stop offset="100%" stop-color="${GOLD_DARK}"/>
    </linearGradient>
    <linearGradient id="goldBtn" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${GOLD_DARK}"/>
      <stop offset="50%" stop-color="${GOLD}"/>
      <stop offset="100%" stop-color="${GOLD_LIGHT}"/>
    </linearGradient>
    <radialGradient id="centerGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${GOLD}" stop-opacity="0.07"/>
      <stop offset="60%" stop-color="${GOLD}" stop-opacity="0.02"/>
      <stop offset="100%" stop-color="${GOLD}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="ring1" cx="50%" cy="50%" r="50%">
      <stop offset="80%" stop-color="${GOLD}" stop-opacity="0"/>
      <stop offset="85%" stop-color="${GOLD}" stop-opacity="0.04"/>
      <stop offset="90%" stop-color="${GOLD}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="ring2" cx="50%" cy="50%" r="50%">
      <stop offset="60%" stop-color="${GOLD}" stop-opacity="0"/>
      <stop offset="64%" stop-color="${GOLD}" stop-opacity="0.03"/>
      <stop offset="68%" stop-color="${GOLD}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- Deep dark background -->
  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <!-- Radial rings -->
  <rect width="${W}" height="${H}" fill="url(#centerGlow)"/>
  <rect width="${W}" height="${H}" fill="url(#ring1)"/>
  <rect width="${W}" height="${H}" fill="url(#ring2)"/>

  <!-- Geometric accent lines -->
  <line x1="0" y1="0" x2="${W}" y2="${H}" stroke="${GOLD}" stroke-width="0.5" opacity="0.03"/>
  <line x1="${W}" y1="0" x2="0" y2="${H}" stroke="${GOLD}" stroke-width="0.5" opacity="0.03"/>
  <line x1="${W/2}" y1="0" x2="${W/2}" y2="${H}" stroke="${GOLD}" stroke-width="0.3" opacity="0.02"/>
  <line x1="0" y1="${H/2}" x2="${W}" y2="${H/2}" stroke="${GOLD}" stroke-width="0.3" opacity="0.02"/>

  <!-- Corner accents -->
  <path d="M0 0 L80 0 L0 80 Z" fill="${GOLD}" opacity="0.03"/>
  <path d="M${W} 0 L${W-80} 0 L${W} 80 Z" fill="${GOLD}" opacity="0.03"/>
  <path d="M0 ${H} L80 ${H} L0 ${H-80} Z" fill="${GOLD}" opacity="0.03"/>
  <path d="M${W} ${H} L${W-80} ${H} L${W} ${H-80} Z" fill="${GOLD}" opacity="0.03"/>

  <!-- Subtle dot grid -->
  ${Array.from({ length: 15 }, (_, row) =>
    Array.from({ length: 20 }, (_, col) =>
      `<circle cx="${60 + col * 58}" cy="${45 + row * 45}" r="0.8" fill="${GOLD}" opacity="0.06"/>`
    ).join('')
  ).join('')}

  <!-- ====== LOGO + BRAND ====== -->
  <image x="${W/2 - 50}" y="55" width="100" height="100" href="data:image/png;base64,${LOGO_B64}"/>

  <!-- ====== MAIN HEADLINE ====== -->
  <text x="${W/2}" y="215" font-family="${FONT}" font-size="16" fill="${GOLD}" font-weight="700" text-anchor="middle" letter-spacing="8">WE ARE LIVE</text>

  <text x="${W/2}" y="295" font-family="${FONT}" font-size="62" fill="${WHITE}" font-weight="700" text-anchor="middle" letter-spacing="2">COPY. TRADE.</text>
  <text x="${W/2}" y="365" font-family="${FONT}" font-size="62" fill="url(#gold)" font-weight="700" text-anchor="middle" letter-spacing="2">EARN.</text>

  <!-- Divider -->
  <rect x="${W/2 - 40}" y="388" width="80" height="3" rx="1.5" fill="url(#gold)" opacity="0.6"/>

  <!-- Sub headline -->
  <text x="${W/2}" y="430" font-family="${FONT}" font-size="20" fill="${WHITE}" text-anchor="middle" opacity="0.7" letter-spacing="1">Copy live gold trades on Arbitrum with one click</text>

  <!-- 3 Pillars -->
  <g transform="translate(175, 465)">
    <rect x="0" y="0" width="240" height="70" rx="16" fill="${GOLD}" opacity="0.04" stroke="${GOLD}" stroke-width="1" stroke-opacity="0.12"/>
    <circle cx="30" cy="35" r="14" fill="${GOLD}" opacity="0.08"/>
    <text x="30" y="40" font-family="${FONT}" font-size="16" fill="${GOLD}" font-weight="700" text-anchor="middle">1</text>
    <text x="60" y="30" font-family="${FONT}" font-size="13" fill="${WHITE}" font-weight="700">Connect Wallet</text>
    <text x="60" y="48" font-family="${FONT}" font-size="11" fill="${WHITE}" opacity="0.5">MetaMask + Arbitrum</text>
  </g>

  <g transform="translate(480, 465)">
    <rect x="0" y="0" width="240" height="70" rx="16" fill="${GREEN}" opacity="0.04" stroke="${GREEN}" stroke-width="1" stroke-opacity="0.12"/>
    <circle cx="30" cy="35" r="14" fill="${GREEN}" opacity="0.08"/>
    <text x="30" y="40" font-family="${FONT}" font-size="16" fill="${GREEN}" font-weight="700" text-anchor="middle">2</text>
    <text x="60" y="30" font-family="${FONT}" font-size="13" fill="${WHITE}" font-weight="700">Copy a Trade</text>
    <text x="60" y="48" font-family="${FONT}" font-size="11" fill="${WHITE}" opacity="0.5">XAU/USD on gTrade</text>
  </g>

  <g transform="translate(785, 465)">
    <rect x="0" y="0" width="240" height="70" rx="16" fill="${PURPLE}" opacity="0.04" stroke="${PURPLE}" stroke-width="1" stroke-opacity="0.12"/>
    <circle cx="30" cy="35" r="14" fill="${PURPLE}" opacity="0.08"/>
    <text x="30" y="40" font-family="${FONT}" font-size="16" fill="${PURPLE}" font-weight="700" text-anchor="middle">3</text>
    <text x="60" y="30" font-family="${FONT}" font-size="13" fill="${WHITE}" font-weight="700">Claim Profit</text>
    <text x="60" y="48" font-family="${FONT}" font-size="11" fill="${WHITE}" opacity="0.5">USDC to your wallet</text>
  </g>

  <!-- Website -->
  <text x="${W/2}" y="575" font-family="${FONT}" font-size="22" fill="url(#gold)" text-anchor="middle" font-weight="700" letter-spacing="4">SMARTTRADINGCLUB.IO</text>

  <!-- Bottom line -->
  <text x="${W/2}" y="610" font-family="${FONT}" font-size="13" fill="${WHITE}" text-anchor="middle" opacity="0.35" letter-spacing="2">Fully on-chain  ·  Auto-copy  ·  50% referral rewards  ·  USDC</text>

  <!-- Top + bottom gold accent -->
  <rect x="0" y="0" width="${W}" height="2" fill="url(#gold)" opacity="0.8"/>
  <rect x="0" y="${H-2}" width="${W}" height="2" fill="url(#gold)" opacity="0.8"/>
</svg>`;

sharp(Buffer.from(svg)).png().toBuffer().then(buf => {
  fs.writeFileSync('twitter-launch.png', buf);
  console.log('Launch image saved:', buf.length, 'bytes');
});
