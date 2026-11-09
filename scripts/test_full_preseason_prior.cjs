#!/usr/bin/env node
'use strict';
/* Complete FBS game-ahead 2025/26 test for a roster / continuity preseason
 * prior that decays to <=5% as current season evidence accumulates.
 * Research only: does NOT modify production model parameters or Power scores.
 */
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const SITE=path.join(__dirname,'../site'),DATA=path.join(SITE,'data');
const html=fs.readFileSync(path.join(SITE,'index.html'),'utf8');
const inline=(html.match(/<script>([\s\S]*?)<\/script>/i)||[])[1];
if(!inline)throw Error('Dashboard model prelude missing');
const prelude=inline.slice(0,inline.indexOf('const submetric='));
const lib=['model_v4.js','opponent_network_research.js','model_v5.js'].map(f=>fs.readFileSync(path.join(SITE,f),'utf8')).join('\n');
const parse=new Function('text',prelude+'return csvParse(text)');
const runV4=new Function('rows','year',lib+'\n'+prelude+
 '\nstate.raw=rows;return computeV4(rows,Infinity,year).teams');
const runV52=new Function('rows','adv','year','cutoff','params',lib+'\n'+prelude+
 '\nMODEL_V5.setParameters(params);state.raw=rows;const r=computeV5(rows,cutoff,year);'+
 'attachEfficiencyV5(r.teams,adv);return r.teams;');
