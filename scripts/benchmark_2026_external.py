#!/usr/bin/env python3
"""Point-in-time 2026 CFMI vs ESPN FPI, SP+, FEI evaluation.
Archived date and original source date must BOTH predate the first kickoff of
the game week. Evaluate identical games, not end-of-season or postgame ranks.
No published model weights are trained on this dataset.
"""
import csv,io,json,math,re,urllib.request
from collections import defaultdict
from datetime import date,datetime,timedelta,timezone
from pathlib import Path
from statistics import mean
from urllib.error import HTTPError,URLError

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'site'/'data'
URL='https://cfbtxt.com/data/ratings_snapshots/2026/historical_ratings.csv'
RAW=DATA/'research_external_2026_archived_snapshots.csv'
OUTPUT=DATA/'research_2026_external_benchmark.json'
REQUIRED=('fpi','sp_plus','fei')
ALIASES={
 'miamifl':'miami','miamiflorida':'miami','miamihurricanes':'miami',
 'mississippi':'olemiss','brighamyoung':'byu','hawaii':'hawaii',
 'hawaiiwarriors':'hawaii','appalachianstate':'appstate',
 'connecticut':'uconn','northcarolinastate':'ncstate',
 'northcarolinast':'ncstate','northcarolinastatewolfpack':'ncstate',
 'southerncal':'usc','southerncalifornia':'usc','southernmississippi':'southernmiss',
 'louisianalafayette':'louisiana','louisianamonroe':'ulmonroe',
 'louisianamonroewarhawks':'ulmonroe','ulml':'ulmonroe','ulm':'ulmonroe',
 'floridainternational':'fiu','floridaintl':'fiu','fiu':'fiu',
 'texassanantonio':'utsa','texassana':'utsa',
 'northillinois':'northernillinois','northernill':'northernillinois',
 'massachusetts':'umass','nevada las vegas':'unlv',
 'unlv':'unlv','samhoustonstate':'samhouston',
 'miamiohio':'miamioh','miamioh':'miamioh',
 'middletennesseestate':'middletennessee','westernkentucky':'westernkentucky',
 'westernky':'westernkentucky','texaselpaso':'utep',
 'sanjosestate':'sanjosestate','sanjosest':'sanjosestate',
 'bowlinggreenstate':'bowlinggreen','arkansasstate':'arkansasstate'
}
def norm(s):
 t=str(s or '').casefold().strip().replace('ʻ','').replace('’','').replace('&','and')
 t=re.sub(r'[^a-z0-9]','',t)
 return ALIASES.get(t,t)
def parse_date(s):
 if not s:return None
 try:return date.fromisoformat(str(s).strip()[:10])
 except ValueError:return None
def correct(edge,game):
 return (edge>=0)==bool(game['homeWon'])
def accuracy(games,func):
 if not games:return None
 return sum(correct(func(g),g) for g in games)/len(games)
def exact_sign_p(better,worse):
 n=better+worse
 if not n:return 1.0
 count=min(better,worse)
 return min(1.,2*sum(math.comb(n,k) for k in range(count+1))/2**n)
def read_archive():
 req=urllib.request.Request(URL,headers={'User-Agent':'CFMI 2026 validation research','Accept':'text/csv'})
 with urllib.request.urlopen(req,timeout=45) as response:
  raw=response.read(15000001)
  if len(raw)>15000000:raise RuntimeError('Historical ratings archive unexpectedly large')
  if 'csv' not in response.headers.get('content-type',''):
   raise RuntimeError('External ratings endpoint did not return CSV')
 RAW.write_bytes(raw)
 records=list(csv.DictReader(io.StringIO(raw.decode('utf-8-sig'))))
 if len(records)<300:raise RuntimeError('Historical ratings archive incomplete')
 return records
def build_snapshots(rows):
 batches=defaultdict(list)
 bad=defaultdict(int)
 for r in rows:
  metric=str(r.get('metric','')).strip().lower()
  if metric not in REQUIRED or str(r.get('season'))!='2026':continue
  snap=parse_date(r.get('snapshot_date'))
  src=parse_date(r.get('source_date'))
  try:
   rating=float(r['rating'])
   rank=int(r['rank'])
  except (ValueError,TypeError,KeyError):continue
  if not snap or not src or src>snap:
   bad['invalid_or_future_original_source_date']+=1
   continue
  if not math.isfinite(rating) or rank<1 or rank>160:continue
  batches[(metric,snap,src)].append((norm(r['team']),rating,rank,r['team']))
 return batches,dict(bad)
