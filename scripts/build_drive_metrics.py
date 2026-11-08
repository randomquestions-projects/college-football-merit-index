#!/usr/bin/env python3
"""Extract unbiased in-game drive control and drive-finishing from ESPN PBP.

The published play-by-play contains two win-probability models. We use ONLY
home_wp_before_naive, the spread-free model. NEVER use home_wp_before, which
could incorporate Vegas point spreads / team reputation.

Possession-level control = average team win-probability across meaningful
possessions. Finish = points per genuine scoring-opportunity possession
(snap inside opponent 40), averaged over meaningful offensive drives.
Garbage-time possessions are excluded when 2H spread-free WP is outside 5%-95%.

Downloads season Parquet (~45MB 2026) to the GitHub runner (not Pages),
projects only a handful of columns via DuckDB, and publishes a small CSV.
"""
import csv
import json
import os
import urllib.request
from pathlib import Path
from tempfile import TemporaryDirectory

try:
    import duckdb
except ImportError as e:
    raise SystemExit("duckdb Python package required for play-by-play extraction") from e

SEASON = os.environ.get("CFMI_SEASON", "2026")
if SEASON not in ("2024", "2025", "2026"):
    raise SystemExit("Invalid season")
ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "site" / "data" if SEASON == "2026" else ROOT / "site" / "data" / "history" / SEASON
DATA.mkdir(parents=True, exist_ok=True)
OUT = DATA / f"drive_quality_{SEASON}.csv"
FIELDS = ["game_id","team_id","neutral_wp_control","control_possessions",
          "off_pts_per_scoring_opp","off_scoring_opp_n","def_pts_per_scoring_opp",
          "def_scoring_opp_n","off_meaningful_drives","def_meaningful_drives"]

def download(url, path):
    request = urllib.request.Request(url,headers={"User-Agent":"CFMI-public-analytics/4.1"})
    with urllib.request.urlopen(request,timeout=180) as response, path.open("wb") as out:
        while True:
            chunk=response.read(1024*1024)
            if not chunk:break
            out.write(chunk)
    if path.stat().st_size < 1024*1024:
        raise ValueError("PBP Parquet download unexpectedly small")
    print("PBP DOWNLOADED",SEASON,"bytes",path.stat().st_size,flush=True)

