# College Football Merit Index (CFMI)

An independent, public college-football rankings dashboard. The project ranks every 2026 FBS team from actual results rather than AP, CFP, preseason polls, recruiting talent or brand reputation.

## Dashboard

Once GitHub Pages is enabled, the public dashboard will be served at:

https://randomquestions-projects.github.io/college-football-merit-index/

The website defaults to the **Top 50**, with an all-FBS view, sortable metric ranks, opponent-ledger drilldowns, and fully documented methodology.

## Ranking methodology

| Component | Weight |
|---|---:|
| Strength of record (wins above benchmark / winning percentage) | 35% |
| Opponent- and venue-adjusted margin of victory | 20% |
| Quality wins / quality road wins | 20% |
| On-field efficiency | 25% |

The on-field component includes EPA/PPA, success rate, game control, explosiveness, penalty differential, turnover differential, offensive/defensive consistency, and red-zone play efficiency. Scores are converted to national percentiles. When measured advanced-stat coverage is insufficient, the dashboard displays a separately labeled **75% résumé preview**, not a fabricated 100% model.

The red-zone metric is **positive-EPA play success rate**, *not* red-zone possession touchdown conversion. Data coverage, model assumptions and limits are disclosed on the site.

## Weekly refresh

`.github/workflows/publish.yml` runs **Sunday at 9:00 AM America/New_York**, including DST, as well as on code changes and manual dispatch. It:

1. Downloads completed 2026 scores from the public SportsDataverse/cfbfastR feed.
2. Attempts SportsDataverse advanced-team, situational, turnover and quarter-score releases.
3. Writes validated score and advanced snapshots under `site/data/` with metadata.
4. Deploys `site/` to GitHub Pages. If collection fails, the previously published site stays online.

Public GitHub Actions scheduled jobs can be delayed, and GitHub automatically disables schedules in public repositories after 60 days without repository activity.

## Privacy

This public repository contains football data, code and methodology only. **No ChatGPT chat transcript, account credentials or personal information is stored or linked.** The linked GitHub account/repository ownership are public metadata. No API keys are required.

## Data sources

- [SportsDataverse 2026 schedules](https://github.com/sportsdataverse/cfbfastR-data/blob/main/schedules/csv/cfb_schedules_2026.csv)
- [SportsDataverse derived ESPN advanced data releases](https://github.com/sportsdataverse/sportsdataverse-data/releases)
- [GitHub Actions schedule documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onschedule)

## Local development

```bash
python scripts/update_data.py
python -m http.server --directory site 8000
```

Visit http://localhost:8000/. This is a public experiment, not a predictive model or an official college-football poll.