const model=JSON.parse(fs.readFileSync(path.join(DATA,'model_v5_params.json'),'utf8'));
const source=JSON.parse(fs.readFileSync(path.join(DATA,'preseason_full_sources_2024_2026.json'),'utf8'));
const clip=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const sig=x=>1/(1+Math.exp(-clip(x,-30,30)));
const mean=arr=>arr.reduce((sum,v)=>sum+v,0)/Math.max(arr.length,1);
function getRows(y){
 const folder=y===2026?DATA:path.join(DATA,'history',String(y));
 return {raw:parse(fs.readFileSync(path.join(folder,'cfb_schedules_'+y+'.csv'),'utf8')),
  adv:parse(fs.readFileSync(path.join(folder,'cfmi_advanced_'+y+'.csv'),'utf8'))};
}
const years={2024:getRows(2024),2025:getRows(2025),2026:getRows(2026)};
function getIdMap(rows,year){
 const teamIds=new Map(),namesById=new Map();
 for(const g of rows){
  if(+g.season!==year)continue;
  for(const side of ['home','away']){
   if(g[side+'_division']!=='fbs')continue;
   const tid=String(g[side+'_id']||'');
   teamIds.set(g[side+'_team'],tid);namesById.set(tid,g[side+'_team']);
  }
 }
 return {teamIds,namesById};
}
const idMaps={};
for(const year of [2024,2025,2026])idMaps[year]=getIdMap(years[year].raw,year);
const previousPower={};
for(const year of [2025,2026]){
 const prevYear=year-1;
 const scores=runV4(years[prevYear].raw,prevYear);
 const ids=idMaps[prevYear].teamIds;
 previousPower[year]=new Map(scores.filter(t=>ids.has(t.name)).map(t=>[ids.get(t.name),t.power]));
}
function prior(t,previousPoints,mix=.55){
 const tPct=Number.isFinite(t.talentCompositePct)?t.talentCompositePct:.25;
 const blue=Number.isFinite(t.blueChipRatioPct)?t.blueChipRatioPct:.5;
 // Blue-chip and talent composite are collinear: use a small supporting share.
 const blend=.88*tPct+.12*blue;
 const roster=(blend-.5)*26;
 const last=Number.isFinite(previousPoints)?clip(previousPoints,-25,25):0;
 // Losing returning production means last season is a less reliable indicator;
 // this is a reliability modifier, not a direct penalty to roster talent.
 const retained=Number.isFinite(t.returningOverall)?t.returningOverall:.50;
 const continuity=clip(.65+.45*(retained-.50),.4,.95);
 const lastTerm=last*continuity;
 // The roster composite includes rated classes; portal net talent is capped at
 // 1.2 points to prevent counting the same transfers a second time.
 const net=Number.isFinite(t.netTransferTalentPct)?t.netTransferTalentPct:.5;
 const portal=clip((net-.5)*2.4,-1.2,1.2);
 return {points:mix*lastTerm+(1-mix)*roster+portal,
  lastTerm,roster,portal,continuity,talentPct:tPct,
  imputed:!!t.talentIsImputed,returningAvailable:Number.isFinite(t.returningOverall),
  portalAvailable:Number.isFinite(t.netTransferTalent)};
}
function decay(completedFbs,pattern='fast'){
 // Fast vs slower curve and zero-floor alternatives are prespecified;
 // validation chooses one using 2025 only, then checks all 2026 games.
 if(pattern==='zero_after_4')return [1,.55,.35,.20,.08,0][Math.min(5,completedFbs)];
 if(pattern==='slow')return [1,.80,.65,.50,.35,.25,.15,.10,.08,.05][Math.min(9,completedFbs)];
 if(pattern==='very_fast')return [1,.4,.2,.1,.05,.03][Math.min(5,completedFbs)];
 return [1,.55,.35,.20,.08,.05][Math.min(5,completedFbs)];
}
function eligibleGames(year){
 const {raw,adv}=years[year],teamIds=idMaps[year].teamIds;
 const season=raw.filter(g=>+g.season===year&&g.season_type==='regular'&&
   g.completed==='TRUE'&&g.home_division==='fbs'&&g.away_division==='fbs'&&
   g.home_points!==''&&g.away_points!==''&&g.home_points!=='NA'&&g.away_points!=='NA'&&
   Number.isFinite(+g.home_points)&&Number.isFinite(+g.away_points)&&
   +g.home_points!==+g.away_points);
 const out=[], teamRows=source.seasons[String(year)].teams;
 const records=season.slice().sort((a,b)=>Date.parse(a.start_date)-Date.parse(b.start_date));
 for(let week=1;week<=13;week++){
  if(year===2026&&week>10)break;
  const games=records.filter(g=>+g.week===week);
  if(games.length<5)continue;
  const kickoff=Math.min(...games.map(g=>Date.parse(g.start_date)));
  const asof=runV52(raw,adv,year,kickoff-1,model);
  const byName=new Map(asof.map(t=>[t.name,t]));
  for(const g of games){
   const home=byName.get(g.home_team),away=byName.get(g.away_team);
   const homeID=teamIds.get(g.home_team),awayID=teamIds.get(g.away_team);
   if(!home||!away||!homeID||!awayID)continue;
   const sHome=teamRows[homeID],sAway=teamRows[awayID];
   if(!sHome||!sAway)continue;
   const ph=prior(sHome,previousPower[year]?.get(homeID));
   const pa=prior(sAway,previousPower[year]?.get(awayID));
   const neutral=g.neutral_site==='TRUE';
   const venue=neutral?0:model.parameters.homePoints;
   out.push({
    id:String(g.game_id),week,date:g.start_date,home:g.home_team,away:g.away_team,
    homeId:homeID,awayId:awayID,
    actualMargin:+g.home_points-(+g.away_points),
    actualHomeWin:+g.home_points>+g.away_points?1:0,
    originalEdge:home.powerPoints-away.powerPoints+venue,
    homeCurrent:home.powerPoints,awayCurrent:away.powerPoints,
    priorEdge:ph.points-pa.points+venue,
    homePrior:ph,awayPrior:pa,
    homeEvidence:home.fbsGames,awayEvidence:away.fbsGames,
    venue,neutral
   });
  }
 }
 if(out.length<550)throw Error('Too few paired FBS samples '+year+': '+out.length);
 return out;
}
const samples={2025:eligibleGames(2025),2026:eligibleGames(2026)};
function edge(game,kind,intensity){
 if(kind==='none'||intensity===0)return game.originalEdge;
 let wh=decay(game.homeEvidence,kind)*intensity,wa=decay(game.awayEvidence,kind)*intensity;
 wh=clip(wh,0,1);wa=clip(wa,0,1);
 return (1-wh)*game.homeCurrent+wh*game.homePrior.points
   -((1-wa)*game.awayCurrent+wa*game.awayPrior.points)+game.venue;
}
function metrics(rows,kind,intensity,weekGroup='all'){
 const subset=rows.filter(g=>weekGroup==='all'||
   (weekGroup==='early'?g.week<=4:g.week>=5));
 if(!subset.length)return null;
 let wins=0,brier=0,ll=0,mae=0;
 for(const g of subset){
  const e=edge(g,kind,intensity),p=clip(sig(e/model.parameters.logisticScale),1e-5,1-1e-5);
  wins+=Number((e>=0)===Boolean(g.actualHomeWin));
  brier+=(p-g.actualHomeWin)**2;
  ll-=g.actualHomeWin*Math.log(p)+(1-g.actualHomeWin)*Math.log(1-p);
  mae+=Math.abs(e-g.actualMargin);
 }
 return {games:subset.length,correct:wins,accuracy:wins/subset.length,
  brier:brier/subset.length,logLoss:ll/subset.length,marginMAE:mae/subset.length};
}
const choices=[];
for(const curve of ['fast','zero_after_4','very_fast','slow'])
 for(const intensity of [.3,.5,.7,1])
  choices.push({curve,intensity});
