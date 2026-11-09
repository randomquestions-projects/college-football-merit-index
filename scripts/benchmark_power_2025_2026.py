#!/usr/bin/env python3
"""2025+2026 CFMI game-ahead Power vs source-dated FPI/SP+/FEI rating picks.
Strictly shared FBS game denominators, no postgame external snapshots, no
end-of-year ratings, no conference labels or outside ratings in CFMI itself.
Archived snapshots are reconstructed, not signed original forecast feeds.
"""
import csv,io,json,math,re,urllib.request
from collections import defaultdict
from external_2025_weekly import load_2025_fallback
from datetime import datetime,timezone,date
from pathlib import Path
DATA=Path(__file__).resolve().parents[1]/'site'/'data'
INPUT=DATA/'prediction_ledger_2025_2026.json'
OUTPUT=DATA/'power_benchmark_2025_2026.json'
SYSTEMS=('fpi','sp_plus','fei')
BASE='https://cfbtxt.com/data/ratings_snapshots/{year}/historical_ratings.csv'
ALIASES={'miamifl':'miami','miamiflorida':'miami','miamihurricanes':'miami','mississippi':'olemiss',
'brighamyoung':'byu','appalachianstate':'appstate','connecticut':'uconn',
'northcarolinastate':'ncstate','northcarolinast':'ncstate','southerncal':'usc',
'southerncalifornia':'usc','southernmississippi':'southernmiss',
'louisianalafayette':'louisiana','louisianamonroe':'ulm','ulmonroe':'ulm',
'floridainternational':'fiu','texassanantonio':'utsa','northillinois':'northernillinois',
'massachusetts':'umass','samhoustonstate':'samhouston','miamiohio':'miamioh',
'middletennesseestate':'middletennessee','westernky':'westernkentucky',
'texaselpaso':'utep','sanjosest':'sanjosestate'}
def norm(s):
 x=re.sub('[^a-z0-9]','',str(s or '').casefold().replace('ʻ','').replace('’',''))
 return ALIASES.get(x,x)
def day(s):
 try:return date.fromisoformat(str(s or '')[:10])
 except ValueError:return None
def read_year(year):
 url=BASE.format(year=year)
 req=urllib.request.Request(url,headers={'User-Agent':'CFMI independent weekly benchmark','Accept':'text/csv'})
 try:
  with urllib.request.urlopen(req,timeout=50) as res:
   body=res.read(18000000)
  if len(body)>=18000000 or len(body)<2000:raise RuntimeError('Archive size is invalid')
  rows=list(csv.DictReader(io.StringIO(body.decode('utf-8-sig'))))
  if not rows or not {'season','metric','team','rating','rank','snapshot_date','source_date'}.issubset(rows[0]):
   raise RuntimeError('Ratings archive schema is invalid')
  return url,rows,None
 except Exception as exc:
  return url,[],f'{type(exc).__name__}: {exc}'
def group_snapshots(rows,year):
 groups=defaultdict(dict);rejected=0
 for r in rows:
  metric=str(r.get('metric') or '').strip().lower()
  if metric not in SYSTEMS or str(r.get('season'))!=str(year):continue
  s=day(r.get('snapshot_date'));orig=day(r.get('source_date'))
  if not s or not orig or orig>s:rejected+=1;continue
  try:rating=float(r['rating']);rank=int(r['rank'])
  except (TypeError,ValueError):continue
  if not math.isfinite(rating) or rank<1 or rank>165:continue
  teams=groups[(metric,s,orig)]
  key=norm(r['team'])
  if key not in teams:teams[key]={'rating':rating,'rank':rank}
 filtered=[{'metric':m,'snapshot':s,'sourceDate':orig,'teams':teams} for (m,s,orig),teams in groups.items()
  if len(teams)>=125 and len(set(x['rank'] for x in teams.values()))>=115]
 return filtered,rejected
def latest(snapshots,system,cutoff):
 eligible=[s for s in snapshots if s['metric']==system and s['snapshot']<cutoff and s['sourceDate']<cutoff]
 return max(eligible,key=lambda s:(s['snapshot'],s['sourceDate'])) if eligible else None
def aggregate(games,system=None):
 completed=[g for g in games if g['finished'] and (system is None or system in g['industry'])]
 n=len(completed)
 if not n:return {'games':0,'correct':0,'accuracy':None,'cfmiCorrect':0,'cfmiAccuracy':None}
 wins=sum((g['industry'][system]['predictedWinner'] if system else g['predictedWinner'])==g['actualWinner'] for g in completed)
 baseline=sum(g['predictedWinner']==g['actualWinner'] for g in completed)
 return {'games':n,'correct':wins,'accuracy':wins/n,'cfmiCorrect':baseline,'cfmiAccuracy':baseline/n}
def pair(games,system):
 subset=[g for g in games if g['finished'] and system in g['industry']]
 cfmiOnly=otherOnly=0
 for g in subset:
  a=g['predictedWinner']==g['actualWinner']
  b=g['industry'][system]['predictedWinner']==g['actualWinner']
  cfmiOnly+=int(a and not b)
  otherOnly+=int(b and not a)
 return {'cfmiOnlyCorrect':cfmiOnly,'industryOnlyCorrect':otherOnly,'disagreementGames':cfmiOnly+otherOnly}
