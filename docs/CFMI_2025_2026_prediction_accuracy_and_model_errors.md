# CFMI prediction accountability — 2025 and 2026

**Model:** V5.2 opponent-adjusted Power with V5.3 Talent & Continuity prior that decays to zero after five completed FBS games. **Study:** reconstructed week-ahead regular-season FBS-versus-FBS predictions using data cut off before the week's first kickoff. **Merit:** never used to choose the projected winner.

## Historical Matchups tab

The Matchups dashboard supports **Season** (2025 / 2026) and **Prediction week** (all observed regular-season weeks, plus upcoming 2026). Selecting a completed week shows every fixture's:

- before-game opponent-adjusted Power and Merit scores/ranks, projected winner, expected point margin, estimated winner probability and before-game team performance;
- final score, actual winner, correct/incorrect result, three model-based keys, and side-by-side pregame team metrics;
- a weekly correct/incorrect record, accuracy, and cumulative season-to-date record through the selected week.

The **current week** shows not-yet-completed FBS fixtures and season-to-date correct/incorrect predictions. Week 1 is based on Week 0 preseason Power; as evidence builds, the Talent & Continuity prior follows the published 100/55/35/20/8/0% decay. No Week 0 Merit ranking is invented.

### Reproducibility and data integrity

The build computes all team ratings using strictly previous-game data: the cut-off timestamp is one millisecond before the first fixture in the game week. The historical ledger includes game ID, week, opponent Power ratings, pregame scoring statistics and projected strength, actual result and the original cutoff. The workflow recomputes and audits the ledger every refresh.

**Crucial:** These historical predictions are *reconstructed* under **today's model version and today's available source releases**, not snapshots cryptographically frozen at the historical publication time. Claims of what *an earlier version* of CFMI actually published are not warranted. Later corrections to source records could change reconstructed past-week outputs. The 2025 results were already used to select some of the current model's coefficients and prior-decay rule; they are model-development, not a pristine blind test.

## Full CFMI model winner forecasts

| Season / coverage | Correct | Games | Accuracy | Brier | Log loss | Mean absolute margin error |
|---|---:|---:|---:|---:|---:|---:|
| **2025, Weeks 1–16** | 556 | 762 | **73.0%** | .1822 | .5406 | 13.09 points |
| **2026, Weeks 1–10** | 397 | 562 | **70.6%** | .1971 | .5780 | 13.42 points |

The denominator is *completed FBS-versus-FBS regular-season games* in the period available. Do **not** conflate these whole-period accuracy rates with earlier reports limited to Weeks 5–10 (no preseason games).

## External metrics and fairness

