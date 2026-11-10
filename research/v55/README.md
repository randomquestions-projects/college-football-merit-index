# CFMI v5.5 Expected-Efficiency Research — frozen development status

Research date: **2026-11-09**. Baseline: **v5.4** at commit `72729d7830a7429cbd2bf1425fc0d56f94c5b282`. Research branch only; **do not merge to production scoring**.

## Objective and method
Predict each offense's EPA/play, first-down creation, explosive plays, non-garbage efficiency and points per scoring opportunity **against its particular opposing defense**, rather than directly reweighting national Power. A two-way opponent-adjusted ridge model estimates offensive effect plus defense vulnerability from prior completed FBS games. The game-specific weighted run/pass predictions supply a ridge-shrunken, capped (±4-point) *residual* to **frozen Power Points difference + venue**, with optional training-only adjustment for overlap with Power.

Data lineage: Research GitHub Actions run [42656511113](https://github.com/randomquestions-projects/college-football-merit-index/actions/runs/42656511113) reconstructed 2024 and 2025 FBS advanced team-game and 2023-trained neutral-WP possession metrics. v5.4 artifact [42559345298](https://github.com/randomquestions-projects/college-football-merit-index/actions/runs/42559345298) supplies game-ahead baseline and 2026 advanced results. These are reconstruction-date source releases, not immutable historical as-of publication snapshots.

## Results — no production promotion
- Frozen v5.4: 2025 **556/762 = 73.0%**; 2026 through Week 10 **397/562 = 70.6%**.
- Tested **32 fixed** research configurations across four efficiency/style feature families, two 2024 profile prior settings, two ridge penalties, and Power overlap removal on/off.
- **2025 chronological validation**, 456 games in Weeks 7–14, expanding pregame training window: baseline **334/456**, log loss **0.53520**, margin MAE **12.458**. **None** of the 32 configurations improved winner accuracy *and* log loss *and* margin error together. No selected candidate.
- **2026 retrospective inspection only:** best after examining 2026 was **404/562** for a style-plus-efficiency candidate with 2024 prior and training-only Power orthogonalization. It fixed **32** v5.4 errors but broke **25** correct picks (paired exact p≈0.427). **NOT a valid blind test and NOT a validated gain**. Its 2025 chronological validation was worse than v5.4; looking at 32 versions further inflates false discovery.
- Leakage tests passed: Week 1 current-season efficiency is zero; changing Week 8 advanced data leaves Week 1–8 pregame features unchanged; switching teams reverses game matchup feature signs.

## Week 11 prospective research shadow
[The 67-game forecast archive](week11_shadow_forecasts_2026.csv) was committed before Week 11's first kickoff. Numbers are **expected home-team victory margins in points** (negative = away favored), rounded to 4 decimals. Three research shadows use **2025-only chronological CV** to choose each family's settings; all **failed the deployment gate**. The 2026 Week 11 actual results were unavailable when committed.

- `style`: 2025 CV winner 332/456, 2026 retrospective 389/562.
- `efficiency`: 2025 CV 329/456, 2026 retrospective 396/562.
- `efficiency_plus_finishing`: 2025 CV 331/456, 2026 retrospective 396/562.

Model variants are experimental controls, **not** production forecasts or recommendations. Do not adjust these picks or coefficients after Week 11 outcomes and then score the changes as pregame.

Production model v5.4 and its Matchup Score remain unchanged. Detailed reproducible scripts and full-precision game-level data are in the companion downloadable research package attached to the conversation. The first honest post-freeze evaluation is upcoming Week 11 and then the 2027 season.