def describe(games,system):
 subset=[g for g in games if g['finished'] and system in g['industry']]
 # Among games CFMI got wrong and the external model got right,
 # quantify systematic under/overconfidence; purely descriptive.
 misses=[g for g in subset if not g['correct'] and g['industry'][system]['correct']]
 return {'count':len(misses),'examples':[{
  'week':g['week'],'game':g['away']+' @ '+g['home'],
  'actual':g['actualWinner'],'cfmiPick':g['predictedWinner'],
  'otherPick':g['industry'][system]['predictedWinner'],
  'cfmiMargin':round(g['predictedMargin'],2),'actualMargin':g['actualMargin'],
  'homeScheduleStrength':g['homeSOS'],'awayScheduleStrength':g['awaySOS'],
  'preseasonPriorActive':max(g['homePriorWeight'],g['awayPriorWeight'])>0,
  'cfmiFavoriteWinProb':round(max(g['homeWinProbability'],g['awayWinProbability']),3)
 } for g in sorted(misses,key=lambda x:-abs(x['predictedMargin']))[:30]],
 'breakdown':{
  'earlyGames':sum(g['week']<=4 for g in misses),
  'lateGames':sum(g['week']>4 for g in misses),
  'strongFavoriteMisses':sum(max(g['homeWinProbability'],g['awayWinProbability'])>=.75 for g in misses),
  'largeOpponentStrengthGap':sum(abs((g['homeSOS'] or 0)-(g['awaySOS'] or 0))>=5 for g in misses),
  'roadUpsets':sum(g['actualWinner']==g['away'] and not g['neutral'] for g in misses)}
 }
