import Anthropic from "@anthropic-ai/sdk";
import { welcomeImage } from "./telegram-images.js";

const {
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
  ANTHROPIC_API_KEY,
} = process.env;

const WEBSITE = "https://www.smarttradingclub.io";
const CONTRACT = "0xbE1E770670a0186772594ED381F573B3161029a2";
const TG_GROUP = "https://t.me/SmartTradingClubDapp";

const SYSTEM_PROMPT = `You are the Smart Trading Club assistant bot in a Telegram group. You help users understand the platform and answer their questions.

About the platform:
- Smart Trading Club is a copy trading platform on Arbitrum (blockchain)
- Users copy live gold (XAU/USD) trades with one click
- Trades are executed on-chain via gTrade with real leverage
- Users need USDC on Arbitrum + a little ETH for gas
- Fee: 20% on profit only — no fee on losses
- Contract address: ${CONTRACT}
- Website: ${WEBSITE}

How it works:
1. Connect MetaMask wallet to Arbitrum
2. Wait for a trade signal (notifications come in this Telegram group)
3. Click "Copy Now" on the website, enter USDC amount, confirm in MetaMask
4. Trade closes automatically at TP (take profit) or SL (stop loss)
5. Click "Claim" to receive USDC back including profit

Important details:
- Minimum investment depends on leverage: position size must be ~$3000+ on gTrade
  - At 50x leverage: ~$60 minimum
  - At 100x leverage: ~$30 minimum
  - At 150x leverage: ~$20 minimum
- Users can bridge from other chains using the Bridge feature on the website
- All trades are 100% on-chain and verifiable on Arbiscan
- The platform trades XAU/USD (gold) only

Rules — FOLLOW STRICTLY:
- Write like a real person in a group chat, NOT like an AI or customer service bot
- MAX 1-2 short sentences. Never more unless they specifically ask for a full explanation
- Match the vibe — if they say "hey" just say "hey! 👋" back with maybe one line
- Answer in the same language they use (Dutch or English)
- No bullet points, no numbered lists, no formal structure — just casual chat
- Use emoji sparingly, like a normal person would
- Never say "I'm an AI" or "as an AI assistant"
- Never give financial advice or promise returns
- When relevant, drop the website link: ${WEBSITE}
- Sound like a chill community manager, not a robot`;

let client = null;
let lastUpdateId = 0;
let polling = false;

function getClient() {
  if (!client && ANTHROPIC_API_KEY) {
    client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  }
  return client;
}

async function askClaude(question, userName) {
  const ai = getClient();
  if (!ai) return null;

  try {
    const response = await ai.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 150,
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: `User "${userName}" says: ${question}` },
      ],
    });
    return response.content[0]?.text || null;
  } catch (err) {
    console.error("[AI] Claude error:", err.message);
    return null;
  }
}

async function sendReply(chatId, text, replyToMessageId) {
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        reply_to_message_id: replyToMessageId,
        disable_web_page_preview: true,
      }),
    });
  } catch (err) {
    console.error("[AI] Reply error:", err.message);
  }
}

// Built-in command responses (no AI needed)
const COMMANDS = {
  "/start": `Welcome to <b>Smart Trading Club</b>!\n\nCopy live gold trades on Arbitrum with one click.\n\n🔗 <a href="${WEBSITE}">Open App</a>`,
  "/help": `<b>How to get started:</b>\n\n1. Connect MetaMask to Arbitrum\n2. Make sure you have USDC + ETH for gas\n3. Wait for a trade signal in this group\n4. Click "Copy Now" on the website\n5. Claim your profit when the trade closes\n\n🔗 <a href="${WEBSITE}">Open App</a>`,
  "/website": `🔗 <a href="${WEBSITE}">smarttradingclub.io</a>`,
  "/contract": `📄 Contract: <a href="https://arbiscan.io/address/${CONTRACT}">${CONTRACT.slice(0, 6)}...${CONTRACT.slice(-4)}</a>`,
};

function shouldRespond(update) {
  const msg = update.message;
  if (!msg || !msg.text) return false;

  // Ignore bot's own messages
  if (msg.from?.is_bot) return false;

  const chatId = String(msg.chat?.id);
  const isGroup = chatId === TELEGRAM_CHAT_ID || chatId === TELEGRAM_CHAT_ID?.replace("-100", "-");
  const isPrivate = msg.chat?.type === "private";

  if (!isGroup && !isPrivate) return false;

  // In private chat, always respond
  if (isPrivate) return true;

  const text = msg.text.toLowerCase().trim();

  // Commands
  if (text.startsWith("/")) return true;

  // Questions (ends with ?)
  if (text.endsWith("?")) return true;

  // Bot mentioned
  if (text.includes("@onchaincopybot") || text.includes("bot")) return true;

  // Reply to bot message
  if (msg.reply_to_message?.from?.is_bot) return true;

  return false;
}

