#!/usr/bin/env node
'use strict';
/** Reconstruct game-ahead CFMI V5.3 matchup predictions for 2025 and 2026.
 * Each game's teams are evaluated strictly before the first kickoff of that
 * scheduled week; no outcomes from its week enter Power. Both seasons use the
 * latest 2024-trained / 2025-selected V5.2 parameters, so the 2025 "backtest"
 * is a reused model-selection sample, NOT an untouched predictive holdout.
 * Historical roster and stats datasets are retrospective source releases,
 * not cryptographically sealed original game-week publications.
 */
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const SITE=path.join(__dirname,'../site'),DATA=path.join(SITE,'data');
const html=fs.readFileSync(path.join(SITE,'index.html'),'utf8');
const inline=html.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
if(!inline)throw Error('Dashboard calculation prelude unavailable');
const prelude=inline.slice(0,inline.indexOf('const submetric='));
const library=['model_v4.js','opponent_network_research.js','model_v5.js','preseason_prior_v1.js','model_matchup_v1.js']
  .map(f=>fs.readFileSync(path.join(SITE,f),'utf8')).join('\n');
const csvParse=new Function('raw',prelude+'return csvParse(raw)');
const score=new Function('rows','advanced','season','cutoff','parameters','prior','matchupParameters',
 library+'\n'+prelude+'\n'+[
  "state.raw=rows;",
  "if(!MODEL_V5.setParameters(parameters))throw Error('invalid current model');",
  "if(!MODEL_PRESEASON_V53.load(prior))throw Error('invalid preseason prior '+season);",
  "const r=computeV5(rows,cutoff,season);",
  "attachEfficiencyV5(r.teams,advanced);",
  "if(matchupParameters)CFMI_MATCHUP.setParameters(matchupParameters);",
  "const profiles=CFMI_MATCHUP.profiles(r.teams,advanced);",
  "return {teams:r.teams,predict:(home,away,neutral)=>CFMI_MATCHUP.predict(home,away,neutral,profiles,parameters.parameters)};"
 ].join('\n'));
const previousYear=new Function('rows','season',library+'\n'+prelude+
 'state.raw=rows;return computeV4(rows,Infinity,season).teams;');
const parameters=JSON.parse(fs.readFileSync(path.join(DATA,'model_v5_params.json'),'utf8'));
const preseasonData=JSON.parse(fs.readFileSync(path.join(DATA,'preseason_full_sources_2024_2026.json'),'utf8'));
const prior2026=JSON.parse(fs.readFileSync(path.join(DATA,'preseason_prior_2026.json'),'utf8'));
const matchupFile=path.join(DATA,'model_matchup_params.json');
const matchupParameters=process.env.CFMI_MATCHUP_DISABLED==='1'||!fs.existsSync(matchupFile)?null:JSON.parse(fs.readFileSync(matchupFile,'utf8'));
const clamp=(x,l,h)=>Math.max(l,Math.min(h,x));
const sigmoid=x=>1/(1+Math.exp(-clamp(x,-30,30)));
const N=Number.isFinite(parameters.parameters.logisticScale)?parameters.parameters.logisticScale:8.75;
const homeAdvantage=parameters.parameters.homePoints;
function source(year){
 const folder=year===2026?DATA:path.join(DATA,'history',String(year));
 const rows=csvParse(fs.readFileSync(path.join(folder,'cfb_schedules_'+year+'.csv'),'utf8'));
 const advanced=csvParse(fs.readFileSync(path.join(folder,'cfmi_advanced_'+year+'.csv'),'utf8'));
 return {rows,advanced};
}
const s24=source(2024),s25=source(2025),s26=source(2026);
function idsFor(rows,season){
 const names=new Map(),ids=new Map();
 for(const game of rows){
  if(Number(game.season)!==season)continue;
  for(const side of ['home','away']){
   if(game[side+'_division']!=='fbs')continue;
   const id=String(game[side+'_id']||'');
   if(!id)continue;
   ids.set(game[side+'_team'],id);names.set(id,game[side+'_team']);
  }
 }
 return {ids,names};
}
const mapped={2024:idsFor(s24.rows,2024),2025:idsFor(s25.rows,2025),2026:idsFor(s26.rows,2026)};
function prior2025(){
 const prev=previousYear(s24.rows,2024);
 const prevPoints=new Map(prev.filter(t=>mapped[2024].ids.has(t.name))
  .map(t=>[mapped[2024].ids.get(t.name),t.power]));
 const teamData=preseasonData.seasons['2025'].teams;
 const ratings={};
 for(const [name,id] of mapped[2025].ids){
  const t=teamData[id];if(!t)throw Error('Missing 2025 talent source '+name);
  const tp=Number.isFinite(t.talentCompositePct)?t.talentCompositePct:.25;
  const blue=Number.isFinite(t.blueChipRatioPct)?t.blueChipRatioPct:.5;
  const talentIndex=100*(.88*tp+.12*blue);
  const roster=(talentIndex/100-.5)*26;
  const last=prevPoints.get(id);
  const past=Number.isFinite(last)?clamp(last,-25,25):0;
  const returning=Number.isFinite(t.returningOverall)?t.returningOverall:.50;
  const continuity=clamp(.65+.45*(returning-.50),.4,.95);
  const net=Number.isFinite(t.netTransferTalentPct)?t.netTransferTalentPct:.5;
  const portal=clamp((net-.5)*2.4,-1.2,1.2);
  ratings[name]={priorPoints:.55*(past*continuity)+.45*roster+portal,
   talentIndex,sourceCoverage:t.preseasonSourceCoverage||{},imputedTalent:!!t.talentIsImputed,
   components:{lastYearPowerRaw:Number.isFinite(last)?last:null,returningOverall:t.returningOverall,
    transferNetPercentile:net,portal,continuity}};
 }
 const mean=Object.values(ratings).reduce((z,t)=>z+t.priorPoints,0)/Object.keys(ratings).length;
 for(const t of Object.values(ratings))t.priorPoints-=mean;
 assert(Object.keys(ratings).length>=130);
 return {version:'5.3-research-v1',season:2025,teams:ratings,
  decayByCompletedFbsGames:[1,.55,.35,.20,.08,0]};
}
const priors={2025:prior2025(),2026:prior2026};
const actual=(g)=>g.completed==='TRUE'&&g.home_points!==''&&g.away_points!==''&&
 g.home_points!=='NA'&&g.away_points!=='NA'&&Number.isFinite(+g.home_points)&&
 Number.isFinite(+g.away_points)&&+g.home_points!==+g.away_points;
