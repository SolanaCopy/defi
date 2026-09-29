# Backtest: rule-based gold strategies (29 Sep 2026)

Question: can the autopilot trade XAU/USD profitably without Claude, on fixed rules?

**Answer: not with any of the rules tested. Do not trade these live.**

## Set-up

- Data: Yahoo GC=F 1-hour bars, 7 May 2024 to 29 Sep 2026 (17,397 bars). Gold rose from $2,328 to $4,180 over this period. gTrade's own XAU 15-minute bars (22 Jun to 29 Sep 2026) served as a cross-check.
- Split: rules chosen on the first 60% (to 13 Oct 2025), judged on the last 40%.
- Costs come from gTrade `trading-variables` (pair 90, fee index 13):
  - 0.035% to open and 0.035% to close;
  - 0.01% slippage each way;
  - 0.001%/h for borrowing and funding.
- Leverage 25x. The 20% performance fee comes off winning trades. Guards match `bot/autopilot.js`: one position at a time, at most 4 trades per day, stop after 2 losses.
- Conservative fills: when stop and target fall inside the same bar, the stop counts. A gap through the stop fills at the open.
- Scripts: `backtest.py` (1h), `slower.py` (4h), `sensitivity.py` (cost sensitivity), `sanity.py` (engine check).

## Results

Average result per trade, as % of the amount copied.

| Strategy | 1h in-sample | 1h out-of-sample | 4h in-sample | 4h out-of-sample |
|---|---|---|---|---|
| Trend pullback | −6.4% | −4.6% | **+0.1%** | −8.6% |
| 24-bar breakout | −5.0% | −2.9% | −2.3% | +7.0% |
| London breakout | −5.5% | −0.2% | – | – |
| Mean reversion | −3.9% | −4.9% | −1.8% | −6.5% |
| Random entries | −4.1% | −3.3% | −4.2% | −2.6% |

## What this means

- **No rule shows a stable edge.** Only one rule broke even on the data used to choose it: the 4h trend pullback. It then lost 8.6% per trade on the unseen data.
- The 4h breakout made money on the unseen data, but it lost on the data used to choose it. Picking it now would be hindsight.
- Most rules do about as well as random entries. That is what no edge looks like.
- **The engine is sound.** "Always long" makes money before costs in this rising market, which rules out a bias in the simulation.
- **Costs decide the outcome.** At 25x, the 0.09% round-trip cost alone is about 2.25% of the amount copied on every trade.
- This agrees with the live record: 72 on-chain trades from April to May 2026 lost 2.3% in total.

## Recommendation

Run the autopilot on paper only (`AUTOPILOT_DRY_RUN=1`) until a strategy shows positive results on unseen data and then over several weeks of paper trading.
