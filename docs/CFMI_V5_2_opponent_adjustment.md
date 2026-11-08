# CFMI V5.2 — Opponent-quality recalibration

**Purpose:** Power must estimate a team's neutral-field performance against average FBS opposition, not mistake high offensive efficiency against poor defenses for equivalent strength against elite defenses.

**Release policy:** No conference weights, school-brand penalties, recruiting rank, preseason team talent, sportsbook spreads, AP/CFP, ESPN FPI, SP+ or FEI inputs. Quality of competition is inferred from completed FBS games only. Merit remains unchanged at 55% achieved record, 25% quality/road wins, 20% opponent-adjusted game control.

## Diagnostic root cause (2026 Week 10)

- **Liberty:** Power #8, schedule quality #135, 8–1, seven of eight FBS opponents rated below #85; its only loss to a stronger FBS opponent was 13–20 against James Madison. It also narrowly defeated FCS Gardner-Webb 24–23, which V5.1 Power completely ignored.
- **New Mexico:** Power #14, schedule quality #126, 8–1; large wins over several bottom-half opponents but an 8-point loss at Oklahoma. It beat FCS Mercyhurst 70–7, which should not raise the Power score.
- **Alabama:** Power #4, schedule quality #3 with substantially stronger opponent evidence.

**Conclusion:** Existing Power DID use opponent-adjusted SRS/Elo and leave-one-game-out opponent raw performance. The adjustment was real, but its two-component efficiency correction rewarded dominance against weak opposition too heavily, and its FBS-only opponent baseline ignored FCS near-loss evidence. The correct fix is stronger inference and honest uncertainty, not an SEC/P4 lookup table.

## 1. Joint offense-versus-defense opponent network

For each completed FBS-vs-FBS game we estimate offensive play quality *against the specific opposing defense*. We simultaneously estimate every program's offensive and defensive strength for EPA/PPA, successful-play rate, and explosive-play rate:

**Measured offense against opponent = team's underlying offense − opponent's defensive prevention ability + game noise.**

Offense and defense are jointly inferred using a regularized iterative ridge procedure across the full season-to-date opponent network. A common league-average anchor and 3.5 neutral pseudo-games per unit shrink untested or weakly connected schedules toward neutral. The model derives opponent defensive quality from their performances against OTHER offenses, not raw season averages or conference labels.

This produces **jointly opponent-adjusted** EPA, success rate, and explosiveness. Each is trained in a point-margin forecast against actual future results, not assigned arbitrary fixed positive percentages.

For example, Liberty's previously displayed opponent-adjusted success differential was about +0.151; the joint-network estimate is approximately +0.089. Georgia's previous +0.243 becomes about +0.176. Both shrink because of ridge regularization, and the model values their *relative quality* through actual common and cross-schedule opponent evidence.

## 2. Opponent-schedule support and uncertainty

A second **historically fitted** correction diagnoses whether baseline Power still overstates teams whose *impressive performance has been verified primarily against weak opponents*.

Three season-only signals enter the candidate:

- **Average opponent-strength residual:** the team's average played-opponent SRS rating, calculated with all prior completed games and no conference prior.
- **Unsupported high strength:** positive estimated strength scaled by the extent to which played opponents are below league-average quality, with a cap on the uncertainty adjustment.
- **Narrow FCS performance:** no positive credit for FCS blowouts; only a bounded negative evidence penalty for margins below a conservative 14-point FBS-over-FCS benchmark. This is intentionally asymmetric. A 60-point FCS victory is not equivalent to a 60-point victory over an FBS opponent.

The coefficients were fitted using **2024 Week 5–13 next-game outcomes**, tested against previous V5.1 on **2025 Week 5–13 games**, and checked on 2026 reconstructed week-ahead games without using 2026 to fit or choose coefficients. **2025 is reused model-selection data from earlier versions, not an untouched final holdout**.

These are deliberately modest marginal corrections. Neither a poor SOS ranking nor a single close FCS game automatically disqualifies a strong team.

## 3. Rating construction

Using the fitted coefficients, V5.2 estimates:

```
Power points vs average FBS
  = 2024-calibrated (SRS/Elo opponent-strength baseline)
  + jointly adjusted EPA contribution
  + jointly adjusted success contribution
  + jointly adjusted explosive-play contribution
  + additional observed schedule strength
  − unsupported dominance against very weak schedule
  − underperformance against FCS opposition

Power index / 100 = clip(50 + 1.6 × Power points, 0, 100)
```

