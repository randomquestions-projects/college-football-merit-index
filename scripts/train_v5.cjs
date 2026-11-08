#!/usr/bin/env node
'use strict';
/**
 * CFMI V5.1 power-training pipeline: the complete opponent-adjusted,
 * sustainable football-performance feature set is tested, not presumed useful.
 * 2024 weeks 5–13 fit coefficients and calibration. 2025 weeks 5–13 compare
 * the candidate against both bare opponent strength and deployed V5 Power.
 * 2025 is a model-selection set; it is NOT a pristine independent final test.
 */
const fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..','site'),DIR=path.join(ROOT,'data');
const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const inline=html.match(/<script>([\s\S]*?)<\/script>/i);
if(!inline)throw Error('Missing model prelude');
const end=inline[1].indexOf('const submetric=');
if(end<10000)throw Error('Model prelude moved');
const prelude=inline[1].slice(0,end);
const library=fs.readFileSync(path.join(ROOT,'model_v4.js'),'utf8')+'\n'+
 fs.readFileSync(path.join(ROOT,'model_v5.js'),'utf8');
const parse=new Function('csv',prelude+'return csvParse(csv)');
const evaluate=new Function('rows','adv','season','cutoff',library+'\n'+prelude+'\n'+
 'state.raw=rows;const r=computeV4(rows,cutoff,season);attachEfficiencyV4(r.teams,adv);'+
 'return {teams:r.teams,signals:v5PowerSignals(r.teams,state.fullModel),'+
 'coverage:{measured:state.advCovered,expected:state.advExpected,full:state.fullModel}};');
