# CFMI V5.3 research — Preseason Talent & Continuity Prior

**Status:** V5.3 integrated on research branch, pending production merge. The previous V5.2 opponent-network Power remains the game-only engine; Merit remains unchanged.  
**First research date:** November 8, 2026.

## V5.3 deployed-candidate specification — full-FBS evidence supersedes preliminary 68-team limitations

**Implementation:** Week 0 is an independent Power rating for all 138 teams, and the prior blends into the existing V5.2 opponent-adjusted Power before fading out entirely after **five completed FBS games**. Merit never uses this prior. The earlier 68-team experiment below is retained as research history, *not* the basis for selecting or validating the full-FBS release.

### Verified season-specific sources and missing-data policy

| Season | FBS teams | Measured talent | Returning-production records | Portal records |
|---|---:|---:|---:|---:|
| 2024 | 134 | 133 | 134 | 134 |
| 2025 | 136 | 135 | 136 | 136 |
| 2026 | 138 | 137 | 138 | 138 |

The [SportsDataverse talent](https://github.com/sportsdataverse/sportsdataverse-data/releases/tag/cfb_team_talent), [returning production](https://github.com/sportsdataverse/sportsdataverse-data/releases/tag/cfb_returning_production), and [portal](https://github.com/sportsdataverse/sportsdataverse-data/releases/tag/cfb_team_portal) season-by-season parquet releases join on ESPN team ID and include Liberty, New Mexico, and North Dakota State. No Power Four membership weighting exists. **One missing 2026 FBS talent value** (and one per earlier season) is imputed from the **25th percentile of measured FBS talent** with an explicit imputed flag. Missing returning production or portal values are not interpreted as zero talent.

The source files were fetched in November 2026; *original preseason release timestamps are not independently verified*. Backtests are reconstructed, and corrections published later could influence prior-season inputs. Do not label them genuinely frozen preseason archival forecasts.

### Week 0 formula and evidence decay

The Week 0 expected-strength prior (points versus the FBS average) uses:

- 55% of previous-season opponent-adjusted scoring strength (shrunken for amount of current-season returning production)
- 45% of current-roster relative talent (88% talent composite, 12% blue-chip corroboration), in expected-margin point units
- bounded net-transfer talent adjustment (at most ±1.2 points) to explain exceptional roster movement without repeatedly counting transferred players

This is a *research-prototype blend*, not a fully re-estimated multivariate parameter model. The national prior is recentered against the average FBS program. An opponent's conference classification contributes no points.

| Completed FBS games | Prior contribution to Power |
|---:|---:|
| 0 | 100% |
| 1 | 55% |
| 2 | 35% |
| 3 | 20% |
| 4 | 8% |
| 5+ | **0%** |

The decay curve was selected on 2025 game-ahead log loss from a predeclared family; the earlier illustrative nonzero 5% floor was rejected. Weighting by observed schedule information (rather than game count) is a possible future improvement, not implemented. **Coach/OC/DC changes and actual top-30 and next-50 individual player-star ratings remain unavailable for a validated all-FBS as-of-season source**; their flags are null/unverified, not estimated or given hidden reputation-based bonuses.

### All-FBS game-ahead tests (same games; research and not independent frozen-source confirmation)

| Comparison | Previous on-field CFMI | With preseason prior |
|---|---:|---:|
| 2025 Weeks 1–4, 195 games | 138/195 (70.8%) | **144/195 (73.8%)** |
| 2025 Weeks 1–13, 685 games | 496/685 (72.4%) | **500/685 (73.0%)** |
| 2026 Weeks 1–4, 215 games | 159/215 (74.0%) | **169/215 (78.6%)** |
| 2026 Weeks 1–10, 562 games | 386/562 (68.7%) | **396/562 (70.5%)** |
| 2026 all-game log loss | 0.6002 | **0.5780** |
| 2026 mean absolute margin error | 13.91 pts | **13.42 pts** |

All current-season ratings are cut off *before* their week's first kickoff and do not use future completed-game results. The **2025 data select** the candidate and the 2026 data were *not used to fit these parameters*; however, observing the 2026 season contributed to designing this upgrade, so it is not a truly prospectively preregistered test. Gains are promising but do not demonstrate statistically assured superiority.

### Preseason standings and playoff/title model

The 2026 preseason Week 0 Power top five in the research build were **Notre Dame, Texas A&M, Ohio State, Texas Tech and Georgia**. This is not the final-season ranking.

A separate **5,000-scenario** schedule-aware simulation draws each FBS game from a predicted margin/probability and approximates conference title participants, top conference champions, other automatic bids, seven at-large invitations, byes and a 12-team championship bracket. It also generates simulated qualification shares and a national-title favorite. For example, the illustrative model identified Notre Dame as its leading title candidate, winning **8.24%** of scenarios. These simulated percentages **are not calibrated CFP market odds or official-selection forecasts**: committee decisions, conference-specific tiebreakers, player health, coaches, team-season correlated uncertainty and preseason-source vintage are not fully modeled. Treat them as an analytical scenario view.

### Pipeline, tests and release requirements

- `scripts/collect_preseason_all_fbs.py` → audited full-FBS talent, returning production and portal records, source hashes and imputation.
- `scripts/test_full_preseason_prior.cjs` → head-to-head past-season validation, selects a fading prior on 2025 only.
- `scripts/build_preseason_week0.cjs` → Week 0 strength, independent Talent Index, and data-lineage fields.
- `scripts/build_preseason_playoff_forecast.cjs` → 5,000-scenario CFP approximation.
- `site/preseason_prior_v1.js`, `site/model_v5.js` → exact same blending logic for site and historical snapshots.
- `scripts/build_weekly_views.cjs` → reconstructs **Week 0–10**, with no Merit before games start.
- `scripts/audit_dashboard.cjs`, `scripts/smoke_dashboard.cjs` → all-FBS, source, sum-of-title-scenarios, 0→100% Week 0 weight, 0% by current week, week-as-of/cutoff and new Preseason tab checks.

**Caveat:** No immutable as-original preseason archive, full coaching continuity, or complete individual current-roster top-30/next-50 star ratings has been independently verified. A further properly blinded post-2026 season remains essential before calling the model definitively better.

---

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

## Archived pilot: 68-school first experiment (superseded by full-FBS study)

Source check shows **2024–2026 archived roster tier pages contain exactly 68 P4/Notre Dame programs each**, not the entire FBS. The complete **2026 full-FBS team talent composite covers all 138** schools but is not accompanied by equally complete, independently frozen historical 2024/2025 year-specific player-level ratings. Therefore the experimental validation below is **strictly matched games with the subset of teams having historical roster data**. It **cannot** establish the benefit for Ole Miss versus Liberty, New Mexico, or North Dakota State.

The initial code used top-30 and depth-31-to-80 *tier-score proxies* (not actual known starters or individual player grades). The preseason estimated point-strength prior was 55% last-season opponent-adjusted SRS and 45% current roster-tier percentile; prior influence diminished quickly after completed games. Four intensity variants were tested. The 2025 selection set favored a **0.7 multiplier** to the candidate weekly-decay weights.

| Year / same matched games | Power with no prior | Talent + previous-year prior (0.7 intensity) |
|---|---:|---:|
| 2025 matched games | 217 | 217 |
| 2025 all-game correct picks | 66.4% (144/217) | **67.3% (146/217)** |
| 2025 log loss | 0.5887 | **0.5851** |
| 2025 margin MAE | 12.33 points | **12.12 points** |
| 2026 matched games | 238 | 238 |
| 2026 all-game correct picks | 61.8% (147/238) | **63.4% (151/238)** |
| 2026 log loss | 0.6431 | **0.6343** |
| 2026 margin MAE | 12.91 points | **12.80 points** |
| 2026 Weeks 1–4 correct picks | 63.9% (46/72) | **68.1% (49/72)** |

**Interpretation:** Incorporating a talent/previous-season prior improves early-game predictions in this P4-heavy matched subset. The 2026 evidence is directionally consistent with 2025, but the 2025 reference model had already been selected with that season's outcomes, and 2026 outcomes partly motivated this research. Neither season is a pristine independent confirmation of this new hypothesis. The sample's 2026 improvement is only 4 correct games out of 238; changes must be evaluated with paired uncertainty before production. Also, some historical roster pages may be retrospectively updated.

**Decision:** Do NOT merge this prior into live CFMI Power based on the partial historical 68-team sample. Next statistical requirement is verified **all-138-program historical talent coverage** (including G5) and either a genuine pre-season ratings archive or immutable yearly snapshots, plus reliable returning-production and coaching continuity. These are necessary for the user's primary cross-conference use case.

The experiment code is [here](../scripts/test_talent_prior.cjs); sourcing and roster-tier audit are [here](../scripts/collect_talent_research.py).

## 6. Statistical gates before release

1. **Expand 2024/2025 all-FBS roster talent coverage**, particularly G5 and recently promoted teams. A 68-team P4-only backtest cannot prove effectiveness for Liberty/New Mexico/NDSU versus P4.
2. Archive original preseason source dates and roster snapshots rather than assuming current historical pages are immutable. Historical webpages may have received retroactive player data updates.
3. Test Weeks 1–3 and Weeks 4–10 separately (accuracy, Brier, log-loss and margin MAE), on the same games with no future data.
4. Test incremental value relative to prior-year Power *alone*, roster talent *alone*, and previous-year Power plus talent. Check if an aggressive prior anchors too strongly to disappointing highly recruited teams.
5. Compare model calibration and matchup ranking across tiers and travel/home locations. No automatic P4 conference bonus. Check a P4 roster with poorly coached players against strong G5 performance.
6. Fit using 2024/2025 where sources permit, freeze parameters, then evaluate new post-freeze 2026+ games. Since 2026 teams motivated the idea, the full 2026 sample is not a clean untouched prospective test.
7. Release only if benefit is real across multiple seasons and doesn't undermine Power's post-Week-4 on-field performance objective.

**Conclusion:** A preseason prior is a strong research direction, but roster and coaching data lineage—and a true all-FBS historical backtest—must be reliable before exposing a live ranking that can silently reintroduce recruiting-status bias.
