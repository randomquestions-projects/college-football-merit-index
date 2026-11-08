#!/usr/bin/env python3
"""Refresh AP and CFP poll comparisons. NEVER feed poll data into CFMI.

The scores/ranking pipeline is independent of ESPN/AP/CFP. An unavailable or
unexpected poll feed retains the last verified snapshot, and prints a warning.
"""
import json
import re
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "site" / "data" / "polls_2026.json"
API = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/rankings"
ALIAS = {
  "miami": "Miami", "miami (fl)": "Miami", "miami fl": "Miami",
  "southern california":"USC", "southern cal":"USC", "usc":"USC",
  "mississippi":"Ole Miss", "ole miss":"Ole Miss",
  "connecticut":"UConn", "uconn":"UConn",
  "north carolina state":"NC State", "nc state":"NC State",
  "brigham young":"BYU", "byu":"BYU",
  "southern methodist":"SMU", "smu":"SMU",
  "appalachian state":"App State", "app state":"App State",
  "hawai'i":"Hawai'i", "hawaii":"Hawai'i",
  "texas christian":"TCU", "tcu":"TCU",
  "pennsylvania state":"Penn State", "penn state":"Penn State",
  "ut san antonio":"UTSA", "utsa":"UTSA",
  "florida state":"Florida State", "fla state":"Florida State",
  "new mexico state":"New Mexico State",
  "north dakota state":"North Dakota State",
}
def normalize(n):
  n=re.sub(r"\s+"," ",str(n or "").strip())
  lower=n.lower()
  return ALIAS.get(lower,n)

def candidates(records):
  result={}
  for poll in records:
    name=(str(poll.get("name") or "")+" "+str(poll.get("type") or "")).lower()
    key=("ap" if ("ap top" in name or "ap poll" in name or re.search(r"\bap\b",name))
         else "cfp" if ("college football playoff" in name or "cfp" in name or "playoff committee" in name)
         else None)
    ranks=poll.get("ranks") or []
    if key is None or len(ranks)<25:
      continue
    ordered=[None]*25
    for row in ranks:
      rank=row.get("current")
      try:rank=int(rank)
      except (ValueError,TypeError):continue
      if rank<1 or rank>25:continue
      team=row.get("team") or {}
      t=normalize(team.get("location") or team.get("shortDisplayName") or team.get("displayName") or "")
      if not t or ordered[rank-1] is not None:continue
      ordered[rank-1]=t
    if any(x is None for x in ordered) or len(set(ordered))!=25:
      continue
    result[key]=(ordered,poll)
  return result

def main():
  prev=json.loads(PATH.read_text(encoding="utf8")) if PATH.exists() else {"season":2026}
  if prev.get("season")!=2026:
    raise ValueError("Poll snapshot season mismatch")
  now=datetime.now(timezone.utc)
  params=urlencode({"season":2026})
  try:
    req=Request(API+"?"+params,headers={"User-Agent":"Mozilla/5.0 (compatible; CFMI/1.0)","Accept":"application/json"})
    with urlopen(req,timeout=30) as resp:
      raw=json.load(resp)
    print("ESPN RESPONSE KEYS",list(raw))
    polls=raw.get("rankings") or []
    print("ESPN POLL TYPES",[(x.get("name"),x.get("type"),len(x.get("ranks") or [])) for x in polls])
    available=candidates(polls)
  except Exception as exc:
    print("WARN poll API fetch failed; retaining previously verified poll snapshot:",repr(exc))
    available={}
  for name in ("ap","cfp"):
    old=prev.get(name,{})
    if name not in available:
      print("WARN",name,"was not in the new feed; keeping verified prior snapshot")
      continue
    names, poll=available[name]
    if len(names)!=25 or len(set(names))!=25:continue
    same=names==old.get("teams")
    if same:
      print("UNCHANGED",name,"latest confirmed list remains dated",old.get("release_date"))
    else:
      # Source often omits a reliable publication date. Mark detection date
      # separately; don't claim it was the official poll's release date.
      print("NEW SNAPSHOT",name,"detected on",now.date().isoformat())
      prev[name]={**old,
          "name":"Associated Press Top 25" if name=="ap" else "College Football Playoff Selection Committee",
          "teams":names,
          "source_url":"https://www.ncaa.com/rankings/football/fbs/associated-press" if name=="ap" else "https://collegefootballplayoff.com/rankings",
          "release_date":None,
          "detected_on_utc":now.date().isoformat(),
          "games_through":None,
          "date_label":"New snapshot detected; official release date not independently verified"}
  prev["last_checked_at_utc"]=now.isoformat()
  prev["automation_source"]="ESPN public college football rankings API; AP/CFP are comparison only"
  PATH.write_text(json.dumps(prev,indent=2,ensure_ascii=False)+"\n",encoding="utf8")
  print("POLL COMPARE READY", [(k,len(prev.get(k,{}).get("teams",[]))) for k in ("ap","cfp")])
if __name__=="__main__":
  main()
