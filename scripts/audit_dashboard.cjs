#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const base=path.join(__dirname,'..','site'),data=path.join(base,'data');
const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
const m=html.match(/<script>([\s\S]*?)<\/script>/i);
if(!m)throw Error('Missing inline calculation engine');
const boundary=m[1].indexOf('const submetric=');
if(boundary<1500)throw Error('Invalid engine boundary');
const prelude=m[1].slice(0,boundary);
const model=fs.readFileSync(path.join(base,'model_v4.js'),'utf8')+'\n'+fs.readFileSync(path.join(base,'opponent_network_research.js'),'utf8')+'\n'+fs.readFileSync(path.join(base,'model_v5.js'),'utf8')+'\n'+fs.readFileSync(path.join(base,'preseason_prior_v1.js'),'utf8');
const doc=JSON.parse(fs.readFileSync(path.join(data,'model_v5_params.json'),'utf8'));
const datasetMetadata=JSON.parse(fs.readFileSync(path.join(data,'metadata.json'),'utf8'));
assert.equal(datasetMetadata.season,2026,'Published ingestion snapshot must be current season');
assert.equal(datasetMetadata.dataset_schema_version,'2.0.0','Data and scoring schema must be separated');
assert.equal(datasetMetadata.scoring_model_declared_here,false,'Ingestion must not claim ownership of ranking coefficients');
assert(!Object.hasOwn(datasetMetadata,'model_version')&&!Object.hasOwn(datasetMetadata,'weights'),
 'Legacy V4 coefficients or version leaked into active data ingestion metadata');
const history=JSON.parse(fs.readFileSync(path.join(data,'weekly_views_2026.json'),'utf8'));
const prior=JSON.parse(fs.readFileSync(path.join(data,'preseason_prior_2026.json'),'utf8'));
const projection=JSON.parse(fs.readFileSync(path.join(data,'preseason_playoff_forecast_2026.json'),'utf8'));
const priorEvaluation=JSON.parse(fs.readFileSync(path.join(data,'research_full_preseason_backtest.json'),'utf8'));
const ledger=JSON.parse(fs.readFileSync(path.join(data,'prediction_ledger_2025_2026.json'),'utf8'));
const industrial=JSON.parse(fs.readFileSync(path.join(data,'power_benchmark_2025_2026.json'),'utf8'));
const matchupParameters=JSON.parse(fs.readFileSync(path.join(data,'model_matchup_params.json'),'utf8'));
assert.equal(matchupParameters.version,'matchup-1.0-research');
assert.equal(matchupParameters.parameters.coefficients.length,7);
assert.equal(matchupParameters.parameters.keys.length,7);
const selected=matchupParameters.selected;
if(matchupParameters.deployCandidate){
 assert(selected&&selected.selection2025.logLoss<matchupParameters.baseline['2025'].logLoss,
  'Never activate matchup adjustments that fail the 2025 selection gate');
}else{
 assert(matchupParameters.parameters.coefficients.every(x=>x===0),
  'Unvalidated matchup effects must stay zero');
}

