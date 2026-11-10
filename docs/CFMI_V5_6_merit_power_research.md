# CFMI v5.6: earned dominance and reliable predictive strength

## Scope and non-negotiables

Merit measures what teams earned. Power estimates neutral-field strength. Matchup predictions are secondary. The scoring code **does not use polls, outside ratings, recruiting or preseason projections as Merit inputs**; Power may use an explicitly fading preseason roster prior. The complete raw schedules, advanced game data, possession features, historical backtests and V4 legacy research are retained. No data have been deleted.

The v5.5 baseline remains available at the GitHub commit before this branch. This release updates **Merit** while keeping the core **Power point-scoring coefficients and the home-field/Matchup Predictor formula unchanged**.

## Merit formula

Base Merit: 50% schedule-adjusted record achievement; 20% earned signature FBS victories; 30% opponent-adjusted game performance. Additional bounded head-to-head/FCS corrections remain.

The record component counts actual wins against the expected record of a top-25-caliber benchmark facing the same opponents and venues. Signature victory credit still disproportionately rewards winning against strong FBS opponents. Its old additional 20% road multiplier and 8% neutral multiplier have been removed, because venue already affects the expected-wins benchmark.

The performance component averages completed FBS game evidence: 55% capped opponent/venue-adjusted scoring margin, 20% possession-based control, 15% opponent-corrected net EPA, 7% opponent-corrected offensive/defensive scoring-opportunity finishing, 3% turnover/penalty discipline. The term is then adjusted for games of evidence and mapped onto the 0–100 component scale. Opponent baselines exclude the current game and shrink toward the observed league baseline using two pseudo-games. The scoring-margin component remains the fallback when one measured advanced field is unavailable. FCS blowouts earn no additional positive performance points.

**Deliberate values choice**: against similarly difficult opponents, more convincing sustained dominance earns substantially more Merit. The same game still cannot be counted as a win twice by applying a second venue multiplier.

This is **not** an attempt to maximize next-week prediction accuracy with Merit. Head-to-head is a bounded achievement rule, not a Power override. Early-season Merit remains provisional when the evidence base is insufficient.

## Power: research, evidence and release restraint

The existing Power index is independently derived from regularized scored-margin SRS, chronological Elo, the joint offense/defense opponent-adjusted efficiency network, schedule and underwhelming FCS evidence, an explicitly fading talent/continuity prior, and a historical cross-conference context estimate. This release does **not** add an arbitrary conference bonus or an unvalidated winning-percentage adjustment.

Consistency, drive finishing and possession control have plausible football value, but they correlate with current SRS, EPA, success and scoring performance. The shadow test `scripts/research_v56_power_ablation.cjs` reconstructs each team's observations immediately before its week's kickoff, fits a fixed positive ridge model on 2024 results and evaluates against 2025 and 2026 without changing Power. The study additionally evaluates removing the legacy schedule-reliability penalty. Outcomes are scored with same-game winner accuracy, expected-margin MAE, Brier and log loss, including per-week counts. Archived source releases can be retrospectively revised; 2025 was used in previous model selection, and 2026 has already informed development. Neither is an untouched prospective test set.

`powerEvidenceEffectiveGames` is now a **descriptive opponent-quality-weighted evidence volume**, separate from the mean Power estimate. It is not a Bayesian posterior, rating confidence interval or win probability. We preserve the schedule-reliability scoring penalty until its removal proves consistently beneficial on unseen future games.

## Data and implementation hygiene

`scripts/update_data.py` now writes ingestion-only `dataset_schema_version` metadata rather than falsely declaring `CFMI-4.0.0` and obsolete 30/20/15/35 scoring weights. The active scoring version comes from the scoring engine and its published output contract. Legacy `q`, `qualityScore`, and `effScore` remain available for historical V4 reproducibility, but the v6 public contract marks them excluded. The current ranking table and CSV no longer surface the archived `effScore` composite. Full-FBS audits reconcile active component points and enforce the correct source schema.

## Before future promotion

1. All FBS scores/components, historical weekly cutoffs, game-level audits and browser views must reconcile; missing values must not silently turn into zeros.
2. Compare v5.5 versus v5.6 Merit on identical historical source releases for 2024–2026, including known head-to-head and FCS edge cases. Evaluate ranking principles rather than future wins.
3. Power alternatives must remain research-only unless future genuinely unseen pregame predictions improve without material degradation in point error or probability calibration. Retrospective model selection cannot be claimed as unbiased validation.
4. Maintain frozen pregame snapshots with source hashes for all future weeks.

**Disclosure:** A clean engineering and retrospective model audit does not prove the ranking philosophy is objectively optimal. The confidence that matters most is reproducibility, defensible scoring principles and honest out-of-time performance claims.
