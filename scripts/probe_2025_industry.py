#!/usr/bin/env python3
"""Inspect 2025 game-ahead FPI history and weekly FEI table source schemas.
This is a research probe only: no ratings used without a genuine prior-week key.
"""
import csv,io,urllib.request,json,tempfile,os
import duckdb
from bs4 import BeautifulSoup
url='https://github.com/sportsdataverse/sportsdataverse-data/releases/download/cfb_fpi_weekly/cfb_fpi_weekly_2025.parquet'
with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'CFMI-pregame-audit/1.0'}),timeout=60) as r:
 body=r.read(12000000)
if not body.startswith(b'PAR1') or not body.endswith(b'PAR1'):raise RuntimeError('FPI parquet invalid')
with tempfile.NamedTemporaryFile(suffix='.parquet') as file:
 file.write(body);file.flush()
 df=duckdb.read_parquet(file.name).df()
print('FPI 2025 ARCHIVE',json.dumps({'rows':len(df),'columns':list(df.columns),'examples':df.head(4).astype(str).to_dict('records'),'sampleweek5':df[df['week']==5].head(5).astype(str).to_dict('records')},default=str),flush=True)
url='https://bcftoys.com/2025-wfei'
with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (CFMI historical review)'}),timeout=60) as r:
 body=r.read(7000000)
soup=BeautifulSoup(body,'html.parser')
print('FEI 2025 ARCHIVE',json.dumps({'length':len(body),'tables':len(soup.select('table')),'headings':[h.get_text(' ',strip=True) for h in soup.select('h2,h3')][:7], 'tablesFirst':[str(t)[:1200] for t in soup.select('table')[:2]], 'sectionSample':str(soup.select_one('h3'))[:1800]}),flush=True)
