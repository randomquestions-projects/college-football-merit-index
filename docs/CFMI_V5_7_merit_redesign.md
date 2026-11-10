# CFMI v5.7 — earned Merit with opponent quality first

## Decision and release status

This candidate revises the **Merit Index only**. The independent neutral-field **Power** and matchup models keep their v5.6 coefficients and prediction methods. This document describes a research candidate; **do not interpret a proposed or tested branch as a published release until CI succeeds and the PR is merged**.

Frozen baseline: v5.6 commit `0ce545132b8ad74a614db7fa54e18bc86dcb87e9`. The 2026 data used for the diagnostic are retrospectively assembled from the November 10 source release, so the following is a sensitivity study, not a blind validation.

## New Merit formula

```
Merit = 0.45 × difficulty_weighted_record_score
      + 0.30 × quality_win_score
      + 0.25 × opponent_weighted_dominance_score
      + FCS_underperformance_penalty
```

All terms use results actually earned in completed games, no polls, recruiting prior, arbitrary Power Four boost, or final predictive Power rank.

### Difficulty-weighted record (45%)

For each game let `p` be the expected chance that the fixed top-25-caliber benchmark wins against that opponent at that venue (derived from the season-only opponent strength, not a public poll). Let `w` be 1 for a win or 0 for a loss.

```
adjustment = w ? (0.65 + 0.90 × (1 − p)) : (0.70 + 0.70 × p)
weighted_game_result = (w − p) × adjustment
record_score = clamp(50 + 11.5 × Σ weighted_game_result, 0, 100)
```

A victory the benchmark was unlikely to earn gives more credit; losing a contest the benchmark should win is penalized more. This explicitly replaces treating each easy win as an undifferentiated additional success. The legacy WAB remains a disclosed diagnostic, not the v5.7 record-score formula.

### Actual quality FBS wins (30%)

A win earns quality units according to the defeated FBS team's season-only neutral strength, relative to the independent top-25-strength benchmark, using the smooth sigmoid `h = sigmoid((opponent_strength − benchmark_strength) / 5.5)`.

```
win_units = (0.10 + 2.10 × h^1.3) × venue_factor
venue_factor = 1.25 away; 1.08 neutral; 1.00 home
quality_raw = Σ units from actual FBS victories only
evidence_factor = FBS_games / (FBS_games + 1)
quality_score = clamp(30 + 10.5 × quality_raw × evidence_factor, 0, 100)
```

There is **no tanh saturation of the entire season**. A Notre Dame or Alabama win can meaningfully distinguish two otherwise similar résumés. A loss never earns a quality-win bonus. Road wins receive an explicit preference beyond the benchmark's home/road difficulty; this is a normative résumé policy stated openly rather than a hidden duplication.

### Opponent-weighted dominance (25%)

Keep the measured v5.6 game signal (55% adjusted margin, 20% possession control, 15% opponent-corrected EPA, 7% scoring opportunity finishing, 3% discipline), with verified-data fallbacks.

For each completed FBS game, downweight positive dominance against weaker opposition and upweight it against elite opposition using the same `h`. Negative dominance against a weak opponent is not excused:

```
dominance_multiplier = (dominance >= 0) ? (0.57 + 0.90 × h) : (1.12 − 0.17 × h)
weighted_game_dominance = clamp(dominance × multiplier, −30, 30)
dominance_score = clamp(50 + 1.35 × mean(weighted_game_dominance) × FBS_games/(FBS_games+1.7), 0, 100)
```

FCS wins do not earn quality or positive dominance points. Weak FCS performances keep the pre-existing bounded penalty.

### Head-to-head — only a pairwise ranking tiebreak

**Zero head-to-head points are ever added to or subtracted from Merit.** First sort by the numerical Merit score. Only when adjacent teams' scores differ by **0.35 points or less**, and they played each other once, may the winner be listed immediately above the loser. Direct head-to-head results between other teams never affect the current comparison. This may deliberately yield an adjacent rank order whose scores differ slightly; report scores and pairwise result transparently. Multi-team circular ties are not resolved by this simple pairwise rule and should be reviewed separately, not forced into a mathematically inconsistent score adjustment.

## Governance and caveats

* The 45/30/25 mix is an explicit policy candidate (versus v5.6's 50/20/30), not estimated from future-win accuracy.
* Quality and schedule strength intentionally overlap: one values the difficulty of all game outcomes and one emphasizes actual elite wins. Audit contribution ranges and marginal sensitivity to make overlap visible.
* Opponent ratings are based on games completed by the selected snapshot and therefore depend partly on the game being assessed. This is acceptable for retrospective résumé comparison, **not** for pregame forecasting.
* Test all 138 FBS teams, historical cutoffs, quality and road monotonicity, FCS protection, rank stability, H2H neutrality, score-component arithmetic, Power unchanged, and browser audits before promotion.
* Sensitivity checks must include UCLA/Utah, Alabama/Texas, Miami/Alabama, Boise/Wake/Tennessee/USC, New Mexico/BYU, BYU/Notre Dame, and North Dakota State/Liberty/Arizona. **Do not force outcomes to match a preconceived top 25.**