const keys=['baseline','epa','success','explosive','finishing','consistency','control','offense','defense'];
const mean=a=>a.reduce((v,x)=>v+x,0)/Math.max(1,a.length);
const clamp=(v,l,h)=>Math.max(l,Math.min(h,v));
const sigmoid=x=>1/(1+Math.exp(-clamp(x,-30,30)));
const capCorrection=10;
function readSeason(season){
 const dir=season===2026?DIR:path.join(DIR,'history',String(season));
 const rows=parse(fs.readFileSync(path.join(dir,'cfb_schedules_'+season+'.csv'),'utf8'));
 const adv=parse(fs.readFileSync(path.join(dir,'cfmi_advanced_'+season+'.csv'),'utf8'));
 const played=rows.filter(g=>g.season===String(season)&&g.season_type==='regular'&&g.completed==='TRUE'&&
  g.home_division==='fbs'&&g.away_division==='fbs'&&g.home_points!==''&&g.away_points!==''&&
  g.home_points!=='NA'&&g.away_points!=='NA'&&Number.isFinite(+g.home_points)&&
  Number.isFinite(+g.away_points)&&+g.home_points!==+g.away_points);
 const observations=[],weekly=[];
 for(let week=5;week<=13;week++){
  const upcoming=played.filter(g=>Number(g.week)===week);
  if(upcoming.length<5)continue;
  const first=Math.min(...upcoming.map(g=>Date.parse(g.start_date)));
  if(played.filter(g=>Number(g.week)<week&&Date.parse(g.start_date)<first).length<120)continue;
  const r=evaluate(rows,adv,season,first-1);
  weekly.push({week,...r.coverage});
  const team=new Map(r.teams.map(t=>[t.name,t]));
  for(const g of upcoming){
   const h=team.get(g.home_team),a=team.get(g.away_team);
   if(!h||!a)continue;
   const home=r.signals.get(h.name),away=r.signals.get(a.name);
   const x=[h.power-a.power,...keys.slice(1).map(k=>home[k]-away[k])];
   observations.push({
    gameId:String(g.game_id),date:g.start_date,home:g.home_team,away:g.away_team,
    year:season,week,neutral:g.neutral_site==='TRUE',
    margin:+g.home_points-(+g.away_points),actual:+(+g.home_points>+g.away_points),
    baseline:h.power-a.power,x,
    advancedAvailable:r.coverage.full
   });
  }
 }
 if(observations.length<(season===2026?180:350))throw Error('Insufficient historical samples '+season);
 return {observations,weekly};
}
function fitPositiveRidge(rows){
 // Positive performance signals are allowed to increase strength, never
 // perversely reduce it. Strong shrinkage handles correlated EPA, success,
 // finishing, offensive scoring and other features.
 const ridge=[100,350,390,480,650,720,690,900,900];
 const prior=[1,0,0,0,0,0,0,0,0];
 const beta=prior.slice(),n=keys.length;
 for(let iter=0;iter<2500;iter++){
  let changed=0;
  for(let i=0;i<n;i++){
   let numer=ridge[i]*prior[i],denom=ridge[i];
   for(const g of rows){
    const current=beta.reduce((v,b,j)=>v+b*g.x[j],0);
    const residual=g.margin-(g.neutral?0:2.5)-current+beta[i]*g.x[i];
    numer+=g.x[i]*residual;denom+=g.x[i]*g.x[i];
   }
   const proposed=numer/denom;
   const next=i===0?clamp(proposed,.70,1.50):clamp(proposed,0,5);
   changed=Math.max(changed,Math.abs(next-beta[i]));beta[i]=next;
  }
  if(changed<1e-8)break;
 }
 const p=Object.fromEntries(keys.map((k,i)=>[k==='baseline'?'baseScale':k,beta[i]]));
 const home=rows.filter(g=>!g.neutral);
 const residual=home.reduce((sum,g)=>sum+g.margin-
  predictedEdge(g,{...p,homePoints:0}),0);
 p.homePoints=clamp((residual+100*2.5)/(home.length+100),0,6);
 return {...p,shrinkagePenalties:ridge};
}
function predictedEdge(g,p,cap=capCorrection){
 const advanced=keys.slice(1).reduce((sum,k,i)=>sum+(p[k]||0)*g.x[i+1],0);
 return (p.baseScale||1)*g.baseline+clamp(advanced,-cap,cap)+
    (g.neutral?0:(p.homePoints??2.5));
}
function calibration(rows,p,cap=capCorrection){
 let best={scale:12,loss:Infinity};
 for(let scale=6;scale<=25;scale+=.25){
  const loss=mean(rows.map(g=>{
   const prob=clamp(sigmoid(predictedEdge(g,p,cap)/scale),1e-5,1-1e-5);
   return -(g.actual*Math.log(prob)+(1-g.actual)*Math.log(1-prob));
  }));
  if(loss<best.loss)best={scale,loss};
 }
 return best.scale;
}
function results(rows,p,scale,cap=capCorrection){
 let wins=0,brier=0,logLoss=0,mae=0,mse=0;
 for(const g of rows){
  const margin=predictedEdge(g,p,cap),pr=clamp(sigmoid(margin/scale),1e-5,1-1e-5);
  wins+=Number((margin>=0)===Boolean(g.actual));
  brier+=(pr-g.actual)**2;
  logLoss-=g.actual*Math.log(pr)+(1-g.actual)*Math.log(1-pr);
  mae+=Math.abs(margin-g.margin);mse+=(margin-g.margin)**2;
 }
 return {games:rows.length,accuracy:wins/rows.length,brier:brier/rows.length,
  logLoss:logLoss/rows.length,marginMAE:mae/rows.length,marginRMSE:Math.sqrt(mse/rows.length)};
}
function bootstrap(test,modern,modernS,old,oldS){
 const weeks=[...new Set(test.map(x=>x.week))],byWeek=new Map(weeks.map(w=>[w,test.filter(g=>g.week===w)]));
 const vals={logLoss:[],marginMAE:[],accuracy:[]};let seed=20261108;
 const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
 for(let rep=0;rep<1200;rep++){
  let n=0,logLoss=0,marginMAE=0,accuracy=0;
  for(let i=0;i<weeks.length;i++){
   const group=byWeek.get(weeks[Math.floor(rand()*weeks.length)]);
   for(const g of group){
    const a=predictedEdge(g,modern),b=predictedEdge(g,old);
    const pa=clamp(sigmoid(a/modernS),1e-5,1-1e-5),pb=clamp(sigmoid(b/oldS),1e-5,1-1e-5);
    const la=-(g.actual*Math.log(pa)+(1-g.actual)*Math.log(1-pa));
    const lb=-(g.actual*Math.log(pb)+(1-g.actual)*Math.log(1-pb));
    logLoss+=lb-la;marginMAE+=Math.abs(g.margin-b)-Math.abs(g.margin-a);
    accuracy+=Number((a>=0)===Boolean(g.actual))-Number((b>=0)===Boolean(g.actual));n++;
   }
  }
  vals.logLoss.push(logLoss/n);vals.marginMAE.push(marginMAE/n);vals.accuracy.push(accuracy/n);
 }
 const interval=arr=>{arr.sort((x,y)=>x-y);return {lower95:arr[Math.floor(.025*arr.length)],
   upper95:arr[Math.floor(.975*arr.length)]}};
 return {method:'paired week-block bootstrap',samples:1200,weekCount:weeks.length,
  positiveIndicatesImprovement:true,logLoss:interval(vals.logLoss),
  marginMAE:interval(vals.marginMAE),accuracy:interval(vals.accuracy)};
}
const train=readSeason(2024),test=readSeason(2025);
const candidate=fitPositiveRidge(train.observations);
const base={baseScale:1,homePoints:2.5};
const previous={
 baseScale:1.2359402338491845,epa:0,
 success:13.554077261006876*.05,
 explosive:11.844451681279617*.03,
 homePoints:3.540379938213802
};
// The V5 model was already selected with this same 2025 set. We compare
// transparently as a reference, not an untouched external holdout.
const candidateS=calibration(train.observations,candidate);
// Prospective 2026 as-of-week evaluation, never used to train, tune or select.
const prospective=readSeason(2026);
const baseS=calibration(train.observations,base);
const previousS=8.75;
const test2026Candidate=results(prospective.observations,candidate,candidateS);
const test2026Previous=results(prospective.observations,previous,previousS,8);
const test2026Baseline=results(prospective.observations,base,baseS);
const trainCandidate=results(train.observations,candidate,candidateS);
const testCandidate=results(test.observations,candidate,candidateS);
const testBase=results(test.observations,base,baseS);
const testPrevious=results(test.observations,previous,previousS,8);
// Gating prevents expanding the model merely to use a wider feature list.
// Every factor is evaluated; a zero coefficient legitimately means no
// independent predictive value was established with the available data.
const winsBase=testCandidate.logLoss<testBase.logLoss &&
 testCandidate.marginMAE<testBase.marginMAE-.20;
