#!/usr/bin/env python3
"""Refresh external comparator rankings for CFMI, never a model input.

Snapshots from CFB TXT: historical dated downloads of ESPN FPI, Bill Connelly
SP+, and Brian Fremeau FEI. Preserve each metric's original source date.
For each metric, use only the newest internally consistent complete 2026
snapshot; no extrapolation and no re-ranking across different ratings.
"""
import csv,io,json,os,re,urllib.request
from collections import defaultdict
from datetime import datetime,timezone
from pathlib import Path

SEASON=2026
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"site"/"data"/"external_rankings_2026.json"
URL="https://cfbtxt.com/data/ratings_snapshots/2026/historical_ratings.csv"
SOURCE={
 "fpi":("ESPN FPI","https://www.espn.com/college-football/fpi"),
 "sp_plus":("SP+","https://pay.cfbupdate.com/sp-ratings"),
 "fei":("FEI","https://bcftoys.com/2026-fei/"),
}
def normalize(value):
    s=" ".join(str(value or "").strip().split())
    aliases={
      "Miami (FL)":"Miami","Miami (Fla.)":"Miami","Southern California":"USC",
      "Southern Cal":"USC","Mississippi":"Ole Miss","Brigham Young":"BYU",
      "Connecticut":"UConn","North Carolina State":"NC State",
      "Hawaii":"Hawai'i","Hawaiʻi":"Hawai'i",
      "Appalachian State":"App State","N. Illinois":"Northern Illinois",
      "Northern Ill.":"Northern Illinois","Texas-San Antonio":"UTSA",
      "Massachusetts":"UMass","Louisiana-Lafayette":"Louisiana",
    }
    return aliases.get(s,s)
def load():
    req=urllib.request.Request(URL,headers={"User-Agent":"Mozilla/5.0 (compatible; CFMI comparisons/1.0)","Accept":"text/csv"})
    with urllib.request.urlopen(req,timeout=45) as resp:
      blob=resp.read(6_000_001)
      if len(blob)>6_000_000:raise RuntimeError("External ratings CSV unexpectedly large")
      content_type=resp.headers.get("Content-Type","")
      if "csv" not in content_type and not blob.startswith(b"season,"):raise RuntimeError("Unexpected external data format")
    records=list(csv.DictReader(io.StringIO(blob.decode("utf-8-sig"))))
    if len(records)<300:raise RuntimeError("External rating snapshot contains too few rows")
    required={"season","snapshot_date","metric","team","rating","rank","source_date"}
    if not required.issubset(records[0]):raise RuntimeError("Unexpected rating columns: "+str(list(records[0])))
    grouped=defaultdict(list)
    for r in records:
      if str(r["season"])!="2026":continue
      key=str(r["metric"]).lower().strip()
      if key not in SOURCE:continue
      try:
        rank=int(r["rank"]);rating=float(r["rating"])
        day=str(r["snapshot_date"]).strip()
        datetime.fromisoformat(day)
      except (ValueError,TypeError):continue
      if rank<1 or rank>160 or not (-1000<rating<1000):continue
      grouped[(key,day)].append({"team":normalize(r["team"]),"rank":rank,"rating":rating,"source_date":r["source_date"]})
    out={"season":2026,"source":"CFB TXT dated external rating snapshots","source_url":URL,
         "checked_at_utc":datetime.now(timezone.utc).isoformat(),"systems":{}}
    for key,(name,original) in SOURCE.items():
      batches=sorted(((day,rows) for (k,day),rows in grouped.items() if k==key),reverse=True)
      accepted=None
      for day,rows in batches:
        if len(rows)<100:continue
        seen=set();ranked={}
        for r in sorted(rows,key=lambda x:x["rank"]):
          t=r["team"]
          if t in seen:continue
          seen.add(t);ranked[t]=r
        unique_ranks={r["rank"] for r in ranked.values()}
        if len(ranked)<100 or len(unique_ranks)<95 or min(unique_ranks)!=1:continue
        accepted=(day,ranked)
        break
      if not accepted:
        print("WARN: No complete verified",key,"snapshot; leaving comparator unavailable",flush=True)
        continue
      day,ranked=accepted
      dates=sorted(set(r.get("source_date") for r in ranked.values() if r.get("source_date")))
      # Original source date is more important than the ingest/snapshot date.
      out["systems"][key]={
        "name":name,"original_source_url":original,"snapshot_date":day,
        "source_dates":dates,"source_date":max(dates) if dates else None,
        "team_count":len(ranked),"teams":ranked
      }
      print("EXTERNAL RANKING",key,len(ranked),"snapshot",day,"original source",dates[-1] if dates else None,
            "Top5",[(r["team"],r["rank"]) for r in sorted(ranked.values(),key=lambda x:x["rank"])[:5]],flush=True)
    if len(out["systems"])<2:raise RuntimeError("Less than two verified external power-ratings sources")
    OUT.parent.mkdir(parents=True,exist_ok=True)
    OUT.write_text(json.dumps(out,indent=2,ensure_ascii=False)+"\n",encoding="utf8")
    print("EXTERNAL COMPARISON SNAPSHOT",OUT,flush=True)
if __name__=="__main__":load()
