#!/usr/bin/env node
'use strict';
/**
 * CFMI V5 two-season, strictly forward-only predictive model fit.
 * 2024 weeks 5–13: fit shrunken season-only margin/efficiency coefficients.
 * 2025 weeks 5–13: untouched validation and deployment decision.
 * External ratings, polls, sportsbooks, recruiting and team/conference names are never inputs.
 */
const fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..','site'),DIR=path.join(ROOT,'data');
const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/i);
if(!script)throw Error('CFMI script missing');
const boundary=script[1].indexOf('const submetric=');
if(boundary<10000)throw Error('CFMI engine boundary missing');
const prelude=script[1].slice(0,boundary);
const v4=fs.readFileSync(path.join(ROOT,'model_v4.js'),'utf8');
const evaluate=new Function('rows','adv','season','cutoff',v4+'\n'+prelude+'\n'+
 'state.raw=rows;const result=computeV4(rows,cutoff,season);attachEfficiencyV4(result.teams,adv);'+
 'return {teams:result.teams,coverage:{advanced:state.advCovered,expected:state.advExpected,full:state.fullModel}};'
);
const parse=new Function('csv',prelude+'return csvParse(csv)');
const mean=a=>a.reduce((x,y)=>x+y,0)/Math.max(1,a.length);
const sigmoid=x=>1/(1+Math.exp(-Math.max(-30,Math.min(30,x))));
function rawSnapshots(year){
 const dir=path.join(DIR,'history',String(year));
 const rows=parse(fs.readFileSync(path.join(dir,'cfb_schedules_'+year+'.csv'),'utf8'));
 const advanced=parse(fs.readFileSync(path.join(dir,'cfmi_advanced_'+year+'.csv'),'utf8'));
 const finals=rows.filter(r=>r.season===String(year)&&r.season_type==='regular'&&r.completed==='TRUE'&&
  r.home_division==='fbs'&&r.away_division==='fbs'&&r.home_points!==''&&r.away_points!==''&&
  r.home_points!=='NA'&&r.away_points!=='NA'&&Number.isFinite(+r.home_points)&&
  Number.isFinite(+r.away_points)&&+r.home_points!==+r.away_points);
 const observations=[],coverage=[];
 for(let week=5;week<=13;week++){
  const games=finals.filter(g=>+g.week===week);
  if(games.length<5)continue;
  const firstKick=Math.min(...games.map(g=>Date.parse(g.start_date)));
  const previous=finals.filter(g=>+g.week<week&&Date.parse(g.start_date)<firstKick);
  if(previous.length<120)continue;
  const r=evaluate(rows,advanced,year,firstKick-1);
  coverage.push({week,...r.coverage});
  const lookup=new Map(r.teams.map(t=>[t.name,t]));
  const valid=r.teams.filter(t=>Number.isFinite(t.ppaNet)&&t.advMetricCounts?.ppaNet>0);
  const avg={};
  for(const key of ['ppaNet','successNet','explosiveNet']){
    const eligible=r.teams.filter(t=>Number.isFinite(t[key])&&t.advMetricCounts?.[key]>0);
    avg[key]=mean(eligible.map(t=>t[key]));
  }
  const feature=(t,k,maxAbs)=>{
    if(!r.coverage.full)return 0;
    return Number.isFinite(t[k])?Math.max(-maxAbs,Math.min(maxAbs,(t[k]-avg[k])*(t.advMetricCoverage?.[k]||0))):0;
  };
  for(const g of games){
   const h=lookup.get(g.home_team),a=lookup.get(g.away_team);
   if(!h||!a)continue;
   const neutral=g.neutral_site==='TRUE',venue=neutral?0:2.5;
   const homeMargin=+g.home_points-(+g.away_points);
   const epa=feature(h,'ppaNet',.7)-feature(a,'ppaNet',.7);
   const success=feature(h,'successNet',.22)-feature(a,'successNet',.22);
   const explosive=feature(h,'explosiveNet',.13)-feature(a,'explosiveNet',.13);
   observations.push({
    year,week,homeMargin,neutral,
    outcome:+(+g.home_points>+g.away_points),
    baseline:h.power-a.power,
    // Standardized coefficient units: one feature ~= representative team gap.
    x:[(h.power-a.power),epa/.10,success/.05,explosive/.03],
    raw:[epa,success,explosive],venue,advancedAvailable:r.coverage.full
   });
  }
 }
 if(observations.length<300)throw Error('Too few eligible walk-forward games '+year+': '+observations.length);
 return {observations,coverage};
}
function solveLinear(A,b){
 const n=b.length;const matrix=A.map((row,i)=>[...row,b[i]]);
 for(let k=0;k<n;k++){
   let pivot=k;for(let j=k+1;j<n;j++)if(Math.abs(matrix[j][k])>Math.abs(matrix[pivot][k]))pivot=j;
   [matrix[k],matrix[pivot]]=[matrix[pivot],matrix[k]];
   const d=matrix[k][k];if(Math.abs(d)<1e-9)throw Error('Singular ridge normal matrix');
   for(let q=k;q<=n;q++)matrix[k][q]/=d;
   for(let j=0;j<n;j++)if(j!==k){const w=matrix[j][k];for(let q=k;q<=n;q++)matrix[j][q]-=w*matrix[k][q];}
 }
 return matrix.map(x=>x[n]);
}
function fitRidge(obs){
 // Prior center: preserve model's 1-to-1 points-scale baseline, and require
 // measured gain before coefficients for correlated EPA/success/explosive inputs.
 const lambda=[120,850,850,1100],prior=[1,0,0,0],n=4;
 const A=Array.from({length:n},()=>Array(n).fill(0));
 const b=Array(n).fill(0);
 for(let i=0;i<n;i++){A[i][i]=lambda[i];b[i]=lambda[i]*prior[i];}
 for(const g of obs){
  const target=g.homeMargin-g.venue;
  for(let i=0;i<n;i++){
    b[i]+=g.x[i]*target;
    for(let j=0;j<n;j++)A[i][j]+=g.x[i]*g.x[j];
  }
 }
 const raw=solveLinear(A,b);
 // Bounds protect predictions from instability and correlated feature swings.
 const c=[Math.max(.7,Math.min(1.45,raw[0])),
   Math.max(-5,Math.min(5,raw[1])),
   Math.max(-4,Math.min(4,raw[2])),
   Math.max(-3,Math.min(3,raw[3]))];
 return {baseScale:c[0],epa:c[1]/.10,success:c[2]/.05,explosive:c[3]/.03,
  rawFittedCoefficients:raw,shrinkagePenalties:lambda,usableAdvancedGames:obs.filter(g=>g.advancedAvailable).length};
}
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
function predictedEdge(g,p){
 const corr=clamp(p.epa*g.raw[0]+p.success*g.raw[1]+p.explosive*g.raw[2],-16,16);
 return p.baseScale*g.baseline+corr+g.venue;
}
function trainCalibration(obs,p){
 // One-dimensional, monotonic link fitted on previous-season game outcomes.
 let best={scale:12,loss:Infinity};
 for(let s=6;s<=25;s+=.25){
  const loss=mean(obs.map(g=>{
   const prob=clamp(sigmoid(predictedEdge(g,p)/s),.0001,.9999);
   return -(g.outcome*Math.log(prob)+(1-g.outcome)*Math.log(1-prob));
  }));
  if(loss<best.loss)best={scale:s,loss};
 }
 return best;
}
function stats(obs,p,scale){
 const m={games:obs.length,accuracy:0,brier:0,logLoss:0,marginMAE:0,marginRMSE:0,early:0,late:0,advancedGames:0};
 for(const g of obs){
  const margin=predictedEdge(g,p),win=clamp(sigmoid(margin/scale),.0001,.9999);
  const err=margin-g.homeMargin;
  m.accuracy+=+( (margin>=0)===Boolean(g.outcome));
  m.brier+=(win-g.outcome)**2;
  m.logLoss-=g.outcome*Math.log(win)+(1-g.outcome)*Math.log(1-win);
  m.marginMAE+=Math.abs(err);m.marginRMSE+=err*err;
  if(g.advancedAvailable)m.advancedGames++;
 }
 for(const k of ['accuracy','brier','logLoss','marginMAE'])m[k]/=m.games;
 m.marginRMSE=Math.sqrt(m.marginRMSE/m.games);
 return m;
}
const train=rawSnapshots(2024),test=rawSnapshots(2025);
const baseline={baseScale:1,epa:0,success:0,explosive:0};
const fitted=fitRidge(train.observations);
const calibratedCandidate=trainCalibration(train.observations,fitted);
const calibratedBaseline=trainCalibration(train.observations,baseline);
const candidateTest=stats(test.observations,fitted,calibratedCandidate.scale);
const baselineTest=stats(test.observations,baseline,calibratedBaseline.scale);
const candidateTrain=stats(train.observations,fitted,calibratedCandidate.scale);
const baselineTrain=stats(train.observations,baseline,calibratedBaseline.scale);
const advancedAvailable= train.observations.filter(x=>x.advancedAvailable).length>=150;
const acceptable=advancedAvailable && candidateTest.logLoss<baselineTest.logLoss-.0001 &&
  candidateTest.marginMAE<=baselineTest.marginMAE+.15;