for(const year of ['2025','2026']){
 const season=ledger.seasons[year],benchmark=industrial.seasons[year];
 assert(season&&season.weeks.length>=9,'Historical matchup weeks missing '+year);
 assert(benchmark&&benchmark.entireCFMI.games>300,'Industry comparison missing '+year);
 const games=season.weeks.flatMap(w=>w.games);
 assert(games.every(g=>Number.isFinite(g.homeMatchupScore)&&Number.isFinite(g.awayMatchupScore) &&
  Math.abs(g.homeMatchupScore+g.awayMatchupScore-100)<1e-6),
  'Both game-specific Matchup Scores must total 100%');
 assert(games.every(g=>Number.isFinite(g.baselinePowerMargin)&&
  Number.isFinite(g.matchupAdjustment)&&
  Math.abs(g.predictedMargin-g.baselinePowerMargin-g.matchupAdjustment)<1e-7),
  'Matchup Score must explain exact Power + venue + opponent-matchup point margin');
 assert(games.every(g=>Math.abs(g.matchupAdjustment)<=4.00000001),
  'Opponent-specific matchup residual must remain within validated cap');
 assert(games.every(g=>g.homePowerIndex>=0&&g.awayPowerIndex>=0),
  'Neutral Power scores cannot be overwritten by matchup-specific ratings');

 assert(games.length>=350,'Too few 2025/26 FBS matchups '+year);
 assert(games.every(g=>Date.parse(g.asOfUtc)<Date.parse(g.kickoffUtc)),
  'Matchup prediction must be made before kickoff '+year);
 assert(games.every(g=>g.homeWinProbability>=0&&g.homeWinProbability<=1&&
  Number.isFinite(g.homePowerIndex)&&Number.isFinite(g.awayPowerIndex)),
  'Invalid pregame probability or team Power score '+year);
 assert(games.every(g=>!g.finished||(g.predictedWinner===g.actualWinner)===g.correct),
  'Predicted winners must reconcile to final game result '+year);
 const scored=games.filter(g=>g.finished);
 const wins=scored.filter(g=>g.correct).length;
 assert.equal(wins,season.overall.correct,'YTD correct picks mismatch '+year);
 assert.equal(scored.length,season.overall.played,'YTD games mismatch '+year);
 assert(benchmark.commonGames<=scored.length,'External common games exceeds CFMI sample '+year);
 for(const metric of ['fpi','sp_plus','fei']){
  const row=benchmark.commonScorecard[metric];
  assert(row?.games===benchmark.commonGames,'Benchmark denominator differs across providers '+year+' '+metric);
  assert(row?.correct>=0&&row?.correct<=row.games,'External winner score invalid '+year+' '+metric);
 }
 assert(benchmark.perWeek.every(w=>w.cfmi.games>=0),'Per-week benchmark missing '+year);
}
// Treat missing historical provider data as unavailable, not zero success.
const priorFPI=industrial.seasons['2025'].systems.fpi;
const priorFEI=industrial.seasons['2025'].systems.fei;
assert(priorFPI.games>=600,'2025 ESPN FPI weekly snapshots must cover substantial matched games');
assert(priorFEI.games>=700,'2025 retrospective FEI weekly ratings must cover season games');
assert.equal(industrial.seasons['2025'].systems.sp_plus.games,0,
 'Do not impute unavailable 2025 SP+ game-ahead team strength');
assert.equal(industrial.seasons['2025'].commonGames,0,
 'Never claim a four-way 2025 rating comparison when SP+ has no dated archive');
assert(industrial.seasons['2025'].alternateSourceCoverage.fpiSnapshots>=12,
 '2025 FPI must use non-overwritten historical snapshots');
assert(industrial.seasons['2025'].sourceWarnings.some(x=>x.includes('retrospective')),
 '2025 FEI source timestamp caveat must be published');
assert(ledger.seasons['2026'].weeks.some(w=>w.summary.unplayed>0),
 'Expected a current-week or future-week matchup slate in 2026');

