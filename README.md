# College Football Merit Index — CFMI V5

**Public dashboard:** https://randomquestions-projects.github.io/college-football-merit-index/  
**Status:** V5 upgrade lives on feature branch `feature/weekly-history-and-matchups`; production currently stays on V4.1 until the full GitHub Actions evaluation and browser audit pass and the pull request merges.  
**Research design:** [CFMI V5 statistical methodology audit](docs/CFMI_V5_statistical_design_review.md)

CFMI is a **season-only, brand-neutral college football assessment** with two different answers:

**Merit** — *What has a team actually earned through its season's results?*  
**Power** — *How good is the team in a hypothetical future matchup?*

Neither final score uses AP/CFP votes, FPI, SP+, FEI, recruiting, preseason rankings, bookmaker lines, conference prestige, or the school's name to allocate ranking points. External systems are comparison-only.

## V5 index formulas

### Merit — normative résumé criterion, not trained to predict the next winner

| Factor | Weight | Interpretation |
|---|---:|---|
| Schedule-adjusted results | **75%** | Actual wins minus expected wins for a neutral top-25-strength benchmark facing the same schedule; an opponent/venue-adjusted season achievement |
| Residual quality of results | **15%** | Game outcome surprise weighted by strong-opponent difficulty, then residualized against overall WAB to reduce double counting |
| Opponent-adjusted game control | **10%** | Diminishing-return scoring-margin evidence with venue/opponent context and games-played shrinkage |

Per-game expected results already adjust venue and opponent strength. **V5 removes V4's arbitrary 1.52× road and 1.16× neutral signature-win multipliers** from scoring; diagnostic views may still display the old quality statistics, clearly labeled as such. Margin and advanced efficiency no longer dominate a result-focused résumé. Historical weekly benchmarks are recalculated using **only games before that week's cutoff**, rather than borrowing later game results.

Merit factor score transformations are documented in `site/model_v5.js`. Its 75/15/10 weights are intentionally values-based **research assumptions**; they are not asserted to be mathematically optimal or calibrated against polls. There is no objectively observed “correct résumé rank” training label. Validation should emphasize transparent counterfactuals and blinded expert pairwise judgements, not next-game accuracy alone.

### Power — predictive strength on an expected-points scale

A season-only neutral-start, regularized SRS + Elo power baseline estimates relative game strength. Additional **opponent-adjusted, shrinkage-corrected** net EPA/play, play success rate, and explosive rate enter only when **2024 weekly training and 2025 out-of-time validation** establish incremental predictive value beyond the simpler baseline.

Conceptually:

```
Power margin vs. average FBS team (points)
  = fitted baseline coefficient × season-only SRS/Elo strength
    + clipped [EPA coefficient × adjusted net EPA
               + success coefficient × adjusted net success rate
               + explosive coefficient × adjusted net explosive rate]

Power Index (0–100) = clip(50 + 1.6 × Power points, 0, 100)
```

**A Power index point is not a win probability.** The matchmaking pipeline uses underlying points ratings (plus 2.5 points for the home venue when applicable), then a historical logistic calibration fitted on 2024 and evaluated on 2025. Only verified probabilities appear; otherwise the view shows a directional winner pick without a percentage.

We fit ridge-regularized coefficients with constrained ranges to control highly correlated play-quality signals. If the holdout log loss does not beat the baseline, or margin error meaningfully worsens, the deployed parameters revert to the baseline rather than assuming additional complexity is always better. The published `site/data/model_v5_params.json` and `site/data/backtest_v5.json` include the objective validation results, accepted/rejected choice, sample sizes, data coverage, fitted parameters, and training/validation years. **Model selection on 2025 means 2025 is no longer a pristine final benchmark for any future V5 tuning**; a new season or later disjoint holdout is needed for an unbiased further assessment.

### Data and uncertainty

