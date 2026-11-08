#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const base=path.join(__dirname,'../site');
const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
const body=html.match(/<script>([\s\S]*?)<\/script>/)[1],prelude=body.slice(0,body.indexOf('const submetric='));
const scripts=['model_v4.js','opponent_network_research.js','model_v5.js'].map(f=>fs.readFileSync(path.join(base,f),'utf8')).join('\n');
const calculate=[
'MODEL_V5.setParameters(config);',
'const raw=csvParse(csv),adv=csvParse(advanced);',
'const r=computeV5(raw,Date.now(),2026);state.raw=raw;',
'attachEfficiencyV5(r.teams,adv);return r.teams;'
].join('\n');
const run=new Function('csv','advanced','config',scripts+'\n'+prelude+'\n'+calculate);
const teams=run(fs.readFileSync(path.join(base,'data/cfb_schedules_2026.csv'),'utf8'),
 fs.readFileSync(path.join(base,'data/cfmi_advanced_2026.csv'),'utf8'),
 JSON.parse(fs.readFileSync(path.join(base,'data/model_v5_params.json'),'utf8')));
const byName=new Map(teams.map(t=>[t.name,t]));
const interesting=['Liberty','New Mexico','Georgia','Alabama','Utah','Ohio State','Oregon','Miami','Ole Miss','South Florida','Tulane','Boise State'];
const details=interesting.map(name=>{
 const t=byName.get(name);if(!t)return {name,missing:true};
 return {team:name,record:t.won+'-'+t.lost,conference:t.conference,meritRank:t.rank,
 powerRank:t.powerRank,powerPoints:t.powerPoints,powerIndex:t.powerScore,
 baselineRank:t.baselinePowerRank,baselinePoints:t.power,
 aveOpponentRating:t.sos,adjustedMOV:t.mov,netEPA:t.ppaNet,
 success:t.successNet,explosives:t.explosiveNet,
 componentPoints:t.powerContributionPoints,advCoverage:t.advCoverage,
 opponentGames:t.played.map(g=>({
  name:g.op,site:g.site,score:g.pf+'-'+g.pa,oppFbs:g.opFbs,
  oppRating:g.opRating,oppPowerRank:g.oppRank,margin:g.margin,
  adjustedMOV:g.adjustedMOV
 })).sort((a,b)=>b.oppRating-a.oppRating)};
});
const top=teams.slice().sort((a,b)=>a.powerRank-b.powerRank).slice(0,35).map(t=>({
 rank:t.powerRank,name:t.name,conference:t.conference,
 wins:t.won,losses:t.lost,powerPoints:+t.powerPoints.toFixed(3),
 baseline:+t.power.toFixed(3),sos:+t.sos.toFixed(3),
 sosRank:t.sosRank,adjustedMOV:+t.mov.toFixed(3),
 success:+t.successNet.toFixed(3),explosive:+t.explosiveNet.toFixed(3)
}));
console.log('CFMI CURRENT TOP POWER',JSON.stringify(top));
console.log('CFMI POWER TEAM DIAGNOSTICS',JSON.stringify(details));
