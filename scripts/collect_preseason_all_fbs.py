#!/usr/bin/env python3
"""Collect all-FBS preseason talent, returning production and transfer data.
Research artifacts only; each season's inputs are kept separate and source
hashes recorded. Previous-year results remain outside this data layer.
"""
import csv,hashlib,io,json,math,tempfile,urllib.request
from collections import defaultdict
from datetime import datetime,timezone
from pathlib import Path
import duckdb
ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'site'/'data'
BASE='https://github.com/sportsdataverse/sportsdataverse-data/releases/download'
YEARS=(2024,2025,2026)
SOURCES=['cfb_team_talent','cfb_returning_production','cfb_team_portal']
def grab(family,year):
 url=f'{BASE}/{family}/{family}_{year}.parquet'
 with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'CFMI-research-snapshot/0.2'}),timeout=45) as r:
  b=r.read(6000000)
 if not b.startswith(b'PAR1') or not b.endswith(b'PAR1'):raise RuntimeError('Invalid parquet '+url)
 with tempfile.NamedTemporaryFile(suffix='.parquet') as f:
  f.write(b);f.flush()
  rows=duckdb.sql("SELECT * FROM read_parquet(?)",[f.name]).df() if False else duckdb.read_parquet(f.name).df()
 return rows,b,url
def valid(v):
 try:
  v=float(v)
  return v if math.isfinite(v) else None
 except (ValueError,TypeError):return None
def percentile(values,x):
 if x is None:return None
 if not values:return None
 below=sum(v<x for v in values)
 equal=sum(v==x for v in values)
 return (below+equal*.5)/len(values)