const gameRecord=(g,home,away,priorWeekCutoff,matchup)=>{
 const neutral=g.neutral_site==='TRUE';
 const homeEdge=matchup.marginHome;
 const baselineEdge=(home.powerPoints-away.powerPoints)+(neutral?0:homeAdvantage);
 const p=matchup.homeWinProbability,finished=actual(g);
 const homeScore=finished?Number(g.home_points):null;
 const awayScore=finished?Number(g.away_points):null;
 const predictedWinner=homeEdge>=0?home.name:away.name;
 const actualWinner=finished?(homeScore>awayScore?home.name:away.name):null;
 return {
  gameId:String(g.game_id),season:Number(g.season),week:Number(g.week),
  kickoffUtc:g.start_date,asOfUtc:new Date(priorWeekCutoff).toISOString(),
  home:home.name,away:away.name,neutral,venue:g.venue||null,
  homePowerIndex:home.powerScore,awayPowerIndex:away.powerScore,
  homePowerRank:home.powerRank,awayPowerRank:away.powerRank,
  homeMeritRank:home.meritPublishedRank??null,
  awayMeritRank:away.meritPublishedRank??null,
  homeMerit:Number(g.week)===1?null:home.score,
  awayMerit:Number(g.week)===1?null:away.score,
  homeRecord:home.won+'–'+home.lost,awayRecord:away.won+'–'+away.lost,
  homeExpectedPoints:home.powerPoints,awayExpectedPoints:away.powerPoints,
  homeSOS:home.sos,awaySOS:away.sos,
  homeEPA:home.ppaNet,awayEPA:away.ppaNet,
  homeSuccess:home.successNet,awaySuccess:away.successNet,
  homeExplosive:home.explosiveNet,awayExplosive:away.explosiveNet,
  homeMargin:home.mov,awayMargin:away.mov,
  homeFbsGames:home.fbsGames,awayFbsGames:away.fbsGames,
  homePriorWeight:home.preseasonPriorWeight??0,
  awayPriorWeight:away.preseasonPriorWeight??0,
  homeWinProbability:p,awayWinProbability:1-p,
  homeMatchupScore:matchup.homeMatchupScore,awayMatchupScore:matchup.awayMatchupScore,
  neutralPowerDifference:matchup.basePoints,venueAdjustment:matchup.homePoints,
  matchupAdjustment:matchup.matchupAdjustment,
  matchupComponents:matchup.components,matchupStyles:matchup.opponentStyles,
  matchupEvidence:matchup.evidence,
  baselinePowerMargin:baselineEdge,baselinePowerPick:baselineEdge>=0?home.name:away.name,
  predictedMargin:homeEdge,predictedWinner,finished,
  homeScore,awayScore,actualMargin:finished?homeScore-awayScore:null,
  actualWinner,correct:finished?actualWinner===predictedWinner:null
 };
};
function aggregate(games){
 const finalized=games.filter(g=>g.finished),n=finalized.length;
 const wins=finalized.filter(g=>g.correct).length;
 const brier=n?finalized.reduce((z,g)=>z+(g.homeWinProbability-Number(g.actualWinner===g.home))**2,0)/n:null;
 const logLoss=n?finalized.reduce((z,g)=>{
  const p=clamp(g.homeWinProbability,1e-6,1-1e-6),y=Number(g.actualWinner===g.home);
  return z-y*Math.log(p)-(1-y)*Math.log(1-p);
 },0)/n:null;
 const mae=n?finalized.reduce((z,g)=>z+Math.abs(g.predictedMargin-g.actualMargin),0)/n:null;
 return {played:n,correct:wins,incorrect:n-wins,accuracy:n?wins/n:null,
  unplayed:games.length-n,scheduled:games.length,brier,logLoss,marginMAE:mae};
}
const output={version:'CFMI V5.5 Merit-Power calibrated matchup ledger v1',
 matchupModel:matchupParameters?.deployCandidate?'historically_selected_matchup_interactions':'power_plus_venue_only',
 generatedAtUtc:new Date().toISOString(),
 trainingSeasons:[2024],selectionSeasons:[2025],
 methodology:'CFMI V5.2 opponent-adjusted Power + 2025-selected V5.3 rapidly fading preseason prior; input game cutoffs at least one millisecond before the earliest scheduled kickoff in each week.',
 leakageNotice:'All weekly model inputs exclude that week’s games. However 2025 was used in selecting V5.2 and the V5.3 decay, and historical sources may have later corrections; these are NOT immutable originally-published forecasts.',
 seasons:{}};