A game's predicted winner uses the **difference in opponents' estimated Power points**, then adds the previous training-year home adjustment only when the game is not neutral. Win probabilities retain the separate 2024-trained calibration link; index values are NOT win probabilities.

All 2026 past-week snapshots rerun the model with a strict cutoff at that week. The published data may contain later source corrections, so reconstructed historical results are not equivalent to sealed original-date source archives.

## 4. Evaluations against the existing V5.1 Power

Same games and walk-forward cutoffs for every model; 2024 used for fitting, 2025 for comparative selection, 2026 for independent *out-of-training* research (with the caveat that 2026 team anomalies motivated the study).

| Metric | Existing V5.1 | V5.2 joint opponent + schedule | Interpretation |
|---|---:|---:|---|
| 2025 FBS games | 490 | 490 | Same game set |
| 2025 winner accuracy | 72.65% | **73.06%** | +2 correct games |
| 2025 log loss | 0.5477 | **0.5464** | Small improvement |
| 2025 margin MAE | 12.36 pts | **12.33 pts** | Small improvement |
| 2026 FBS games through W10 | 347 | 347 | Same game set |
| 2026 winner accuracy | **65.42%** | **65.42%** | Unchanged |
| 2026 log loss | 0.6225 | **0.6220** | Small improvement |
| 2026 margin MAE | **12.71 pts** | 12.75 pts | Slight regression |

**Interpretation:** These gains are small and do not establish superiority over FPI, SP+, FEI or other power-rating systems. They do support adopting a more coherent and transparent opponent-network construction with safeguards; future games should be saved and evaluated prospectively. This model has not been tuned to replicate the AP/CFP rankings.

## 5. Illustrative 2026 rank changes under the new approach

| School | Old Power rank | V5.2 candidate | Context |
|---|---:|---:|---|
| Liberty | #8 | **#14** | Extremely weak SOS and narrow FCS win now reduce certainty |
| New Mexico | #14 | **#15** | Weak schedule still matters, but strong FBS performance remains meaningful |
| Georgia | #1 | **#1** | Strong opponent-adjusted evidence |
| Alabama | #4 | **#4** | Strong schedule and quality opponent performance |
| Oregon | #22 | **#18** | Difficult played schedule is recognized from game evidence |
| Ole Miss | #26 | **#23** | Difficult schedule relative to margin and advanced performance |

These are **results**, not rank targets or training labels. New Mexico can still remain high if its observed performance supports that rating. It would violate the project’s goals to manually demote non-P4 schools or introduce an unobserved conference effect merely because a rank looks surprising.

## 6. Integrity and diagnostics

- **No arbitrary conference boost:** all divisions are treated on actual FBS game evidence, not historical or conference names.
- **FCS blowout invariance:** adding 60 points to an already dominant FCS victory must leave Merit and Power unchanged. Converting a 1-point FCS escape into a convincing win legitimately removes negative underperformance evidence, but never adds unlimited credit.
- **Source coverage:** the network uses verified offense and defense opponent-game rows and shrinks missing or sparsely connected samples.
- **Model selection:** if future data do not demonstrate a positive effect, the workflow retains the previous V5.1 coefficients rather than forcing a correction.
- **Interpretability:** each team has baseline, EPA, success, explosive, additional schedule quality, unsupported dominance and close-FCS evidence contributions in estimated Power points.
- **Version trace:** all weekly historical ratings, matchup predictions and comparison data are rebuilt under the selected version and parameters.

## Sources

- [Current scoring source](../site/model_v5.js)
- [Joint opponent-adjusted estimator](../site/opponent_network_research.js)
- [Walk-forward competitor experiment](../scripts/test_joint_opponent_network.cjs)
- [Selection gates](../scripts/promote_opponent_network.cjs)
- [Automated ranking and leakage audit](../scripts/audit_dashboard.cjs)
- [Previous 2026 FPI/SP+/FEI comparison](./CFMI_2026_Power_Prediction_Benchmark.md)

The above values come from rerunning the published GitHub Actions research workflow on verified game data as of 2026-11-08. A final CI and deployment run must succeed before V5.2 should be considered publicly published.