def main():
 schedule={}
 for year in YEARS:
  path=(DATA if year==2026 else DATA/'history'/str(year))/f'cfb_schedules_{year}.csv'
  if not path.exists():raise RuntimeError('Schedules must be downloaded before preseason sources: '+str(path))
  rows=list(csv.DictReader(path.open()))
  ids=set()
  team_names={}
  for game in rows:
   if str(game.get('season'))!=str(year):continue
   for side in ('home','away'):
    if game.get(f'{side}_division')=='fbs':
     i=str(game.get(f'{side}_id',''))
     if i and i!='None':ids.add(i);team_names[i]=game.get(f'{side}_team')
  if len(ids)<125:raise RuntimeError('Schedule does not cover all FBS teams '+str(year))
  schedule[year]=(ids,team_names)
 report={'version':'preseason-sources-v0.2','builtAtUtc':datetime.now(timezone.utc).isoformat(),
  'seasons':{},'limitations':[
  'Historical files were retrieved in November 2026: their original preseason publication timestamps have not been independently frozen.',
  'Team talent is a recruiting-class composite; it is not necessarily a verified active-player-by-player roster or a top-30-snap weighted starter grade.',
  'Return-production and portal observations may use ESPN roster snapshots revised after season start; do not label as original publication-time forecasts.',
  'Available transfer talent is based on players with recruit-name matches; zero for an unmatched player is missing evidence, not proof of no talent.',
  'Blue-chip ratio overlaps strongly with talent composite; retain separately for inspection rather than count as full new evidence.',
  'No coach or coordinator ratings are inferred. Unknown coaching inputs stay null.'
  ]}
 for year in YEARS:
  ids,names=schedule[year]
  archives={}
  sources={}
  for fam in SOURCES:
   df,b,url=grab(fam,year)
   cols=list(df.columns)
   if 'team_id' not in cols:raise RuntimeError('Missing team_id '+fam)
   records={str(x['team_id']):x for x in df.to_dict('records')}
   archives[fam]=records
   sources[fam]={'url':url,'sha256':hashlib.sha256(b).hexdigest(),'rawRows':len(df),'fields':cols}
  teams={}
  for tid in sorted(ids,key=int):
   a=archives['cfb_team_talent'].get(tid,{})
   b=archives['cfb_returning_production'].get(tid,{})
   c=archives['cfb_team_portal'].get(tid,{})
   teams[tid]={
    'team':names.get(tid), 'teamId':tid, 'season':year,
    'talentComposite':valid(a.get('talent_composite')),
    'talentRankRaw':valid(a.get('talent_rank')),
    'blueChipRatio':valid(a.get('blue_chip_ratio')),
    'ratedRecruitCount':valid(a.get('n_recruits')),
    'returningOffense':valid(b.get('off_returning')),
    'returningDefense':valid(b.get('def_returning')),
    'returningOverall':valid(b.get('overall_returning')),
    'returningPlayers':valid(b.get('n_returning')),
    'returningEstimated':str(b.get('is_estimated','')).lower()=='true' if b else None,
    'rosterN':valid(c.get('roster_n')),
    'transfersIn':valid(c.get('transfers_in_n')),
    'transfersOut':valid(c.get('transfers_out_n')),
    'portalShare':valid(c.get('portal_share')),
    'transferTalentIn':valid(c.get('transfer_talent_in')),
    'transferTalentOut':valid(c.get('transfer_talent_out')),
    'netTransferTalent':valid(c.get('net_transfer_talent')),
    'headCoachChanged':None,'offCoordinatorChanged':None,'defCoordinatorChanged':None,
    'top30StarRating':None,'next50StarRating':None,
    'preseasonSourceCoverage':{
     'talent':tid in archives['cfb_team_talent'],
     'returning':tid in archives['cfb_returning_production'],
     'portal':tid in archives['cfb_team_portal']
    }
   }
  full=[t for t in teams.values() if t['talentComposite'] is not None]
  if len(full)<125:raise RuntimeError(f'{year} coverage too low: {len(full)}/{len(teams)} FBS talents')
  fields=['talentComposite','blueChipRatio','returningOverall','returningOffense','returningDefense','netTransferTalent','portalShare']
  for field in fields:
   vals=[t[field] for t in teams.values() if t[field] is not None]
   for t in teams.values():
    t[field+'Pct']=percentile(vals,t[field])
  # Missing talent: impute at 25th percentile *of observed FBS*, not P4.
  # A P4-based default can inflate G5 relative strength and silently recreate
  # the conference bias that CFMI is intended to avoid.
  rosterScores=sorted(t['talentComposite'] for t in teams.values() if t['talentComposite'] is not None)
  fbsFallback=rosterScores[int(.25*(len(rosterScores)-1))]
  for t in teams.values():
   t['talentIsImputed']=t['talentComposite'] is None
   t['talentFallbackPolicy']='FBS_25th_percentile_high_uncertainty' if t['talentIsImputed'] else 'measured'
   if t['talentIsImputed']:
    t['talentComposite']=fbsFallback
    t['talentCompositePct']=.25
  report['seasons'][str(year)]={
   'sourceHashes':sources,
   'coverage':{
    'FbsTeams':len(ids),
    'talent':sum(t['preseasonSourceCoverage']['talent'] for t in teams.values()),
    'returning':sum(t['preseasonSourceCoverage']['returning'] for t in teams.values()),
    'portal':sum(t['preseasonSourceCoverage']['portal'] for t in teams.values()),
    'coaching':0,
    'top30Star':0
   },
   'imputation':{'count':sum(t['talentIsImputed'] for t in teams.values()),
    'fallbackTalentComposite':fbsFallback,'fallbackPopulation':'all observed FBS teams'},
   'teams':teams
  }
  print('FULL_PRESEASON_SOURCE_AUDIT',json.dumps({
   'season':year,'coverage':report['seasons'][str(year)]['coverage'],
   'imputation':report['seasons'][str(year)]['imputation'],
   'sample':{t:next(({'talentComposite':x['talentComposite'],
    'talentCompositePct':x['talentCompositePct'],'returning':x['returningOverall'],
    'portalShare':x['portalShare']} for x in teams.values() if x['team']==t),None)
      for t in ['Liberty','New Mexico','Ole Miss','Georgia','North Dakota State']}
   }),flush=True)
 (DATA/'preseason_full_sources_2024_2026.json').write_text(json.dumps(report,indent=2,allow_nan=False)+'\n')
if __name__=='__main__':main()
