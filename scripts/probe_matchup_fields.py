#!/usr/bin/env python3
"""Check actual source columns for run/pass split indicators, never assume a field exists."""
import csv,io,json,urllib.request,collections,math
url='https://github.com/sportsdataverse/sportsdataverse-data/releases/download/espn_cfb_adv_team/adv_team_2026.csv'
req=urllib.request.Request(url,headers={'User-Agent':'CFMI matchup-feature audit/1.0'})
with urllib.request.urlopen(req,timeout=70) as r:
 rows=list(csv.DictReader(io.StringIO(r.read(14000000).decode('utf-8-sig'))))
print('CFMI MATCHUP SOURCE SCHEMA',json.dumps({'rows':len(rows),'columns':list(rows[0]),
 'sample':[{k:v for k,v in x.items() if any(s in k.lower() for s in ('rush','pass','first_down','explos'))} for x in rows[:3]]}),flush=True)
fields=['EPA_rushing_per_play','EPA_passing_per_play','rushing_first_downs_created_rate','passing_first_downs_created_rate','EPA_explosive_rushing_rate','EPA_explosive_passing_rate','passes_rate','rushes','passes']
counts={f:sum(x.get(f) not in ('',None,'NA','null') for x in rows) for f in fields}
print('CFMI MATCHUP FIELD COVERAGE',json.dumps(counts),flush=True)
