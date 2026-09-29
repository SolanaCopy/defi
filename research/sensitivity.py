"""Same backtest, different cost assumptions: is there any edge before costs?"""
import numpy as np
import backtest as bt

y = bt.indicators(bt.load_yahoo("yahoo_gc_60m.json"))
cut = y.index[int(len(y) * 0.6)]
halves = {"in": y[y.index < cut], "out": y[y.index >= cut]}
for label, cost, hold in (("NO COSTS", 0.0, 0.0), ("HALF COSTS", 0.0008, 0.000025)):
    bt.COST_RT, bt.HOLD_COST_H = cost, hold
    print(f"== {label}  (avg % of stake per trade at 25x, before 20% fee: see avg_trade_%)")
    for name, (sig, rule) in bt.STRATEGIES.items():
        parts = []
        for h, data in halves.items():
            bt.RNG.bit_generator.state = np.random.default_rng(7).bit_generator.state
            s = bt.summarize(bt.run(data, sig, rule))
            parts.append(f"{h}: {s['trades']} tr, win {s['win_rate']}%, avg {s['avg_trade_%']}%, PF {s['profit_factor']}")
        print(f"  {name:16s} | " + " | ".join(parts))
