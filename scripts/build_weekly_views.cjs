#!/usr/bin/env node
'use strict';
/*
 * CFMI weekly reconstructed as-of views.
 * Every weekly rating is recomputed with a hard game-time cutoff, including
 * fresh opponent ratings, team percentiles, and advanced per-game metrics.
 * No future games are included in any prior-week calculation.
 * This is reconstructed history using today's source release and model version,
 * NOT proof of what a website published or knew in that past week.
 */
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..','site'),year='2026';
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const inline=html.match(/<script>([\s\S]*?)<\/script>/i);
if(!inline)throw Error('Missing CFMI inline model prelude');
const boundary=inline[1].indexOf('const submetric=');
if(boundary<10000)throw Error('CFMI engine prelude moved: update build_weekly_views.cjs');
const prelude=inline[1].slice(0,boundary);
const model=fs.readFileSync(path.join(root,'model_v4.js'),'utf8')+'\n'+fs.readFileSync(path.join(root,'opponent_network_research.js'),'utf8')+'\n'+fs.readFileSync(path.join(root,'model_v5.js'),'utf8')+'\n'+fs.readFileSync(path.join(root,'preseason_prior_v1.js'),'utf8');
const parameters=JSON.parse(fs.readFileSync(path.join(root,'data','model_v5_params.json'),'utf8'));
const prior=JSON.parse(fs.readFileSync(path.join(root,'data','preseason_prior_2026.json'),'utf8'));

const schedule=fs.readFileSync(path.join(root,'data','cfb_schedules_2026.csv'),'utf8');
const advanced=fs.readFileSync(path.join(root,'data','cfmi_advanced_2026.csv'),'utf8');
const csvParse=new Function('csv',prelude+'return csvParse(csv)');
const rows=csvParse(schedule),advRows=csvParse(advanced);
if(rows.length<300||advRows.length<200)throw Error('Unacceptably incomplete 2026 data');
const compute=new Function('raw','advanced','cutoff','parameters','prior',
 model+'\n'+prelude+'\n'+
 'state.raw=raw;MODEL_V5.setParameters(parameters);if(!MODEL_PRESEASON_V53.load(prior))throw Error("Invalid preseason prior");const result=computeV5(raw,cutoff,2026);'+
 'attachEfficiencyV5(result.teams,advanced);'+
 'return {teams:result.teams,gameCount:result.games.length,modelVersion:result.modelVersion,coverage:{measured:state.advCovered,expected:state.advExpected,full:state.fullModel}};'
);
const validScore=r=>r.season===year&&r.season_type==='regular'&&r.completed==='TRUE'&&
 r.home_points!==''&&r.away_points!==''&&r.home_points!=='NA'&&r.away_points!=='NA'&&
 Number.isFinite(+r.home_points)&&Number.isFinite(+r.away_points)&&
 Number.isFinite(Date.parse(r.start_date));
const completed=rows.filter(validScore);
const lastWeek=Math.max(...completed.map(x=>Number(x.week)));
if(!Number.isInteger(lastWeek)||lastWeek<1||lastWeek>16)throw Error('2026 completed game weeks invalid');
const summarize=t=>{
 const avg=(key)=>{
  const xs=(t.advGames||[]).map(g=>g[key]).filter(Number.isFinite);
  return xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
 };
 return {
  name:t.name,conference:t.conference,rank:t.rank,powerRank:t.powerRank,
  score:t.score,powerScore:t.powerScore,won:t.won,lost:t.lost,
  wab:t.wab,sor:t.sor,sos:t.sos,mov:t.mov,
  quality:t.qualityComponent,eff:t.effScore,meritRecordScore:t.meritRecordScore,meritQualityResidual:t.meritQualityResidual,meritQualityScore:t.meritQualityScore,meritControlScore:t.meritControlScore,powerPoints:t.powerPoints,powerEvidence:t.powerEvidence,powerMode:t.powerMode||'reference',opponentSupportRisk:t.powerOpponentSupportRisk||0,fcsUnderperformance:t.powerFcsUnderperformance||0,powerBreakdown:t.powerContributionPoints,
  preseasonPriorWeight:t.preseasonPriorWeight||0,preseasonPriorPoints:t.preseasonPriorPoints??null,preseasonTalentIndex:t.preseasonTalentIndex??null,preseasonTalentRank:t.preseasonTalentRank??null,
  opponentStrength:t.power,baselineRank:t.baselinePowerRank,
  ppaNet:t.ppaNet,successNet:t.successNet,explosiveNet:t.explosiveNet,
  off:t.off,def:t.def,top25Wins:t.top25Wins,
  roadWins:t.roadWins,top25RoadWins:t.top25RoadWins,
  coreGames:t.advCoreGames,fbsGames:t.fbsGames,
  offPpa:avg('off_ppa'),defPpa:avg('def_ppa'),
  offSuccess:avg('off_success_rate'),defSuccess:avg('def_success_rate'),
  offExplosive:avg('off_explosive_rate'),defExplosive:avg('def_explosive_rate')
 };
};
const sundayBefore=ms=>{
 const d=new Date(ms);d.setUTCHours(0,0,0,0);
 while(d.getUTCDay()!==0)d.setUTCDate(d.getUTCDate()-1);
 return d.toISOString().slice(0,10);
};
const weeks=[];
const firstKick=Math.min(...rows.filter(r=>r.season===year&&r.season_type==='regular')
  .map(r=>Date.parse(r.start_date)).filter(Number.isFinite));
