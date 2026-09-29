"""Backtest of rule-based gold (XAU) strategies for the Smart Trading Club autopilot.

Honest-by-construction:
  - rules and parameters are fixed up front (textbook values, no tuning loop)
  - data is split: first 60% in-sample (to choose), last 40% out-of-sample (to judge)
  - costs, from gTrade's trading-variables for XAU (pair 90, fee index 13) on
    29 Sep 2026: 0.035% open + 0.035% close, plus 0.01% slippage each way =
    0.09% of position size per round trip; borrowing is ~0.0002%/h, taken as
    0.001%/h to leave room for funding fees
  - if stop and target fall inside the same bar, the stop is assumed hit
  - gaps through the stop fill at the open, not at the stop
  - same guards as bot/autopilot.js: one position at a time, max 4 trades per
    UTC day, stop for the day after 2 losses

Results are per trade on the copied amount at 25x leverage, not compounded:
a copier puts a fixed amount into each trade.
"""
import json
import sys
from dataclasses import dataclass

import numpy as np
import pandas as pd

LEV = 25
COST_RT = 0.0009          # fees + slippage, fraction of notional per round trip
HOLD_COST_H = 0.00001     # borrowing + funding per hour, fraction of notional
PERF_FEE = 0.20           # platform fee on winning trades
MAX_TRADES_DAY = 4
MAX_LOSSES_DAY = 2
TIME_STOP_H = 24


def load_yahoo(path):
    r = json.load(open(path))["chart"]["result"][0]
    q = r["indicators"]["quote"][0]
    df = pd.DataFrame({"o": q["open"], "h": q["high"], "l": q["low"], "c": q["close"]},
                      index=pd.to_datetime(r["timestamp"], unit="s", utc=True))
    return df.dropna()


def load_gtrade_1h(path):
    t = json.load(open(path))
    df = pd.DataFrame(t)
    df.index = pd.to_datetime(df["time"], unit="ms", utc=True)
    df = df.rename(columns={"open": "o", "high": "h", "low": "l", "close": "c"})[["o", "h", "l", "c"]]
    return df.resample("1h").agg({"o": "first", "h": "max", "l": "min", "c": "last"}).dropna()


def indicators(df):
    d = df.copy()
    for n in (5, 20, 50, 200):
        d[f"ema{n}"] = d.c.ewm(span=n, adjust=False).mean()
    tr = pd.concat([d.h - d.l, (d.h - d.c.shift()).abs(), (d.l - d.c.shift()).abs()], axis=1).max(axis=1)
    d["atr"] = tr.ewm(alpha=1 / 14, adjust=False).mean()
    for n in (2, 14):
        delta = d.c.diff()
        up = delta.clip(lower=0).ewm(alpha=1 / n, adjust=False).mean()
        dn = (-delta.clip(upper=0)).ewm(alpha=1 / n, adjust=False).mean()
        d[f"rsi{n}"] = 100 - 100 / (1 + up / dn)
    d["hh24"] = d.h.rolling(24).max().shift()
    d["ll24"] = d.l.rolling(24).min().shift()
    d["hour"] = d.index.hour
    d["day"] = d.index.date
    return d


# ---------- strategies: return +1 long / -1 short / 0, plus stop and target in ATR ----------
@dataclass
class Rule:
    name: str
    sl_atr: float
    tp_atr: float


def sig_trend_pullback(d, i):
    r = d.iloc[i]
    up = r.ema50 > r.ema200 and r.ema50 > d.ema50.iloc[i - 5]
    dn = r.ema50 < r.ema200 and r.ema50 < d.ema50.iloc[i - 5]
    was_below = (d.c.iloc[i - 3:i] < d.ema20.iloc[i - 3:i]).any()
    was_above = (d.c.iloc[i - 3:i] > d.ema20.iloc[i - 3:i]).any()
    if up and was_below and r.c > r.ema20 and r.rsi14 < 70:
        return 1
    if dn and was_above and r.c < r.ema20 and r.rsi14 > 30:
        return -1
    return 0


def sig_breakout(d, i):
    r = d.iloc[i]
    if r.c > r.hh24 and r.c > r.ema200:
        return 1
    if r.c < r.ll24 and r.c < r.ema200:
        return -1
    return 0


def sig_london(d, i):
    # Asian range 00:00-07:00 UTC; trade the first close outside it between 07 and 11 UTC
    r = d.iloc[i]
    if not 7 <= r.hour <= 11:
        return 0
    day = d[(d.day == r.day) & (d.hour < 7)]
    if len(day) < 5:
        return 0
    hi, lo = day.h.max(), day.l.min()
    earlier = d[(d.day == r.day) & (d.hour >= 7) & (d.index < d.index[i])]
    if ((earlier.c > hi) | (earlier.c < lo)).any():
        return 0  # only the first break of the day
    if r.c > hi:
        return 1
    if r.c < lo:
        return -1
    return 0


