"""Same engine on 4-hour bars: bigger moves, so the fixed costs weigh less.
Time stop 30 bars (5 days). Costs as in backtest.py (full)."""
import numpy as np
import backtest as bt

raw = bt.load_yahoo("yahoo_gc_60m.json").resample("4h").agg({"o": "first", "h": "max", "l": "min", "c": "last"}).dropna()
y = bt.indicators(raw)
bt.TIME_STOP_H = 30
bt.HOLD_COST_H = bt.HOLD_COST_H * 4     # per 4h bar
cut = y.index[int(len(y) * 0.6)]
halves = {"in": y[y.index < cut], "out": y[y.index >= cut]}
print(f"4h bars {y.index[0].date()}..{y.index[-1].date()}, split {cut.date()}; move of gold over the period: {raw.c.iloc[0]:.0f} -> {raw.c.iloc[-1]:.0f}")
for name in ("trend_pullback", "breakout_24h", "mean_reversion", "random_baseline"):
    sig, rule = bt.STRATEGIES[name]
    parts = []
    for h, data in halves.items():
        bt.RNG.bit_generator.state = np.random.default_rng(7).bit_generator.state
        t = bt.run(data, sig, rule)
        s = bt.summarize(t)
        longs = (t.side == 1).mean() * 100 if len(t) else 0
        parts.append(f"{h}: {s['trades']} tr, win {s['win_rate']}%, avg {s['avg_trade_%']}%, total {s['total_%_of_stake']}%, maxDD {s['max_drawdown_%']}%, PF {s['profit_factor']}, {longs:.0f}% long")
    print(f"  {name:16s} | " + " | ".join(parts))
