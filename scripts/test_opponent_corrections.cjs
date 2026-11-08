#!/usr/bin/env node
'use strict';
/*
 * Audit residual opponent-quality bias in CFMI Power. Competing hypotheses:
 * 1. Baseline already corrects fully for opponent quality (coefficients zero).
 * 2. Weakly supported strength is overestimated even after recursive SRS.
 * 3. Close FBS-vs-FCS results are informative negative signals despite the
 *    deliberate exclusion of blowout bonuses.
 * All non-baseline coefficients fitted with 2024 weeks 5-13 only, evaluated
 * out of time on 2025 weeks 5-13 and 2026 completed weeks 5-10.
 */
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const ROOT=path.join(__dirname,'../site'),dir=path.join(ROOT,'data');
const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const inline=html.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
if(!inline)throw Error('Missing inline model prelude');
const prelude=inline.slice(0,inline.indexOf('const submetric='));
const library=['model_v4.js','model_v5.js'].map(f=>fs.readFileSync(path.join(ROOT,f),'utf8')).join('\n');
const csvParse=new Function('csv',prelude+'return csvParse(csv)');
const solve=new Function('schedule','advanced','cutoff','season','params',
 library+'\n'+prelude+'\n'+[
  "MODEL_V5.setParameters(params);",
  "const raw=csvParse(schedule),adv=csvParse(advanced);",
  "state.raw=raw;",
  "const result=computeV5(raw,cutoff,season);attachEfficiencyV5(result.teams,adv);",
  "return result.teams;"
 ].join('\n'));
