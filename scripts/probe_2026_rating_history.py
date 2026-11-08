#!/usr/bin/env python3
"""Inspect available original-source-dated 2026 FPI/SP+/FEI rating snapshots for
honest game-ahead validation; do not backfill with post-game rankings."""
import urllib.request,io,csv,collections,json,datetime
url="https://cfbtxt.com/data/ratings_snapshots/2026/historical_ratings.csv"
req=urllib.request.Request(url,headers={"User-Agent":"CFMI-benchmark-study/1.0","Accept":"text/csv"})
with urllib.request.urlopen(req,timeout=45) as resp:
 blob=resp.read(15000000);print("CFB TXT bytes",len(blob),"type",resp.headers.get("content-type"),flush=True)
rows=list(csv.DictReader(io.StringIO(blob.decode("utf-8-sig"))))
group=collections.defaultdict(list)
for r in rows:
 if str(r.get('season'))=='2026':
  group[(r.get('metric'),r.get('snapshot_date'),r.get('source_date'))].append(r)
print("RECORDS",len(rows),"GROUPS",len(group),flush=True)
for (metric,snapshot,source),members in sorted(group.items()):
 unique=len(set(r['team'] for r in members))
 r0=members[0]
 print("METRIC SNAPSHOT",metric,snapshot,"source",source,"teams",unique,"ratingsample",r0.get("rating"),flush=True)
