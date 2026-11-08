# College Football Merit Index — CFMI V4

**Public dashboard:** https://randomquestions-projects.github.io/college-football-merit-index/

A reproducible, independent, season-only assessment of college-football **merit and quality of play**. Includes every FBS team, an AP/CFP Top 25 comparison, and interactive **up-to-five-team résumé comparisons**.

## Three views

1. **CFMI Rankings:** All FBS and Top 25/50, opponent-adjusted score components, sortable metrics, and game-by-game team audit with opponent strength, venue, game quality and data completeness.
2. **AP / CFP Comparison:** CFMI vs the dated latest available AP and CFP Top 25; publication dates and rank deltas. Polls **never influence CFMI**.
3. **Compare Team Résumés:** Select one to five teams at a time. View quality wins, opponent-strength power, close losses, home/away results, adjusted margin, EPA, national rank comparisons, common opponents and explainable head-to-head narratives. Direct link: [#resume](https://randomquestions-projects.github.io/college-football-merit-index/#resume).

## V4 weighting

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

In parallel, a season-only **Elo** calculation starts every FBS program from the same neutral 1500 rating. Game results update Elo using the FIDE-like \`K × (outcome − expected)\` rule, a capped margin multiplier, 55 Elo home advantage and a modest K-factor reduction as the season progresses. No past-season ratings enter Elo.

The internal opponent-power signal blends SRS margin power (78%) and neutral-start Elo results (22%). **“Top-25 opponent” means top 25 by this internally derived, same-season signal**, not AP/CFP or brand reputation. Conference labels are never model inputs.

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

The workflow [.github/workflows/publish.yml](.github/workflows/publish.yml) publishes a refreshed, validated static dataset and site on **Sunday at 9 AM America/New_York** (DST-aware), and checks for updated AP/CFP polls on Sunday evening and Tuesday night. Pushing changes to \`main\` also triggers publication. GitHub scheduled jobs may be delayed.

Site and data are generated and deployed through GitHub Actions; no manual CSV imports, user registration, API keys or private chat data are needed. \`scripts/audit_dashboard.cjs\` verifies all team scores and the game feed using the same JavaScript engine as the browser.

### Sources

- [SportsDataverse/cfbfastR schedule and final scores](https://github.com/sportsdataverse/cfbfastR-data/blob/main/schedules/csv/cfb_schedules_2026.csv)
- [SportsDataverse ESPN advanced-team, situational, turnovers, linescores, drives and complete play-by-play](https://github.com/sportsdataverse/sportsdataverse-data/releases)
- [Massey — rating and schedule-adjustment methodology](https://masseyratings.com/faq.php)
- [Massey's NCAA model description](https://www.ncaa.com/_flysystem/public-s3/images/2024/10/30/massey.pdf)
- [BCF Toys — FEI opponent-adjusted non-garbage possessions](https://bcftoys.com/2025-fei)
- [FIDE — chess Elo ratings and K-factor](https://www.fide.com/docs/regulations/ARB%20Manual%202020.pdf)

The V4 implementation is an original blend. No SP+, FEI, AP or CFP numerical ratings are fed into it. This repository contains football data, public code and formulas only, **not the ChatGPT conversation or account credentials**.

## Development

\`\`\`bash
python scripts/update_data.py
python -m pip install numpy duckdb
python scripts/train_neutral_wp.py
python scripts/update_possessions.py
python scripts/update_polls.py
node scripts/audit_dashboard.cjs
python -m http.server --directory site 8000
\`\`\`

Open http://localhost:8000/ after generating data. V4 data model is isolated in \`site/model_v4.js\` so methodology changes can be made without changing the permanent website URL. Audit output is saved in \`site/data/cfmi_ranking_audit.json\`.
