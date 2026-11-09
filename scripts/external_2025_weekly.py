#!/usr/bin/env python3
"""2025 fallbacks when cfbtxt's 2025 combined rating archive is unavailable.
ESPN FPI: source-dated SportsDataverse weekly snapshots. Exclude overwritten
week-1 ratings and any rating whose as-of or last-updated date is after the
first scheduled kickoff of the game week.
FEI: Brian Fremeau's retrospective 2025 WEEKLY FEI table at BCF Toys.
2025 FEI tables are game-week aligned, but not immutable timestamped releases:
show this caveat in user-facing comparative data.
No 2025 SP+ official dated team snapshots have been verified; do NOT invent.
"""
import urllib.request,tempfile,math,re
from datetime import date,datetime
import duckdb
from bs4 import BeautifulSoup

FPI='https://github.com/sportsdataverse/sportsdataverse-data/releases/download/cfb_fpi_weekly/cfb_fpi_weekly_2025.parquet'
FEI='https://bcftoys.com/2025-wfei'
def read(url,limit=8000000):
 req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 CFMI independent 2025 weekly analytics study'})
 with urllib.request.urlopen(req,timeout=75) as r:
  b=r.read(limit+1)
 if len(b)>limit:raise RuntimeError('Archive unexpectedly large: '+url)
 return b
def as_date(v):
 try:return date.fromisoformat(str(v)[:10])
 except ValueError:return None
def parse_key(v):
 s=str(v)
 try:return date(int(s[:4]),int(s[4:6]),int(s[6:8]))
 except (ValueError,TypeError):return None
def yes(v):
 return str(v).lower() in ('true','1','t','yes')
def no(v):
 return str(v).lower() in ('false','0','f','no')
def fpi_snapshots(id_to_norm):
 b=read(FPI)
 if not b.startswith(b'PAR1') or not b.endswith(b'PAR1'):raise RuntimeError('FPI archive is not valid parquet')
 with tempfile.NamedTemporaryFile(suffix='.parquet') as f:
  f.write(b);f.flush()
  df=duckdb.read_parquet(f.name).df()
 rows=df.to_dict('records')
 groups={}
 for r in rows:
  try:
   if int(r['season'])!=2025 or int(r['season_type'])!=2:continue
   # Explicitly reject ESPN's overwritten week 1 (Dec 2025 rating stored in W1).
   if not no(r.get('snapshot_out_of_sequence')):continue
   if not yes(r.get('snapshot_is_contemporaneous')):continue
   cutoff=parse_key(r.get('run_date_time_key'))
   last=as_date(r.get('last_updated'))
   if not cutoff or not last:continue
   tid=str(r['team_id'])
   name=id_to_norm.get(tid)
   value=float(r['fpi'])
   rank=int(float(r['rank']))
   if not name or not math.isfinite(value):continue
   group=groups.setdefault(cutoff,{'teams':{},'latestUpdated':last})
   group['teams'][name]={'rating':value,'rank':rank}
   if last>group['latestUpdated']:group['latestUpdated']=last
  except (TypeError,ValueError,KeyError):continue
 records=[]
 for asof,group in groups.items():
  updated=group['latestUpdated'];teams=group['teams']
  if len(teams)>=125 and len(set(t['rank'] for t in teams.values()))>=110:
   records.append({'metric':'fpi','snapshot':asof,'sourceDate':updated,
    'teams':teams,'source':'SportsDataverse ESPN FPI weekly 2025; original run-date and max last-updated checked'})
 print('CFMI 2025 FPI ORIGINAL-SOURCE AUDIT',{
   'rawRecords':len(rows),'validGroupDates':len(groups),
   'teamCounts':[(d.isoformat(),len(g['teams']),g['latestUpdated'].isoformat()) for d,g in sorted(groups.items())],
   'approvedSnapshots':len(records)},flush=True)
 return records
def fei_weekly(normalize):
 b=read(FEI,limit=7000000)
 soup=BeautifulSoup(b,'html.parser')
 weeks={}
 for heading in soup.find_all('h3'):
  label=heading.get_text(' ',strip=True)
  if not label.endswith(' 2025 Weekly Ratings'):continue
  team=normalize(label[:-len(' 2025 Weekly Ratings')])
  table=heading.find_parent('table')
  if not table:continue
  for tr in table.find_all('tr'):
   cells=[c.get_text(' ',strip=True) for c in tr.find_all('td',recursive=False)]
   if len(cells)<22:continue
   for offset in (0,12):
    try:
     w=cells[offset]
     if w=='P':week=-1
     else:week=int(w)
     rating=float(cells[offset+3])
     rank=int(cells[offset+4])
     if not math.isfinite(rating) or rank<1 or rank>160:continue
     weeks.setdefault(week,{})[team]={'rating':rating,'rank':rank}
    except (ValueError,IndexError,TypeError):continue
 if max((len(teams) for teams in weeks.values()),default=0)<125:
  raise RuntimeError('Cannot parse at least 125 FBS teams in 2025 FEI weekly HTML')
 # Each FEI week is AFTER the games in that week. The Week 0 model is
 # used to predict Week 1; 1 to predict Week 2, etc.
 return weeks
def load_2025_fallback(schedules,normalize):
 ids={}
 for team in schedules.values():
  tid=str(team['teamId'])
  ids[tid]=normalize(team['team'])
 fpi=fpi_snapshots(ids)
 fei=fei_weekly(normalize)
 return {'fpi':fpi,'fei':fei,'urls':{'fpi':FPI,'fei':FEI},
  'coverage':{
   'fpiSnapshots':len(fpi),
   'fpiFirst':min((x['snapshot'].isoformat() for x in fpi),default=None),
   'feiWeeks':{w:len(t) for w,t in sorted(fei.items())},
   'feiOriginalTimestampVerifiable':False
  }}