def sig_meanrev(d, i):
    r = d.iloc[i]
    if r.c > r.ema200 and r.rsi2 < 10:
        return 1
    if r.c < r.ema200 and r.rsi2 > 90:
        return -1
    return 0


RNG = np.random.default_rng(7)


def sig_random(d, i):
    return int(RNG.choice([1, -1])) if RNG.random() < 0.05 else 0


STRATEGIES = {
    "trend_pullback": (sig_trend_pullback, Rule("trend_pullback", 1.5, 3.0)),
    "breakout_24h": (sig_breakout, Rule("breakout_24h", 2.0, 4.0)),
    "london_breakout": (sig_london, Rule("london_breakout", 1.0, 2.0)),
    "mean_reversion": (sig_meanrev, Rule("mean_reversion", 2.0, 1.0)),
    "random_baseline": (sig_random, Rule("random_baseline", 1.5, 3.0)),
}


def run(d, sig, rule):
    trades = []
    i = 205
    day_count, day_losses, cur_day = 0, 0, None
    n = len(d)
    while i < n - 1:
        r = d.iloc[i]
        if r.day != cur_day:
            cur_day, day_count, day_losses = r.day, 0, 0
        if day_count >= MAX_TRADES_DAY or day_losses >= MAX_LOSSES_DAY:
            i += 1
            continue
        s = sig(d, i)
        if s == 0 or not np.isfinite(r.atr):
            i += 1
            continue
        entry = d.o.iloc[i + 1]
        sl = entry - s * rule.sl_atr * r.atr
        tp = entry + s * rule.tp_atr * r.atr
        exit_px, j = None, i + 1
        while j < n and j <= i + TIME_STOP_H:
            b = d.iloc[j]
            if j > i + 1 and (b.o - sl) * s <= 0:        # gapped through the stop
                exit_px = b.o
                break
            hit_sl = (b.l <= sl) if s == 1 else (b.h >= sl)
            hit_tp = (b.h >= tp) if s == 1 else (b.l <= tp)
            if hit_sl:                                   # pessimistic: stop first
                exit_px = sl
                break
            if hit_tp:
                exit_px = tp
                break
            j += 1
        if exit_px is None:
            j = min(j, n - 1)
            exit_px = d.c.iloc[j]
        hours = max(1, j - i)
        move = (exit_px - entry) / entry * s
        net = move - COST_RT - HOLD_COST_H * hours     # fraction of notional
        ret = max(net * LEV, -1.0)                     # fraction of the copied amount
        trades.append({"time": d.index[i + 1], "side": s, "ret": ret})
        day_count += 1
        if ret < 0:
            day_losses += 1
        i = j + 1
    return pd.DataFrame(trades)


def summarize(t):
    if t.empty:
        return {"trades": 0}
    wins = t.ret > 0
    gross = t.ret.where(~wins, t.ret * (1 - PERF_FEE))   # copier view: fee off the winners
    eq = gross.cumsum()
    dd = (eq - eq.cummax()).min()
    months = max(1, (t.time.iloc[-1] - t.time.iloc[0]).days / 30.4)
    return {
        "trades": len(t),
        "win_rate": round(wins.mean() * 100, 1),
        "avg_trade_%": round(gross.mean() * 100, 2),
        "total_%_of_stake": round(gross.sum() * 100, 1),
        "per_month_%": round(gross.sum() * 100 / months, 1),
        "max_drawdown_%": round(dd * 100, 1),
        "profit_factor": round(gross[gross > 0].sum() / -gross[gross < 0].sum(), 2) if (gross < 0).any() else None,
    }


if __name__ == "__main__":
    y = indicators(load_yahoo("yahoo_gc_60m.json"))
    cut = y.index[int(len(y) * 0.6)]
    ins, oos = y[y.index < cut], y[y.index >= cut]
    g = indicators(load_gtrade_1h("gtrade_xau_15m.json"))
    print(f"Yahoo GC=F 1h: {y.index[0].date()} .. {y.index[-1].date()}  | in-sample until {cut.date()}")
    print(f"gTrade XAU 1h (from 15m): {g.index[0].date()} .. {g.index[-1].date()}\n")
    out = {}
    for name, (sig, rule) in STRATEGIES.items():
        row = {}
        for label, data in (("in_sample", ins), ("out_of_sample", oos), ("gtrade_100d", g)):
            RNG.bit_generator.state = np.random.default_rng(7).bit_generator.state
            row[label] = summarize(run(data, sig, rule))
        out[name] = row
        print(name)
        for k, v in row.items():
            print(f"  {k:14s} {v}")
    json.dump(out, open("backtest_results.json", "w"), indent=1, default=str)
