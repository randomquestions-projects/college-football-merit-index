#!/usr/bin/env python3
"""Moneyline coverage audit and strict historical $10 wager backtest.
Every moneyline must have a verifiable pre-kickoff timestamp. Stakes = $10
risked (not $10 to win) on each CFMI pick; unmatched games remain excluded,
never assigned -110 odds or imputed from the spread.
"""
import csv,io,gzip,json,urllib.request,re,collections,datetime,difflib
from pathlib import Path
from datetime import timezone
API='https://randomquestions-projects.github.io/college-football-merit-index/data/prediction_ledger_2025_2026.json'
OG='https://theoddsgap.com/api/odds-history.csv?sport=americanfootball_ncaaf'
CFB='https://raw.githubusercontent.com/sportsdataverse/cfbfastR-data/main/betting/csv/cfb_line_odds.csv.gz'
def fetch(url):
 return urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'CFMI-independent-research/1.0','Accept':'*/*'}),timeout=90)
def dt(v):
 if not v:return None
 try:return datetime.datetime.fromisoformat(str(v).replace('Z','+00:00')).astimezone(timezone.utc)
 except Exception:return None
def norm(n):
 n=str(n).casefold().replace('&','and').replace('ʻ','').replace('’','')
 n=re.sub('[^a-z0-9]','',n)
 aliases={'miamihurricanes':'miami','miamifl':'miami','miamiohredhawks':'miamioh','brighamyoung':'byu','olmiss':'olemiss','mississippi':'olemiss',
 'uconn':'connecticut','floridainternational':'fiu','northcarolinastate':'ncstate','samhoustonstate':'samhouston',
 'ulmonroe':'ulm','appalachianstate':'appstate','texassanantonio':'utsa'}
 return aliases.get(n,n)
def remove_mascot(label,teams):
 n=norm(label)
 matches=[name for name in teams if n.startswith(norm(name)) or norm(name).startswith(n)]
 if len(matches)==1:return matches[0]
 if len(matches)>1:
  matches.sort(key=lambda x:len(norm(x)),reverse=True)
  if len(norm(matches[0]))>len(norm(matches[1])):return matches[0]
 return None
def moneyline_profit(odds):
 v=float(odds)
 if v==0 or abs(v)<100:return None
 if v>0:return 10*v/100
 return 1000/abs(v)
raw=json.load(fetch(API))
games=[g for w in raw['seasons']['2026']['weeks'] for g in w['games'] if g['finished']]
teams=sorted(set(g['home'] for g in games)|set(g['away'] for g in games))
bydate=collections.defaultdict(list)
for g in games:
 day=dt(g['kickoffUtc']).date().isoformat()
 bydate[day].append(g)
print('MONEYLINE_VENUE_EXPECTED',json.dumps({'completedGames':len(games),'totalStakeIfFullyPriced':len(games)*10}),flush=True)
book_pref=['fanduel','draftkings','betmgm','caesars','bet365','espnbet','betonlineag','ballybet']
def choice_key(book):
 k=str(book).lower().replace(' ','')
 return (book_pref.index(k) if k in book_pref else len(book_pref),k)
def outcome(g,american):
 payout=moneyline_profit(american)
 if payout is None:return None
 return round(payout if g['correct'] else -10,4)
def summarize(pairs):
 stake=len(pairs)*10
 net=sum(x['profit'] for x in pairs)
 wins=sum(x['correct'] for x in pairs)
 return {'games':len(pairs),'correct':wins,'accuracy':wins/len(pairs) if pairs else None,
  'totalStaked':stake,'profitLoss':round(net,2),'roi':round(net/stake*100,2) if stake else None,
  'avgWinnerPrice':round(sum(float(x['odds']) for x in pairs if x['correct'])/wins,2) if wins else None}