if(!Number.isFinite(firstKick))throw Error('Missing opening game');
const weekZeroCutoff=firstKick-1;
const weekZero=compute(rows.map(r=>({...r,completed:'FALSE'})),advRows,weekZeroCutoff,parameters,prior);
weeks.push({week:0,asOfDate:new Date(weekZeroCutoff).toISOString().slice(0,10),
 cutoffUtc:new Date(weekZeroCutoff).toISOString(),gameCount:0,
 advancedCoverage:weekZero.coverage,modelVersion:'CFMI V5.3 preseason research',
 teams:weekZero.teams.map(summarize)});

for(let week=1;week<=lastWeek;week++){
 const prior=rows.filter(r=>r.season===year&&r.season_type==='regular'&&Number(r.week)>week)
  .map(r=>Date.parse(r.start_date)).filter(Number.isFinite);
 const thisWeek=completed.filter(r=>Number(r.week)===week);
 if(!thisWeek.length)continue;
 const lastKick=Math.max(...thisWeek.map(r=>Date.parse(r.start_date)));
 // For the current week, do not wait for a future game to update the dashboard;
 // compute the model only from already-final games as of build time.
 const cutoff=prior.length?Math.min(...prior)-1:Date.now();
 const safeCutoff=week===lastWeek?Math.min(cutoff,Date.now()):cutoff;
 const scopedRaw=rows.map(r=>Number(r.week)>week?{...r,completed:'FALSE'}:r);
 const result=compute(scopedRaw,advRows,safeCutoff,parameters,prior);
 const asOf=sundayBefore(prior.length?Math.min(...prior):lastKick+86400000);
 const teams=result.teams.map(summarize);
 const matches=completed.filter(r=>Date.parse(r.start_date)<=safeCutoff&&Number(r.week)<=week);
 weeks.push({
  week,asOfDate:asOf,cutoffUtc:new Date(safeCutoff).toISOString(),
  gameCount:matches.length,advancedCoverage:result.coverage,
  modelVersion:result.modelVersion,teams
 });
}
if(!weeks.length||weeks[weeks.length-1].teams.length<120)throw Error('Insufficient historical FBS coverage');
const latest=weeks[weeks.length-1],byName=new Map(latest.teams.map(t=>[t.name,t]));
// FBS-versus-FBS fixtures in the earliest upcoming schedule week.
const future=rows.filter(r=>r.season===year&&r.season_type==='regular'&&
 r.home_division==='fbs'&&r.away_division==='fbs'&&!validScore(r)&&
 Number.isFinite(Date.parse(r.start_date))&&Date.parse(r.start_date)>Date.now()-3600000);
const nextWeek=future.length?Math.min(...future.map(x=>Number(x.week))):null;
const matchups=nextWeek===null?[]:future.filter(x=>Number(x.week)===nextWeek)
 .sort((a,b)=>Date.parse(a.start_date)-Date.parse(b.start_date))
 .map(g=>{
  const home=byName.get(g.home_team),away=byName.get(g.away_team);
  if(!home||!away)return null;
  const eligible=latest.teams.filter(t=>Number.isFinite(t.powerPoints));
  const neutral=g.neutral_site==='TRUE';
  // V5 predictive strength is in estimated point margins, not percentile index units.
  const homeEdge=(home.powerPoints-away.powerPoints)+(neutral?0:parameters.parameters.homePoints);
  const probability=parameters.probabilitiesCalibrated===true?
    1/(1+Math.exp(-Math.max(-30,Math.min(30,homeEdge/parameters.parameters.logisticScale)))):null;
  return {
    gameId:String(g.game_id),week:nextWeek,date:g.start_date,
    venue:g.venue||null,neutral,home:home.name,away:away.name,
    predictedWinner:homeEdge>=0?home.name:away.name,
    predictionBasis:'V5 opponent-adjusted predictive point ratings + trained home advantage',
    edgePointsDiagnostic:homeEdge,
    homeWinProbability:probability,
    awayWinProbability:probability===null?null:1-probability,
    calibrated:probability!==null,
    homeMetrics:home,awayMetrics:away
  };
 }).filter(Boolean);
const document={
 season:2026,version:'CFMI V5.3 preseason + season-only historical/matchups extension',
 generatedAtUtc:new Date().toISOString(),
 historicalMode:'RECONSTRUCTED_AS_OF_CUTOFF',
 warning:'Week 0 Power uses preseason roster talent, 2025 strength, returning production and portal metrics. Merit is unavailable before actual games. All weeks are reconstructed from current source releases, not immutable preseason/weekly archives. The prior disappears after five completed FBS games.',
 history:weeks,upcoming:{week:nextWeek,games:matchups}
};
const filename=path.join(root,'data','weekly_views_2026.json');
fs.writeFileSync(filename,JSON.stringify(document)+'\n');
console.log('CFMI weekly views built',JSON.stringify({
 weeks:weeks.map(w=>({week:w.week,asOf:w.asOfDate,games:w.gameCount,teams:w.teams.length})),
 upcomingWeek:nextWeek,upcomingFbsGames:matchups.length,
 outputBytes:fs.statSync(filename).size
}));