assert.equal(prior.season,2026);assert.equal(prior.version,'5.3-research-v1');
assert.equal(projection.season,2026);assert(projection.trials>=1000);
assert(Object.keys(prior.teams).length>=135);
assert(Math.abs(projection.teams.reduce((z,t)=>z+t.championPct,0)-100)<0.0001,'Title probabilities must add to 100%');
assert(projection.teams.every(t=>Number.isFinite(t.playoffPct)&&t.playoffPct>=0&&t.playoffPct<=100));
assert(priorEvaluation.coverage[2026].talent>=135);
assert.equal(doc.version,'5.2.0');
assert.deepEqual(doc.parameters.trainedOn,[2024]);
assert.deepEqual(doc.parameters.validatedOn,[2025]);
assert(doc.trainingGames>=300&&doc.validationGames>=300);
assert(doc.validation?.baseline2025?.logLoss>0&&doc.validation?.previousV5_2025?.logLoss>0);
assert(['joint_opponent_network','validated_v5_reference'].includes(doc.parameters.mode));
if(doc.parameters.mode==='joint_opponent_network'){
 assert(doc.parameters.jointCoefficients.length===6);
 assert(doc.validation?.opponentStrengthComparison?.selected===true);
}
assert(doc.parameters.finishing>=0&&doc.parameters.consistency>=0&&doc.parameters.offense>=0&&doc.parameters.defense>=0);
const body=prelude+[
"if(!MODEL_V5.setParameters(parameters))throw Error('Model parameters invalid');",
"if(!MODEL_PRESEASON_V53.load(prior))throw Error('Preseason prior invalid');",
"const records=csvParse(scores),advanced=csvParse(advCsv);",
"const {teams,games}=computeV5(records,cutoff,2026);",
"state.raw=records;attachEfficiencyV5(teams,advanced);",
"return {gameCount:games.length,coverage:{measured:state.advCovered,eligible:state.advExpected,full:state.fullModel},",
"teams:teams.map(t=>({name:t.name,rank:t.rank,merit:t.score,power:t.powerScore,",
"powerPoints:t.powerPoints,powerRank:t.powerRank,won:t.won,lost:t.lost,wab:t.wab,",
"residual:t.meritQualityResidual,meritRecord:t.meritRecordScore,meritQuality:t.meritQualityScore,meritControl:t.meritControlScore,dominance:t.meritDominanceRaw,dominanceCoverage:t.meritDominanceCoverage,h2h:t.meritHeadToHeadAdjustment,fcs:t.meritFcsPerformancePenalty,meritProvisional:t.meritProvisional,meritPublishedRank:t.meritPublishedRank,effectiveGames:t.preseasonEffectiveGames,conferenceContext:t.powerConferenceCalibration,powerComponentTotal:Object.values(t.powerContributionPoints).reduce((z,v)=>z+v,0),",
"advanced:t.advCoreGames,fbsGames:t.fbsGames,priorWeight:t.preseasonPriorWeight||0,mode:t.powerMode||'reference'})),version:MODEL_V5.version};"
].join('\n');
const compute=new Function('scores','advCsv','parameters','cutoff','prior',model+'\n'+body);
const csv=fs.readFileSync(path.join(data,'cfb_schedules_2026.csv'),'utf8');
const adv=fs.readFileSync(path.join(data,'cfmi_advanced_2026.csv'),'utf8');
const latest=compute(csv,adv,doc,Date.now(),prior);
assert.equal(latest.version,'5.7.0');
assert(latest.gameCount>=300,'Expected substantial 2026 games');
assert(latest.teams.length>=130,'Expected complete FBS coverage');
assert(latest.coverage.eligible>=300,'Missing advanced data eligibility');
assert(latest.teams.every(t=>Number.isFinite(t.merit)&&t.merit>=0&&t.merit<=100
 &&Number.isFinite(t.power)&&t.power>=0&&t.power<=100&&Number.isFinite(t.powerPoints)
 &&Number.isInteger(t.rank)&&Number.isInteger(t.powerRank)&&t.fbsGames>=t.advanced),
 'Invalid Merit, Power, coverage or ranks');
// Merit exactly follows the published earned-resume contribution weights.
for(const t of latest.teams){
 const scored=.45*t.meritRecord+.30*t.meritQuality+.25*t.meritControl+(t.fcs||0);
 assert.equal(t.h2h,0,'Global head-to-head score adjustment prohibited');
 assert(Math.abs(scored-t.merit)<1e-8,'Merit formula mismatch '+t.name);
 assert(Number.isFinite(t.dominance)&&t.dominanceCoverage>=0&&t.dominanceCoverage<=1,'Missing opponent-adjusted dominance '+t.name);
 assert(t.dominance>=-30&&t.dominance<=30,'Unbounded game dominance can overwhelm Merit '+t.name);
 assert(Math.abs(t.powerComponentTotal-t.powerPoints)<1e-8,'Power component total mismatch '+t.name);
}
// Metamorphic check: increasing an ALREADY dominant FCS victory by 60
// must not raise Merit or Power. Converting a close FCS win to a blowout
// intentionally removes negative underperformance evidence.
const parse=new Function('csv',prelude+'return csvParse(csv)');
const source=parse(csv);
const example=source.find(g=>{
 if(g.completed!=='TRUE'||g.season!=='2026'||g.season_type!=='regular')return false;
 if(g.home_division==='fbs'&&g.away_division==='fcs')
   return Number(g.home_points)-Number(g.away_points)>=20;
 if(g.away_division==='fbs'&&g.home_division==='fcs')
   return Number(g.away_points)-Number(g.home_points)>=20;
 return false;
});
if(example){
 const adjusted=source.map(g=>({...g}));
 const game=adjusted.find(g=>g.game_id===example.game_id);
 const field=game.home_division==='fbs'?'home_points':'away_points';
 game[field]=String(Number(game[field])+60);
 const headings=Object.keys(adjusted[0]),quote=x=>'"'+String(x??'').replaceAll('"','""')+'"';
 const modified=headings.map(quote).join(',')+'\n'+adjusted.map(r=>headings.map(h=>quote(r[h])).join(',')).join('\n')+'\n';
 const distorted=compute(modified,adv,doc,Date.now(),prior);
 for(const t of latest.teams){
  const other=distorted.teams.find(x=>x.name===t.name);
  assert(other&&Math.abs(other.merit-t.merit)<1e-8&&Math.abs(other.powerPoints-t.powerPoints)<1e-8,
   'FCS blowout must never improve V5.1 rating '+t.name);
 }
}


