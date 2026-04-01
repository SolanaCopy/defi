import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const VOICE = 'en-US-BrianNeural';
const __dirname = dirname(fileURLToPath(import.meta.url));

// Generate each sentence separately to get exact duration per sentence
const sentences = [
  "Welcome to Smart Trading Club.",
  "In this tutorial, you'll learn how to copy professional gold trading signals automatically.",
  "Every trade is executed on-chain on Arbitrum, fully transparent and verifiable.",
  "Let's get started.",
  "Before we begin, here's what you'll need.",
  "First, a MetaMask wallet — it's a free browser extension.",
  "Second, the Arbitrum network, which our site adds automatically.",
  "Third, some USDC on Arbitrum — that's the stablecoin used for all trades.",
  "And finally, a tiny bit of ETH for gas fees — about fifty cents is enough for dozens of transactions.",
  "Step one: connect your wallet.",
  "Click the Connect Wallet button in the top right corner.",
  "MetaMask will ask you to confirm the connection. No funds are moved — it's just a handshake.",
  "The site can now see your address and balances. Make sure you're on the Arbitrum One network.",
  "Step two: approve USDC spending.",
  "This is a one-time approval that lets the smart contract use your USDC when copying trades.",
  "Click Approve in the MetaMask popup. This is standard for every DeFi protocol.",
  "Your funds stay in your wallet until a trade is actually copied.",
  "You can revoke this approval at any time.",
  "Step three: enable auto-copy.",
  "Choose how much USDC you want to invest per trade.",
  "When a new signal is posted, the bot automatically executes the trade for you on gTrade, a decentralized exchange.",
  "When the trade closes, your USDC plus any profit — or minus any loss — returns to your wallet automatically.",
  "Now let's look at the results page.",
  "Every trade is recorded on the Arbitrum blockchain. Anyone can verify the results — it's fully transparent.",
  "You can see the total profit and loss, win rate, and complete trade history.",
  "Each signal shows the entry price, take profit, stop loss, and final result.",
  "Here are some important tips.",
  "Remember, trading involves risk — with twenty-five x leverage, even small moves can mean significant losses.",
  "Only invest what you can afford to lose.",
  "Keep enough USDC in your wallet so trades aren't skipped. Keep a small amount of ETH for gas fees.",
  "And join our Telegram for real-time notifications on every signal and trade closure.",
  "And that's it — you're all set!",
  "Connect your wallet, approve USDC, enable auto-copy, and let the bot handle the rest.",
  "Head over to smarttradingclub.io to get started.",
  "See you on the next trade!",
];

const FPS = 30;
const VOICE_START_FRAME = 10; // voiceover starts at frame 10 in the composition

// Generate each sentence as separate audio to measure exact duration
const durations = [];
const tempDir = join(__dirname, '_temp_subs');
mkdirSync(tempDir, { recursive: true });

for (let i = 0; i < sentences.length; i++) {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
  const subDir = join(tempDir, `s${i}`);
  mkdirSync(subDir, { recursive: true });
  await tts.toFile(subDir, sentences[i]);

  // Read generated file size to estimate duration
  const { statSync } = await import('fs');
  const filePath = join(subDir, 'audio.mp3');
  try {
    const stats = statSync(filePath);
    const durationSec = stats.size / (96000 / 8);
    durations.push(durationSec);
    console.log(`${i}: ${durationSec.toFixed(2)}s — "${sentences[i].slice(0, 50)}..."`);
  } catch {
    // Fallback: estimate from char count
    const durationSec = sentences[i].length * 0.065;
    durations.push(durationSec);
    console.log(`${i}: ~${durationSec.toFixed(2)}s (estimated) — "${sentences[i].slice(0, 50)}..."`);
  }
}

// But the actual audio is ONE continuous file, so individual durations won't perfectly match.
// The continuous audio has natural pauses between sentences.
// Add a small gap between sentences (~0.3s) to account for pauses.
const GAP = 0.3;

let currentTime = 0;
const subtitles = sentences.map((text, i) => {
  const from = Math.round((currentTime + VOICE_START_FRAME / FPS) * FPS);
  const dur = durations[i];
  const to = Math.round((currentTime + dur + VOICE_START_FRAME / FPS) * FPS);
  currentTime += dur + GAP;
  return { from, to, text };
});

console.log('\n// ===== GENERATED SUBTITLE DATA =====');
console.log('const subtitleData = [');
subtitles.forEach(s => {
  console.log(`  { from: ${s.from}, to: ${s.to}, text: ${JSON.stringify(s.text)} },`);
});
console.log('];');

writeFileSync(join(__dirname, 'subtitles-timed.json'), JSON.stringify(subtitles, null, 2));
console.log('\nSaved to scripts/subtitles-timed.json');

// Cleanup
const { rmSync } = await import('fs');
rmSync(tempDir, { recursive: true, force: true });
console.log('Cleaned up temp files.');
