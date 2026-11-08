# CFMI V5.1 design audit — resume recognition and comprehensive performance

**Date:** November 8, 2026. **Status:** new model implementation and 2024/25 backtest; deploy only after CI passes.

## Purpose

### Earned merit, not predicted ability

CFMI deliberately separates these:

1. How many actual games did you win versus what a strong, independently inferred benchmark would have won against the **same schedule**?
2. Which *actual wins* were accomplishments, especially when playing strong opponents on the road? A road game remains hard through the schedule benchmark; an explicit small additional bonus expresses that this is a résumé-achievement rating.
3. How convincingly did you perform **relative to opponents' strength and location**? Saturated game margins prevent running up scores from swamping real results; **FCS margin is excluded**.

**V5.1 prototype weights**: 55% achievement record, 25% quality and away victories, 20% opponent-adjusted margin. These are normative weights, not a claim that an objectively correct résumé ranking can be estimated from win probabilities. A two-loss team with outstanding road and top-10 victories can outrank an undefeated team with weak wins. A great-looking loss does not earn quality-win credit.

### Power forecasts repeatable future ability

Game-strength baseline: ridge-regularized SRS using margin, opponent quality and venue, blended with neutral-start season Elo. Expected margin is on a points scale. Candidate incremental features, normalized and opponent-adjusted using other games to reduce self-fulfilling ratings:

| Feature | Why consider it | Risk / validation treatment |
|---|---|---|
| EPA/PPA | Rewards efficient, high-value plays against high-quality defenses | Correlated with scoring margin and success; may shrink to zero when redundant |
| Success rate | Stable drive-to-drive positive plays, offense minus defense | Correlated with EPA |
| Explosive rate | Ability to create/prevent big gains | Volatile, needs reliable denominator |
| Finishing drives | Score efficiently after reaching scoring position | Small samples, possible turnover/field-position confounding |
| Consistency | Sustain favorable EPA across many games rather than one-off spikes | Small sample early in season |
| Control | Possession-based game-state strength, less dominated by garbage time | Score-state model assumptions and overlap with MOV |
| Offensive scoring | Points generated vs expected from opposing defenses | Overlaps opponent-adjusted margin |
| Defensive scoring | Points suppressed vs opponent scoring expectation | Overlaps opponent-adjusted margin |

**Design controls**: all features adjusted for opponent; advanced features shrunk by team-game coverage; nonnegative coefficients for naturally positive signals; ridge penalties with more shrinkage for closely related features; caps on any advanced-only swing; early-season evidence labels; no external predictive input; direct next-week training samples (2024), subsequent-season validation (2025).

**What does inclusion mean?** Every feature must be *measured, compared, and eligible for selection*. A feature that does not add independent predictive evidence after considering others must not receive an arbitrary positive weight. The trained coefficient (including zero) and its contribution are documented in the Methodology/team drilldown; a zero tells us that it is currently a useful diagnostic but not a distinct Power input.

### Testing and scoring

2024 next-week FBS vs FBS games: fit candidate coefficients and calibrate its monotonic margin-to-win probability mapping. 2025: compare predictive win accuracy, probability Brier, probability log loss, margin MAE/RMSE against both a simple SRS/Elo baseline and prior V5 model. Use week-block bootstrap for comparative uncertainty. If full-spectrum signals fail a bounded validation gate, publish the simpler prior V5 coefficients and label new components as diagnostics.

**Statistical caveat**: 2025 was previously used to select V5, so repeated V5.1 model comparison against 2025 is *not* an untouched independent holdout. Avoid claiming generalized superiority before a new post-2025 prospective test season and locked model. Do not optimize the Merit score to win prediction and do not tune either to AP/CFP.

### Data limitations

- FCS results count in records/WAB; no positive signature credit or massive-margin bonus from beating FCS opponents.
- Late data corrections can change reconstructed weekly history; true immutable as-original releases need dated snapshots.
- Offensive and defensive points can be correlated with baseline and require strong regularization.
- No preseason seed, conference prestige, school-name advantage, polls, recruited-talent prior, bookmaker spread or external composite enters scoring.
- Published indexes are not official playoff selections; the goals are objective independent résumé evidence and empirically evaluated predictive ability.

### Public model sources
- [V5.1 source](../site/model_v5.js)
- [Historical training and model-selection code](../scripts/train_v5.cjs)
- [Current and historical rankings](../site/index.html)
- [Earlier V5 initial statistical design review](./CFMI_V5_statistical_design_review.md)