const winsPrevious=testCandidate.logLoss<=testPrevious.logLoss+.001 &&
 testCandidate.marginMAE<=testPrevious.marginMAE-.10;
const useCandidate=winsBase&&winsPrevious;
const selected=useCandidate?candidate:previous;
const selectedS=useCandidate?candidateS:previousS;
const chosen=useCandidate?'full_spectrum_regularized':'validated_v5_reference';
const params={...Object.fromEntries(keys.slice(1).map(k=>[k,selected[k]||0])),
 baseScale:selected.baseScale,homePoints:selected.homePoints,logisticScale:selectedS,
 source:chosen,trainedOn:[2024],validatedOn:[2025]};
// Export exact pregame same-week CFMI projections used for 2026 evaluation.
const gameAhead2026={
 season:2026,generatedAtUtc:new Date().toISOString(),
 model:'CFMI Power V5.1 deployed via 2024-trained and 2025-selected parameters',
 trainingSeasons:[2024],selectionSeasons:[2025],
 note:'Reconstructed strict prior-week predictions; source corrections may change retrospectively.',
 games:prospective.observations.map(g=>{
  const prior=predictedEdge(g,previous,8);
  const expanded=predictedEdge(g,candidate);
  return {gameId:g.gameId,date:g.date,week:g.week,home:g.home,away:g.away,
    neutral:g.neutral,homePoints:g.margin,homeWon:g.actual===1,
    cfmiPredictedMargin:prior,cfmiNeutralMargin:prior-(g.neutral?0:previous.homePoints),
    cfmiHomeWinProb:sigmoid(prior/previousS),
    expandedPredictedMargin:expanded,
    opponentBaselineMargin:predictedEdge(g,base)};
 })
};
fs.writeFileSync(path.join(DIR,'research_cfmi_2026_pregame.json'),JSON.stringify(gameAhead2026,null,2)+'\n');
const same2025=test.observations.filter(g=>g.week<=10);
const same2026=prospective.observations.filter(g=>g.week<=10);
const breakdown=(sample,p,scale)=>{
 const overall=results(sample,p,scale);
 const favorites=sample.map(g=>{
  const edge=predictedEdge(g,p);
  const f=sigmoid(Math.abs(edge)/scale);
  const correct=(edge>=0)===Boolean(g.actual);
  return {week:g.week,predictedFavoriteWinProb:f,correct,upset:!correct,edge:Math.abs(edge),homeWon:!!g.actual};
 });
 return {...overall,expectedWinnerAccuracy:mean(favorites.map(x=>x.predictedFavoriteWinProb)),
   medianFavoriteWinChance:favorites.map(x=>x.predictedFavoriteWinProb).sort((a,b)=>a-b)[Math.floor(favorites.length/2)],
   lowConfidenceGames:favorites.filter(x=>x.predictedFavoriteWinProb<.65).length,
   upsetsAgainst70pctFavorites:favorites.filter(x=>x.predictedFavoriteWinProb>=.7&&!x.correct).length,
   shareHomeWon:mean(sample.map(g=>+Boolean(g.actual))),
   perWeek:[...new Set(sample.map(g=>g.week))].sort((a,b)=>a-b)
      .map(week=>({week,...results(sample.filter(x=>x.week===week),p,scale)}))
 };
};
const seasonalDifficulty={weekRange:'5-10',
  earlier2025:breakdown(same2025,previous,previousS),
  current2026:breakdown(same2026,previous,previousS)};
