import { createClient } from "@supabase/supabase-js";

// Returns the most recent gold_analysis row IF it qualifies as a tradeable
// signal (setup ≠ none, confidence ≥ 75, R:R ≥ 1.5, not expired). Otherwise
// returns { active: false }. Used by the Telegram bot to push admin DMs.
export default async function handler(req, res) {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const { data: latest } = await supabase
    .from("gold_analysis")
    .select(
      "id, created_at, valid_until, verdict, setup_type, entry, stop_loss, take_profit, rr_ratio, confidence, summary, session, trend_4h, trend_1h, trend_15m, price",
    )
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latest) return res.status(200).json({ active: false, reason: "no analysis yet" });

  const expired = latest.valid_until && new Date(latest.valid_until).getTime() < Date.now();

  // The stored rr_ratio is computed from prices alone. gTrade takes 0.06% of
  // position size to open and 0.06% to close, which against the price move is a
  // flat 0.12% — and on the observed 15-point stops that is 37% of the entire
  // risk budget. A gross 1.5 is roughly a net 0.8, so the old gross gate waved
  // through trades that lose money by construction. Recompute net, the same way
  // src/App.jsx and bot/signal-actions.js now do.
  const GTRADE_ROUNDTRIP_FEE = 0.0012;
  const RR_HARD_FLOOR = 1.36; // break-even R:R at the observed 42% win rate

  const netRR = (() => {
    const entry = Number(latest.entry);
    const tp = Number(latest.take_profit);
    const sl = Number(latest.stop_loss);
    if (![entry, tp, sl].every((n) => Number.isFinite(n) && n > 0)) return null;
    const rewardMove = Math.abs(tp - entry) / entry;
    const riskMove = Math.abs(entry - sl) / entry;
    if (!(riskMove > 0)) return null;
    const netReward = rewardMove - GTRADE_ROUNDTRIP_FEE;
    return netReward <= 0 ? 0 : netReward / (riskMove + GTRADE_ROUNDTRIP_FEE);
  })();

  const qualifies =
    latest.setup_type &&
    latest.setup_type !== "none" &&
    Number(latest.confidence) >= 75 &&
    netRR !== null &&
    netRR >= RR_HARD_FLOOR &&
    !expired;

  if (!qualifies) {
    return res.status(200).json({
      active: false,
      reason: expired
        ? "expired"
        : latest.setup_type === "none"
          ? "no setup"
          : Number(latest.confidence) < 75
            ? `confidence ${latest.confidence}% < 75%`
            : netRR === null
              ? "entry/TP/SL missing or invalid"
              : netRR < RR_HARD_FLOOR
                ? `net R:R ${netRR.toFixed(2)} < ${RR_HARD_FLOOR} (gross ${latest.rr_ratio})`
                : "unknown",
      latest_id: latest.id,
    });
  }

  return res.status(200).json({ active: true, signal: latest });
}
