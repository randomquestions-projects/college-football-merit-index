#!/usr/bin/env python3
"""Audit historical *all-FBS* talent and returning-production parquet releases.
Research only. Reject timestamp/coverage/schema problems instead of fabricating.
"""
import urllib.request, tempfile, os, json, re, hashlib
import duckdb

BASE="https://github.com/sportsdataverse/sportsdataverse-data/releases/download/"
for family in ("cfb_team_talent","cfb_returning_production"):
 for year in (2024,2025,2026):
  url=f"{BASE}{family}/{family}_{year}.parquet"
  req=urllib.request.Request(url,headers={"User-Agent":"CFMI-historical-prior-audit/1.0"})
  try:
   with urllib.request.urlopen(req,timeout=40) as r:
    body=r.read(6000000)
    contentType=r.headers.get("content-type")
   if not body.startswith(b"PAR1") or not body.endswith(b"PAR1"):
    raise RuntimeError(f"Not parquet: {contentType} first={body[:60]!r}")
   with tempfile.NamedTemporaryFile(suffix=".parquet",delete=False) as f:
    f.write(body);name=f.name
   try:
    con=duckdb.connect(database=':memory:')
    df=con.execute(f"SELECT * FROM read_parquet('{name}')").df()
    print('SDV_PRESEASON_ARCHIVE',json.dumps({
     "family":family,"season":year,"rows":len(df),
     "columns":{n:str(t) for n,t in df.dtypes.items()},
     "samples":df.head(3).astype(str).to_dict('records'),
     "hash":hashlib.sha256(body).hexdigest(),
     "content_type":contentType
    }),flush=True)
   finally:os.remove(name)
  except Exception as exc:
   print("SDV_ARCHIVE_FAILED",json.dumps({"family":family,"season":year,"exception":repr(exc)}),flush=True)
   raise
