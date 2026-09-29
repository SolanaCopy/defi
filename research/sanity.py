"""Engine sanity check: in a market that rose ~80%, 'always long' with wide
stops must come out positive before costs. If it does not, the engine is wrong."""
import numpy as np
import backtest as bt

raw = bt.load_yahoo("yahoo_gc_60m.json").resample("4h").agg({"o": "first", "h": "max", "l": "min", "c": "last"}).dropna()
y = bt.indicators(raw)
bt.TIME_STOP_H = 30
always_long = lambda d, i: 1
for label, cost, hold in (("no costs", 0.0, 0.0), ("full costs", 0.0016, 0.0002)):
    bt.COST_RT, bt.HOLD_COST_H = cost, hold
    for lev in (25, 5):
        bt.LEV = lev
        s = bt.summarize(bt.run(y, always_long, bt.Rule("long", 3.0, 6.0)))
        print(f"always long, {label:10s}, {lev:2d}x: {s['trades']} tr, win {s['win_rate']}%, avg {s['avg_trade_%']}%, total {s['total_%_of_stake']}%, PF {s['profit_factor']}")
