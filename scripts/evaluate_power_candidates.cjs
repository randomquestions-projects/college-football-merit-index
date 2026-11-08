#!/usr/bin/env node
"use strict";
/* Prespecified predictive power candidates; weekly training uses only past games. */
const fs=require("fs"),path=require("path");
const root=path.join(__dirname,"..","site");
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
const body=html.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
const index=body?.indexOf("const submetric=");
if(!body||index<10000)throw Error("Unexpected site JS layout");
const model=fs.readFileSync(path.join(root,"model_v4.js"),"utf8");
const prelude=body.slice(0,index);
const evalModel=new Function("csv","adv","year","cutoff",model+"\n"+prelude+
 "const rows=csvParse(csv),advanced=csvParse(adv);"+
 "const result=computeV4(rows,cutoff,year);state.raw=rows;attachEfficiencyV4(result.teams,advanced);"+
 "return result.teams.map(t=>({name:t.name,merit:t.score,core:t.power,corePct:t.powerPct,epa:t.ppaNetPct,success:t.successNetPct,explosive:t.explosiveNetPct,consistency:t.consistencyScorePct,powerRank:t.powerRank,coreRank:t.powerCoreRank}));");
const parse=new Function("csv",prelude+"return csvParse(csv)");
const candidates={
 core_100:{corePct:100},
 core_75_epa15_success5_explosive5:{corePct:75,epa:15,success:5,explosive:5},
 core_65_epa20_success10_explosive5:{corePct:65,epa:20,success:10,explosive:5},
 core_55_epa25_success10_explosive5_consistency5:{corePct:55,epa:25,success:10,explosive:5,consistency:5},
 core_45_epa30_success15_explosive5_consistency5:{corePct:45,epa:30,success:15,explosive:5,consistency:5},
 core_35_epa40_success15_explosive5_consistency5:{corePct:35,epa:40,success:15,explosive:5,consistency:5}
};
function candidateScore(t,w){return Object.entries(w).reduce((s,[k,x])=>s+x*t[k]/100,0)}
const sigmoid=x=>1/(1+Math.exp(-Math.max(-30,Math.min(30,x))));
const report={model:"CFMI Power candidate exploration, no polls or preseason",years:{},candidates};
for(const year of [2024,2025]){
 const folder=path.join(root,"data","history",String(year));
 const csv=fs.readFileSync(path.join(folder,"cfb_schedules_"+year+".csv"),"utf8");
 const adv=fs.readFileSync(path.join(folder,"cfmi_advanced_"+year+".csv"),"utf8");
 const all=parse(csv).filter(g=>g.season===String(year)&&g.season_type==="regular");
 const finals=all.filter(g=>g.completed==="TRUE"&&g.home_division==="fbs"&&g.away_division==="fbs"&&g.home_points!==""&&g.away_points!==""&&g.home_points!=="NA"&&g.away_points!=="NA"&&Number.isFinite(+g.home_points)&&Number.isFinite(+g.away_points)&&+g.home_points!==+g.away_points);
 const result=Object.fromEntries(Object.keys(candidates).concat("raw_core_margin","merit").map(k=>[k,{correct:0,games:0,brier:0}]));
 for(let week=5;week<=13;week++){
   const targets=finals.filter(g=>+g.week===week);
   if(targets.length<5)continue;
   const kickoff=Math.min(...targets.map(g=>Date.parse(g.start_date)));
   if(finals.filter(g=>+g.week<week&&Date.parse(g.start_date)<kickoff).length<120)continue;
   const t=evalModel(csv,adv,year,kickoff);
   const map=new Map(t.map(a=>[a.name,a]));
   for(const game of targets){
     const home=map.get(game.home_team),away=map.get(game.away_team);
     if(!home||!away)continue;
     const y=+game.home_points>+game.away_points?1:0;
     const homeAdv=game.neutral_site==="TRUE"?0:1;
     for(const [id,w] of Object.entries(candidates)){
       const d=candidateScore(home,w)-candidateScore(away,w)+homeAdv;
       const p=sigmoid(d/6);
       result[id].correct+=(d>=0)===Boolean(y)?1:0;
       result[id].games++;result[id].brier+=(p-y)**2;
     }
     for(const [id,d] of [["raw_core_margin",home.core-away.core+(homeAdv?2.5:0)],["merit",home.merit-away.merit+homeAdv]]){
       const p=sigmoid(d/6);
       result[id].correct+=(d>=0)===Boolean(y)?1:0;
       result[id].games++;result[id].brier+=(p-y)**2;
     }
   }
 }
 for(const [k,x] of Object.entries(result))if(x.games){x.accuracy=x.correct/x.games;x.brier/=x.games;delete x.correct;}
 report.years[year]=result;
}
console.log("POWER CANDIDATE OUT-OF-SAMPLE RESULTS",JSON.stringify(report.years,null,2));
fs.writeFileSync(path.join(root,"data","power_method_research.json"),JSON.stringify(report,null,2)+"\n");
