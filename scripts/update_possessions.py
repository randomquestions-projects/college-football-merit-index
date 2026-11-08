#!/usr/bin/env python3
"""Add 2026 (or historical) neutral-state possession metrics to CFMI game data.

Uses granular verified SportsDataverse play-by-play (game and team IDs).
Never uses ESPN's team-seeded WP / Vegas spreads / polls. Trained 2023
state-only win probability is validated on heldout 2024/2025. Garbage is
defined by neutral-state WP outside 3%-97%; excluded on-field scrimmage plays
are not treated as evidence of quality. Scoring opportunities are DRIVES
with a meaningful scrimmage snap inside opponent 40, not individual plays.
"""
import csv,io,json,math,os,tempfile,urllib.request
from collections import defaultdict
from pathlib import Path
import duckdb

ROOT=Path(__file__).resolve().parents[1]
SEASON=str(os.environ.get("CFMI_SEASON","2026"))
if SEASON not in ("2024","2025","2026"):raise RuntimeError("Unexpected season")
DIR=ROOT/"site"/"data" if SEASON=="2026" else ROOT/"site"/"data"/"history"/SEASON
ADV=DIR/f"cfmi_advanced_{SEASON}.csv"
SCORES=DIR/f"cfb_schedules_{SEASON}.csv"
OUT=DIR/f"cfmi_possession_{SEASON}.csv"
WP=ROOT/"site"/"data"/"neutral_wp_model.json"
URL=f"https://github.com/sportsdataverse/sportsdataverse-data/releases/download/espn_cfb_pbp/play_by_play_{SEASON}.parquet"
FIELDS=["game_id","team","possession_control_wp","off_finish_pp40","def_finish_pp40",
        "off_redzone_td_rate","def_redzone_td_rate","off_ppa_nongarbage","def_ppa_nongarbage",
        "off_success_nongarbage","def_success_nongarbage","off_explosive_nongarbage",
        "def_explosive_nongarbage","scoring_opportunities","redzone_trips_actual",
        "drives_valid","meaningful_scrimmage_plays","excluded_garbage_plays"]
def num(v):
 try:
    n=float(v)
    return n if math.isfinite(n) else None
 except (TypeError,ValueError):return None
def fmean(vals):
 return sum(vals)/len(vals) if vals else None
def feature(score_diff,remaining_sec,home_pos,yte):
 m=max(.5,remaining_sec/60.0)
 p=1 if home_pos else -1
 z=(50-float(yte))/50
 return [float(score_diff)/math.sqrt(m+5),
         float(score_diff)/(m+8),
         p/math.sqrt(m+6),
         p*z/math.sqrt(m+6),
         m/60.0]
def prob(x,model):
 vals=[1]+[(v-a)/b for v,a,b in zip(x,model["scaler_mean"],model["scaler_sd"])]
 z=sum(k*t for k,t in zip(vals,model["coefficients"]))
 return 1/(1+math.exp(-max(-35,min(35,z))))
def make_stats():
 return {"epa":[],"success":0,"exp":0,"exp_den":0,"scrim":0,"garbage":0}
