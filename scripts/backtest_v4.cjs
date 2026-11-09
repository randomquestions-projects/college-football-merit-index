#!/usr/bin/env node
"use strict";
/* Walk-forward historical accuracy audit for 2024-2025.
 * Uses only past games to rank next week's games, never AP/CFP/prior-year seeding.
 * Compares V4 against the former V3 formula, Elo, opponent power, and raw wins.
 */
const fs=require("fs"),path=require("path");
const root=path.join(__dirname,"..","site");
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
const m=html.match(/<script>([\s\S]*?)<\/script>/i);
if(!m)throw Error("Missing inline engine");
const idx=m[1].indexOf("const submetric=");
if(idx<1500)throw Error("Missing engine boundary");
const prelude=m[1].slice(0,idx);
const model=fs.readFileSync(path.join(root,"model_v4.js"),"utf8");
const archivedV3=fs.readFileSync(path.join(__dirname,"..","archive","legacy_v3_engine.js"),"utf8");
const executor=new Function("scores","advanced","season","cutoff",
model+"\n"+archivedV3+"\n"+prelude+"\n"+
"const rows=csvParse(scores),adv=csvParse(advanced);"+
"const result=computeV4(rows,cutoff,season);state.raw=rows;attachEfficiencyV4(result.teams,adv);"+
"const v4=result.teams.map(t=>({name:t.name,score:t.score,elo:t.elo,power:t.power,powerScore:t.powerScore,powerRank:t.powerRank,winpct:t.winpct,rank:t.rank}));"+
"const coverage={number:state.advCovered,denominator:state.advExpected,active:state.fullModel};"+
"const legacyRows=rows.map(r=>({...r,season:'2026',completed:(r.completed==='TRUE'&&Date.parse(r.start_date)<cutoff?'TRUE':'FALSE')}));"+
"const legacy=compute(legacyRows,'live');attachEfficiency(legacy.teams,adv);"+
"return {v4,legacy:legacy.teams.map(t=>({name:t.name,score:t.score,rank:t.rank})),coverage};"
);
const parse=new Function("csv",prelude+"return csvParse(csv)");
const sigmoid=x=>1/(1+Math.exp(-Math.max(-30,Math.min(30,x))));
function evaluate(year){
 const base=path.join(root,"data","history",String(year));
 const csv=fs.readFileSync(path.join(base,"cfb_schedules_"+year+".csv"),"utf8");
 const advanced=fs.readFileSync(path.join(base,"cfmi_advanced_"+year+".csv"),"utf8");
 const rows=parse(csv).filter(r=>r.season===String(year)&&r.season_type==="regular");
 const final=rows.filter(r=>r.completed==="TRUE"&&r.home_division==="fbs"&&r.away_division==="fbs"&&
   Number.isFinite(+r.home_points)&&Number.isFinite(+r.away_points)&&r.home_points!==""&&r.away_points!==""&&
   r.home_points!=="NA"&&r.away_points!=="NA"&&+r.home_points!==+r.away_points);
 const metrics={season:year,games:0,v4:0,v3:0,elo:0,power:0,predictivePower:0,naive:0,brierV4:0,brierV3:0,brierPredictivePower:0,top25Overlap:0,top25CompareN:0};
 const weeks=[],coverage=[];let prior=null;
 for(let week=5;week<=13;week++){
   const upcoming=final.filter(r=>+r.week===week);if(upcoming.length<5)continue;
   const firstKick=Math.min(...upcoming.map(r=>Date.parse(r.start_date)));
   const training=final.filter(r=>+r.week<week&&Date.parse(r.start_date)<firstKick);
   if(training.length<120)continue;
   const r=executor(csv,advanced,year,firstKick);
   const team=new Map(r.v4.map(t=>[t.name,t])),old=new Map(r.legacy.map(t=>[t.name,t]));
   const thisTop=new Set(r.v4.filter(t=>t.rank<=25).map(t=>t.name));
   if(prior){metrics.top25Overlap+=[...thisTop].filter(name=>prior.has(name)).length;metrics.top25CompareN++}prior=thisTop;
   weeks.push(week);coverage.push({week,coreEPA:r.coverage.number,expected:r.coverage.denominator,active:r.coverage.active});
   for(const game of upcoming){
     const h=team.get(game.home_team),a=team.get(game.away_team),oh=old.get(game.home_team),oa=old.get(game.away_team);
     if(!h||!a||!oh||!oa)continue;
     const actual=+game.home_points>+game.away_points?1:0,neutral=game.neutral_site==="TRUE";
     const d4=h.score-a.score+(neutral?0:1),d3=oh.score-oa.score+(neutral?0:1);
     metrics.games++;metrics.v4+=Number((d4>=0)===Boolean(actual));metrics.v3+=Number((d3>=0)===Boolean(actual));
     metrics.elo+=Number(((h.elo-a.elo)+(neutral?0:55)>=0)===Boolean(actual));
     metrics.power+=Number(((h.power-a.power)+(neutral?0:2.5)>=0)===Boolean(actual));
     const pd=h.powerScore-a.powerScore+(neutral?0:1);
     metrics.predictivePower+=Number((pd>=0)===Boolean(actual));
     metrics.brierPredictivePower+=(sigmoid(pd/6)-actual)**2;
     metrics.naive+=Number(((h.winpct-a.winpct)+(neutral?0:.03)>=0)===Boolean(actual));
     metrics.brierV4+=(sigmoid(d4/6)-actual)**2;metrics.brierV3+=(sigmoid(d3/6)-actual)**2;
   }
 }
 if(metrics.games<100)throw Error("Insufficient heldout FBS games "+year+" "+metrics.games);
 const out={season:year,heldoutGames:metrics.games,weeks,
  accuracy:{v4:metrics.v4/metrics.games,v3:metrics.v3/metrics.games,elo:metrics.elo/metrics.games,
    opponentPower:metrics.power/metrics.games,predictivePower:metrics.predictivePower/metrics.games,naiveWinPct:metrics.naive/metrics.games},
  brier:{v4FixedScale:metrics.brierV4/metrics.games,v3FixedScale:metrics.brierV3/metrics.games,predictivePowerFixedScale:metrics.brierPredictivePower/metrics.games},
  top25WeekToWeekOverlap:metrics.top25CompareN?metrics.top25Overlap/metrics.top25CompareN:null,
  coreEPACoverageByWeek:coverage
 };
 return out;
}
const results=[2024,2025].map(evaluate);
const report={model:"CFMI V4.1.0 — distinct Merit and Power",generatedAt:new Date().toISOString(),
method:"Walk-forward historical held-out FBS games; each week's model uses previous completed regular-season games only. Predictions use rank score difference + 1 index-point home adjustment. No polls or preseason ratings. Brier uses fixed uncalibrated logistic 6-point scale; predictive hit rate is only one test of a merit ranking.",
results};
fs.writeFileSync(path.join(root,"data","backtest_v4.json"),JSON.stringify(report,null,2)+"\n");
console.log("CFMI 2024–25 BACKTEST",JSON.stringify(results.map(r=>({season:r.season,games:r.heldoutGames,accuracy:r.accuracy,brier:r.brier,top25Carryover:r.top25WeekToWeekOverlap})),null,2));