fs.writeFileSync(path.join(DIR,'research_2025_vs_2026.json'),JSON.stringify(seasonalDifficulty,null,2)+'\n');
console.log('FAIR_SEASON_2025_2026_WEEK_5_10',JSON.stringify(seasonalDifficulty));
const audit={
 version:'5.1.0',generatedAtUtc:new Date().toISOString(),
 methodology:'Season-only walk-forward snapshots. 2024 weeks 5–13 train ridge-regularized nonnegative performance factors, then 2025 weeks 5–13 compare against season-only baseline and prior V5. No future games enter any snapshot or ratings. 2025 reused for model selection, not an untouched final test.',
 featureKeys:keys,
 trainSeason:2024,validationSeason:2025,
 trainingGames:train.observations.length,validationGames:test.observations.length,prospective2026Games:prospective.observations.length,
 deployedCandidate:chosen,
 selectionReason:useCandidate?'Full-spectrum candidate improved margin MAE and met log-loss gates against the baseline and V5 reference.':'Use existing V5 reference; full-spectrum candidate did not meet the predeclared margin and log-loss validation gates.',
 parameters:params,probabilitiesCalibrated:true,
 validation:{
  candidate2025:testCandidate,baseline2025:testBase,previousV5_2025:testPrevious,
  candidate2026:test2026Candidate,previousV5_2026:test2026Previous,baseline2026:test2026Baseline,
  candidateTrain2024:trainCandidate,
  candidateCoefficients:candidate,
  pairedWeeklyBootstrap2025:bootstrap(test.observations,candidate,candidateS,previous,previousS),
  coverage2024:train.weekly,coverage2025:test.weekly,coverage2026:prospective.weekly
 },
 caveats:[
  '2025 was used to select both the prior V5 and this expanded candidate; this is an iterative out-of-time comparison, not an unbiased final holdout.',
  '2026 weekly results are prospectively evaluated as of the available cutoff but not used to fit, choose or recalibrate the model; retrospective source corrections can still affect reconstructed as-of values.',
  'Red-zone finishing and game control may be less stable than EPA/success; coefficients shrink or reach zero when incremental signal is not established.',
  'Offensive and defensive scoring diagnostics overlap the game-margin baseline; regularization prevents double-counted strength.',
  'Neither recruiting, conferences, betting markets, polls nor preseason team priors determine ratings.',
  'Probabilities are calibrated only through a monotone 2024-trained link; 2025 is evaluation/model-selection data.'
 ]
};
fs.writeFileSync(path.join(DIR,'model_v5_params.json'),JSON.stringify(audit,null,2)+'\n');
fs.writeFileSync(path.join(DIR,'backtest_v5.json'),JSON.stringify(audit,null,2)+'\n');
console.log('CFMI V5.1 POWER COMPARISON',JSON.stringify({
 training:train.observations.length,validation:test.observations.length,
 choice:chosen,params,trainCandidate,testCandidate,testPrevious,testBase,
 prospective2026:{candidate:test2026Candidate,previous:test2026Previous,baseline:test2026Baseline},
 uncertainty:audit.validation.pairedWeeklyBootstrap2025
},null,2));