for(const [year,src] of [[2025,s25],[2026,s26]]){
 const prior=priors[year],fixture=src.rows.filter(g=>+g.season===year&&g.season_type==='regular'&&
  g.home_division==='fbs'&&g.away_division==='fbs'&&Number.isFinite(Date.parse(g.start_date)));
 const maxWeek=Math.max(...fixture.filter(actual).map(g=>Number(g.week)));
 const weeks=[];
 for(let week=1;week<=Math.min(16,maxWeek+1);week++){
  const matched=fixture.filter(g=>Number(g.week)===week);
  if(!matched.length)continue;
  if(year===2026&&week>maxWeek+1)continue;
  const firstKick=Math.min(...matched.map(g=>Date.parse(g.start_date)));
  const cutoff=firstKick-1;
  const scoring=score(src.rows,src.advanced,year,cutoff,parameters,prior,matchupParameters);
  const lookup=new Map(scoring.teams.map(t=>[t.name,t]));
  const games=[];
  for(const g of matched){
   const h=lookup.get(g.home_team),a=lookup.get(g.away_team);
   if(!h||!a)continue;
   games.push(gameRecord(g,h,a,cutoff,scoring.predict(h,a,g.neutral_site==='TRUE')));
  }
  if(games.length===0)continue;
  games.sort((a,b)=>Date.parse(a.kickoffUtc)-Date.parse(b.kickoffUtc));
  const summary=aggregate(games);
  weeks.push({week,firstKickoffUtc:new Date(firstKick).toISOString(),asOfUtc:new Date(cutoff).toISOString(),games,summary});
 }
 assert(weeks.length>=9,'Missing weekly prediction coverage '+year);
 const all=weeks.flatMap(w=>w.games),played=all.filter(g=>g.finished);
 const overall=aggregate(all);
 const ytd=[],running=[];
 for(const w of weeks){
  running.push(...w.games);ytd.push({week:w.week,...aggregate(running)});
 }
 output.seasons[String(year)]={season:year,currentWeek:weeks.find(w=>w.summary.unplayed>0)?.week??(maxWeek+1),
  latestCompletedWeek:maxWeek,playedThrough:new Date().toISOString(),weeks,overall,ytd};
 console.log('CFMI PRE-WEEK LEDGER',JSON.stringify({
  season:year,weeks:weeks.map(x=>({week:x.week,played:x.summary.played,correct:x.summary.correct,pending:x.summary.unplayed})),
  overall,rounding:'100*accuracy to 1 decimal',
  exampleWrong:played.filter(g=>!g.correct).slice(0,2).map(g=>({home:g.home,away:g.away,week:g.week,pick:g.predictedWinner,winner:g.actualWinner}))
 }));
}
fs.writeFileSync(path.join(DATA,'prediction_ledger_2025_2026.json'),JSON.stringify(output)+'\n');
const curr=output.seasons['2026'];
assert(curr.weeks.some(w=>w.week===1&&w.summary.played>0));
assert(curr.weeks.every(w=>w.games.every(g=>Date.parse(g.asOfUtc)<Date.parse(g.kickoffUtc))));
assert(curr.weeks.every(w=>w.games.every(g=>g.finished?g.correct=== (g.predictedWinner===g.actualWinner):g.actualWinner===null)));
console.log('CFMI MATCHUP LEDGER AUDIT PASSED',JSON.stringify({
  year2025:output.seasons['2025'].overall,
  year2026:output.seasons['2026'].overall,
  latestWeek:curr.currentWeek
 }));
