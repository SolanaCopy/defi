/**
 * Persistent storage for daily poll state so bot restarts don't lose
 * pollOpenPrice (price at 12:00 UTC) between the poll and the 21:00 UTC
 * result post.
 *
 * Stored as JSON on disk. Path is configurable via POLL_STATE_PATH so the
 * file can live on a Railway volume; defaults to bot/poll-state.json.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = process.env.POLL_STATE_PATH || path.join(__dirname, "poll-state.json");

const defaults = {
  lastPollDate: "",
  lastResultDate: "",
  pollOpenPrice: null,
  pollScores: {},          // userId -> { firstName, streak, totalCorrect }
  pollVotes: {},           // optionIndex -> [{ userId, firstName }]
};

export function loadPollState() {
  try {
    if (!fs.existsSync(FILE)) return { ...defaults };
    const raw = fs.readFileSync(FILE, "utf8");
    const parsed = JSON.parse(raw);
    return { ...defaults, ...parsed };
  } catch (err) {
    console.error("[poll-state] load failed, using defaults:", err.message);
    return { ...defaults };
  }
}

export function savePollState(state) {
  try {
    const serializable = {
      lastPollDate: state.lastPollDate || "",
      lastResultDate: state.lastResultDate || "",
      pollOpenPrice: state.pollOpenPrice ?? null,
      pollScores: state.pollScores instanceof Map
        ? Object.fromEntries(state.pollScores)
        : (state.pollScores || {}),
      pollVotes: state.pollVotes instanceof Map
        ? Object.fromEntries(state.pollVotes)
        : (state.pollVotes || {}),
      weeklyWeekKey: state.weeklyWeekKey || "",
      lastWeeklyWinnerWeek: state.lastWeeklyWinnerWeek || "",
      lastSentSignalId: state.lastSentSignalId ?? null,
    };
    fs.writeFileSync(FILE, JSON.stringify(serializable, null, 2));
  } catch (err) {
    console.error("[poll-state] save failed:", err.message);
  }
}

export function mapFromObject(obj) {
  return new Map(Object.entries(obj || {}).map(([k, v]) => {
    const key = isNaN(Number(k)) ? k : Number(k);
    return [key, v];
  }));
}