For 2026, CFMI, FPI, SP+, FEI have 562 identical game-ahead fixtures with complete archive coverage. Rating-based favorites (rather than providers' official game-pick feeds) are compared:

| 2026 Weeks 1–10 | Correct | Accuracy |
|---|---:|---:|
| **SP+** | **409 / 562** | **72.8%** |
| ESPN FPI | 407 / 562 | 72.4% |
| FEI | 407 / 562 | 72.4% |
| **CFMI** | 397 / 562 | **70.6%** |

CFMI and FPI/FEI/SP+ remain separate; external metrics never enter the CFMI model.

### 2025 matched original-dated FPI and retrospective weekly FEI

| 2025 comparison | Games included | Provider correct | Provider accuracy | CFMI correct, same games | CFMI accuracy |
|---|---:|---:|---:|---:|---:|
| **ESPN FPI** weekly original-dated ratings | **664** | 487 | **73.3%** | 481 | 72.4% |
| **FEI** retrospective weekly rating table | 751 | 443 | 59.0% | 550 | 73.2% |
| SP+ | — | — | Unavailable | — | — |

The FPI comparison uses **15 historical source-dated snapshots** (each rating 136 FBS programs). ESPN's 2025 week-1 row was overwritten with December values and is excluded; the first eligible FPI matchup group is Week 3, and thus this covers 664 of 762 full-season FBS fixtures. On exactly those 664 games, FPI gets **six more winners right** than CFMI. The FEI comparison is more uncertain: BCF Toys exposes 2025 weekly FEI team numbers but not an immutable original publish timestamp or its official game-level projected probabilities; the reported 59.0% represents **a neutral-rating-order pick constructed by our study**, not the provider's own scored forecasting system. Its substantial discrepancy requires source/parsing and venue-model review before treating it as an authoritative measure of FEI's predictive quality. No 2025 SP+ weekly point-rating archive passed source checks, and end-of-season SP+ is intentionally never substituted.

**2025 source caveat:** CFB TXT's single 2025 historical snapshot CSV is not published at the same path as 2026. The build instead uses season-specific ESPN FPI weekly rating snapshots with checked as-of/run and update dates, and Brian Fremeau's 2025 weekly FEI tables from BCF Toys. The FEI page contains weekly results but no immutable original publication timestamps; label as *retrospective weekly FEI*, not verified source-date originals. A trustworthy complete 2025 weekly SP+ points-rating archive has not been established. **Never replace missing pregame records with a season-ending rating.** All available 2025 external comparisons use per-provider shared-game samples with CFMI accuracy measured on *those exact games*; if a provider has zero verified records it must say “Not available,” not zero accuracy.

Source links:
- [CFB TXT 2026 archived source-dated FPI, SP+ and FEI](https://cfbtxt.com/data/ratings_snapshots/2026/historical_ratings.csv)
- [SportsDataverse FPI weekly 2025](https://github.com/sportsdataverse/sportsdataverse-data/releases/tag/cfb_fpi_weekly)
- [BCF Toys 2025 weekly FEI archive](https://bcftoys.com/2025-wfei)

### Measured disagreements and areas for improvement

**2026, all 562 matched games:** SP+ gets 50 outcomes correct that CFMI misses, while CFMI gets 38 right that SP+ misses. FPI gets 47 that CFMI misses; CFMI gets 37 that FPI misses. These differences do not automatically prove persistent superiority, but they show our model has identifiable weaknesses.

| CFMI 2026 subperiod | Correct | Games | Accuracy |
|---|---:|---:|---:|
| Weeks 1–4 | **169** | 215 | **78.6%** |
| Weeks 5–8 | 149 | 229 | 65.1% |
| Weeks 9–10 | 79 | 118 | 66.9% |

**The midseason dip matters more than adding additional preseason talent weight.** The prior vanishes after five FBS games; the evidence points us toward improved current-season team strength estimation.

**2026 slices:** CFMI correctly picked 86/149 (57.7%) of predicted close games (absolute model margin at most three points). It was right in 132/156 (84.6%) of games where its predicted favorite had at least 75% estimated probability, compared with 203/227 (89.4%) in 2025. It correctly predicted 56/78 (71.8%) games with an absolute played-opponent SOS gap greater than five model points, compared with 57/72 (79.2%) in 2025. Differences are descriptive, not adjusted for the game population and may reflect 2026 difficulty.

**Counterfactual home-field test:** Tuning a single flat home advantage on 2025 log loss chooses 3.5 points vs the existing 3.54 points; on 2026 this *reduces* accuracy from 397/562 to 396/562 and marginally worsens log loss and MAE. **Do not change the home edge on this evidence.**

## Recommended next model experiments — prioritized

1. **Matchup-style interactions (highest priority):** Predict a game using independently adjusted *home offense versus away defense* and vice versa, with net EPA, successful plays, explosive play rates and scoring-opportunity finishing. Fit a modest residual on top of current Power and verify improvement on *future* games after opponent-adjustment and strength are already included. Risks: double counting and small-sample false discoveries. Interpret offense and defense simultaneously rather than bolting on raw ratings.
2. **Schedule-network reliability:** Audit teams whose apparent efficiency rests on a poorly connected or unusually weak opponent network. Use hierarchical shrinkage and posterior uncertainty instead of manual P4/SEC bonuses. Check cross-schedule games and avoid repeatedly granting extra SOS credit that is already embedded in opponent-adjusted performance.
3. **Changing team strength/recency:** Determine whether later-season misses occur around real changes in QB availability, coordinator/scheme changes or improvements after an early rough start. Test game-level recency weighting with regularization; do not assume recent wins imply momentum.
4. **Confidence calibration and close-game decisions:** Evaluate 50–60%, 60–75% and 75%+ favorites with reliability curves, Brier and log loss. Calibration changes probabilities, not necessarily which team is picked; a better success rate requires better evidence about team differences.
5. **Freeze true pregame outputs:** Save weekly publication-date source hashes, team ratings and pick probabilities *before games begin*. Keep a locked model version and compare in fresh 2026 Week 11+ and subsequent seasons. The 2025 and early-2026 samples already informed model development, so they cannot serve as a pristine final holdout for an upgrade.

### Testing gates

Any new candidate should be scored on exactly the same games as frozen V5.3, with winner accuracy, Brier, log loss and predicted-margin MAE. Evaluate weeks separately; use paired game/week-block bootstrap uncertainty and check 2025/2026 for robustness without declaring reused data independent. Don't add a feature merely because it moves an aesthetically surprising team downward; establish incremental future-game predictive value first.

## Code and published data

- [Pregame matchup ledger builder](../scripts/build_prediction_ledger.cjs)
- [2025/2026 external benchmark and source-date checks](../scripts/benchmark_power_2025_2026.py)
- [2025 FPI and FEI source parsing](../scripts/external_2025_weekly.py)
- [Prediction-error analysis](../scripts/analyze_power_misses.cjs)
- [Browser and model audits](../scripts/smoke_dashboard.cjs)
- Live site publishes `site/data/prediction_ledger_2025_2026.json`, `site/data/power_benchmark_2025_2026.json`, and `site/data/power_miss_analysis_2025_2026.json` when the complete workflow passes.

**Release status:** Peer-review-style research interpretation; the actual dashboard/data changes must pass full GitHub Actions and deploy before being treated as publicly published.
