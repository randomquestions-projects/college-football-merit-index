# CFMI V5 statistical design review — 2026-11-08

**Status:** research/design recommendations, NOT deployed V5 model weights. Current live/index engine remains CFMI V4.1 until a separately audited replacement beats predeclared gates.

## Goals: two deliberately different target quantities

- **Merit (deservedness):** a retrospective evaluation of season-to-date achieved wins, opponent quality, away/neutral difficulty and the schedule actually played. A difficult win is valuable even if repeatable play was unconvincing. An impressive loss cannot be relabeled as a win.
- **Power (repeatable ability):** an opponent-adjusted estimate of expected strength in the *next* game on neutral ground, ideally expressed on a points-per-game scale and translated to calibrated venue-specific win probabilities.
- Both must remain **season-only and independent of AP, CFP, FPI, SP+, FEI, betting lines, brand names and conference labels** in their scoring inputs. Those external values are allowed only in comparison/validation.

## Existing deployed V4.1 — independently verified from source

Merit = 30% Strength of Record (85% WAB percentile, 15% winning-percentile) + 20% capped opponent-adjusted margin percentile + 15% quality/road-win percentile + 35% adjusted on-field performance percentile (EPA 10, success 7, explosion 5, consistency 4, possession control 3, finishing 3, expected turnovers 2, penalties 1).

Power = 65% SRS/Elo opponent baseline percentile + 20% adjusted net EPA percentile + 10% adjusted success percentile + 5% adjusted explosive-play percentile. The 65% baseline is 78% SRS + 22% season-neutral Elo, i.e. 50.7% SRS and 14.3% Elo in the overall mix.

The published 2024–25 backtest reports 69.4% and 70.8% winner selection for the *Merit* V4 score, against 70.5% and 71.8% using the independent baseline opponent-power signal. This is **not a validated comparison of V4.1's full Power index against FPI/SP+/FEI**, and fixed logistic probability-score diagnostics in its backtest are **not calibrated win-probability scores**. Any tuning and assessment on the same 2024–25 years requires an additional outer test season.

## Expert audit and prioritized changes

