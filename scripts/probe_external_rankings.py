#!/usr/bin/env python3
"""Inspect public external rankings source schema, no private keys."""
import csv,io,urllib.request
sources={
"cfbtxt_historical":"https://cfbtxt.com/data/ratings_snapshots/2026/historical_ratings.csv",
"sp_charts":"https://collegefootballcharts.com/stats/sp-overall.csv",
"fei":"https://bcftoys.com/2026-fei/"
}
for name,url in sources.items():
 print("SOURCE",name,url,flush=True)
 try:
  req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0 (compatible; CFMI ranking audit)","Accept":"text/csv,text/html,*/*"})
  with urllib.request.urlopen(req,timeout=35) as r:
   raw=r.read(4500000)
   print("CONTENT",r.headers.get("Content-Type"),"BYTES",len(raw),flush=True)
  if name!="fei":
   lines=list(csv.reader(io.StringIO(raw.decode("utf-8-sig",errors="replace"))))
   print("COLUMNS",lines[0][:65],flush=True)
   print("ROWS",len(lines),flush=True)
   for line in (lines[1:4]+lines[-2:]):
    print("SAMPLE",line[:30],flush=True)
  else:
   html=raw.decode("utf-8",errors="replace")
   from html.parser import HTMLParser
   class TableExtract(HTMLParser):
    def __init__(self):super().__init__();self.rows=[];self.intr=False;self.intd=False;self.buf=[];self.val=""
    def handle_starttag(self,t,a):
     if t=="tr":self.intr=True;self.buf=[]
     if self.intr and t in ("td","th"):self.intd=True;self.val=""
    def handle_data(self,d):
     if self.intd:self.val+=d
    def handle_endtag(self,t):
     if t in ("td","th") and self.intr:self.buf.append(" ".join(self.val.split()));self.intd=False
     if t=="tr" and self.intr:
      if self.buf:self.rows.append(self.buf)
      self.intr=False
   p=TableExtract();p.feed(html)
   print("TABLE_ROWS",len(p.rows),flush=True)
   for row in p.rows[:5]:print("FEI_SAMPLE",row[:30],flush=True)
 except Exception as e:print("SOURCE_ERROR",name,repr(e),flush=True)