// Reconstructed score algebra and rank publication invariants.
for(const t of latest.teams){
 if(t.meritProvisional)assert(t.meritPublishedRank===null,'Insufficient résumé cannot receive a published national rank');
 else assert.equal(t.meritPublishedRank,t.rank);
 assert(Number.isFinite(t.conferenceContext)&&Math.abs(t.conferenceContext)<=3,
   'Historical conference-context correction must be bounded');
 if(t.fbsGames===0)assert.equal(t.conferenceContext,0,'No preseason conference context');
}

for(const key of ['rank','powerRank']){
 const ranks=latest.teams.map(t=>t[key]).sort((a,b)=>a-b);
 assert.deepEqual(ranks,Array.from({length:latest.teams.length},(_,i)=>i+1),'Invalid ranking sequence: '+key);
}
for(const [key,rank] of [['merit','rank'],['power','powerRank']]){
 const sorted=latest.teams.slice().sort((a,b)=>a[rank]-b[rank]);
 for(let i=1;i<sorted.length;i++)assert(sorted[i-1][key]>=sorted[i][key]-(key==='merit'?.350001:1e-8),'Nonmonotone '+rank);
}
assert(Array.isArray(history.history)&&history.history.length>=6,'Weekly snapshots missing');
assert.equal(history.season,2026);
assert.equal(history.history[0].week,0,'Week 0 preseason snapshot missing');
const zero=history.history[0];
assert.equal(zero.gameCount,0);
assert(zero.teams.every(t=>t.meritPublishedRank===null),'Week 0 must not imply earned Merit ranking');
const first=history.history.find(w=>w.week===1);
assert(first&&first.teams.every(t=>t.meritPublishedRank===null&&t.meritProvisional),
 'Week 1 national Merit ranks are necessarily provisional');
const zeroRecomputed=compute(csv,adv,doc,Date.parse(zero.cutoffUtc),prior);
assert(zeroRecomputed.teams.every(t=>t.priorWeight===1),'Week 0 ratings must be all preseason prior');
assert(latest.teams.filter(t=>t.fbsGames>=6).every(t=>t.priorWeight===0),'Teams with at least six FBS games must be fully on-field');
let previous=-1;
for(const snapshot of history.history){
 assert(snapshot.gameCount>=previous,'Game counts must not decrease');
 previous=snapshot.gameCount;
 assert(snapshot.teams.length===latest.teams.length,'History must include entire FBS');
 assert(snapshot.teams.every(t=>Number.isFinite(t.score)&&Number.isFinite(t.powerScore)
  &&t.rank>=1&&t.powerRank>=1&&t.rank<=snapshot.teams.length
  &&t.powerRank<=snapshot.teams.length),'History has invalid rank/score');
 const recomputed=compute(csv,adv,doc,Date.parse(snapshot.cutoffUtc),prior);
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
 modelVersion:'5.7.0',generatedAtUtc:new Date().toISOString(),
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