def run_odds_gap():
 with fetch(OG) as r:
  reader=csv.DictReader(io.TextIOWrapper(r,encoding='utf-8-sig'))
  head=reader.fieldnames
  rawcount=0;mlcount=0
  pools=collections.defaultdict(dict)
  dates=collections.Counter()
  for row in reader:
   rawcount+=1
   if row.get('sport')!='americanfootball_ncaaf' or row.get('market')!='ml':continue
   mlcount+=1
   kick=dt(row.get('commence_time')); close=dt(row.get('close_ts'))
   if not kick or not close or close>=kick:continue
   dates[kick.date().isoformat()]+=1
   if kick.date().isoformat() not in bydate:continue
   home=remove_mascot(row.get('home'),teams)
   away=remove_mascot(row.get('away'),teams)
   if not home or not away:continue
   gamesame=[g for g in bydate[kick.date().isoformat()] if g['home']==home and g['away']==away]
   if len(gamesame)!=1:continue
   game=gamesame[0]
   side='home' if game['predictedWinner']==game['home'] else 'away'
   if row.get('side')!=side:continue
   odds=row.get('close_american_odds')
   if moneyline_profit(odds) is None:continue
   book=row.get('book')
   if not book:continue
   # Single book, latest verified pregame quote for each book.
   key=(game['gameId'],book)
   prior=pools[key].get('close_ts')
   if prior is None or close>prior:
    pools[key]={'game':game,'odds':int(float(odds)),'close_ts':close,'book':book}
  merged=collections.defaultdict(list)
  for (game_id,book),x in pools.items():merged[game_id].append(x)
  results=[]
  for game_id,books in merged.items():
   x=sorted(books,key=lambda b:choice_key(b['book']))[0]
   g=x['game']
   results.append({'gameId':game_id,'week':g['week'],'home':g['home'],'away':g['away'],'pick':g['predictedWinner'],
     'correct':g['correct'],'odds':x['odds'],'book':x['book'],'priceTimestamp':x['close_ts'].isoformat(),
     'profit':outcome(g,x['odds'])})
  results.sort(key=lambda x:(x['week'],x['gameId']))
  covered=set(x['gameId'] for x in results)
  return {'source':OG,'rawRows':rawcount,'moneylineRows':mlcount,
   'schema':head,'daysAvailable':dict(sorted(dates.items())),
   'matched':summarize(results),
   'matchedByWeek':{str(w):summarize([x for x in results if x['week']==w]) for w in sorted(set(x['week'] for x in results))},
   'unmatchedCount':len(games)-len(covered),
   'bookSelection':'One selected source sportsbook per game, priority FanDuel > DraftKings > BetMGM > Caesars > Bet365 > ESPNBet > BetOnline > BallyBet > alphabetic. Closing moneyline recorded strictly before kickoff.',
   'examples':results[:12],
   'rows':results}
def inspect_cfbfastR():
 with fetch(CFB) as r:
  t=io.TextIOWrapper(gzip.GzipFile(fileobj=r),encoding='utf-8-sig')
  reader=csv.DictReader(t)
  head=reader.fieldnames
  years=collections.Counter(); examples=[]; n=0; season26=0
  for row in reader:
   n+=1
   year=str(row.get('season',row.get('year','')))
   if year:years[year]+=1
   if year=='2026':
    season26+=1
    if len(examples)<3:examples.append(row)
   if n>1000000:break
 return {'source':CFB,'schema':head,'rowsInspected':n,'bySeason':years.most_common(12),'season2026Rows':season26,
  'examples2026':examples,
  'usableMoneylineFields':[x for x in (head or []) if 'money' in x.lower() or 'ml_' in x.lower() or x.lower().endswith('_ml')]}
def main():
 result={'ledgerGames':len(games),'asOf':'2026-11-08','tenDollarPerGameFullyCoveredStake':len(games)*10}
 for label,func in [('theOddsGap',run_odds_gap),('cfbfastR',inspect_cfbfastR)]:
  try:
   x=func()
   result[label]=x
   if label=='theOddsGap':
    p={k:v for k,v in x.items() if k!='rows'}
    print('VERIFIED_ODDS_GAP_ROI',json.dumps(p)[:22000],flush=True)
   else:print('CFBFASTR_MONEYLINE_COVERAGE',json.dumps(x)[:22000],flush=True)
  except Exception as exc:
   result[label]={'error':type(exc).__name__+': '+str(exc)}
   print('ODDS_SOURCE_FAILURE',label,result[label]['error'],flush=True)
 dest=Path('site/data/research_2026_moneyline_rois.json')
 dest.write_text(json.dumps(result,default=str,indent=2)+'\n')
 print('2026_ODDS_RESEARCH_SUMMARY',json.dumps({key:{k:v for k,v in x.items() if k not in ['rows','examples','examples2026','daysAvailable']} for key,x in result.items() if isinstance(x,dict)}),flush=True)
if __name__=='__main__':main()
