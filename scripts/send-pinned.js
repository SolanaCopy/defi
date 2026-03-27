import "dotenv/config";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT = process.env.TELEGRAM_CHAT_ID;

const text = [
  `\u{1F3C6} <b>Smart Trading Club</b>`,
  ``,
  `Copy live gold trades on Arbitrum with one click.`,
  `No experience needed \u2014 just connect, copy, and earn.`,
  ``,
  `\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501`,
  ``,
  `<b>How it works</b>`,
  ``,
  `1\uFE0F\u20E3  Connect MetaMask to Arbitrum`,
  `2\uFE0F\u20E3  Wait for a trade signal in this group`,
  `3\uFE0F\u20E3  Click "Copy Now" and confirm in MetaMask`,
  `4\uFE0F\u20E3  Trade closes automatically at TP or SL`,
  `5\uFE0F\u20E3  Click "Claim" to receive your profit`,
  ``,
  `\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501`,
  ``,
  `<b>Key info</b>`,
  ``,
  `\u{1F4B0}  <b>Min investment:</b> ~$20 (150x) to ~$60 (50x)`,
  `\u{1F4CA}  <b>Fee:</b> 20% on profit only \u2014 no fee on losses`,
  `\u26D3  <b>Network:</b> Arbitrum (L2, fast & cheap gas)`,
  `\u{1FA99}  <b>You need:</b> USDC + small ETH for gas`,
  `\u{1F916}  <b>Bot:</b> Answers questions 24/7 in this group`,
  ``,
  `\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501`,
  ``,
  `<b>What you trade</b>`,
  ``,
  `XAU/USD (Gold) via gTrade \u2014 real leverage, fully on-chain.`,
  `Every trade is verifiable on Arbiscan.`,
  ``,
  `\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501`,
  ``,
  `\u{1F512} Your funds stay in your wallet until you copy a trade.`,
  `No lock-ups, no deposits. You pay per trade directly via MetaMask.`,
].join("\n");

const buttons = {
  inline_keyboard: [
    [
      { text: "\u{1F680} Open App", url: "https://www.smarttradingclub.io?tab=dashboard" },
      { text: "\u{1F4C4} Contract", url: "https://arbiscan.io/address/0xf41d121DB5841767f403a4Bc59A54B26DecF6b99" },
    ],
    [
      { text: "\u{1F309} Bridge to Arbitrum", url: "https://www.smarttradingclub.io?tab=invest" },
      { text: "\u{1F4AC} Ask the Bot", url: "https://t.me/Onchaincopybot" },
    ],
  ],
};

const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    chat_id: CHAT,
    text,
    parse_mode: "HTML",
    reply_markup: buttons,
    disable_web_page_preview: true,
  }),
});

const data = await res.json();
if (data.ok) {
  console.log("Sent! Message ID:", data.result.message_id);

  const pin = await fetch(`https://api.telegram.org/bot${TOKEN}/pinChatMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT,
      message_id: data.result.message_id,
      disable_notification: true,
    }),
  });
  const pinData = await pin.json();
  console.log("Pinned:", pinData.ok);
} else {
  console.log("Error:", data.description);
}