def main():
 input_data=json.loads(INPUT.read_text())
 result={'version':'2025-2026-historical-power-comparison-v1',
  'generatedAtUtc':datetime.now(timezone.utc).isoformat(),
  'provenance':'CFMI current V5.2 Power + season-tagged V5.3 prior, retraced as of the first kickoff each game-week; FPI/SP+/FEI source_date AND archive snapshot_date must be earlier than first kickoff date.',
  'methodology':{
   'fpi_sp_plus':'Higher native point-scale rating plus researcher-applied +2.5 point home advantage (neutral site: zero). Not official provider picks.',
   'fei':'Higher native efficiency rating, no home-field bonus because native ratings are not points.',
   'cfmi':'Power point difference plus current trained home edge; winning probabilities use historical CFMI calibration.',
   'limitations':[
    '2025 FEI provides retrospective weekly historical ratings without verifiable original timestamp; 2025 FPI uses original run date and last-updated. 2025 SP+ is unavailable, not imputed.',
    'External rating-based picks are not official game-level ESPN or FEI forecasts.',
    '2025 CFMI was partly used to select model/decay coefficients, so accuracy is retrospective in-sample model-selection evidence, not a pristine holdout.',
    'Historical datasets and snapshots may have been revised since their dates. The archive date and original source date are checked to prevent obvious future-week rating leakage.',
    'Provider rating scales may differ; only winner accuracy uses all three fairly. Margin MAE is exploratory for FPI/SP+ but not FEI.',
    'Game records are season FBS-vs-FBS regular-season only; FCS, bowls and postseason are excluded.'
   ]},'seasons':{},'matchedAcrossSeasons':{}}
 for y in (2025,2026):
  season=input_data['seasons'][str(y)]
  url,records,error=read_year(y)
  snapshots,rejected=group_snapshots(records,y)
  sourceWarnings=[]
  supplemental=None
  if y==2025 and error:
   years=json.loads((DATA/'preseason_full_sources_2024_2026.json').read_text())
   supplemental=load_2025_fallback(years['seasons']['2025']['teams'],norm)
   sourceWarnings=[
    '2025 combined FPI/SP+/FEI snapshot archive unavailable at expected path.',
    '2025 FPI instead uses ESPN weekly source-date and last-updated constrained ratings; overwritten and non-contemporaneous snapshots are excluded.',
    '2025 FEI uses a retrospective published week-by-week table (its original publication timestamps are not verifiable).',
    'No trustworthy 2025 SP+ weekly point-rating archive has yet been identified; 2025 SP+ comparison is intentionally left blank.'
   ]
  games=[]
  coverage={}
  for wk in season['weeks']:
   cutoff=day(wk['firstKickoffUtc'])
   chosen={system:latest(snapshots,system,cutoff) for system in SYSTEMS}
   if supplemental:
    fpi=[x for x in supplemental['fpi'] if x['snapshot']<cutoff and x['sourceDate']<cutoff]
    chosen['fpi']=max(fpi,key=lambda x:(x['snapshot'],x['sourceDate'])) if fpi else None
    ratings=supplemental['fei'].get(int(wk['week'])-1)
    chosen['fei']={
     'metric':'fei','snapshot':None,'sourceDate':None,'teams':ratings,
     'source':'BCF Toys 2025 retrospective weekly FEI (not immutable dated)'
    } if ratings and len(ratings)>=125 else None
   coverage[str(wk['week'])]={system:({'snapshotDate':s['snapshot'].isoformat() if s['snapshot'] else None,
     'originalSourceDate':s['sourceDate'].isoformat() if s['sourceDate'] else None,
     'source':s.get('source','CFB TXT source-dated archive'),'teams':len(s['teams'])} if s else None)
    for system,s in chosen.items()}
   for raw in wk['games']:
    g={**raw,'industry':{}}
    for system,s in chosen.items():
     if not s:continue
     h=s['teams'].get(norm(g['home']));a=s['teams'].get(norm(g['away']))
     if not h or not a:continue
     margin=h['rating']-a['rating']+(0 if g['neutral'] or system=='fei' else 2.5)
     pick=g['home'] if margin>=0 else g['away']
     g['industry'][system]={'predictedWinner':pick,'correct':g['finished'] and pick==g['actualWinner'],
      'ratingDifference':round(margin,5),'homeRank':h['rank'],'awayRank':a['rank']}
    games.append(g)
  completed=[g for g in games if g['finished']]
  all_common=[g for g in completed if all(system in g['industry'] for system in SYSTEMS)]
  systems={'cfmi':aggregate(completed)}
  for system in SYSTEMS:
   systems[system]={**aggregate(completed,system),**pair(completed,system),
    'diagnostic':describe(completed,system)}
  comparison={
   'sourceUrl':url,'sourceError':None if supplemental else error,
   'sourceWarnings':sourceWarnings,
   'alternateSourceCoverage':supplemental['coverage'] if supplemental else None,
   'alternateSourceURLs':supplemental['urls'] if supplemental else None,
   'originalDateRejects':rejected,
   'weekSnapshots':coverage,'gamesEvaluated':len(completed),
   'entireCFMI':aggregate(completed),
   'systems':systems,
   'commonGames':len(all_common),
   'commonScorecard':{'cfmi':aggregate(all_common),
    **{system:{**aggregate(all_common,system),**pair(all_common,system)} for system in SYSTEMS}},
   'perWeek':[{'week':w['week'],'cfmi':aggregate([g for g in games if g['week']==w['week']]),
    **{system:aggregate([g for g in games if g['week']==w['week']],system) for system in SYSTEMS}}
    for w in season['weeks']],
   'gameComparisons':[{
    'gameId':g['gameId'],'week':g['week'],'home':g['home'],'away':g['away'],
    'cfmiPick':g['predictedWinner'],'winner':g['actualWinner'],
    'cfmiCorrect':g['correct'],'cfmiProbHome':g['homeWinProbability'],
    'opponentSOSDifference':(g['homeSOS'] or 0)-(g['awaySOS'] or 0),
    'homePower':g['homePowerIndex'],'awayPower':g['awayPowerIndex'],
    'opponentDifference':g['predictedMargin'],
    'industry':g['industry']} for g in completed]
  }
  result['seasons'][str(y)]=comparison
  print('CFMI INDUSTRY YEAR BENCHMARK',json.dumps({
   'year':y,'error':error,'games':len(completed),'matched':comparison['commonGames'],
   'scorecard':comparison['commonScorecard'],
   'pairwise':{k:{'games':v['games'],'correct':v['correct'],'accuracy':v['accuracy'],'cfmiCorrect':v['cfmiCorrect'],'cfmiAccuracy':v['cfmiAccuracy']} for k,v in systems.items()},
   'perWeek':comparison['perWeek'],
   'firstExternalSource':coverage.get('5'),
   'warnings':sourceWarnings,
   'alternateCoverage':supplemental['coverage'] if supplemental else None}),flush=True)
 # Cross-season averages are paired by provider, not falsely treated as all-four-system overlaps.
 for system in SYSTEMS:
  rows=[g for yr in result['seasons'].values() for g in yr['gameComparisons'] if system in g['industry']]
  result['matchedAcrossSeasons'][system]={
   'games':len(rows),'cfmiCorrect':sum(g['cfmiCorrect'] for g in rows),
   'externalCorrect':sum(g['industry'][system]['correct'] for g in rows),
   'cfmiAccuracy':sum(g['cfmiCorrect'] for g in rows)/len(rows) if rows else None,
   'externalAccuracy':sum(g['industry'][system]['correct'] for g in rows)/len(rows) if rows else None}
 OUTPUT.write_text(json.dumps(result,indent=2,allow_nan=False)+'\n')
 print('CFMI INDUSTRY BENCHMARK FINISHED',json.dumps({
  '2025':{k:v['accuracy'] for k,v in result['seasons']['2025']['commonScorecard'].items()},
  '2026':{k:v['accuracy'] for k,v in result['seasons']['2026']['commonScorecard'].items()},
  'both':result['matchedAcrossSeasons'],
  '2025SourceError':result['seasons']['2025']['sourceError'],
  '2026SourceError':result['seasons']['2026']['sourceError']},indent=2))
if __name__=='__main__':main()
