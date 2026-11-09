# CFMI 2026 — Home/Road Prediction Accuracy and Historical Moneyline Returns

**Scope:** 2026 FBS-versus-FBS regular season, completed Weeks 1–10 as of November 8, 2026. CFMI V5.3 game-ahead predictions reconstructed from the season's weekly ledger. This is a retrospective performance study, **not** a contemporaneously frozen record of the original site's forecasts.

## 1. Home/road winner accuracy

| Pick category | Picks | Correct | Wrong | Accuracy |
|---|---:|---:|---:|---:|
| Home team (non-neutral only) | 401 | 288 | 113 | 71.82% |
| Road team (non-neutral only) | 151 | 102 | 49 | 67.55% |
| Neutral sites | 10 | 7 | 3 | 70.00% |
| **All 2026** | **562** | **397** | **165** | **70.64%** |

The venue-adjusted differential is **4.27 percentage points**. A descriptive two-sided independent-proportions normal approximation gives z ≈ 0.97 and p ≈ 0.33, **not a statistically well-established gap**. This approximation ignores repeated teams and schedule selection; an opponent/game-level paired or hierarchical assessment is preferable before changing the current venue adjustment.

Actual home teams won 337 of 552 non-neutral games (61.05%). Consequently, home selections had an easier unconditional success baseline, and the home-vs-road CFMI split alone does not show a causal home-field error.

The road-pick issue is concentrated in particular weeks:
- Week 7: 13/22 road winners (59.1%).
- Week 8: 8/21 (38.1%).
- Week 9: 9/17 (52.9%).
- Combined Weeks 7–9 road picks: 30/60 (50%).

For road picks with CFMI win probability ≥75%, 18/21 (85.7%) won. This points toward uncertain or marginal road favorites rather than a blanket failure of confidently rated road teams.

## 2. $10 straight moneyline bet on each CFMI prediction

### ESPN game-linked historical DraftKings closing moneylines (highest coverage)

| Metric | Value |
|---|---:|
| 2026 games with completed outcomes | 562 |
| Games with both posted DraftKings closing moneylines | **547** |
| Missing moneyline | **15** |
| Correct CFMI picks among priced games | **382 / 547 (69.84%)** |
| Total hypothetical wagered ($10 risk each) | **$5,470.00** |
| Total received, including returned winning stakes | **$5,291.29** |
| **Profit/loss** | **−$178.71** |
| **ROI** | **−3.27%** |

The **15 games without a priced moneyline were all CFMI-correct picks**. This is nonrandom missing coverage, so **do not treat −$178.71 as the exact answer for a $10 bet on all 562 games**. A hypothetical full-562-game stake would be $5,620, but the 15 missing possible winning payouts cannot be determined from ESPN's archive.

### Location / bet selection

| Pick | Priced bets | Correct | $10 stake total | Net P&L | ROI |
|---|---:|---:|---:|---:|---:|
| Home picks, non-neutral | 386 | 273 | $3,860 | −$71.93 | −1.86% |
| Road picks, non-neutral | 151 | 102 | $1,510 | **−$99.48** | **−6.59%** |
| Neutral-site picks | 10 | 7 | $100 | −$7.29 | −7.29% |

Road-team picks accounted for **55.7% of the total net losses**, despite being only **27.6%** of the priced games.

### Performance by season stage

| Week range | Priced bets | Correct | Net P&L | ROI |
|---|---:|---:|---:|---:|
| Weeks 1–4 | 202 | 156 | **+$74.47** | +3.69% |
| Weeks 5–8 | 227 | 147 | **−$140.98** | −6.21% |
| Weeks 9–10 | 118 | 79 | **−$112.20** | −9.51% |
| **All priced games** | **547** | **382** | **−$178.71** | **−3.27%** |

The most damaging week was **Week 8, −$96.80 on 56 DraftKings-priced games (−17.29%)**.

### When CFMI agrees versus disagrees with market favoritism

Using each book's two-sided moneylines to calculate de-vig implied probability:

| CFMI position | Priced games | CFMI wins | Net P&L | ROI |
|---|---:|---:|---:|---:|
| Market favors CFMI's pick | 463 | 353 | −$74.32 | −1.61% |
| Market favors the other team | 84 | 29 | **−$104.39** | **−12.43%** |

This is evidence that the model is particularly vulnerable when taking a contrarian pick against the sportsbook favorite. It does not by itself justify adding betting market odds into CFMI Power; the market can be an independent benchmark and evidence that some current-team-performance signals need work.

### Independent timestamped sportsbook check: The Odds Gap

A freely accessible historical CSV currently covers October 20–25, 2026, not all season weeks. Fifty-one games could be matched using bookmaker-specific **observed closing timestamps that precede kickoff**. Selecting one book per game via a reproducible priority list gave:

- 51 actual priced games, 30 wins and 21 losses.
- $510 staked, **−$80.59 net (−15.80% ROI)**.

This is a *subset covering Week 8*, not a full-season estimate. It is not directly identical to the ESPN Week 8 calculation (56 games and a single DraftKings book), although both show a negative week.

### Provenance, model vintage and limitations

- CFMI input is **reconstructed** historical pre-week Power predictions; it is not sealed original-publication-date predictions.
- Full-coverage quoted prices come from **ESPN Core-v2 college football per-game odds**, provider **DraftKings**, field `homeTeamOdds.close.moneyLine.american` or `awayTeamOdds.close.moneyLine.american`. ESPN labels them historical **closing prices**, but its examined payload does not independently certify a time-stamped snapshot taken before kickoff.
- Prices represent a theoretical closing-line wager on the game's winner. An actual user placing a bet when CFMI's weekly prediction was published might have received a different line.
- Missing moneylines remain excluded. No spread-to-moneyline conversion, blanket -110 assumption or invented sportsbook offer.
- Stakes are **$10 risked** on every pick, not “win $10”; a correct bet at -200 earns $5 profit, a wrong bet loses $10.
- Real-world sportsbook limits, taxes, account/market access, bets offered and timing are not modeled.
- Source-dated independent odds are not fully available for 2026, so complete out-of-sample betting-profit claims are inappropriate.
- A high winner prediction rate alone cannot determine profitability: betting-market favorites pay less on wins.

**Source references:**
- ESPN Core v2: `https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/events/{game_id}/competitions/{game_id}/odds?limit=25`
- Timestamped partial archive: https://theoddsgap.com/api/odds-history.csv?sport=americanfootball_ncaaf
- CFMI prediction ledger: https://randomquestions-projects.github.io/college-football-merit-index/data/prediction_ledger_2025_2026.json
- Reproducible research scripts: `scripts/research_home_road_odds_2026.py`, `scripts/calculate_moneyline_roi_2026.py`, `scripts/espn_dk_moneyline_roi_2026.py`

**Conclusion:** The current model has a **measured road-pick accuracy gap and disproportionately poor road-pick ROI**, but the early-season prediction and ROI results are relatively better than later weeks. Investigate *marginal road favorites*, opponent-adjusted strength reliability and head-to-head offense/defense matchup asymmetry. Do not mechanically raise the home-field points coefficient without a separately held-out, paired test.