def main():
 model=json.loads(WP.read_text())
 if model.get("model_version")!="neutral-state-wp-v1":raise RuntimeError("Unvalidated state win probability version")
 with SCORES.open(newline="",encoding="utf-8-sig") as fh:games=list(csv.DictReader(fh))
 eligible={}
 for g in games:
    if g.get("season")==SEASON and g.get("season_type")=="regular" and g.get("completed")=="TRUE" and g.get("home_division")==g.get("away_division")=="fbs":
        eligible[int(g["game_id"])]={"home":int(g["home_id"]),"away":int(g["away_id"]),
                                    "home_name":g["home_team"],"away_name":g["away_team"]}
 if len(eligible)<200:raise RuntimeError("Too few eligible completed FBS-FBS games")
 req=urllib.request.Request(URL,headers={"User-Agent":"CFMI-neutral-possession-metrics/1.0"})
 with urllib.request.urlopen(req,timeout=180) as resp:blob=resp.read()
 print("POSSESSION_PBP_FETCH",SEASON,len(blob),"bytes",flush=True)
 selected='''game_id, game_play_number, pos_team_id, "drive.id", period,
             "clock.minutes", "clock.seconds", "start.homeScore",
             "start.awayScore", "start.pos_team.id", "start.yardsToEndzone",
             scrimmage_play, scoring_opp, rz_play, pos_score_pts,
             td_play, rush, "pass", yds_rushed, yds_receiving, EPA,
             penalty_no_play'''
 with tempfile.NamedTemporaryFile(suffix=".parquet") as tmp:
    tmp.write(blob);tmp.flush()
    db=duckdb.connect()
    sql=f'SELECT {selected} FROM read_parquet(?) WHERE season=? ORDER BY game_id, game_play_number'
    rows=db.execute(sql,[tmp.name,int(SEASON)]).fetchall()
    db.close()
 print("POSSESSION_PBP_ROWS",len(rows),flush=True)
 if len(rows)<50000:raise RuntimeError("Incomplete play-by-play data, refusing replacement")
 keys=[x.strip().strip('"') for x in selected.split(",")]
 drives={}
 stats=defaultdict(make_stats)
 game_control=defaultdict(list)
 seen_games=set()
 for row in rows:
    r=dict(zip(keys,row))
    gid=r["game_id"];g=eligible.get(gid)
    if g is None:continue
    team=r["pos_team_id"]
    if team not in (g["home"],g["away"]):continue
    side="home" if team==g["home"] else "away"
    seen_games.add(gid)
    did=r["drive.id"]
    if not did:continue
    k=(gid,str(did),team)
    drive=drives.setdefault(k,{"gid":gid,"team":team,"team_name":g[side+"_name"],
        "wps":[],"opportunity40":False,"redzone20":False,"points":0,"td":False,
        "scrimmage_count":0,"excluded":0})
    pts=num(r["pos_score_pts"])
    if pts is not None and 0<pts<=8:drive["points"]+=pts
    if r["td_play"] and pts is not None and pts>=6:drive["td"]=True
    if not r["scrimmage_play"] or r["penalty_no_play"]:continue
    period,minute,second=r["period"],r["clock.minutes"],r["clock.seconds"]
    if period is None or minute is None or int(period)>4 or int(period)<1:continue
    remaining=(4-int(period))*900+int(minute)*60+int(second or 0)
    hscore,ascore,yte=r["start.homeScore"],r["start.awayScore"],r["start.yardsToEndzone"]
    if hscore is None or ascore is None or yte is None or not 0<=remaining<=3600:continue
    if not 1<=int(yte)<=99:continue
    p=prob(feature(int(hscore)-int(ascore),remaining,team==g["home"],yte),model)
    stat=stats[(gid,team)]
    stat["scrim"]+=1
    if p<=.03 or p>=.97:
        stat["garbage"]+=1;drive["excluded"]+=1
        continue
    drive["scrimmage_count"]+=1
    drive["wps"].append(p)
    if r["scoring_opp"] or int(yte)<=40:drive["opportunity40"]=True
    if r["rz_play"] or int(yte)<=20:drive["redzone20"]=True
    epa=num(r["EPA"])
    if epa is not None and -10<=epa<=10:
        stat["epa"].append(epa)
        stat["success"]+=int(epa>0)
    if r["rush"] or r["pass"]:
        stat["exp_den"]+=1
        rush_yards=num(r["yds_rushed"])
        pass_yards=num(r["yds_receiving"])
        explosive=(bool(r["rush"]) and rush_yards is not None and rush_yards>=12) or (bool(r["pass"]) and pass_yards is not None and pass_yards>=16)
        stat["exp"]+=int(explosive)
 for d in drives.values():
    if d["wps"]:game_control[d["gid"]].append(fmean(d["wps"]))
 byteam=defaultdict(lambda:{"opp40":0,"pts40":0,"rz20":0,"rztd":0,"drives":0})
 for d in drives.values():
    if not d["wps"]:continue
    k=(d["gid"],d["team"]);x=byteam[k]
    x["drives"]+=1
    if d["opportunity40"]:
        x["opp40"]+=1
        x["pts40"]+=min(8,max(0,d["points"]))
    if d["redzone20"]:
        x["rz20"]+=1
        x["rztd"]+=int(d["td"])
 out=[]
 for gid,g in eligible.items():
    vals=game_control.get(gid,[])
    for side,other in (("home","away"),("away","home")):
        tid,oid=g[side],g[other]
        s,opp=stats.get((gid,tid),make_stats()),stats.get((gid,oid),make_stats())
        d,od=byteam[(gid,tid)],byteam[(gid,oid)]
        offepa=fmean(s["epa"]);defepa=fmean(opp["epa"])
        valswp=fmean(vals)
        record={
          "game_id":str(gid),"team":g[side+"_name"],
          "possession_control_wp":valswp if side=="home" or valswp is None else 1-valswp,
          "off_finish_pp40":d["pts40"]/d["opp40"] if d["opp40"] else None,
          "def_finish_pp40":od["pts40"]/od["opp40"] if od["opp40"] else None,
          "off_redzone_td_rate":d["rztd"]/d["rz20"] if d["rz20"] else None,
          "def_redzone_td_rate":od["rztd"]/od["rz20"] if od["rz20"] else None,
          "off_ppa_nongarbage":offepa,"def_ppa_nongarbage":defepa,
          "off_success_nongarbage":s["success"]/len(s["epa"]) if s["epa"] else None,
          "def_success_nongarbage":opp["success"]/len(opp["epa"]) if opp["epa"] else None,
          "off_explosive_nongarbage":s["exp"]/s["exp_den"] if s["exp_den"] else None,
          "def_explosive_nongarbage":opp["exp"]/opp["exp_den"] if opp["exp_den"] else None,
          "scoring_opportunities":d["opp40"],"redzone_trips_actual":d["rz20"],
          "drives_valid":d["drives"],
          "meaningful_scrimmage_plays":s["scrim"]-s["garbage"],
          "excluded_garbage_plays":s["garbage"]
        }
        if s["scrim"]<8:continue
        out.append(record)
 if len(seen_games)<200 or len(out)<400:raise RuntimeError("Insufficient completed-game possession coverage: "+str((len(seen_games),len(out))))
 with OUT.open("w",newline="",encoding="utf8") as fh:
    writer=csv.DictWriter(fh,fieldnames=FIELDS);writer.writeheader();writer.writerows(out)
 # Preserve original box metrics and merge every PBP-derived metric by game and team;
 # do NOT silently replace "EPA_explosive_rate" or red-zone play-success with
 # incompatible units. New explicitly named metrics are preferred in model V4.
 with ADV.open(newline="",encoding="utf-8-sig") as fh: old=list(csv.DictReader(fh))
 if not old:raise RuntimeError("No base advanced games to enrich")
 join={(r["game_id"],r["team"]):r for r in out}
 enriched=[]
 for r in old:
    x=join.get((r["game_id"],r["team"]))
    if x:r.update({k:v for k,v in x.items() if k not in ("game_id","team")})
    enriched.append(r)
 fields=list(old[0])
 for f in FIELDS:
    if f not in ("game_id","team") and f not in fields:fields.append(f)
 with ADV.open("w",newline="",encoding="utf8") as fh:
    writer=csv.DictWriter(fh,fieldnames=fields,extrasaction="ignore")
    writer.writeheader();writer.writerows(enriched)
 stats_out={
  "season":int(SEASON),"pbp_source":URL,
  "game_count_fbs_eligible":len(eligible),"games_with_pbp":len(seen_games),
  "matched_team_games":len(out),"enriched_team_games":len([r for r in old if (r["game_id"],r["team"]) in join]),
  "scrimmage_plays":sum(s["scrim"] for s in stats.values()),
  "garbage_excluded_plays":sum(s["garbage"] for s in stats.values()),
  "meaningful_scoring_opportunities":sum(x["opp40"] for x in byteam.values()),
  "model":"2023-trained score-clock-possession-field only / heldout 2024-25, 3–97% garbage-window",
 }
 (DIR/"possession_metadata.json").write_text(json.dumps(stats_out,indent=2)+"\n")
 print("CFMI POSSESSION ENRICHMENT",json.dumps(stats_out),flush=True)
 for x in out:
    if x["team"]=="Georgia" and x["game_id"]=="401856741":
        print("GEORGIA_OLE_MISS_POSSESSION",x,flush=True)
if __name__=="__main__":main()