// Select only after a true later-season test; no V5 candidate is assumed better.
const deployed=acceptable?fitted:baseline,scale=acceptable?calibratedCandidate.scale:calibratedBaseline.scale;
const evidence={
 version:'5.0.0',generatedAtUtc:new Date().toISOString(),
 methodology:'Train on 2024 weekly next-game FBS vs FBS margins; validate on previously untouched 2025 weeks 5-13. No 2026 outcomes in training; source advanced games always filtered to previous played game IDs. Fixed ridge priors and bounded corrections.',
 trainSeason:2024,validationSeason:2025,trainingGames:train.observations.length,
 validationGames:test.observations.length,
 advancedTrainingGames:train.observations.filter(x=>x.advancedAvailable).length,
 deployedCandidate:acceptable?'regularized_efficiency':'margin_baseline_only',
 reason:acceptable?'2025 held-out log loss improved and margin MAE did not meaningfully degrade':
  'Conservative baseline: efficiency improvement not established on untouched 2025 season.',
 parameters:{
  baseScale:deployed.baseScale,epa:deployed.epa,success:deployed.success,
  explosive:deployed.explosive,homePoints:2.5,
  logisticScale:scale,source:acceptable?'historical_2024_ridge_2025_validated':'historical_2024_baseline_2025_validated',
  trainedOn:[2024],validatedOn:[2025]
 },
 probabilitiesCalibrated:true,
 validation:{
   candidate2025:candidateTest,baseline2025:baselineTest,
   candidateTrain2024:candidateTrain,baselineTrain2024:baselineTrain,
   candidateProbabilityScale:calibratedCandidate.scale,
   baselineProbabilityScale:calibratedBaseline.scale,
   candidateCoefficients:fitted
 },
 caveats:[
  '2025 determined model selection and is not reusable as a clean final holdout for additional iterative tuning.',
  'Calibrated only with a fitted one-dimensional sigmoid scale; inspect season-by-season reliability diagrams.',
  'Initial-season predictions have higher uncertainty, but no preseason or recruiting prior enters CFMI.',
  'Model excludes injuries, personnel changes, betting market, third-party ratings and FCS-vs-FCS results.'
 ]
};
fs.writeFileSync(path.join(DIR,'model_v5_params.json'),JSON.stringify(evidence,null,2)+'\n');
fs.writeFileSync(path.join(DIR,'backtest_v5.json'),JSON.stringify(evidence,null,2)+'\n');
console.log('CFMI V5 TRAINING + 2025 HOLDOUT',JSON.stringify({
 train:train.observations.length,test:test.observations.length,advancedAvailable,
 selected:evidence.deployedCandidate,coefficients:evidence.parameters,
 training:{candidate:candidateTrain,baseline:baselineTrain},
 validation:{candidate:candidateTest,baseline:baselineTest}
},null,2));
