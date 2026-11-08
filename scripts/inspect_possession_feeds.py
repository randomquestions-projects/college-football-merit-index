#!/usr/bin/env python3
"""One-time public feed schema and sample inspection for CFMI drive/PBP research.
Only public football data; emits no personal data.
"""
import csv,io,os,tempfile,urllib.request
root="https://github.com/sportsdataverse/sportsdataverse-data/releases/download"
assets=[
 ("drives",f"{root}/espn_cfb_drives/drives_2026.csv"),
 ("adv_drives",f"{root}/espn_cfb_adv_drives/adv_drives_2026.csv"),
]
for name,url in assets:
 print("===SCHEMA",name,url,flush=True)
 try:
  req=urllib.request.Request(url,headers={"User-Agent":"CFMI-schema-audit/1.0"})
  with urllib.request.urlopen(req,timeout=90) as resp:raw=resp.read()
  rows=list(csv.DictReader(io.StringIO(raw.decode("utf-8-sig"))))
  print("ROWS",len(rows),"FIELDS",list(rows[0]),flush=True)
  for r in rows[:2]:
   print("EXAMPLE",name,{k:str(v)[:90] for k,v in r.items()},flush=True)
  matches=[r for r in rows if str(r.get("game_id",""))=="401856741"]
  print("GEORGIA_OLE_MISS_ROWS",len(matches),flush=True)
  for r in matches[:3]:print("GEORGIA_OM",name,{k:str(v)[:60] for k,v in r.items()},flush=True)
 except Exception as exc:print("FAIL",name,repr(exc),flush=True)
# 2026 pbp parquet: only read metadata (download temp, never store on site).
try:
 import duckdb
 url=f"{root}/espn_cfb_pbp/play_by_play_2026.parquet"
 print("===PBP METADATA",url,flush=True)
 req=urllib.request.Request(url,headers={"User-Agent":"CFMI-schema-audit/1.0"})
 with urllib.request.urlopen(req,timeout=120) as resp:data=resp.read()
 print("PBP_BYTES",len(data),flush=True)
 with tempfile.NamedTemporaryFile(suffix=".parquet") as tmp:
  tmp.write(data);tmp.flush()
  con=duckdb.connect()
  # all column names; filter only GEORGIA sample, avoid huge logs
  cols=con.execute("describe select * from read_parquet(?)",[tmp.name]).fetchall()
  print("PBP_FIELDS",cols,flush=True)
  keys=[c[0] for c in cols]
  gid=next((k for k in keys if k.lower() in ["game_id","gameid","espn_game_id"]),None)
  if gid:
   select=["game_id","game_play_number","pos_team_id","homeTeamId","awayTeamId","drive.id","start.TimeSecsRem","start.homeScore","start.awayScore","end.homeScore","end.awayScore","start.yardsToEndzone","start.pos_team.id","homeFinalScore","awayFinalScore","scrimmage_play","rz_play","scoring_opp","pos_score_pts","td_play","fg_made","start.is_home","home_wp_before"]
   select=[x for x in select if x in keys]
   fields=", ".join('"'+x.replace('"','""')+'"' for x in select)
   try:
    q=f"select {fields} from read_parquet(?) where game_id=401856741 order by game_play_number limit 14"
    rows=con.execute(q,[tmp.name]).fetchall()
    print("PBP_SELECTED_FIELDS",select,flush=True)
    for row in rows: print("GEORGIA_PBP_ROW",dict(zip(select,row)),flush=True)
    print("PBP_ROWS_COUNT",con.execute("select count(*) from read_parquet(?) where game_id=401856741",[tmp.name]).fetchone(),flush=True)
   except Exception as exc:print("PBP_SAMPLE_ERROR",repr(exc),flush=True)
except Exception as exc:print("PBP_METADATA_FAIL",repr(exc),flush=True)