1. **Biggest issue: Merit is still too Power-like.** 55% of Merit comes from margins and on-field metrics, and its 30% record term includes a percentile-adjusted winning percentage alongside WAB. This can promote a dominant loser over a team with superior achieved wins. Preserve adjusted margin/control as *small secondary tie-breakers*, not the main task.
2. **Double-counting within Merit.** WAB already adjusts for opponent and location. The 15% separate signature/road component rewards some of the same opponent/venue difficulty again. Prefer one integrated game-by-game expected-achievement score; if adding a road premium, quantify its **incremental** effect not already incorporated in the expected-win baseline.
3. **No formally anchored strength-of-record scale.** Present WAB as additional wins relative to a fixed reference team (e.g. a benchmark top-25 team, trained exclusively on earlier seasons), and compare each game's realized binary result with that benchmark win probability. Freeze benchmark definition across weeks. Percentiles redefined weekly obscure absolute change.
4. **A precise default Merit prototype:** 75% game-level WAB/record-achievement composite, 15% wins against strong opponents *beyond* baseline expected difficulty (residualized bonus), 10% opponent-adjusted game-control evidence. Explicitly keep win/loss outcomes the primary driver and penalize losses relative to the schedule. **These are starting hypotheses, not statistically proven optimal weights.**
5. **Power uses overlapping performance signals.** Adjusted margin, EPA, success and explosive rate all measure correlated play performance. Redundancy can make coefficients unstable and inflate confidence. Fit ridge/elastic-net or a hierarchical latent-strength model and inspect collinearity, shrinkage and leave-season-out stability. Keep a simpler model if incremental gains fail.
6. **Power's percentile 0–100 score is not in football units.** Prefer an underlying continuous latent strength in **neutral-field expected margin points** and use a fixed monotonic display scale separately. A 10-point index gap should have a stable historical meaning. Add offensive, defensive, and special-teams components only when reliable observed data support each.
7. **Start-of-season is under-identified in a neutral-start approach.** Preserve the season-only policy, but publish a wider uncertainty interval at low sample counts. Dynamic shrinkage to neutral must vary with number, connectedness and quality of opponents faced; do not award artificial precision for 2 games. A preseason prior would improve predictive power but violate the chosen brand principle, so treat it as a separate counterfactual benchmark rather than silently adding it.
8. **Matchup forecasting is a distinct calibrated output.** Define the neutral rating gap, then add an empirically estimated home-site advantage (potentially varying by season or geography). Fit logistic/probit outcome calibration on previous years only. Produce win probability and projected margin *only after* verified historical calibration. Current matchup UI intentionally shows a directional Power pick without claiming calibrated percentages.
9. **Data leaks and selection effects.** Every historical feature, opponent average, benchmark normalization and model parameter must be frozen at a strict snapshot cutoff. Filter advanced-play observations via eligible game IDs, never just the team-season aggregate. Store data-source publication timestamps and model SHAs. Advanced coverage thresholds and metric missingness should be reported at every snapshot. Late data revisions imply reconstructed-as-of history ≠ literally archived-on-date history.
10. **Validation must match each objective.** Predictive Power: walk-forward winner accuracy, Brier, log loss, expected-margin MAE/RMSE, calibration curves, home-vs-road slices, FBS-FBS-only slices, conference crossover games, early vs late season, top-25 matchups, and coverage cohorts. Merit: independent résumé audit, rank stability, head-to-head and common-opponent contradiction analyses, schedule counterfactual tests and a blinded expert pairwise ranking assessment. **Do not optimize Merit to next-week accuracy** or maximize correlation with AP/CFP.
11. **Predeclare testing gates.** Hold out an untouched final season after training and calibration, compare with current V4.1 and simple SRS/Elo using matched games, paired bootstrap confidence intervals grouped by week, and report false improvements. Sensitivity-test WAB benchmark top-5/top-10/top-25, venue premium, garbage-time rules and time-decay.
12. **Differentiate through explainability and uncertainty, not arbitrary formula complexity.** Show score contribution of each earned result, incremental road/quality win credit after controlling for difficulty, opponent-adjustment chain, uncertainty bands, calibrated probability reliability, model-version changes, and week-over-week drivers. Publicly label late-data revisions.

## Weekly history and fixture release introduced in this branch

- The new `scripts/build_weekly_views.cjs` re-runs the **unchanged V4.1 formula** for each 2026 week, only using finalized games before that week's cutoff and only advanced team-games corresponding to eligible games.
- `site/data/weekly_views_2026.json` is produced by the GitHub Actions deployment after all source data are refreshed; it includes every FBS team's seasonal W/L, Merit/Power ranks and scores, component signals, coverage, the underlying cutoff timestamp, source-generation time, and the next eligible slate.
- The Historical Results tab has separate Merit and Power top-25 movement panels and a selectable full-FBS score table for each saved week. These are **reconstructed histories under current V4.1 rules and source data**, not a claim that the same exact output was available live on past Sundays.
- The Matchups tab displays all scheduled next-week FBS-versus-FBS games found in the verified schedule, both scores/ranks, and a directional venue-adjusted Power selection. Its explanations reference the actual compared team metrics. No invented odds, betting spread, injury knowledge, or probability.
- **Recommended next version:** write immutable weekly release files at publication time, commit or archive every week's source hashes and full model output, use dated inputs with actual `source_published_at` when historical data is revised, and add version-selectable `V4.1-as-reconstructed` versus `V5-as-published` histories.

## Public statistical/methodology references

- ESPN FPI and Strength of Record definitions: https://espnpressroom.com/feature/heres-playbook-stats-info-explains-football-power-index-terminology/
- Bill Connelly's predictive SP+ explanation and résumé SP+ treatment: https://pay.cfbupdate.com/sp-ratings
- Brian Fremeau's FEI: https://bcftoys.com/
- Massey ratings and methodology: https://masseyratings.com/faq.php
- CFMI own published V4.1 baseline/backtest: `README.md`, `site/model_v4.js`, `scripts/backtest_v4.cjs`

**Non-goal:** mimic poll decisions, tune the model to produce intuitive top-25 teams, or claim that its scores are guaranteed better than third-party rating systems before a fair held-out comparison.
