# CFMI v5.5 — Merit integrity and Power cross-schedule calibration

**Scope:** Major-product focus on independent, earned **Merit** and predictive, neutral-field **Power**. Matchup Predictor remains secondary. This version does not use CFP/AP rank or FPI/SP+/FEI as scoring inputs.

## Merit: three improvements

The base Merit model remains 55% schedule-adjusted win achievement, 25% quality/road wins, 20% adjusted FBS scoring performance.

1. **Quality wins:** Increase the `meritScale.qualityPoints` transformation from 20 to **28**. The base score is still a bounded, saturating function of earned opponent quality and road performance, rather than an external poll-based label. An FBS win against a much stronger opponent earns more than a win against a weak opponent; current-season opponent strength comes from the calibrated network. This is a model-design choice, not a causal coefficient estimated on a pristine historical test.
2. **FCS underperformance:** Add a bounded **0 to −5 Merit-point** performance penalty for narrow FCS wins and losses. Winning by 17+ carries no penalty and no extra quality-win credit; one close FCS win can reduce Merit by up to 3.5, and an FCS loss by 4. Avoid rewarding additional blowout margin over already-dominant FCS competition.
3. **Head-to-head:** If two FBS teams are separated by <=3 pre-head-to-head Merit points, have each played >=3 completed FBS games, and the direct winner has >=wins and <=losses than the loser, apply a small **+1.5/−1.5 symmetric adjustment** to that pair. Cap each team's aggregate adjustment at ±3. Retain base Merit before H2H for eligibility; every matchup is processed exactly once, so iteration order cannot create score feedback. A one-game upset does not automatically supersede a season-long résumé.

**Provisional Merit:** Prior to the season's median FBS team having four FBS games, all team national Merit ranks are marked provisional. Even later, a school with fewer than three completed FBS games remains provisional. Week 0 has **no published Merit rank** and Week 1 has **no spurious movement from alphabetically assigned Week 0 ranks**. Provisional teams retain internal sorted research scores, but the public history displays "Provisional" rather than #1, #60, etc. Power is still ranked in preseason because it explicitly uses a roster prior.

## Power: empirical conference-environment context

The neutral-field Power equation remains opponent-adjusted scoring baseline, opponent-adjusted EPA/success/explosiveness, schedule reliability and limited FCS underperformance, with an explicit early-season prior. **No Merit-to-Power feed-through or H2H rank override.**

A second fixed empirical term estimates the systematic component of cross-conference margins unaccounted for by 2024 v5.4 pregame expected margins. This is ridge-shrunk (11 contemporary FBS conference classifications, penalty 3), centered, and scaled at **25%** for current use. The model learns signed adjustments from actual 2024 cross-conference scoring, **not arbitrary P4 brand status**. The correction is applied by actual current school conference after its first completed FBS game. Schools whose league category changed substantially / is too heterogeneous (Pac-12 and FBS Independents) get **0**. Calculated values are exposed under Power point contributions and represented as an empirical context correction, not a separate AP/CFP or prestige prior.

The 2024 fit used reconstructed v5.4 baseline forecasts, whose original Power components were already fitted using 2024: this is **development data**, not an independent test. A conservative 25% factor was selected after inspecting 2025 performance; 2026 outcomes were also examined during development. **No untouched 2025/2026 blind holdout exists**. In isolation on identical 2025/2026 v5.4 game ledgers (before combining with prior changes), a 25% conference correction that activates after one game gave **559/762 (73.36%)** 2025 and **397/562 (70.64%)** 2026 correct picks with lower estimated margin errors. Including an unadjusted first-week offset produced 560/762 and 395/562; do not mix these testing definitions. **The combined v5.5 pipeline's latest regenerated prediction ledger is the authoritative final result.** Changing any one coefficient merely to make Tennessee outrank Liberty is prohibited.

## Early-season Power evidence

Week 0 remains pure previous-season strength, measured roster talent, returning production, and transfers. The prior historically followed weights 100/55/35/20/8/0% by **calendar FBS games played**. V5.5 replaces the discrete count with **effective FBS evidence:** for every previous FBS opponent, contribute `0.85 + 0.15 × sigmoid(opponent unblended neutral Power Points / 6)` effective games. Interpolate the same prior-decay table between adjacent effective-game counts. Thus weaker opposition provides slightly less evidence, but every game remains meaningful. Every team with >=6 FBS games has faded to 0%. This conservative adjustment is a modeling hypothesis; it is not a verified posterior uncertainty distribution.

**No verified coaching-change input** is currently included. Never describe the prior as containing measured coaching continuity. Team-level returning production is measured.

## Acceptance and release rules

- Verify every team Merit and Power score, component reconciliation and numeric rankings; a provisional published rank may be null while the internal reference rank is numeric.
- Week 0/1 Merit must never display an unsupported national #1 or week-over-week movement against a fictitious baseline.
- Verify that 2025 and 2026 historical matchup predictions use pre-week current-season data only; they are reconstructed from current releases and may have retrospective revisions.
- Compare accuracy, game margin MAE, log loss and calibration by season and schedule stratum against **frozen v5.4** on exactly matched games. Any v5.5 improvement is exploratory until prospective source-frozen validation.
- No external FPI, SP+, FEI, CFP or AP values in either model. Conference membership is used in this release only for the **empirical previous-season scoring-environment correction** described above. This must never be described as "conference affiliation display-only".
- Promote only after GitHub CI succeeds across all seven views and full rankings/ledger audits. Future weeks should save immutable pre-kickoff source hashes and predictions.

## Examples motivating the release (2026 Week 10)

- Georgia (8–1) defeated Alabama (7–2) head-to-head. Base Merit previously placed Alabama #5/Georgia #6; direct-result resolution should not be invisible.
- Tennessee beat Alabama and Kentucky and faced a stronger slate than Liberty. Liberty narrowly beat FCS Gardner-Webb. Our Merit methodology must distinguish **quality of evidence**, not assume eight weaker wins necessarily exceed seven high-quality wins.
- Memphis's apparent Week 1 Merit #1 was driven by two completed FBS games when most teams had much less evidence, plus a meaningless Week 0 numerical ranking. This is now provisional rather than asserting a fully supported national rank.

**Important:** This document describes the model implementation and research assumptions, not evidence that an SEC team must always rank above a Conference USA team. Unusual rankings should be explained by the measured inputs, not overruled manually.
