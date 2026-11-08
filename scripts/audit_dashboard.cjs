#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const base=path.join(__dirname,'..','site'),data=path.join(base,'data');
const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
const m=html.match(/<script>([\s\S]*?)<\/script>/i);
if(!m)throw Error('Missing inline calculation engine');
const boundary=m[1].indexOf('const submetric=');
if(boundary<10000)throw Error('Invalid engine boundary');
const prelude=m[1].slice(0,boundary);
const model=fs.readFileSync(path.join(base,'model_v4.js'),'utf8')+'\n'+fs.readFileSync(path.join(base,'model_v5.js'),'utf8');
const doc=JSON.parse(fs.readFileSync(path.join(data,'model_v5_params.json'),'utf8'));
const history=JSON.parse(fs.readFileSync(path.join(data,'weekly_views_2026.json'),'utf8'));
assert.equal(doc.version,'5.1.0');
assert.deepEqual(doc.parameters.trainedOn,[2024]);
assert.deepEqual(doc.parameters.validatedOn,[2025]);
assert(doc.trainingGames>=300&&doc.validationGames>=300);
assert(doc.validation?.baseline2025?.logLoss>0&&doc.validation?.previousV5_2025?.logLoss>0);
assert(doc.parameters.finishing>=0&&doc.parameters.consistency>=0&&doc.parameters.offense>=0&&doc.parameters.defense>=0);
const body=prelude+[
"if(!MODEL_V5.setParameters(parameters))throw Error('Model parameters invalid');",
"const records=csvParse(scores),advanced=csvParse(advCsv);",
"const {teams,games}=computeV5(records,cutoff,2026);",
"state.raw=records;attachEfficiencyV5(teams,advanced);",
"return {gameCount:games.length,coverage:{measured:state.advCovered,eligible:state.advExpected,full:state.fullModel},",
"teams:teams.map(t=>({name:t.name,rank:t.rank,merit:t.score,power:t.powerScore,",
"powerPoints:t.powerPoints,powerRank:t.powerRank,won:t.won,lost:t.lost,wab:t.wab,",
"residual:t.meritQualityResidual,meritRecord:t.meritRecordScore,meritControl:t.meritControlScore,",
"advanced:t.advCoreGames,fbsGames:t.fbsGames})),version:MODEL_V5.version};"
].join('\n');
const compute=new Function('scores','advCsv','parameters','cutoff',model+'\n'+body);
const csv=fs.readFileSync(path.join(data,'cfb_schedules_2026.csv'),'utf8');
const adv=fs.readFileSync(path.join(data,'cfmi_advanced_2026.csv'),'utf8');
const latest=compute(csv,adv,doc,Date.now());
assert.equal(latest.version,'5.1.0');
assert(latest.gameCount>=300,'Expected substantial 2026 games');
assert(latest.teams.length>=130,'Expected complete FBS coverage');
assert(latest.coverage.eligible>=300,'Missing advanced data eligibility');
assert(latest.teams.every(t=>Number.isFinite(t.merit)&&t.merit>=0&&t.merit<=100
 &&Number.isFinite(t.power)&&t.power>=0&&t.power<=100&&Number.isFinite(t.powerPoints)
 &&Number.isInteger(t.rank)&&Number.isInteger(t.powerRank)&&t.fbsGames>=t.advanced),
 'Invalid Merit, Power, coverage or ranks');
for(const key of ['rank','powerRank']){
 const ranks=latest.teams.map(t=>t[key]).sort((a,b)=>a-b);
 assert.deepEqual(ranks,Array.from({length:latest.teams.length},(_,i)=>i+1),'Invalid ranking sequence: '+key);
}
for(const [key,rank] of [['merit','rank'],['power','powerRank']]){
 const sorted=latest.teams.slice().sort((a,b)=>a[rank]-b[rank]);
 for(let i=1;i<sorted.length;i++)assert(sorted[i-1][key]>=sorted[i][key]-1e-8,'Nonmonotone '+rank);
}
assert(Array.isArray(history.history)&&history.history.length>=6,'Weekly snapshots missing');
assert.equal(history.season,2026);
let previous=-1;
for(const snapshot of history.history){
 assert(snapshot.gameCount>=previous,'Game counts must not decrease');
 previous=snapshot.gameCount;
 assert(snapshot.teams.length===latest.teams.length,'History must include entire FBS');
 assert(snapshot.teams.every(t=>Number.isFinite(t.score)&&Number.isFinite(t.powerScore)
  &&t.rank>=1&&t.powerRank>=1&&t.rank<=snapshot.teams.length
  &&t.powerRank<=snapshot.teams.length),'History has invalid rank/score');
 const recomputed=compute(csv,adv,doc,Date.parse(snapshot.cutoffUtc));
 for(const name of ['Georgia','Alabama','Utah']){
  const t=snapshot.teams.find(x=>x.name===name),a=recomputed.teams.find(x=>x.name===name);
  if(t)assert(a&&a.won===t.won&&a.lost===t.lost&&a.rank===t.rank&&a.powerRank===t.powerRank,
   'As-of mismatch '+name+' week '+snapshot.week);
 }
}
for(const game of history.upcoming.games||[]){
 assert(Date.parse(game.date)>Date.now()-3600000,'Slate contains completed event');
 assert(Number.isFinite(game.homeMetrics.powerPoints)&&Number.isFinite(game.awayMetrics.powerPoints));
 assert([game.home,game.away].includes(game.predictedWinner),'Missing match pick');
 if(doc.probabilitiesCalibrated){
  assert(Number.isFinite(game.homeWinProbability)&&game.homeWinProbability>=0&&game.homeWinProbability<=1);
  assert(Math.abs(game.homeWinProbability+game.awayWinProbability-1)<1e-9);
 }else assert.equal(game.homeWinProbability,null);
}
const output={
 modelVersion:'5.1.0',generatedAtUtc:new Date().toISOString(),
 provenance:{trainSeason:doc.trainSeason,validationSeason:doc.validationSeason,
  selected:doc.deployedCandidate,validation:doc.validation},
 coverage:latest.coverage,totalGames:latest.gameCount,teamCount:latest.teams.length,
 weeklySnapshots:history.history.map(x=>({week:x.week,asOf:x.asOfDate,games:x.gameCount})),
 upcomingGames:history.upcoming.games?.length||0,teams:latest.teams
};
fs.writeFileSync(path.join(data,'cfmi_ranking_audit.json'),JSON.stringify(output,null,2)+'\n');
console.log('CFMI V5 AUDIT PASSED',JSON.stringify({
 games:latest.gameCount,teams:latest.teams.length,coverage:latest.coverage,
 weeks:history.history.length,matchups:history.upcoming.games?.length||0,
 selection:doc.deployedCandidate,legacyReference:doc.validation.previousV5_2025,heldout2025:{
  candidate:doc.validation.candidate2025,baseline:doc.validation.baseline2025
 }
},null,2));