async function sendWelcomePhoto(chatId, img, caption) {
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`;
    const boundary = "b" + Date.now();
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="parse_mode"\r\n\r\nHTML\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="welcome.png"\r\nContent-Type: image/png\r\n\r\n`),
      img,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
      body,
    });
  } catch (err) {
    console.error("[AI] Welcome photo error:", err.message);
  }
}

async function handleUpdate(update) {
  // Handle chat_member update (new join via privacy-mode-aware event)
  if (update.chat_member) {
    const cm = update.chat_member;
    const wasNotMember = ["left", "kicked", "restricted"].includes(cm.old_chat_member?.status) || !cm.old_chat_member;
    const isNowMember = ["member", "administrator", "creator"].includes(cm.new_chat_member?.status);
    if (wasNotMember && isNowMember && !cm.new_chat_member?.user?.is_bot) {
      const name = cm.new_chat_member.user.first_name || "Trader";
      console.log(`[AI] New member joined (chat_member): ${name}`);
      try {
        const img = await welcomeImage({ username: name });
        await sendWelcomePhoto(cm.chat.id, img, [
          `🔥 Welcome <b>${name}</b> to Smart Trading Club!`,
          ``,
          `Copy our gold trades fully on-chain, fully transparent.`,
          `No trust required. Just results. 📈`,
          ``,
          `👉 Check the pinned message to get started`,
          `❓ Questions? Just ask!`,
        ].join("\n"));
      } catch (err) {
        console.error("[AI] Welcome image error:", err.message);
      }
      return;
    }
  }

  const msg = update.message;

  // New member joined (legacy message event)
  if (msg?.new_chat_members?.length > 0) {
    for (const member of msg.new_chat_members) {
      if (member.is_bot) continue;
      const name = member.first_name || "Trader";
      console.log(`[AI] New member joined: ${name}`);
      try {
        const img = await welcomeImage({ username: name });
        await sendWelcomePhoto(msg.chat.id, img, [
          `🔥 Welcome <b>${name}</b> to Smart Trading Club!`,
          ``,
          `Copy our gold trades fully on-chain, fully transparent.`,
          `No trust required. Just results. 📈`,
          ``,
          `👉 Check the pinned message to get started`,
          `❓ Questions? Just ask!`,
        ].join("\n"));
      } catch (err) {
        console.error("[AI] Welcome image error:", err.message);
      }
    }
    return;
  }

  if (!msg || !msg.text) return;

  if (!shouldRespond(update)) return;

  const text = msg.text.trim();
  const chatId = msg.chat.id;
  const msgId = msg.message_id;
  const userName = msg.from?.first_name || "User";

  // Check built-in commands first
  const cmd = text.split(" ")[0].split("@")[0].toLowerCase();
  if (COMMANDS[cmd]) {
    await sendReply(chatId, COMMANDS[cmd], msgId);
    return;
  }

  // Ask Claude for everything else
  const answer = await askClaude(text, userName);
  if (answer) {
    await sendReply(chatId, answer, msgId);
  }
}

async function pollUpdates() {
  if (!TELEGRAM_BOT_TOKEN) return;

  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=30&allowed_updates=["message","chat_member"]`;
    const res = await fetch(url, { signal: AbortSignal.timeout(35000) });
    const data = await res.json();

    if (data.ok && data.result?.length > 0) {
      for (const update of data.result) {
        lastUpdateId = update.update_id;
        const msg = update.message;
        if (msg?.text) {
          console.log(`[AI] Message from ${msg.from?.first_name}: "${msg.text}"`);
        }
        if (msg?.new_chat_members?.length > 0) {
          console.log(`[AI] New member(s) joined: ${msg.new_chat_members.map(m => m.first_name).join(", ")}`);
        }
        try {
          await handleUpdate(update);
        } catch (err) {
          console.error("[AI] Handle error:", err.message);
        }
      }
    }
  } catch (err) {
    if (err.name !== "TimeoutError") {
      console.error("[AI] Poll error:", err.message);
    }
  }
}

export async function startTelegramAI() {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log("[AI] No TELEGRAM_BOT_TOKEN — AI responses disabled");
    return;
  }
  if (!ANTHROPIC_API_KEY) {
    console.log("[AI] No ANTHROPIC_API_KEY — AI responses disabled");
    return;
  }

  polling = true;
  console.log("[AI] Telegram AI assistant started — listening for questions");

  // Skip old messages
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=-1`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.ok && data.result?.length > 0) {
      lastUpdateId = data.result[data.result.length - 1].update_id;
    }
  } catch {}

  // Poll loop
  while (polling) {
    await pollUpdates();
  }
}

export function stopTelegramAI() {
  polling = false;
}
