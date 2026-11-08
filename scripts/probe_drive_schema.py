#!/usr/bin/env python3
"""Read schemas of the publicly published drive and play-by-play files.
Print only header and one de-identified game row to GitHub Actions logs.
No output is committed; public sports data only.
"""
import csv
import io
import json
import urllib.request
from collections import Counter

BASE="https://github.com/sportsdataverse/sportsdataverse-data/releases/download"
FEEDS={
 "drives":f"{BASE}/espn_cfb_drives/drives_2026.csv",
 "advanced_drives":f"{BASE}/espn_cfb_adv_drives/adv_drives_2026.csv",
 "pbp":f"{BASE}/espn_cfb_pbp/play_by_play_2026.csv"
}
for name,url in FEEDS.items():
 try:
  req=urllib.request.Request(url,headers={"User-Agent":"CFMI-research-probe/1.0"})
  with urllib.request.urlopen(req,timeout=70) as resp:
   first=resp.readline().decode("utf-8-sig")
   second=resp.readline().decode("utf-8-sig")
   third=resp.readline().decode("utf-8-sig")
  header=next(csv.reader([first]))
  rows=list(csv.DictReader(io.StringIO(first+second+third)))
  wanted=("game_id","id","drive_id","play_id","start_time","period","start_period","end_period","offense","offense_id","defense_id","team_id","short_text","scoring_type","scoring_play","home_win_probability","home_win_prob","win_probability","home_wp","offense_wp","wp","seconds_remaining","clock","start_clock","end_clock","yards_to_goal","play_type","start_yards_to_goal","yards","start_yardline","drive_result","result","points","offense_score","defense_score")
  print("SCHEMA",name,len(header),json.dumps(header))
  for row in rows[:1]:
   print("SAMPLE",name,json.dumps({k:row.get(k) for k in wanted if k in row}))
 except Exception as ex:print("ERROR",name,repr(ex))