- All models use **2026 completed-game observations** as of the published weekly cutoff; 2024 historical results are used only to fit general coefficient and probability-scale parameters, not to seed team or conference rankings.
- League-wide advanced data coverage and each team's actual number of measured games are displayed. Missing data trigger conservative shrinkage or a baseline-only fallback, rather than invented advanced statistics.
- Sparse early-season game schedules produce uncertain relative team strengths. Current site exposes a low/moderate/season-sample evidence label; the label is qualitative, not an unearned confidence interval.
- Opponent adjustment is cross-sectional and recomputed as of each period. Strong opponents' future outcomes can change **a later** rank but cannot leak into **an earlier** historical snapshot.

## Six dashboard tabs

| Tab | Behavior |
|---|---|
| **Rankings** | Current-week Merit or Power Top 25/50/All FBS, sorting, full team breakdown |
| **Compare Rankings** | Both CFMI rankings vs. AP, CFP, ESPN FPI, SP+ and FEI, with filters and separately dated sources |
| **Compare Teams** | Up to five teams, résumé/performance metrics, wins and common opponents |
| **Historical Results** | Two Top 25 movement tables (Merit and Power) plus week selection and full-team season-to-date ratings |
| **Matchups** | Next week's verified FBS-vs-FBS schedule, both CFMI scores, Power-based winner/optional probability, statistical comparison and three actionable keys |
| **Methodology** | V5 formulas, validation, source lineage, limits and archived V4.1 reference methodology |

**Historical integrity:** V5 historical results are *reconstructed as-of cutoff* using all completed games then and currently available source files, not a claim to reproduce the exact published bytes and original source-release times from earlier dates. The next improvement is an immutable archive of weekly original publications with dated source versions and model SHAs.

## Build and verification

The [GitHub Actions workflow](.github/workflows/publish.yml) downloads 2026 public schedules and enriched advanced team-game data, validates historical seasons, fits/validates V5, produces weekly data and predictions, audits score/rank and cutoff invariants, runs V4 benchmarks and Chromium smoke checks, then publishes only after all gates succeed on `main`. A pull request invokes the same checks **without deploying** the site.

```sh
# Run once source data from the normal data-refresh job are present:
node scripts/train_v5.cjs
node scripts/build_weekly_views.cjs
node scripts/audit_dashboard.cjs
```

---
## Archived CFMI V4.1 methodology (superseded after V5 deployment)

The historical information below describes V4.1 for auditability. Its 30/20/15/35 Merit and 65/20/10/5 Power percentages are **not V5 production methodology**.

### Archived original README — CFMI V4.1

**Public dashboard:** https://randomquestions-projects.github.io/college-football-merit-index/

A reproducible, independent, season-only assessment of two distinct things: **Merit (what teams have earned)** and **Power (how strong their repeatable performance appears)**. Includes every FBS team, an interactive seven-system ranking comparison, a five-team résumé analysis, and a separate Methodology and Data Lineage page.

## Four main tabs