const training=choices.map(c=>({...c,
 year2025:{all:metrics(samples[2025],c.curve,c.intensity),
  early:metrics(samples[2025],c.curve,c.intensity,'early'),
  later:metrics(samples[2025],c.curve,c.intensity,'later')}}));
training.sort((a,b)=>a.year2025.all.logLoss-b.year2025.all.logLoss);
const winning=training[0],candidate=choices.find(c=>c.curve==='fast'&&c.intensity===.7);
const tested=[{curve:'none',intensity:0},winning,candidate].filter((c,i,a)=>
 a.findIndex(x=>x.curve===c.curve&&x.intensity===c.intensity)===i);
const results=tested.map(c=>({...c,year2025:metrics(samples[2025],c.curve,c.intensity),
 year2026:metrics(samples[2026],c.curve,c.intensity),
 early2025:metrics(samples[2025],c.curve,c.intensity,'early'),
 early2026:metrics(samples[2026],c.curve,c.intensity,'early'),
 later2026:metrics(samples[2026],c.curve,c.intensity,'later')}));
const coverage={};
for(const year of [2025,2026]){
 const ids=idMaps[year].teamIds;
 const rows=source.seasons[String(year)].teams;
 coverage[year]={teams:idMaps[year].namesById.size,
  talent:source.seasons[String(year)].coverage.talent,
  returning:source.seasons[String(year)].coverage.returning,
  portal:source.seasons[String(year)].coverage.portal,
  samples:samples[year].length,
  imputedTeams:source.seasons[String(year)].imputation.count};
}
const aud={
 version:'preseason-all-fbs-v0.2',deployed:false,trainingYear:2025,evaluationYear:2026,
 24MonthReproducibilityCaveat:'Historical files are not independently verified frozen preseason snapshots; 2026 research hypothesis was prompted by observed 2026 standings.',
 chosenOn2025:winning,trainingAlternatives:training,
 reference:'Current production V5.2 Power; no feature uses Power Four membership.',
 priorFeatures:'previous-season SRS/Elo power, same-year team talent composite, small blue-chip support, offense+defense returning production, small net-transfer residual; coach/coordinator fields unavailable -> omitted, never invented.',
 rosterMissingImputation:'25th percentile of available all-FBS same-year talent; uncertainty flagged; never pretend missing team has observed P4 talent',
 coverage,results,
 sampleCounts:{2025:samples[2025].length,2026:samples[2026].length},
 2026NotUsedForSelection:true,
 sampleGamePredictions:samples[2026].filter(g=>g.week<=2).slice(0,18).map(g=>({
  home:g.home,away:g.away,week:g.week,baselineMargin:g.originalEdge,
  withPriorMargin:edge(g,winning.curve,winning.intensity),
  homePrior:g.homePrior.points,awayPrior:g.awayPrior.points
 }))
};
fs.writeFileSync(path.join(DATA,'research_full_preseason_backtest.json'),JSON.stringify(aud,null,2)+'\n');
console.log('CFMI FULL FBS PRESEASON PRIOR BACKTEST',JSON.stringify({
 coverage,selected:winning,results,baselineCoverage:source.seasons['2026'].coverage
 }));
