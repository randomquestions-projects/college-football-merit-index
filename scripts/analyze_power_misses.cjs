#!/usr/bin/env node
'use strict';
/** Diagnostics and frozen 2025-fit home-advantage counterfactuals.
 * Differences measured on exactly same game weeks and matched opponents.
 * No production scoring parameter is modified based on this exploration.
 */
const fs=require('fs'),path=require('path');
const DATA=path.join(__dirname,'../site/data');
const ledger=JSON.parse(fs.readFileSync(path.join(DATA,'prediction_ledger_2025_2026.json'),'utf8'));
const comp=JSON.parse(fs.readFileSync(path.join(DATA,'power_benchmark_2025_2026.json'),'utf8'));
const params=JSON.parse(fs.readFileSync(path.join(DATA,'model_v5_params.json'),'utf8'));
const home=params.parameters.homePoints,scale=params.parameters.logisticScale;
const clamp=(x,l,h)=>Math.max(l,Math.min(h,x));
const sigmoid=x=>1/(1+Math.exp(-clamp(x,-30,30)));
const all=y=>ledger.seasons[String(y)].weeks.flatMap(w=>w.games).filter(g=>g.finished);
const samples={2025:all(2025),2026:all(2026)};
function metric(rows,homeAdjustment){
 let wins=0,logLoss=0,brier=0,mae=0,homeFavorites=0,homeCorrect=0;
 for(const g of rows){
  const pred=g.predictedMargin+(g.neutral?0:homeAdjustment-home);
  const p=clamp(sigmoid(pred/scale),1e-5,1-1e-5);
  const y=g.actualWinner===g.home?1:0;
  wins+=Number((pred>=0)===Boolean(y));
  logLoss-=y*Math.log(p)+(1-y)*Math.log(1-p);
  brier+=(p-y)**2;
  mae+=Math.abs(pred-g.actualMargin);
  if(!g.neutral){homeFavorites++;homeCorrect+=Number((pred>=0)===Boolean(y))}
 }
 return {games:rows.length,correct:wins,accuracy:wins/rows.length,
  logLoss:logLoss/rows.length,brier:brier/rows.length,
  marginMAE:mae/rows.length};
}
const candidates=[0,1,1.5,2,2.5,3,3.5,4,4.5,5];
const evaluated=candidates.map(x=>({homePoints:x,year2025:metric(samples[2025],x),
 year2026:metric(samples[2026],x)})).sort((a,b)=>a.year2025.logLoss-b.year2025.logLoss);