def choose_snapshot(batches,metric,cutoff):
 candidates=[]
 for (k,snapshot,source),teamrows in batches.items():
  if k!=metric or snapshot>=cutoff or source>=cutoff:continue
  teams={}
  for name,rating,rank,rawname in teamrows:
   if name in teams:continue
   teams[name]={'rating':rating,'rank':rank,'name':rawname}
  if len(teams)>=130 and len(set(t['rank'] for t in teams.values()))>=120:
   candidates.append((snapshot,source,teams))
 if not candidates:return None
 candidates.sort(key=lambda x:(x[0],x[1]))
 return candidates[-1]
def compare_group(games,ratings,field,neutral=False):
 def edge(g):
  d=ratings[g['week']]['teams'][norm(g['home'])]['rating'] - ratings[g['week']]['teams'][norm(g['away'])]['rating']
  if neutral:return d
  if field in ('fpi','sp_plus'):return d+(0 if g['neutral'] else 2.5)
  return d  # FEI has non-point rating units. No untrained home adjustment.
 return edge
def summarize_subset(name,selected,edge,cfmi_field='cfmiPredictedMargin'):
 n=len(selected)
 if n==0:return {'name':name,'games':0}
 own=sum(correct(edge(g),g) for g in selected)
 cfmi=sum(correct(g[cfmi_field],g) for g in selected)
 better=sum(correct(g[cfmi_field],g) and not correct(edge(g),g) for g in selected)
 worse=sum(not correct(g[cfmi_field],g) and correct(edge(g),g) for g in selected)
 tie=sum((correct(g[cfmi_field],g)==correct(edge(g),g)) for g in selected)
 return {'name':name,'games':n,'correct':own,'accuracy':own/n,
   'cfmiCorrectSameGames':cfmi,'cfmiAccuracySameGames':cfmi/n,
   'cfmiBetterDiscordant':better,'otherBetterDiscordant':worse,
   'sameResult':tie,'signTestTwoSidedP':exact_sign_p(better,worse)}
