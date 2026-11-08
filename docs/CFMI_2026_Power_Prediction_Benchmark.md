# CFMI Power vs FPI, SP+ and FEI — 2026 game-ahead evaluation

**Assessment date:** November 8, 2026. **Games:** FBS vs FBS, regular season, Weeks 5–10. **Sample:** All **347** eligible games, with pre-week original-source-dated snapshots for all four systems.

**Research code and reproducibility:** [GitHub PR #3](https://github.com/randomquestions-projects/college-football-merit-index/pull/3), [successful automated historical benchmark run](https://github.com/randomquestions-projects/college-football-merit-index/actions/runs/42532320172). Research PR is for verification; it is not merged into production. **No CFMI model parameters were retrained or reselected on these 2026 results.**

## 1. Identical games, rating-derived winner picks

| System | Wins picked correctly | Accuracy | Difference from CFMI |
|---|---:|---:|---:|
| **SP+** | **238 / 347** | **68.6%** | +11 games / +3.2 pp |
| ESPN FPI | 234 / 347 | 67.4% | +7 games / +2.0 pp |
| FEI | 234 / 347 | 67.4% | +7 games / +2.0 pp |
| **CFMI Power V5.1 deployed** | 227 / 347 | **65.4%** | Reference |

**Prediction rule:** CFMI uses its actual game-ahead opponent-adjusted rating and the 3.54-point home-site edge estimated on 2024 data. For FPI and SP+, higher point-like rating is favored with a common *researcher-applied* +2.5-point home advantage (zero for neutral sites). For FEI, higher native efficiency rating is favored on neutral-strength alone: its rating units are not points, so applying a +2.5-point bonus would be invalid. **This is not a reproduction of the official ESPN/FPI/SP+/FEI game forecast feeds or betting odds.** It is a reconstruction of rating-based favorites using archived, dated team ratings.

### Neutral-field strength picks — identical zero home bonus for all four

| System | Correct | Accuracy |
|---|---:|---:|
| SP+ | 240/347 | 69.2% |
| ESPN FPI | 237/347 | 68.3% |
| FEI | 234/347 | 67.4% |
| CFMI Power | 230/347 | 66.3% |

The fully neutral comparison avoids applying an arbitrary home correction to FEI. It tests a slightly different objective from real-world venue-adjusted match predictions. The fact that CFMI itself improves by three picks when its own home bonus is removed is a *diagnostic*, not permission to re-tune venue weight after seeing the results.

### Approximate margin of victory error

For the point-like power ratings, compute expected home margin as *(home rating − away rating + 2.5 points if non-neutral)*.

| Model | Average absolute miss vs final margin |
|---|---:|
| SP+ rating-derived margin | **12.32 points** |
| ESPN FPI rating-derived margin | 12.44 points |
| CFMI deployed prediction | 12.71 points |
| FEI | Not comparable: ratings are not in points |

These researcher-derived margins are not the providers' official game-level spread forecasts; no provider-specific in-season calibration or matchup/roster adjustments have been reconstructed.

## 2. How results changed week by week

All metrics below use the same games per week, with source ratings strictly prior to the week's first kickoff.

| Week | Games | CFMI | FPI | SP+ | FEI |
|---:|---:|---:|---:|---:|---:|
| 5 | 56 | **71.4%** | 75.0% | 69.6% | 69.6% |
| 6 | 58 | 67.2% | 67.2% | 69.0% | 67.2% |
| 7 | 59 | 62.7% | 64.4% | 67.8% | 64.4% |
| 8 | 56 | 58.9% | 58.9% | 64.3% | 58.9% |
| 9 | 56 | 69.6% | 73.2% | 76.8% | 73.2% |
| 10 | 62 | 62.9% | 66.1% | 64.5% | 71.0% |
| **Total** | **347** | **65.4%** | **67.4%** | **68.6%** | **67.4%** |

SP+ pulls ahead primarily in weeks 7–9. All tested systems struggled in Week 8.

## 3. Why CFMI accuracy looks worse than 2025

To compare like with like, run the **same deployed CFMI model** over **Weeks 5–10** in both seasons, with team ratings recomputed before each game week.

| Metric | 2025 Weeks 5–10 | 2026 Weeks 5–10 |
|---|---:|---:|
| Eligible FBS games | 321 | 347 |
| Winner accuracy | **71.3% (229/321)** | **65.4% (227/347)** |
| Mean expected favorite win probability | 69.4% | 69.5% |
| Mean winner-probability error (Brier) | 0.1941 | 0.2173 |
| Mean log loss | 0.5696 | 0.6225 |
| Margin MAE | 12.46 points | 12.71 points |
| Actual upsets over favored teams with model win probability >=70% | 28 | 43 |

**Interpretation:** CFMI's average favorite confidence was almost identical in 2025 and 2026, but the 2026 favorites won less often. This supports the hypothesis that unexpectedly difficult outcomes contributed to the decline. However, the design does *not* independently establish that 2026 was unusually unpredictable for every model versus its own 2025 results. Other factors such as preseason-strength advantages, changed FBS schedule composition, and field/home effects remain hypotheses, not proven causes.

## 4. Paired uncertainty and what is *not* established

Accuracy advantages are modest at the available sample size.

| Compared to CFMI | CFMI right and competitor wrong | Competitor right and CFMI wrong | Two-sided discordant-game sign test |
|---|---:|---:|---:|
| SP+ | 15 | 26 | p ≈ 0.117 |
| ESPN FPI | 20 | 27 | p ≈ 0.382 |
| FEI | 30 | 37 | p ≈ 0.464 |

The tests do not demonstrate a statistically clear long-run difference at the conventional 5% threshold. Games share teams/weeks, so even a paired sign test is not a full clustered uncertainty analysis. Do not claim CFMI is *better* than any of these systems based on this sample; **its observed performance so far is lower**.

For winner-only metrics, the 2026 figures are based on **2026 games reconstructed from pregame source-dated archives**, not frozen original-publication API captures. We required BOTH the archive snapshot date and the original source date to predate the first kickoff of the assessed week. Archives were complete (138 team ratings for each of FPI, SP+, FEI for every tested week), with zero rejected future-original-source-date records. Full fixture coverage was 347/347 for all systems.

### External rating dates used

| Game week | Source date for FPI/SP+/FEI |
|---|---|
| Week 5 | September 29, 2026 |
| Week 6 | October 6, 2026 |
| Week 7 | October 12, 2026 |
| Week 8 | October 19, 2026 |
| Week 9 | October 26, 2026 |
| Week 10 | November 2, 2026 |

[Archived external rating data and attribution (CFB TXT)](https://cfbtxt.com/data/) · [Raw 2026 historical ratings CSV](https://cfbtxt.com/data/ratings_snapshots/2026/historical_ratings.csv).

## 5. Statistical research recommendations

1. **Maintain model independence.** No reason to inject FPI/SP+/FEI, school reputations, or conference priors into CFMI's original season-only rating to chase a few percentage points in the same sample.
2. **Separate three possible causes of misses:** inaccurate team strength, badly calibrated home advantage, and uncertainty in outcomes/close games. Use team-week opponent coverage and actual expected-margin errors; do not rely on winner accuracy alone.
3. **Improve diagnostic reporting:** include per-week matched accuracy against competitors, true prospective source capture identifiers, point-spread MAE, confidence intervals and performance by projected favorite confidence and neutral/home/away splits.
4. **Pre-register future upgrades:** use genuinely untouched 2026 Week 11 onward results for evaluation of existing *frozen* models; avoid retuning based on 2026 Weeks 5–10 and then claiming those same games demonstrate superiority.
5. **Test whether preseason strength knowledge is the tradeoff:** FPI/SP+ commonly include a preseason component, unlike CFMI's deliberate neutral start. A *separately branded* counterfactual model can quantify the cost of season-only independence without changing the original goal.
6. **Evaluate matchup-level offense vs defense style and recent form** with temporal regularization, conservative leakage checks, and multiple-season walk-forward validation. Improvements need to outperform a simple baseline and a frozen V5.1 comparison.

**Key finding:** CFMI Power V5.1 has achieved **65.4%** against SP+ **68.6%**, FPI **67.4%**, and FEI **67.4%** on the identical 347 games. The sample does not prove a stable long-term ranking of prediction systems, and no new CFMI weight changes are justified solely by this backtest.