const best=evaluated[0];
const perWeek=[];
for(const year of [2025,2026]){
 const groups=ledger.seasons[String(year)].weeks.filter(w=>w.summary.played);
 for(const w of groups){
  const rows=w.games.filter(g=>g.finished);
  const current=metric(rows,home);
  const optimized=metric(rows,best.homePoints);
  perWeek.push({season:year,week:w.week,played:rows.length,baseline:current,fit2025:optimized,
   highConfidenceWrong:rows.filter(g=>!g.correct&&Math.max(g.homeWinProbability,g.awayWinProbability)>=.75).length,
   closePredictions:rows.filter(g=>Math.abs(g.predictedMargin)<=3).length});
 }
}
const segments={};
for(const year of [2025,2026]){
 const groups={
  early:samples[year].filter(g=>g.week<=4),
  middle:samples[year].filter(g=>g.week>=5&&g.week<=8),
  late:samples[year].filter(g=>g.week>=9),
  home:samples[year].filter(g=>!g.neutral&&g.predictedMargin>=0),
  away:samples[year].filter(g=>!g.neutral&&g.predictedMargin<0),
  close:samples[year].filter(g=>Math.abs(g.predictedMargin)<=3),
  highlyConfident:samples[year].filter(g=>Math.max(g.homeWinProbability,g.awayWinProbability)>=.75),
  largestScheduleDifferences:samples[year].filter(g=>
    Number.isFinite(g.homeSOS)&&Number.isFinite(g.awaySOS)&&Math.abs(g.homeSOS-g.awaySOS)>5)
 };
 segments[year]={};
 for(const [key,games] of Object.entries(groups)){
  const win=games.filter(g=>g.correct).length;
  segments[year][key]={games:games.length,correct:win,accuracy:games.length?win/games.length:null,
   errors:games.length-win};
 }
}
const confusions={};
for(const year of [2025,2026]){
 confusions[year]={};
 const games=comp.seasons[String(year)].gameComparisons;
 for(const sys of ['fpi','sp_plus','fei']){
  const matched=games.filter(g=>sys in g.industry);
  const onlyOther=matched.filter(g=>!g.cfmiCorrect&&g.industry[sys].correct);
  const onlyCfmi=matched.filter(g=>g.cfmiCorrect&&!g.industry[sys].correct);
  confusions[year][sys]={
   comparable:matched.length,
   cfmiRightOtherWrong:onlyCfmi.length,
   cfmiWrongOtherRight:onlyOther.length,
   highConfidenceCfmiWrong:onlyOther.filter(g=>
      Math.max(g.cfmiProbHome,1-g.cfmiProbHome)>=.75).length,
   largestMissedUpsets:onlyOther.slice()
    .sort((a,b)=>Math.abs(b.opponentDifference)-Math.abs(a.opponentDifference))
    .slice(0,12).map(g=>({
     week:g.week,away:g.away,home:g.home,winner:g.winner,
     cfmiPick:g.cfmiPick,industryPick:g.industry[sys].predictedWinner,
     cfmiEdgePoints:g.opponentDifference,sosDifference:g.opponentSOSDifference}))
  };
 }
}
const output={
 version:'2025-2026-power-error-analysis-v1',
 candidateNotDeployed:true,
 description:'Exploratory paired prior-week predictions; 2025 selected earlier CFMI weights and is reused here to tune home edge. Assess 2026 without choosing based on its results.',
 trainedOnForHomeCounterfactual:2025,validationYear:2026,
 baselineHomePoints:home,best2025HomePoints:best.homePoints,
 selected2025Metric:'2025 predicted-game log-loss',
 homeCounterfactual:{
  existing2025:metric(samples[2025],home),best2025:best.year2025,
  existing2026:metric(samples[2026],home),best2026:best.year2026,
  testedValues:evaluated},
 segments,perWeek,disagreements:confusions,
 recommendedResearch:[
  'Test game-specific offense versus opponent-defense efficiency with consistent out-of-time snapshots; distinguish from net team power to avoid double counting.',
  'Revisit home-field advantage by venue/host, opponent travel and neutral-site handling, using earlier seasons to choose coefficients.',
  'Use a hierarchical model for schedule uncertainty and opponent-network connectivity rather than manual Power Four bonuses.',
  'Recalibrate probability confidence and early-season uncertainty in prospective post-2026 games, using Brier and log loss rather than solely winner accuracy.',
  'Evaluate team availability, returning production and coaching change with archived publication timestamps, not retroactive player or coaching knowledge.',
  'Freeze published week-ahead prediction ledgers before games from next week onwards; current historical runs are reconstructed and source corrections may be present.'
 ],
 caveats:[
  'All observed associations are retrospective, not causal explanations of every wrong pick.',
  'The model was selected using 2025, so further 2025 tuning is exploratory and 2026 was known to motivate the study.',
  'No fitted alternative is automatically deployed; improvements must be repeated in a new prospective season.'
 ]};
fs.writeFileSync(path.join(DATA,'power_miss_analysis_2025_2026.json'),JSON.stringify(output,null,2)+'\n');
console.log('CFMI MISS ANALYSIS',JSON.stringify({
 best2025Home:best.homePoints,
 home2025Current:output.homeCounterfactual.existing2025,
 home2025Candidate:output.homeCounterfactual.best2025,
 home2026Current:output.homeCounterfactual.existing2026,
 home2026Candidate:output.homeCounterfactual.best2026,
 segments:output.segments,
 competing2026:{sp_plus:confusions[2026].sp_plus,fpi:confusions[2026].fpi}
 }));

