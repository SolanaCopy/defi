import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { mkdir, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const VOICE = 'en-US-BrianNeural';
const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'public', 'voiceover');

// Full tutorial script — one continuous voiceover
const fullScript = `
Welcome to Smart Trading Club. In this tutorial, you'll learn how to copy professional gold trading signals automatically. Every trade is executed on-chain on Arbitrum, fully transparent and verifiable. Let's get started.

Before we begin, here's what you'll need. First, a MetaMask wallet — it's a free browser extension. Second, the Arbitrum network, which our site adds automatically. Third, some USDC on Arbitrum — that's the stablecoin used for all trades. And finally, a tiny bit of Ethereum for gas fees — about fifty cents is enough for dozens of transactions.

Step one: connect your wallet. Click the Connect Wallet button in the top right corner. MetaMask will ask you to confirm the connection. No funds are moved — it's just a handshake. The site can now see your address and balances. Make sure you're on the Arbitrum One network.

Step two: approve USDC spending. This is a one-time approval that lets the smart contract use your USDC when copying trades. Click Approve in the MetaMask popup. This is standard for every DeFi protocol. Your funds stay in your wallet until a trade is actually copied. You can revoke this approval at any time.

Step three: enable auto-copy. Choose how much USDC you want to invest per trade. When a new signal is posted, the bot automatically executes the trade for you on gTrade, a decentralized exchange. When the trade closes, your USDC plus any profit — or minus any loss — returns to your wallet automatically.

Now let's look at the results page. Every trade is recorded on the Arbitrum blockchain. Anyone can verify the results — it's fully transparent. You can see the total profit and loss, win rate, and complete trade history. Each signal shows the entry price, take profit, stop loss, and final result.

Here are some important tips. Remember, trading involves risk — with twenty-five x leverage, even small moves can mean significant losses. That's why every trade uses a stop-loss to prevent large losses. Only invest what you can afford to lose. Keep enough USDC in your wallet so trades aren't skipped. Keep a small amount of Ethereum for gas fees. And join our Telegram for real-time notifications on every signal and trade closure.

And that's it — you're all set! Connect your wallet, approve USDC, enable auto-copy, and let the bot handle the rest. Head over to smarttradingclub.io to get started. See you on the next trade!
`.trim();

await mkdir(outDir, { recursive: true });

const tts = new MsEdgeTTS();
await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
const tempDir = join(outDir, '_temp');
await mkdir(tempDir, { recursive: true });
await tts.toFile(tempDir, fullScript);

// Move to final location
const { renameSync, existsSync, rmdirSync, unlinkSync, readdirSync } = await import('fs');
const generated = join(tempDir, 'audio.mp3');
const target = join(outDir, 'tutorial-voiceover.mp3');
if (existsSync(generated)) {
  renameSync(generated, target);
  try { rmdirSync(tempDir); } catch {}
}

// Clean up old per-scene files
for (const f of readdirSync(outDir)) {
  if (f.startsWith('scene') && f.endsWith('.mp3')) {
    unlinkSync(join(outDir, f));
  }
}

console.log('✓ tutorial-voiceover.mp3 generated');