const params=JSON.parse(fs.readFileSync(path.join(dir,'model_v5_params.json'),'utf8'));
const sigmoid=x=>1/(1+Math.exp(-Math.max(-30,Math.min(30,x))));
const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
const clamp=(v,l,h)=>Math.max(l,Math.min(h,v));
const observations={};
const summary={};
const threshold=14; // Conservative prior rule: only unexpectedly close FCS results penalized.
function penaltySignals(t){
 const fcs=t.played.filter(g=>!g.opFbs);
 // Margin deficit after a conservative double-digit FCS victory expectation.
 // No points added for dominating FCS opposition by any margin.
 const fcsShortfall=fcs.reduce((a,g)=>a+Math.min(30,Math.max(0,threshold-g.margin)),0)/(fcs.length+1.5);
 const schedule=Number.isFinite(t.sos)?t.sos:0;
 const unsupportedHigh=Math.max(0,t.powerPoints)*Math.min(1.6,Math.max(0,-schedule)/8);
 return {schedule,unsupportedHigh,fcsShortfall};
}
function getSeason(season){
 const folder=season===2026?dir:path.join(dir,'history',String(season));
 const schedule=fs.readFileSync(path.join(folder,'cfb_schedules_'+season+'.csv'),'utf8');
 const advanced=fs.readFileSync(path.join(folder,'cfmi_advanced_'+season+'.csv'),'utf8');
 const rows=csvParse(schedule);
 const played=rows.filter(g=>g.season===String(season)&&g.season_type==='regular'&&
   g.completed==='TRUE'&&g.home_division==='fbs'&&g.away_division==='fbs'&&
   Number.isFinite(Number(g.home_points))&&Number.isFinite(Number(g.away_points))&&
   g.home_points!==''&&g.away_points!==''&&g.home_points!=='NA'&&g.away_points!=='NA');
 const out=[];
 for(let week=5;week<=13;week++){
  const target=played.filter(g=>Number(g.week)===week);
  if(target.length<5)continue;
  const first=Math.min(...target.map(g=>Date.parse(g.start_date)));
  const previous=played.filter(g=>Date.parse(g.start_date)<first&&Number(g.week)<week);
  if(previous.length<120)continue;
  const teams=solve(schedule,advanced,first-1,season,params);
  const byName=new Map(teams.map(t=>[t.name,t]));
  for(const g of target){
   const home=byName.get(g.home_team),away=byName.get(g.away_team);
   if(!home||!away)continue;
   const nh=penaltySignals(home),na=penaltySignals(away);
   const baseEdge=home.powerPoints-away.powerPoints+
       (g.neutral_site==='TRUE'?0:params.parameters.homePoints);
   out.push({
     season,week,home:g.home_team,away:g.away_team,neutral:g.neutral_site==='TRUE',
     observedMargin:Number(g.home_points)-Number(g.away_points),
     won:Number(g.home_points)>Number(g.away_points)?1:0,
     baseEdge,basePower:home.powerPoints-away.powerPoints,
     homeSOS:nh.schedule,awaySOS:na.schedule,
     x:[
       (nh.schedule-na.schedule)/4,
       -(nh.unsupportedHigh-na.unsupportedHigh)/5,
       -(nh.fcsShortfall-na.fcsShortfall)/6
     ],
     homeFcsShortfall:nh.fcsShortfall,awayFcsShortfall:na.fcsShortfall
   });
  }
 }
 return {out,schedule,advanced};
}
const s24=getSeason(2024),s25=getSeason(2025),s26=getSeason(2026);
observations[2024]=s24.out;observations[2025]=s25.out;observations[2026]=s26.out;
assert(s24.out.length>350&&s25.out.length>350&&s26.out.length>180);
function fit(candidates,lambda){
 const coefficients=[0,0,0],m=3;
 for(let iter=0;iter<700;iter++){
  let change=0;
  for(let k=0;k<m;k++){
    let numer=0,denom=lambda[k];
    for(const g of candidates){
      const prediction=g.baseEdge+coefficients.reduce((total,b,j)=>total+b*g.x[j],0);
      const residual=g.observedMargin-prediction+coefficients[k]*g.x[k];
      numer+=g.x[k]*residual;
      denom+=g.x[k]*g.x[k];
    }
    const next=clamp(numer/denom,0,8);
    change=Math.max(change,Math.abs(next-coefficients[k]));
    coefficients[k]=next;
  }
  if(change<1e-9)break;
 }
 return coefficients;
}
const parameters=fit(s24.out,[110,160,130]);
function predicted(g,p){return g.baseEdge+g.x.reduce((s,x,i)=>s+x*p[i],0)}
function evaluate(samples,p,scale=params.parameters.logisticScale){
 if(!samples.length)return null;
 let correct=0,mae=0,sq=0,brier=0,ll=0;
 for(const g of samples){
  const margin=predicted(g,p),pwin=clamp(sigmoid(margin/scale),1e-5,1-1e-5);
  correct+=Number((margin>=0)===Boolean(g.won));
  mae+=Math.abs(margin-g.observedMargin);
  sq+=(margin-g.observedMargin)**2;
  brier+=(pwin-g.won)**2;
  ll-=g.won*Math.log(pwin)+(1-g.won)*Math.log(1-pwin);
 }
 return {games:samples.length,accuracy:correct/samples.length,marginMAE:mae/samples.length,
  marginRMSE:Math.sqrt(sq/samples.length),brier:brier/samples.length,logLoss:ll/samples.length};
}
for(const year of [2024,2025,2026]){
 const ss=observations[year];summary[year]={
  current:evaluate(ss,[0,0,0]),proposed:evaluate(ss,parameters),
  hardGames: {
   highSOSDifference: ss.filter(g=>Math.abs(g.homeSOS-g.awaySOS)>5).length,
   fcsUnderperformance: ss.filter(g=>g.homeFcsShortfall>0||g.awayFcsShortfall>0).length
  },
  weekly: [...new Set(ss.map(x=>x.week))].sort((a,b)=>a-b).map(week=>{
   const games=ss.filter(g=>g.week===week);
   return {week,old:evaluate(games,[0,0,0]),new:evaluate(games,parameters)};
  })
 };
}
const teamNow=solve(s26.schedule,s26.advanced,Date.now(),2026,params);
const roster=teamNow.map(t=>{
 const signals=penaltySignals(t);
 const correction=parameters[0]*signals.schedule/4-
       parameters[1]*signals.unsupportedHigh/5-
       parameters[2]*signals.fcsShortfall/6;
 return {name:t.name,conference:t.conference,oldRank:t.powerRank,oldPoints:t.powerPoints,
  newPoints:t.powerPoints+correction,schedule:t.sos,sosRank:t.sosRank,
  opponentFBS:t.fbsGames,fcsMiss:signals.fcsShortfall,unsupportedHigh:signals.unsupportedHigh,
  correction,componentSOS:parameters[0]*signals.schedule/4,
  componentWeakSchedule:-(parameters[1]*signals.unsupportedHigh/5),
  componentFcs:-(parameters[2]*signals.fcsShortfall/6)};
});
roster.sort((a,b)=>b.newPoints-a.newPoints||a.name.localeCompare(b.name));
roster.forEach((t,i)=>t.newRank=i+1);
const notable=['Liberty','New Mexico','Alabama','Georgia','Utah','Ohio State','Ole Miss','Boise State','Oregon'];
const details=notable.map(name=>roster.find(t=>t.name===name)).filter(Boolean);
const improvement=summary[2025].current.logLoss-summary[2025].proposed.logLoss;
const maeImprovement=summary[2025].current.marginMAE-summary[2025].proposed.marginMAE;
// Do not improve the in-sample fit at the expense of the 2025 holdout.
// Multiple correlated effects mean incremental gain must be substantive.
const selected=improvement>0.001&&maeImprovement>0.10;
const result={
 version:'opponent_evidence_research_0.1',
 generatedAtUtc:new Date().toISOString(),appliedToPublic:false,
 baselineVersion:params.version,trainingSeason:2024,validationSeason:2025,
 validationNotPristine:'2025 was used in prior model selection; treat this as exploratory, not an untouched final test.',
 factorDefinitions:['opponent SRS schedule strength','uncertainty in high strength vs weak schedule','narrow FBS-versus-FCS underperformance'],
 coefficientConstraint:'Nonnegative 0–8, ridge penalties 110/160/130, fit to residual future point margin in 2024.',
 coeffs:parameters,selected,reason:selected?'Passed predeclared 2025 logloss and margin MAE gate':'Hold current Power: opponent reliability candidate did not pass 2025 gate.',
 scores:summary,
 teams:roster,notable:details
};
fs.writeFileSync(path.join(dir,'opponent_strength_research_2026.json'),JSON.stringify(result,null,2)+'\n');
console.log('POWER OPPONENT ADJUSTMENT STUDY',JSON.stringify({
 coefficients:parameters,selected,reason:result.reason,
 train:summary[2024],validation:summary[2025],current2026:summary[2026],
 notable:details,top15:roster.slice(0,15).map(t=>({name:t.name,oldRank:t.oldRank,newRank:t.newRank,correction:t.correction,sos:t.schedule}))
}));