1. **Rankings (home):** Concise introduction to Merit vs. Power and a first-class switch between two independently scored FBS rankings, with Top 25/50/All, national sorting, coverage and full team drilldowns. No long-form methodology on the home page.
2. **Compare Rankings:** Interactive, sortable ranks for **CFMI Merit, CFMI Power, AP Top 25, CFP Top 25, ESPN FPI, Bill Connelly's SP+, and Brian Fremeau's FEI**. Select the baseline Top 25/50/All FBS cohort, search teams, filter conference, sort columns, and choose an outside ranking for Merit and Power rank-delta columns. All external sources include the original dated rating snapshot and never influence CFMI.
3. **Compare Teams:** Select up to five teams to evaluate ratings, signature wins, road performances, schedules and common opponents. [#resume](https://randomquestions-projects.github.io/college-football-merit-index/#resume)
4. **Methodology:** Both formulas and their limits, all variables/weights and adjustments, data lineage, automatic source checks, historical validation, and caveats. [#methodology](https://randomquestions-projects.github.io/college-football-merit-index/#methodology)

### External-rankings provenance (comparison only)

- **ESPN FPI:** source team-strength ratings from ESPN (2026), accessed through the [CFB TXT public rating snapshots](https://cfbtxt.com/data/ratings_snapshots/2026/historical_ratings.csv). [Original FPI](https://www.espn.com/college-football/fpi).
- **SP+:** Bill Connelly's tempo- and opponent-adjusted efficiency ratings, sourced from the same *dated* historical snapshot. [Original SP+](https://pay.cfbupdate.com/sp-ratings).
- **FEI:** Brian Fremeau's opponent-adjusted non-garbage possession-efficiency ratings, same dated snapshots. [Original FEI](https://bcftoys.com/2026-fei/).
- **AP and CFP:** separate official poll snapshots retrieved through the public ESPN rankings feed; **only Top 25** places are known. “NR” means outside that published Top 25, not outside every ranking system.

The external snapshot CSV has separate `snapshot_date` and original `source_date` fields; we preserve both. These rankings might lag CFMI by days; do not assume the listed teams were evaluated through the same games. Ranking gaps measure **disagreement**, not proof that one model outperforms another. Historical held-out game predictions are the separate evaluation method.

The action `scripts/update_external_rankings.py` refreshes all three outside power ratings on every scheduled site build, validates 2026 season, numeric ranks, dates and national team coverage, and writes `site/data/external_rankings_2026.json`. If an external feed is temporarily inaccessible, the system keeps the last verified public external snapshot with its original dates (if available), rather than blocking CFMI's own refresh or inventing rankings.

## Two different methodologies — NOT two weights on the same résumé

### CFMI Merit: who has earned the strongest season?

| Independent Merit factor | Overall weight |
|---|---:|
| Wins above schedule expectation + winning percentage | **30%** |
| Opponent- and venue-adjusted margin | **20%** |
| Quality victories and quality road wins | **15%** |
| Opponent-adjusted efficiency, drives and consistency | **35%** |

Merit intentionally rewards actual game outcomes and résumé achievements. Opponent power feeds schedule-quality estimates, but a large marquee win or difficult road victory earns added credit because it was actually achieved. An ugly loss matters even when it doesn't say much about a team's true talent.

### CFMI Power: who looks stronger in a future neutral-field matchup?

| Independent Power factor | Overall weight |
|---|---:|
| Season-only opponent-strength baseline (regularized SRS/Elo) | **65%** |
| Opponent-adjusted net EPA/play (offense and defense) | **20%** |
| Opponent-adjusted play success rate | **10%** |
| Opponent-adjusted explosive-play rate | **5%** |

The first 65% itself consists of 78% season-only regularized, venue-adjusted scoring margins and 22% neutral-start Elo. **Effective overall Power contributions are 50.7% SRS, 14.3% Elo, 20% EPA, 10% success and 5% explosive-play rate**. No signature-win bonus, no extra road-win credit, no record-above-benchmark award, no conference bonus, and no preseason ratings enter the *final predictive Power score*. Partial advanced measurements are shrunk toward neutral; when core EPA coverage is too low, Power is labeled a baseline-only fallback.

Why this matters: if Utah earns more quality wins than Alabama, Utah can rank higher in **Merit**. If Alabama has stronger opponent-adjusted performance and margin power, Alabama can rank higher in **Power**. Neither ranking is automatically right or wrong; they ask different questions.

**Avoiding circularity:** The underlying SRS/Elo opponent-strength *baseline* is used for both ratings and schedule quality; its rank is an internal diagnostic (not the public predictive Power Rank). Merit is calculated independently. The final predictive Power Rank is calculated afterward, using adjusted EPA, success and explosiveness, and **does not feed back into Merit or opponent-strength calculations**. AP and CFP are always compared to Merit, never fed into either score.

**Predictive validation and caveat:** Predeclared Power blends were compared on 2024 and 2025 held-out next-week FBS games. A 65/20/10/5 blend was a conservative compromise: compared with the baseline alone, it improved the fixed-scale probability-score diagnostic on both seasons, with very similar winner-selection accuracy. Adding too much advanced efficiency reduced predictive accuracy. This is exploratory two-season evidence, not proof that the weights are optimal. A 0–100 Power score is **not a calibrated win probability or point spread**. It estimates relative ability; actual matchup predictions would require a separately calibrated mapping.

## Detailed Merit V4 weighting

| Component | CFMI V4 |
|---|---:|
| Strength of record: 85% wins above an independently inferred top-25-power benchmark, 15% win% | **30%** |
| Venue- and opponent-adjusted scoring margin, diminishing blowout returns | **20%** |
| Opponent-strength quality victories and quality road wins | **15%** |
| Opponent-adjusted on-field efficiency | **35%** |

Within the 35-point on-field category:

| Metric | Overall points |
|---|---:|
| Offensive and defensive EPA/PPA | 10 |
| Offensive and defensive positive-EPA play success | 7 |
| Offensive and defensive explosiveness | 5 |
| Consistency in adjusted EPA | 4 |
| Neutral-state possession win probability (non-garbage plays) | 3 |
| Actual points per meaningful drive reaching opponent's 40 | 2 |
| Actual touchdowns per red-zone drive reaching opponent's 20 | 1 |
| Expected turnover margin / shrunken raw turnovers | 2 |
| Penalty yards differential | 1 |

### How opponent strength is inferred

A season-only regularized margin **SRS/Massey-style** model iteratively considers every FBS opponent and opponents' opponents. Margin contributions are capped smoothly, with 2.5 points of home advantage. Ratings start at zero for every team.

In parallel, a season-only **Elo** calculation starts every FBS program from the same neutral 1500 rating. Game results update Elo using the FIDE-like `K × (outcome − expected)` rule, a capped margin multiplier, 55 Elo home advantage and a modest K-factor reduction as the season progresses. No past-season ratings enter Elo.

The internal opponent-strength baseline blends SRS margin power (78%) and neutral-start Elo results (22%). **“Top-25 opponent” in the Merit game ledger refers to this underlying independent opponent baseline**, not the public predictive Power composite, AP/CFP or brand reputation. Public Power adds opponent-adjusted EPA, success and explosiveness after Merit has been calculated. Conference labels are never model inputs.

A road victory receives 1.52× the opponent-quality win credit; neutral receives 1.16×. A win over a very good team earns much more than a win over a weak FBS team; FCS wins get zero signature-win credit. FCS wins count as W–L wins but contribute little evidence of superior play.

A narrow loss to an elite team still counts as a loss; schedule-adjusted expected wins and margin soften the penalty compared to losing to a weak opponent. There is no bonus for losing.

### Adjusted on-field play

Every offensive/defensive metric is evaluated against what the **opponent produced or allowed in its other games**, not just raw efficiency. For a team-game:
- Adjusted offense = observed offense + 0.80 × (league-average opposing defense − opponent's leave-one-matchup-out defense baseline)
- Adjusted defense = observed defense + 0.80 × (league-average opposing offense − opponent's leave-one-matchup-out offense baseline)

The opponent baseline uses two league-average pseudogames to stabilize small samples. Expected turnover margin is preferred to the much noisier realized turnover differential.

When a statistic is missing, the model uses the available measurements rather than discarding all others. Each separate metric is shrunk toward neutral percentile 50 according to that team's actual measured-game share. National core EPA coverage below 70% triggers a conspicuously labeled résumé-only fallback. The published dashboard shows **core offensive+defensive EPA coverage** — not just a quarter-score record.

**New validated possession metrics (Nov. 2026):** We now ingest the 2026 SportsDataverse play-by-play Parquet and use a neutral-state game win-probability model trained on **2023 only**. Its only features are score differential, clock, possession and field position—no team, conference, historical power, betting spread, poll or ESPN WP. On 2024 and 2025 unseen seasons, held-out Brier scores were **0.13654** and **0.13445**, respectively (0 best). We average the predicted win probabilities across meaningful possessions for game control; snaps outside the independent 3–97% WP window are excluded from the main EPA, success and explosive measures. Explosiveness uses observed 12+ yard runs and 16+ yard completed passes rather than the ESPN advanced box-score denominator. Drive finishing is scored as **2 overall points** for actual scored points per meaningful drive reaching the opponent's 40, and **1 overall point** for actual touchdowns per meaningful drive entering the red zone (opponent's 20). Both are adjusted against the opponent's other games. These scores are adjusted against opponent baselines just like the other on-field metrics.

**Known limits:** Control is a fitted *state-based* win-probability estimate, not the published ESPN win-probability model, not possession time, and not a literal clock-weighted lead percentage. It is averaged over possessions. Our 3–97% garbage-time cutoff and 40-yard scoring-opportunity definition are transparent assumptions. Red-zone touchdown conversion is part of the 3% finishing category (one-third of it); scoring-opportunity points per drive are the remaining two-thirds. V4 coefficients are research hypotheses, not a fully optimized historical model. Cross-conference opponent quality is less certain when few cross-conference games have been played.

## Historical validation — preliminary

We added a **walk-forward 2024–25 backtest** in `scripts/backtest_v4.cjs`. For each held-out week, the model uses only games completed in prior regular-season weeks. It compares V4 against the previous V3 weighting/formula, a season-only Elo signal, the independent opponent-power signal and simple win percentage. AP/CFP are not considered.

| Held-out season | Games | CFMI V4 winner accuracy | CFMI V3 winner accuracy | Opponent-power signal | Elo signal |
|---|---:|---:|---:|---:|---:|
| 2024 | 481 | 69.4% | 66.1% | 70.5% | 68.6% |
| 2025 | 490 | 70.8% | 69.2% | 71.8% | 68.2% |

The 2024 and 2025 live-data audit also saves `site/data/backtest_v4.json` on every deployment. Mean week-to-week Top-25 overlap for V4 was 21.875 and 20.875 teams respectively across evaluated weeks.

**Interpretation:** This is encouraging but limited evidence. The opponent-power signal alone has slightly higher future-winner accuracy than V4, which is expected because V4 intentionally rewards *results earned*, not just forward-looking power. This does not prove V4 is the best possible résumé ranking. The test contains only two seasons, and the Brier score shown in its JSON uses a fixed, uncalibrated logistic scale; these percentages are not verified win probabilities. Parameters have **not** been optimized on those years, avoiding in-sample overfitting.

## Scheduled refresh and publication

The workflow [.github/workflows/publish.yml](.github/workflows/publish.yml) publishes a refreshed, validated static dataset and site on **Sunday at 9 AM America/New_York** (DST-aware), and checks for updated AP/CFP polls on Sunday evening and Tuesday night. Pushing changes to `main` also triggers publication. GitHub scheduled jobs may be delayed.

Site and data are generated and deployed through GitHub Actions; no manual CSV imports, user registration, API keys or private chat data are needed. `scripts/audit_dashboard.cjs` verifies all team scores and the game feed using the same JavaScript engine as the browser.

### Sources

- [SportsDataverse/cfbfastR schedule and final scores](https://github.com/sportsdataverse/cfbfastR-data/blob/main/schedules/csv/cfb_schedules_2026.csv)
- [SportsDataverse ESPN advanced-team, situational, turnovers, linescores, drives and complete play-by-play](https://github.com/sportsdataverse/sportsdataverse-data/releases)
- [Massey — rating and schedule-adjustment methodology](https://masseyratings.com/faq.php)
- [Massey's NCAA model description](https://www.ncaa.com/_flysystem/public-s3/images/2024/10/30/massey.pdf)
- [BCF Toys — FEI opponent-adjusted non-garbage possessions](https://bcftoys.com/2025-fei)
- [FIDE — chess Elo ratings and K-factor](https://www.fide.com/docs/regulations/ARB%20Manual%202020.pdf)

The V4.1 implementation is an original blend. No SP+, FEI, FPI, AP or CFP numerical ratings enter either CFMI ranking. This repository contains football data, public code and formulas only, **not the ChatGPT conversation or account credentials**.

## Development

```bash
python scripts/update_data.py
python -m pip install numpy duckdb
python scripts/train_neutral_wp.py
python scripts/update_possessions.py
python scripts/update_polls.py
python scripts/update_external_rankings.py
node scripts/audit_dashboard.cjs
python -m http.server --directory site 8000
```

Open http://localhost:8000/ after generating data. V4 data model is isolated in `site/model_v4.js` so methodology changes can be made without changing the permanent website URL. Audit output is saved in `site/data/cfmi_ranking_audit.json`.
