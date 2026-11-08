#!/usr/bin/env python3
"""Research-only 2024/25/26 roster tier and 2026 preseason talent composite.
Ratings are all sourced, by season, not future years; no default conference prior.
Tier means are an explicitly approximate roster-depth proxy, NOT actual player
snap evaluations (no jersey/start-position/snap counts in this source).
"""
from __future__ import annotations
import csv,io,json,re,html,urllib.request,hashlib
from pathlib import Path
from datetime import datetime,timezone
ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'site'/'data'
DATA.mkdir(parents=True,exist_ok=True)
TIERS=['elite','4★T100','4★T250','3★T100pos','3★avg','2★','1★']
APPROX_RATINGS=[99,94,91,87,83,77,72]
def get(url):
 req=urllib.request.Request(url,headers={"User-Agent":"CFMI season-only talent backtest/1.0","Accept":"text/html,text/csv,*/*"})
 with urllib.request.urlopen(req,timeout=55) as resp:return resp.read()
def norm(name):
 n=re.sub(r'[^a-z0-9]','',name.lower())
 aliases={'mississippi':'olemiss','miamifl':'miami','miamiflorida':'miami','hawaii':'hawaii',
 'northcarolinastate':'ncstate','louisianalafayette':'louisiana',
 'floridainternational':'fiu','appalachianstate':'appstate',
 'centralflorida':'ucf','texassanantonio':'utsa','texaselpaso':'utep',
 'southflorida':'southflorida','connecticut':'uconn','southerncal':'usc',
 'brighamyoung':'byu','massachusetts':'umass','louisianamonroe':'ulm',
 'samhoustonstate':'samhouston','sanjo​​sestate':'sanjosestate'}
 return aliases.get(n,n)
def roster(html_text,year):
 cards=re.split(r'<div class="rb-card"\s',html_text)[1:]
 result=[]
 for card in cards:
  name=re.search(r'class="rb-card__name"[^>]*>(.*?)</a>',card,re.S)
  count=re.search(r'class="rb-bar" title="([^"]+)"',card)
  rank=re.search(r'class="rb-card__rank">\s*(\d+)\.',card)
  if not name or not count:continue
  team=html.unescape(re.sub(r'<[^>]*>','',name.group(1))).strip()
  values=[]
  for tier in TIERS:
   pattern=r'(\d+)\s+'+re.escape(tier)+r'(?=\s*\||\s*$)'
   m=re.search(pattern,count.group(1))
   values.append(int(m.group(1)) if m else 0)
  players=sum(values)
  if players<10:continue
  def avg_between(start,end):
   scores=[score for n,score in zip(values,APPROX_RATINGS) for _ in range(n)]
   part=scores[start:end]
   return sum(part)/len(part) if part else None
  full=[score for n,score in zip(values,APPROX_RATINGS) for _ in range(n)]
  result.append(dict(
   season=year,team=team,teamKey=norm(team),
   archiveRosterRank=int(rank.group(1)) if rank else None,
   ratedPlayers=players,top30TierProxy=avg_between(0,30),
   depth31to80TierProxy=avg_between(30,80),
   overallTierMean=sum(full)/len(full),
   blueChipRatio=(values[0]+values[1]+values[2])/players,
   fiveStarPlayers=values[0],fourStarPlayers=values[1]+values[2],
   starTierCounts=dict(zip(TIERS,values)),
   source="Punt and Rally archived "+str(year)+" roster-tier breakdown",
   sourceUrl='https://www.puntandrally.com/talent.php?view=roster&whichyear='+str(year)))
 keys=[r['teamKey'] for r in result]
 if len(result)<115 or len(set(keys))!=len(keys):
  raise RuntimeError(f'Insufficient, duplicate or unreadable {year} roster: rows {len(result)}, unique {len(set(keys))}')
 return result
def read_csv(url):
 rows=list(csv.DictReader(io.StringIO(get(url).decode('utf-8-sig'))))
 if len(rows)<130:raise RuntimeError('Incomplete CSV source '+url)
 return rows
def main():
 out={'version':'research-2026-11-08','generatedAt':datetime.now(timezone.utc).isoformat(),
  'temporalPolicy':'Each season uses ONLY its same-year published roster breakdown; original publication dates and retrospective revisions not independently verifiable.',
  'caveat':'Tier-score top30 is an approximation to rated recruiting tiers, NOT actual current top30 players, playing time or positional value. Historical pages may have retrospective updates; coaching and return-production unavailable in this dataset.',
  'years':{},'sourceHashes':{}}
 for y in [2024,2025,2026]:
  url=f'https://www.puntandrally.com/talent.php?view=roster&whichyear={y}'
  raw=get(url);out['sourceHashes'][str(y)]=hashlib.sha256(raw).hexdigest()
  out['years'][str(y)]=roster(raw.decode('utf-8','replace'),y)
  print('TALENT ROSTER',y,'rows',len(out['years'][str(y)]),'sample',[dict(name=x['team'],top30=x['top30TierProxy'],depth=x['depth31to80TierProxy']) for x in out['years'][str(y)][:2]],flush=True)
 for key,metric in [('talent_composite','Talent composite'),('bluechip','Blue-chip ratio')]:
  url='https://collegefootballcharts.com/stats/'+('talent-composite' if key=='talent_composite' else 'blue-chip-ratio')+'.csv'
  source=read_csv(url)
  mapped={norm(x['team']):float(x[metric]) for x in source if x.get(metric) and x.get('team')}
  for team in out['years']['2026']:
   val=mapped.get(team['teamKey'])
   team[key]=val
  if sum(x.get(key) is not None for x in out['years']['2026'])<125:raise RuntimeError('Poor 2026 source team join '+key)
  out['sourceHashes'][key]=hashlib.sha256(json.dumps(source,sort_keys=True).encode()).hexdigest()
  print('TALENT 2026 join',key,sum(x.get(key) is not None for x in out['years']['2026']),flush=True)
 # Normalize each YEAR separately so 2024 teams are not ranked with 2026 roster info.
 for y,rows in out['years'].items():
  xs=sorted(r['top30TierProxy'] for r in rows)
  ys=sorted(r['depth31to80TierProxy'] or 75 for r in rows)
  def pct(vals,v):return 100*sum(x<=v for x in vals)/len(vals)
  for row in rows:
   # high-end roster ability and actual depth; no double counting raw bluechip
   row['talentIndexProxy'] = round(.75*pct(xs,row['top30TierProxy'])+.25*pct(ys,row['depth31to80TierProxy'] or 75),3)
  rows.sort(key=lambda r:-r['talentIndexProxy'])
  for n,r in enumerate(rows,1):r['talentIndexRankProxy']=n
 (DATA/'research_talent_2024_2026.json').write_text(json.dumps(out,indent=2,ensure_ascii=False)+'\n')
 for team in ['Ole Miss','Liberty','New Mexico','Georgia','Utah','Indiana','North Dakota State','Alabama']:
  print('TALENT 2026',team,next((dict(rank=r['talentIndexRankProxy'],index=r['talentIndexProxy'],
   top30=r['top30TierProxy'],depth=r['depth31to80TierProxy'],
   composite=r.get('talent_composite'),bluechip=r.get('bluechip'),coverage=r['ratedPlayers'])
   for r in out['years']['2026'] if r['team']==team),None),flush=True)
if __name__=='__main__':main()