def main():
 records=read_archive()
 batches,rejected=build_snapshots(records)
 document=json.loads((DATA/'research_cfmi_2026_pregame.json').read_text())
 games=document['games']
 weeks=sorted(set(g['week'] for g in games))
 if not weeks or min(weeks)<5 or max(weeks)>10:
  raise RuntimeError('Expected same prospective Week 5–10 CFMI game sample')
 earliest={w:min(parse_date(g['date']) for g in games if g['week']==w) for w in weeks}
 chosen={}
 for metric in REQUIRED:
  chosen[metric]={}
  for week in weeks:
   snap=choose_snapshot(batches,metric,earliest[week])
   if snap is not None:
    snapshot,source,teams=snap
    chosen[metric][week]={'snapshot':snapshot.isoformat(),'originalSource':source.isoformat(),
      'teams':teams,'count':len(teams)}
 print('ARCHIVE_VALIDATION',json.dumps({
  'source':URL,'rows':len(records),'sourceDateRejections':rejected,
  'weeks':{w:str(earliest[w]) for w in weeks},
  'snapshots':{k:{w:{'date':v['snapshot'],'original_source':v['originalSource'],
   'teams':v['count']} for w,v in data.items()} for k,data in chosen.items()}
 }),flush=True)
 # A neutral-field ranking comparison is strictly the same objective for all
 # four indices, regardless of native rating units.
 tables={'neutralStrength':{},'venueAware':{}}
 byGame={}
 for metric in REQUIRED:
  covered=[g for g in games if g['week'] in chosen[metric] and
   norm(g['home']) in chosen[metric][g['week']]['teams'] and
   norm(g['away']) in chosen[metric][g['week']]['teams']]
  venue=compare_group(covered,chosen[metric],metric,neutral=False)
  pure=compare_group(covered,chosen[metric],metric,neutral=True)
  tables['venueAware'][metric]=summarize_subset(metric,covered,venue)
  if metric in ('fpi','sp_plus'):
   tables['venueAware'][metric]['approxMarginMAE']=mean(abs(venue(g)-g['homePoints']) for g in covered)
   tables['venueAware'][metric]['cfmiMarginMAESameGames']=mean(abs(g['cfmiPredictedMargin']-g['homePoints']) for g in covered)
  tables['neutralStrength'][metric]=summarize_subset(metric,covered,pure,'cfmiNeutralMargin')
  byWeek=[]
  for w in weeks:
   wk=[g for g in covered if g['week']==w]
   if not wk:continue
   result=summarize_subset(metric,wk,venue)
   result['week']=w
   byWeek.append(result)
  tables['venueAware'][metric]['byWeek']=byWeek
  tables['venueAware'][metric]['snapshotSchedule']=[{
   'week':w,'snapshot':chosen[metric][w]['snapshot'],
   'sourceDate':chosen[metric][w]['originalSource'],
   'teamCount':chosen[metric][w]['count']} for w in weeks if w in chosen[metric]]
  byGame[metric]=[{
   'gameId':g['gameId'],'week':g['week'],'home':g['home'],'away':g['away'],
   'actualHomeWon':g['homeWon'],'cfmiCorrect':correct(g['cfmiPredictedMargin'],g),
   'otherCorrect':correct(venue(g),g),
   'otherEdge':round(venue(g),4),'neutralOtherEdge':round(pure(g),4)
  } for g in covered]
 all_match=[g for g in games if all(g['week'] in chosen[k] and
   norm(g['home']) in chosen[k][g['week']]['teams'] and
   norm(g['away']) in chosen[k][g['week']]['teams'] for k in REQUIRED)]
 if len(all_match)<200:raise RuntimeError('Insufficient head-to-head overlap, avoid inaccurate benchmark report: '+str(len(all_match)))
 common={'games':len(all_match),'cfmiCorrect':sum(correct(g['cfmiPredictedMargin'],g) for g in all_match),
  'cfmiAccuracy':accuracy(all_match,lambda g:g['cfmiPredictedMargin']),
  'cfmiNeutralAccuracy':accuracy(all_match,lambda g:g['cfmiNeutralMargin']),
  'homeOnlyAccuracy':mean([g['homeWon'] for g in all_match if not g['neutral']])}
 for metric in REQUIRED:
  venue=compare_group(all_match,chosen[metric],metric)
  neutral=compare_group(all_match,chosen[metric],metric,neutral=True)
  common[metric]=summarize_subset(metric,all_match,venue)
  if metric in ('fpi','sp_plus'):
   common[metric]['approxMarginMAE']=mean(abs(venue(g)-g['homePoints']) for g in all_match)
   common[metric]['cfmiMarginMAE']=mean(abs(g['cfmiPredictedMargin']-g['homePoints']) for g in all_match)
  common[metric+'Neutral']=summarize_subset(metric,all_match,neutral,'cfmiNeutralMargin')
 out={'version':'1.0','generatedAtUtc':datetime.now(timezone.utc).isoformat(),
  'historicalSource':URL,'sampleType':'2026 reconstructed game-ahead predictions, source-dated archival comparators',
  'gameWeeks':weeks,'cfmiSampleSize':len(games),'commonGameComparison':common,
  'pairwise':tables,'sourceDateViolations':rejected,
  'venuePolicy':'CFMI uses own 2024-fit 3.54-point venue advantage; FPI and SP+ use common 2.5-point addition to home team; FEI is neutral strength only due to non-points units. Neutral-strength table strips home adjustment from all comparators and CFMI.',
  'importantCaveat':'Source dated archived ratings are not independent certified time-stamped pregame market forecasts. The archive is a retrospective dataset. Only source-date/snapshot-date PRIOR to first game kickoff date in each week are eligible. This benchmark is a comparison of reconstructed rating-based picks, not full ESPN official game-level picks or official odds.',
  'snapshotSources':{k:tables['venueAware'][k].get('snapshotSchedule') for k in REQUIRED},
  'games':byGame}
 OUTPUT.write_text(json.dumps(out,indent=2,ensure_ascii=False)+'\n')
 print('HISTORICAL_2026_FAIR_POWER_BENCHMARK',json.dumps({
  'cfmiGames':len(games),'common':common,
  'venueMatched':{k:{kk:v for kk,v in val.items() if kk not in ('byWeek','snapshotSchedule')} for k,val in tables['venueAware'].items()},
  'neutralMatched':tables['neutralStrength'],
  'byWeek':{k:v.get('byWeek') for k,v in tables['venueAware'].items()}
 },ensure_ascii=False),flush=True)
 print('RESEARCH_OUTPUT',OUTPUT,flush=True)
if __name__=='__main__':main()
