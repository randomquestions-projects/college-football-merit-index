# CFMI V5.3 research — Preseason Talent & Continuity Prior

**Status:** Research only; does not change live Power or Merit.  
**First research date:** November 8, 2026.

## Problem and goal

CFMI's no-preseason-prior design can be unstable in Weeks 1–3. A team with a weak schedule can produce outstanding on-field numbers before it is tested against strong competition. Previous performance, current roster talent and continuity provide *evidence*, not automatic conference-status credit.

**The experiment asks:** Does adding a fast-decaying, game-week-correct preseason prior improve real next-week outcome and point-margin predictions versus the frozen V5.2 Power? Do **not** select weights based on rankings of Ole Miss, Liberty, or New Mexico.

Merit is completely unchanged; a team cannot earn résumé credit from recruiting rankings.

## 1. Prior components

Potential hierarchy, subject to source completeness and backtesting:

| Predictor | Proposed role | Data availability and caveat |
|---|---|---|
| Previous season's opponent-adjusted team Power | 40–50% of preseason prior | Existing CFMI 2024/2025 complete-game SRS/Elo; roster attrition means the previous rating must shrink |
| Current **roster** high-end talent | 20–30% | Best ~30 projected contributors weighted by *verified* ratings, position and availability; historical roster-tier proxies are not individual top-30 ratings |
| Roster depth (next ~40–50) | 10–15% | Player-talent tiers and position coverage; roster composite already includes transfers |
| Returning production | 10–20% | Returning weighted snaps, route/dropback/rush share, defensive tackles/pressures/stops; avoid treating RB yards and QB snaps as equally predictive |
| Coaching continuity / turnover | Small risk modifier | Head coach / coordinator changes and scheme turnover, not arbitrary coach prestige rankings |

Percentages are **conceptual placeholders**. Actual weights must be learned from pregame historical data. Head coach and coordinator ratings should not be included until dated coaching tenures, departures and robust coach-specific estimates are available; absent measurements must stay absent, not be assigned default reputation values.

**Important anti-double-counting:** A current-roster team talent composite already includes current transfers; adding transfer ranking and three recruiting classes at full strength would count several players repeatedly. Prefer player-level *who is on the roster today*, using class and portal history to explain origin. Blue-chip ratio and top-30 average are highly correlated with roster composite; combine into one latent roster-talent score. Measure change in quality since last season separately where available.

## 2. Proposed decay

Weights refer to **previous games completed** (not calendar week alone):

| Completed games entering prediction | Candidate weight on preseason evidence |
|---:|---:|
| 0 | 100% |
| 1 | 55% |
| 2 | 35% |
| 3 | 20% |
| 4 | 8% |
| 5+ | 5% until evidence indicates further decay |

These are preselected research candidates, **not a verified production schedule**. Later improve with opponent-adjusted information: four cupcake games should provide less certainty than four games against good opponents. This can be expressed as hierarchical Bayesian shrinkage, where a prior variance and observed season-only strength uncertainty govern the final blend.

**Blend strength in expected neutral-field points, not rank numbers or 0–100 bounded index scores.** Convert blended point-strength to a Power index only after blending. Game forecasts then add calibrated home advantage.

## 3. Sources checked

- 2026 full-FBS 247Sports roster talent composite and blue-chip ratios through [College Football Charts](https://collegefootballcharts.com/stats/talent-composite). Both public CSV exports cover 138 schools.
- 2024, 2025 and 2026 historical [Punt and Rally roster-tier breakdowns](https://www.puntandrally.com/talent.php?view=roster&whichyear=2025). **Crucial limit: these pages currently cover 68 teams rather than all FBS.** That is sufficient for a partial P4 study only, not for certifying a model whose central use case is comparing P4 and G5 opponents.
- The 247Sports team talent composite counts the current roster rather than summing the class ranks at the time of signing. Ratings depend on which scholarship recruits/transfers were rated; low coverage and walk-ons create missingness.
- Historical coaching changes and returning-production measures have not yet been sourced and audited for temporal availability. They are out of the first pilot.

## 4. What is implemented on this research branch

- `scripts/probe_talent_sources.py`: source schemas, source headers, historical row coverage and 2026 full-FBS CSV.
- `scripts/collect_talent_research.py`: archive each year's player-tier counts, approximate top-30/depth score for the 68 available teams, source hashes, and separate full 138-team 2026 talent composite/blue-chip table.
- `scripts/test_talent_prior.cjs`: build pregame week-1 through week-10 future-game predictions from the *previous season's final result-based strength* and same-season roster talent, then test fixed fast-decaying prior intensity alternatives. 2025 is used for candidate selection; 2026 is inspected but not trained.
- No active V5.2 Power coefficients, homepage or other production tabs are changed.

## 5. Statistical gates before release

1. **Expand 2024/2025 all-FBS roster talent coverage**, particularly G5 and recently promoted teams. A 68-team P4-only backtest cannot prove effectiveness for Liberty/New Mexico/NDSU versus P4.
2. Archive original preseason source dates and roster snapshots rather than assuming current historical pages are immutable. Historical webpages may have received retroactive player data updates.
3. Test Weeks 1–3 and Weeks 4–10 separately (accuracy, Brier, log-loss and margin MAE), on the same games with no future data.
4. Test incremental value relative to prior-year Power *alone*, roster talent *alone*, and previous-year Power plus talent. Check if an aggressive prior anchors too strongly to disappointing highly recruited teams.
5. Compare model calibration and matchup ranking across tiers and travel/home locations. No automatic P4 conference bonus. Check a P4 roster with poorly coached players against strong G5 performance.
6. Fit using 2024/2025 where sources permit, freeze parameters, then evaluate new post-freeze 2026+ games. Since 2026 teams motivated the idea, the full 2026 sample is not a clean untouched prospective test.
7. Release only if benefit is real across multiple seasons and doesn't undermine Power's post-Week-4 on-field performance objective.

**Conclusion:** A preseason prior is a strong research direction, but roster and coaching data lineage—and a true all-FBS historical backtest—must be reliable before exposing a live ranking that can silently reintroduce recruiting-status bias.
