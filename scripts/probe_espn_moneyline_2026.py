#!/usr/bin/env python3
"""Probe ESPN's postgame Core API for original bookmaker opening/closing moneylines."""
import urllib.request,json
ids=['401856727','401856730','401856735','401856837']
for id in ids:
 for kind,url in [
  ('core',f'https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/events/{id}/competitions/{id}/odds?limit=100'),
  ('summary',f'https://site.api.espn.com/apis/site/v2/sports/football/college-football/summary?event={id}')]:
  try:
   req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 CFMI research','Accept':'application/json'})
   with urllib.request.urlopen(req,timeout=18) as response:
    j=json.loads(response.read(1100000))
   if kind=='core':
    items=j.get('items',[])
    print('ESPN_CORE_PROBE',json.dumps({'game':id,'count':j.get('count'),'items':items[:5]})[:9500],flush=True)
    for item in items[:2]:
     ref=item.get('$ref','')
     if ref:
      with urllib.request.urlopen(urllib.request.Request(ref,headers={'User-Agent':'Mozilla/5.0'}),timeout=18) as response:
       d=json.loads(response.read(400000))
      print('ESPN_CORE_BOOK',json.dumps({'game':id,'book':d})[:10000],flush=True)
   else:
    odds=j.get('pickcenter',[])
    print('ESPN_SUMMARY_PROBE',json.dumps({'game':id,'pickcenter':odds[:3] if isinstance(odds,list) else odds,'keys':list(j)})[:12000],flush=True)
  except Exception as e:print('ESPN_ODDS_PROBE_ERROR',json.dumps({'game':id,'kind':kind,'error':str(e)[:500]}),flush=True)
