#!/usr/bin/env python3
"""Independent research probe: season-to-date CFMI home/road splits,
plus source vetting for PRE-KICKOFF 2026 NCAAF moneyline observations.
No spread-to-moneyline conversion and no inferred prices.
"""
import csv,gzip,io,json,urllib.request,urllib.error,collections,datetime,sys
from pathlib import Path
from urllib.parse import urlparse
def get(url,max_bytes=18000000):
 req=urllib.request.Request(url,headers={'User-Agent':'CFMI independent historical odds source audit/1.0','Accept':'*/*'})
 with urllib.request.urlopen(req,timeout=55) as r:
  data=r.read(max_bytes+1)
  if len(data)>max_bytes:raise ValueError('Download exceeded limit')
  return data,dict(r.headers)
ledger_url='https://randomquestions-projects.github.io/college-football-merit-index/data/prediction_ledger_2025_2026.json'
raw,h=get(ledger_url,11000000)
data=json.loads(raw)
games=[g for week in data['seasons']['2026']['weeks'] for g in week['games'] if g['finished']]
def stats(g):
 if not g:return {'n':0,'correct':0,'incorrect':0,'accuracy':None}
 correct=sum(gm['correct'] for gm in g)
 return {'n':len(g),'correct':correct,'incorrect':len(g)-correct,'accuracy':round(correct/len(g),6)}
splits={
 'all':stats(games),
 'all_home_prediction':stats([g for g in games if g['predictedWinner']==g['home']]),
 'all_away_prediction':stats([g for g in games if g['predictedWinner']==g['away']]),
 'actual_home_winners':sum(g['actualWinner']==g['home'] for g in games),
 'actual_away_winners':sum(g['actualWinner']==g['away'] for g in games),
 'neutral_site':stats([g for g in games if g['neutral']]),
 'home_pick_non_neutral':stats([g for g in games if not g['neutral'] and g['predictedWinner']==g['home']]),
 'road_pick_non_neutral':stats([g for g in games if not g['neutral'] and g['predictedWinner']==g['away']]),
 'non_neutral_home_win_baseline':stats([{'correct':g['actualWinner']==g['home']} for g in games if not g['neutral']]),
 'non_neutral_road_win_baseline':stats([{'correct':g['actualWinner']==g['away']} for g in games if not g['neutral']]),
 'home_favorite_strong':stats([g for g in games if not g['neutral'] and g['predictedWinner']==g['home'] and g['homeWinProbability']>=.75]),
 'road_favorite_strong':stats([g for g in games if not g['neutral'] and g['predictedWinner']==g['away'] and g['awayWinProbability']>=.75]),
 'by_week':[{'week':w['week'],
             'home':stats([g for g in w['games'] if g['finished'] and not g['neutral'] and g['predictedWinner']==g['home']]),
             'road':stats([g for g in w['games'] if g['finished'] and not g['neutral'] and g['predictedWinner']==g['away']])}
            for w in data['seasons']['2026']['weeks'] if w['summary']['played']]
}
print('CFMI_HOME_ROAD_2026',json.dumps(splits),flush=True)
sources={
 'SportsDataverse_CFB_fastR_betting_2026': 'https://raw.githubusercontent.com/sportsdataverse/cfbfastR-data/main/betting/csv/cfb_line_odds.csv.gz',
 'TheOddsGap_sample_2026':'https://theoddsgap.com/api/odds-history.csv?sport=americanfootball_ncaaf',
 'ESPN_betting_2026':'https://github.com/sportsdataverse/sportsdataverse-data/releases/download/espn_cfb_betting/betting_2026.parquet',
 'CFBD_2026_lines':'https://api.collegefootballdata.com/lines?year=2026'
}
for name,url in sources.items():
 try:
  b,h=get(url,18000000)
  contenttype=h.get('Content-Type','')
  obj={'source':name,'bytes':len(b),'contentType':contenttype,'first80':repr(b[:80])}
  if b.startswith(b'\x1f\x8b'):
   clear=gzip.decompress(b)
   if len(clear)>90000000:raise ValueError('CSV decompression too large')
   text=clear.decode('utf-8-sig','replace')
   rdr=csv.DictReader(io.StringIO(text))
   cols=rdr.fieldnames or []
   count=0;yr=0;sample=[];yearCounts=collections.Counter()
   for row in rdr:
    count+=1
    for yfield in ['season','year']:
     if row.get(yfield) is not None:
      yearCounts[str(row[yfield])]+=1;break
    if ('2026' in str(row) or row.get('season')=='2026') and len(sample)<3:sample.append(row)
   obj.update({'schema':cols,'totalRecords':count,'yearValues':yearCounts.most_common(8),
               'recent2026Sample':sample})
  elif b.startswith(b'PAR1'):
   obj['parquet']=True
  elif b.startswith(b'{') or b.startswith(b'['):
   try:
    j=json.loads(b);obj['jsonSummary']={'type':type(j).__name__,'keys':list(j)[:12] if isinstance(j,dict) else [],'count':len(j)}
   except Exception:pass
  else:
   txt=b.decode('utf8','replace')
   obj['linesPreview']=txt[:1500]
  print('ODDS_SOURCE_AUDIT',json.dumps(obj,default=str)[:9000],flush=True)
 except Exception as exc:
  print('ODDS_SOURCE_AUDIT',json.dumps({'source':name,'error':f'{type(exc).__name__}: {str(exc)[:500]}'}),flush=True)