def main():
    url=("https://github.com/sportsdataverse/sportsdataverse-data/releases/download/"
         f"espn_cfb_pbp/play_by_play_{SEASON}.parquet")
    with TemporaryDirectory() as folder:
        pq=Path(folder)/"pbp.parquet"
        download(url,pq)
        db=duckdb.connect(":memory:")
        cols={r[0] for r in db.execute("DESCRIBE SELECT * FROM read_parquet(?)",[str(pq)]).fetchall()}
        required={"game_id","pos_team_id","homeTeamId","awayTeamId","drive.id",
                  "drive.result","scrimmage_play","scoring_opp",
                  "home_wp_before_naive","period"}
        if not required.issubset(cols):
            raise RuntimeError("PBP schema missing columns: "+repr(sorted(required-cols)))
        # Use unique drive identifiers, NOT quarter-end scoring checkpoints.
        # Full-drive WP mean counts each meaningful possession once, rather
        # than weighting teams with more individual offensive snaps.
        sql = """
        WITH plays AS (
          SELECT CAST(game_id AS VARCHAR) AS game_id,
                 CAST(pos_team_id AS VARCHAR) AS team_id,
                 CAST(homeTeamId AS VARCHAR) AS home_id,
                 CAST(awayTeamId AS VARCHAR) AS away_id,
                 CAST("drive.id" AS VARCHAR) AS drive_id,
                 TRY_CAST(home_wp_before_naive AS DOUBLE) AS home_wp,
                 TRY_CAST(period AS INTEGER) AS period,
                 lower(CAST(scrimmage_play AS VARCHAR)) IN ('true','t','1') AS scrimmage,
                 lower(CAST(scoring_opp AS VARCHAR)) IN ('true','t','1') AS opp40,
                 upper(CAST("drive.result" AS VARCHAR)) AS drive_result
            FROM read_parquet(?)
           WHERE TRY_CAST(season AS INTEGER)=?
        ),
        meaningful AS (
           SELECT *, (scrimmage AND home_wp BETWEEN 0 AND 1
                  AND (period<=2 OR home_wp BETWEEN 0.05 AND 0.95)) AS meaningful
           FROM plays
           WHERE drive_id IS NOT NULL AND team_id IS NOT NULL
        ),
        drive_stats AS (
          SELECT game_id,drive_id,team_id,
                 MAX(home_id) AS home_id,MAX(away_id) AS away_id,
                 COUNT(*) FILTER(WHERE meaningful) AS meaningful_snaps,
                 AVG(home_wp) FILTER(WHERE meaningful) AS neutral_home_wp,
                 MAX(CASE WHEN meaningful AND opp40 THEN 1 ELSE 0 END) AS scoring_opportunity,
                 MAX(CASE WHEN meaningful AND drive_result='TD' THEN 7
                          WHEN meaningful AND drive_result='FG' THEN 3
                          ELSE 0 END) AS drive_points
            FROM meaningful
           GROUP BY game_id,drive_id,team_id
        ),
        drives AS (
          SELECT * FROM drive_stats WHERE meaningful_snaps > 0
        ),
        control AS (
          SELECT game_id,MAX(home_id) AS home_id,MAX(away_id) AS away_id,
                 AVG(neutral_home_wp) AS home_control,
                 COUNT(*) AS possessions
            FROM drives WHERE neutral_home_wp BETWEEN 0 AND 1
           GROUP BY game_id
        ),
        finish AS (
          SELECT game_id,team_id,
                 AVG(CASE WHEN scoring_opportunity=1 THEN drive_points END) AS pts_per_opp,
                 COUNT(*) FILTER(WHERE scoring_opportunity=1) AS opportunities,
                 COUNT(*) AS meaningful_drives
            FROM drives GROUP BY game_id,team_id
        )
        SELECT c.game_id,c.home_id,c.away_id,c.home_control,c.possessions,
               h.pts_per_opp,h.opportunities,h.meaningful_drives,
               a.pts_per_opp,a.opportunities,a.meaningful_drives
        FROM control c
        LEFT JOIN finish h ON c.game_id=h.game_id AND c.home_id=h.team_id
        LEFT JOIN finish a ON c.game_id=a.game_id AND c.away_id=a.team_id
        """
        vals=db.execute(sql,[str(pq),int(SEASON)]).fetchall()
        rows=[]
        for gid,hid,aid,wp,n,hpp,hn,hd,app,an,ad in vals:
            if wp is None or n<4:continue
            for team_id,control,own,own_n,own_d,other,other_n,other_d in (
                (hid,wp,hpp,hn,hd,app,an,ad),
                (aid,1-wp,app,an,ad,hpp,hn,hd)):
                if team_id is None:continue
                rows.append({
                    "game_id":gid,"team_id":team_id,
                    "neutral_wp_control":round(control,7) if 0<=control<=1 else None,
                    "control_possessions":n,
                    "off_pts_per_scoring_opp":round(own,6) if own is not None and 0<=own<=7 else None,
                    "off_scoring_opp_n":own_n or 0,
                    "def_pts_per_scoring_opp":round(other,6) if other is not None and 0<=other<=7 else None,
                    "def_scoring_opp_n":other_n or 0,
                    "off_meaningful_drives":own_d or 0,
                    "def_meaningful_drives":other_d or 0
                })
        if len(rows)<200:
            raise ValueError("Insufficient drive/PBP rows: "+str(len(rows)))
        with OUT.open("w",newline="",encoding="utf8") as fh:
            writer=csv.DictWriter(fh,fieldnames=FIELDS)
            writer.writeheader()
            writer.writerows(rows)
        source={'season':int(SEASON),'source_url':url,'team_game_rows':len(rows),
                'games':len(rows)//2,
                'fields':FIELDS,
                'control_definition':"Mean spread-free win probability per meaningful possession across both teams' drives, no Vegas spread",
                'finish_definition':"Drive-result points per offensive drive reaching opponent 40 before garbage time; defensive value from other team's opportunities",
                'garbage_time':"Second-half possessions with source spread-free WP <5% or >95% excluded",
                'caution':"A game with no actual scoring opportunities has null finish rate, not zero; drive results can misattribute unusual return touchdowns"}
        (DATA/f"drive_quality_metadata_{SEASON}.json").write_text(json.dumps(source,indent=2)+"\n")
        print("DRIVE_METRICS",json.dumps(source),flush=True)
if __name__=="__main__":
    main()
