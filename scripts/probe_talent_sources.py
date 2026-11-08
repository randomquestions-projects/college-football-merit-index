#!/usr/bin/env python3
"""Audit original pre/early-season talent sources, without adding any external
rating to live CFMI. Only known site URLs, with timeouts, source/schema checks.
"""
import html,io,re,urllib.request,csv,collections
SOURCES={
 2024:"https://www.puntandrally.com/talent.php?view=roster&whichyear=2024",
 2025:"https://www.puntandrally.com/talent.php?view=roster&whichyear=2025",
 2026:"https://www.puntandrally.com/talent.php?view=roster&whichyear=2026",
 'composite2026':"https://collegefootballcharts.com/stats/talent-composite.csv",
 'bluechip2026':"https://collegefootballcharts.com/stats/blue-chip-ratio.csv",
}
for year,url in SOURCES.items():
 try:
  with urllib.request.urlopen(urllib.request.Request(url,headers={
    "User-Agent":"Mozilla/5.0 (compatible; CFMI preseason research contact via GitHub)",
    "Accept":"text/html,text/csv;q=0.9,*/*;q=0.8"}),timeout=35) as r:
   data=r.read(1800000); mime=r.headers.get("content-type","")
  text=data.decode("utf-8-sig","replace")
  print("SOURCE",year,"bytes",len(data),"mime",mime,"start",text[:280].replace("\n"," "),flush=True)
  if year in (2024,2025,2026):
   pos=text.find("Georgia")
   print("HTML SAMPLE GEORGIA",year,text[max(0,pos-300):pos+350].replace("\n"," "),flush=True)
   for team in ["Ole Miss","Liberty","New Mexico","Georgia"]:
    print("NAME_COUNT",year,team,text.count(team),flush=True)
  else:
   rd=list(csv.DictReader(io.StringIO(text)))
   print("CSV ROWS",year,len(rd),"FIELDS",list(rd[0]) if rd else [],"SAMPLE",rd[:2],flush=True)
 except Exception as e:
  print("SOURCE FAILURE",year,type(e).__name__,str(e)[:500],flush=True)
