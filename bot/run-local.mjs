// Runs the bot on this PC instead of Railway: restarts it whenever it exits and
// appends its output to bot/data/bot.log. Started hidden at logon by the
// scheduled task "SmartTradingClub Bot" (register-local.ps1).
//
// A Node supervisor rather than a batch loop: when the bot process was killed,
// cmd sat on its own "Terminate batch job?" prompt and never restarted it.
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const logFile = path.join(dir, "data", "bot.log");
fs.mkdirSync(path.dirname(logFile), { recursive: true });

const note = (msg) => fs.appendFileSync(logFile, `[${new Date().toISOString()}] runner: ${msg}\n`);

function start() {
  // keep one old log; a busy week of 30s polling adds up
  try {
    if (fs.statSync(logFile).size > 20 * 1024 * 1024) fs.renameSync(logFile, `${logFile}.1`);
  } catch {}
  note("starting bot");
  // Piped and appended here: handing the child a file descriptor left the log
  // empty under a headless conhost.
  const child = spawn(process.execPath, ["close-watcher.js"], { cwd: dir, stdio: ["ignore", "pipe", "pipe"] });
  const append = (chunk) => { try { fs.appendFileSync(logFile, chunk); } catch {} };
  child.stdout.on("data", append);
  child.stderr.on("data", append);
  child.on("exit", (code, signal) => {
    note(`bot exited (${code ?? signal}), restarting in 15s`);
    setTimeout(start, 15_000);
  });
}

start();
