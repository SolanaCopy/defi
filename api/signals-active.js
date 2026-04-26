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
  const qualifies =
    latest.setup_type &&
    latest.setup_type !== "none" &&
    Number(latest.confidence) >= 75 &&
    Number(latest.rr_ratio) >= 1.5 &&
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
            : Number(latest.rr_ratio) < 1.5
              ? `R:R ${latest.rr_ratio} < 1.5`
              : "unknown",
      latest_id: latest.id,
    });
  }

  return res.status(200).json({ active: true, signal: latest });
}
