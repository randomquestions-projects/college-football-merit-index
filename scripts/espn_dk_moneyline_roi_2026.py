#!/usr/bin/env python3
"""Hypothetical $10 moneyline bets following CFMI's pre-week 2026 Power picks.

For completed FBS/FBS games, fetch ESPN's game-linked, bookmaker-labeled
historical close.moneyLine.american (DraftKings). We use historical closing
prices, NOT end-of-game score conversions, blanket -110 odds, or lines implied
by model probabilities. Some missing odds are unavoidable; disclose coverage.

ESPN's game-summary/Core closing values are retrospective, not user-held
immutable pregame quote timestamps. Independently sourced pregame timestamped
Week 8 prices can be used as a comparison.
"""
from concurrent.futures import ThreadPoolExecutor,as_completed
import urllib.request,urllib.error,json,time
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'site'/'data'
LEDGER='https://randomquestions-projects.github.io/college-football-merit-index/data/prediction_ledger_2025_2026.json'
BOOK='DraftKings'
def get(url,seconds=18):
 request=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (CFMI independent historical market analytics)','Accept':'application/json'})
 with urllib.request.urlopen(request,timeout=seconds) as r:return json.load(r)
def american(x):
 try:
  v=int(float(str(x).replace('+','')))
  return v if abs(v)>=100 else None
 except (TypeError,ValueError):return None
def gain(price,correct,stake=10):
 if price is None:return None
 return (stake*price/100 if price>0 else 100*stake/abs(price)) if correct else -stake
def market_expected(odds):
 if not odds:return None
 return 100/(100+odds) if odds>0 else abs(odds)/(abs(odds)+100)
def fetch_game(game):
 gid=game['gameId']
 url=f'https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/events/{gid}/competitions/{gid}/odds?limit=25'
 error=None
 for attempt in range(3):
  try:
   data=get(url)
   books=data.get('items',[])
   matched=next((b for b in books if str(b.get('provider',{}).get('name','')).lower()=='draftkings'),None)
   if matched is None:return {'gameId':gid,'missing':'DraftKings book not found','availableBooks':[b.get('provider',{}).get('name') for b in books]}
   h=american(matched.get('homeTeamOdds',{}).get('close',{}).get('moneyLine',{}).get('american'))
   a=american(matched.get('awayTeamOdds',{}).get('close',{}).get('moneyLine',{}).get('american'))
   if h is None or a is None:return {'gameId':gid,'missing':'Book missing one or both closing moneyline values',
     'h':h,'a':a}
   pickHome=game['predictedWinner']==game['home']
   selected=h if pickHome else a
   profit=gain(selected,game['correct'])
   homeProb=market_expected(h)
   awayProb=market_expected(a)
   normSum=homeProb+awayProb
   return {'gameId':gid,'week':game['week'],'home':game['home'],'away':game['away'],
    'pick':game['predictedWinner'],'winner':game['actualWinner'],'correct':game['correct'],
    'neutral':game['neutral'],'predictedMargin':game['predictedMargin'],
    'modelWinProb':game['homeWinProbability'] if pickHome else game['awayWinProbability'],
    'price':selected,'homePrice':h,'awayPrice':a,
    'marketDeVigPickProb':(homeProb if pickHome else awayProb)/normSum,
    'pickHome':pickHome,'profit':profit,'book':BOOK,'historicalCloseSource':url,
    'priceProvenance':'ESPN Core archived DraftKings close; quote timestamp before kickoff not independently frozen'}
  except Exception as exc:
   error=f'{type(exc).__name__}: {str(exc)[:200]}'
   if attempt<2:time.sleep(.25*(attempt+1))
 return {'gameId':gid,'missing':error}
def summary(entries):
 n=len(entries)
 wins=sum(x['correct'] for x in entries)
 profit=sum(x['profit'] for x in entries)
 return {'games':n,'wins':wins,'losses':n-wins,'accuracy':wins/n if n else None,
  'stake':10*n,'netProfit':round(profit,2),
  'roiPercent':round(100*profit/(10*n),2) if n else None,
  'netPayout':round(profit+10*n,2),
  'pickRoadNonNeutral':sum(not x['pickHome'] and not x['neutral'] for x in entries)}
def main():
 data=get(LEDGER)
 games=[g for week in data['seasons']['2026']['weeks'] for g in week['games'] if g['finished']]
 assert len(games)>=550
 entries=[];missing=[]
 with ThreadPoolExecutor(max_workers=12) as executor:
  futures={executor.submit(fetch_game,g):g for g in games}
  for f in as_completed(futures):
   result=f.result()
   if result.get('missing'):missing.append(result)
   else:entries.append(result)
 entries.sort(key=lambda x:(x['week'],x['gameId']))
 print('ESPN_MONEYLINE_COVERAGE',json.dumps({'requested':len(games),'priced':len(entries),
   'missing':len(missing),'missingSamples':missing[:25]}),flush=True)
 segments={'all':summary(entries),
   'homePicks':summary([x for x in entries if not x['neutral'] and x['pickHome']]),
   'roadPicks':summary([x for x in entries if not x['neutral'] and not x['pickHome']]),
   'neutral':summary([x for x in entries if x['neutral']]),
   'early':summary([x for x in entries if x['week']<=4]),
   'weeks5to8':summary([x for x in entries if 5<=x['week']<=8]),
   'weeks9to10':summary([x for x in entries if x['week']>=9]),
   'marketFavorsCfmi':summary([x for x in entries if x['marketDeVigPickProb']>=.5]),
   'marketAgainstCfmi':summary([x for x in entries if x['marketDeVigPickProb']<.5]),
   'byWeek':{str(w):summary([x for x in entries if x['week']==w]) for w in range(1,11)}}
 print('CFMI_2026_ESPN_DK_MONEYLINE_ROI',json.dumps(segments),flush=True)
 result={'season':2026,'throughWeek':10,
  'method':'Flat $10 risk per completed FBS-vs-FBS regular-season game on CFMI pregame Power predicted winner.',
  'oddsPolicy':'ESPN archived DraftKings historical closing moneyline; when missing, exclude. No assumed -110 or fabricated odds. Prices reflect closing lines, not rates obtainable at CFMI preweek ranking publication.',
  'moneylineVintagingCaveat':'ESPN labels historical open/close sportsbook prices but does not supply an independently frozen per-price pre-kickoff timestamp in the examined payload.',
  'modelVintagingCaveat':'CFMI 2026 picks reconstructed from later source releases under current model; not original publication-time predictions.',
  'book':BOOK,'source':'ESPN Core-v2 game-linked DraftKings moneyline history',
  'totalCompletedGames':len(games),'fullSeasonStakeIfComplete':10*len(games),
  'gamesWithPrices':len(entries),'coveragePct':100*len(entries)/len(games),
  'segments':segments,'missing':missing,'games':entries}
 output=DATA/'research_2026_espn_moneyline_roi.json'
 output.write_text(json.dumps(result,indent=2)+'\n')
 print('ESPN_ROI_OUTPUT',str(output),flush=True)
if __name__=='__main__':main()
