# CFMI Matchup Score: independent third metric

**Purpose:** CFMI has three fundamentally distinct metrics. **Merit** evaluates achieved on-field résumé, **Power** estimates neutral-field team strength against an average FBS program, and **Matchup Score** estimates a team's likelihood of winning against one specific opponent at a specific venue. There is no national Matchup ranking: the same team may have a different Matchup Score against each rival.

## 1. Exact Power-index to projected-margin conversion

The currently deployed Power engine maintains **uncapped expected point strength** internally. The displayed team Power Index is:

```
Power index = clip(50 + 1.6 × neutral-field expected point strength, 0, 100)
```

Never convert a rounded index to points for production predictions: use the source `powerPoints` value, which retains precision and does not lose values to index capping.

```
Home neutral strength edge = Home Power Points − Away Power Points
Venue edge = 0 for neutral sites; historically fitted home advantage otherwise (~3.54 pts)
Original margin = Home neutral strength edge + Venue edge
```

Example (rounded index values from historical card): Ohio State Power 63.4 and Texas Power 61.2 → Ohio State has about `(63.4−61.2)/1.6 = 1.375` points of neutral-field advantage. Home-field edge ~3.54 makes Texas an approximately 2.17-point favorite *before matchup-specific adjustments*. The underlying model uses precise point values, not these rounded scores.

## 2. Third metric: opponent-specific win likelihood

```
Final predicted home margin
  = Home neutral Power Points − Away neutral Power Points
  + empirically fitted home advantage (zero if neutral)
  + validated opponent-specific matchup interaction (bounded ±4 points)

Home Matchup Score = 100 × historical logistic( final margin / calibration scale )
Away Matchup Score = 100 − Home Matchup Score
Predicted winner = team with higher Matchup Score
```

The score is a **probability-like 0–100 opponent- and venue-specific score**; it is not an independent national team rating and cannot replace Merit or Power. All adjustment factors are separately disclosed in team comparison and the game breakdown. A higher Power rank can lose a matchup after a sufficient home or opponent-specific adjustment.

Power is unchanged: every team maintains its original national rank, Power Index, expected neutral strength and underlying opponent-adjusted offense/defense summaries.

## 3. Real matchup-specific data

From the already-used SportsDataverse/ESPN game-level data (2024/2025/2026), the third metric uses:

- Rushing and passing offensive EPA **per play**, separately.
- Opposing defenses' EPA allowed against the run and the pass, separately.
- Rushing and passing first-down-creation rates and explosive-play rates.
- Actual pass share versus rushing tendency to avoid assigning a rush-vulnerability bonus to a team that rarely runs.
- Opponent-adjusted, ridge-shrunken estimates of offense and defense for each phase, using games completed before the matchup's weekly cutoff.

**Adjustment architecture:** The fitted features are the *additional* joint advantage created by pairing offense against a particular defense, distinct from the marginal team Power signal. Candidate components are run exploit, pass exploit, run efficiency × frequency, pass efficiency × frequency, relative run/pass style, first-down matchup and explosive matchup. Positive components favor the home side, negative components the away side. All are estimated from pre-kickoff FBS-vs-FBS game observations and shrink strongly for limited coverage.

Data sample and source audit: the `espn_cfb_adv_team/adv_team_2026.csv` release contains verified columns for `EPA_rushing_per_play`, `EPA_passing_per_play`, `rushing_first_downs_created_rate`, `passing_first_downs_created_rate`, `EPA_explosive_rushing_rate`, `EPA_explosive_passing_rate`, `passes_rate`, `rushes` and `passes`. The 2026 audit found **1,370 populated records for each of these fields** from the provider, with 562 FBS-vs-FBS completed games through Week 10; other FBS/FCS observations are not used in phase-specific fitting. The game IDs are intersected with each team's completed FBS schedule to prevent postgame leakage.

The new run/pass data are not secretly added to the neutral-field Power formula. They are reserved for matchup-specific analysis.

## 4. Modeling and statistical validation

- **2024:** fit regularized conditional interaction coefficients on Week 5–13 games (558 observations).
- **2025:** select the candidate only when it improves pregame game-winner log loss and mean absolute projected-margin error and does not meaningfully regress winner accuracy (762 observations). *2025 has already been used for earlier model selection and is not a pristine holdout.*
- **2026:** inspect 562 games through Week 10 without fitting or selecting on them. The 2026 season inspired the request, so this is also retrospective exploratory evidence, not a preregistered new-season holdout.
- **Deployment gate:** if no model improves enough relative to **Power + venue**, retain zero extra adjustment. Do not invent rushing- or passing-matchup win-probability changes for demonstration purposes. Show neutral Power, venue and descriptive opponent profiles transparently, then continue prospective validation.
- **Cap:** no more than ±4 points from the model's incremental matchup interaction, and no change whatsoever to the core Power or Merit ratings.
- **Historical integrity:** all game-ahead predictions are reconstituted using only earlier completed game IDs, but the source releases may have been revised after the original game dates.

The dashboard displays the Matchup Score and explicit **Power neutral edge → venue points → conditional run/pass adjustment → projected margin → win likelihood** in both current and historical matchup drilldowns. It also labels game-specific rushing/passing strengths as historical opponent-adjusted estimates, not guaranteed play-by-play outcomes.

## Code

- [Matchup-only module](../site/model_matchup_v1.js)
- [2024/25/26 feature training, selection and backtest](../scripts/train_matchup_v1.cjs)
- [Historical pregame predictions](../scripts/build_prediction_ledger.cjs)
- [Live next-week forecasts](../scripts/build_weekly_views.cjs)
- [Offensive and defensive rushing/passing data ingestion](../scripts/update_data.py)
- [Prediction and source integrity tests](../scripts/audit_dashboard.cjs)

**Release policy:** The GitHub workflow selects the adjustment only if the validation gate passes. An absent/zero adjustment does not invalidate the independently useful third metric: the Matchup Score is then a well-defined venue-adjusted Power-based game probability, and the opponent-specific diagnostic profiles are visible without an unsupported impact on actual picks.
