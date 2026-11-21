# College Football Merit Index — Public Rankings Website

**Website:** https://randomquestions-projects.github.io/college-football-merit-index/

This public repository currently publishes the College Football Merit Index's rankings, comparisons, history, preseason, Matchup predictions and experimental Research Lab.

## Privacy migration status

The full current public source at commit `418f0fe64b9bdc3ebc9db2d03590fa348ef15384` was preserved with matching Git blob hashes in the **private** `randomquestions-projects/analytics-research-private` repository under `migration_snapshots/football_2026_11_20/`.

Detailed research reports and old model archives have been removed from the active public tree and retained in that private archive.

**Not yet an output-only deployment.** The existing GitHub Pages application and scheduled public workflow currently still use public JavaScript scoring modules and research scripts. Those files must remain until an independently verified private model runner, approved public projections and deploy identity replace the current production workflow. Do not remove them early: doing so would break rankings and weekly refreshes. The migration is tracked in private research GitHub issue #4.

Git history from before this change is not made private by deleting paths on the default branch. Historical privacy cleanup requires a separate plan covering deployment continuity, release artifacts, mirrors, and cached history.

## Publication policy

Public: HTML/CSS/JS presentation, approved public aggregate rankings, public explanatory methodology and intended site assets.

Private: training code, algorithms, research scripts, model parameters, licensed/third-party source feeds, data warehouses, full historical datasets, secrets, and unpublished experiments.

No complete datasets or credentials should be committed. Future public deployment must pass the allowlisted publication guard and browser smoke tests. The goal is that only a private research pipeline publishes reviewed, limited public results, not model code.

This is an independent rankings research project; not an official College Football Playoff or NCAA ranking.
