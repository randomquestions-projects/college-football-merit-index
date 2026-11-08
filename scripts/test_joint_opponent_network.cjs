#!/usr/bin/env node
'use strict';
/* Full network opponent adjustment benchmark, no team names/conference priors.
 * Fit 2024 weeks 5–13 to future margins, compare untouched-in-this-experiment
 * 2025 weeks 5–13, inspect 2026 weeks 5–10 without fitting.
 */
const fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'../site'),dir=path.join(ROOT,'data');
const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const inline=html.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
if(!inline)throw Error('missing dashboard script');
const prelude=inline.slice(0,inline.indexOf('const submetric='));
const lib=['model_v4.js','model_v5.js','opponent_network_research.js']
 .map(f=>fs.readFileSync(path.join(ROOT,f),'utf8')).join('\n');
const parse=new Function('csv',prelude+'return csvParse(csv)');
const score=new Function('raw','adv','date','season','params',lib+'\n'+prelude+'\n'+[
 'const data=csvParse(raw),dataAdv=csvParse(adv);state.raw=data;',
 'MODEL_V5.setParameters(params);',
 'const r=computeV5(data,date,season);attachEfficiencyV5(r.teams,dataAdv);',
 'return {teams:r.teams,joint:solveOpponentNetworkEfficiency(r.teams)};'
 ].join('\n'));
const params=JSON.parse(fs.readFileSync(path.join(dir,'model_v5_params.json'),'utf8'));
const mean=a=>a.reduce((s,x)=>s+x,0)/Math.max(1,a.length);
const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
const sigmoid=x=>1/(1+Math.exp(-clamp(x,-30,30)));
const fcsDeficit=t=>{const games=t.played.filter(x=>!x.opFbs);return games.reduce((v,x)=>v+Math.min(30,Math.max(0,14-x.margin)),0)/(games.length+1.5)};
function seasonGames(year){
 const folder=year===2026?dir:path.join(dir,'history',String(year));
 const raw=fs.readFileSync(path.join(folder,'cfb_schedules_'+year+'.csv'),'utf8');
 const adv=fs.readFileSync(path.join(folder,'cfmi_advanced_'+year+'.csv'),'utf8');
 const rows=parse(raw);
 const games=rows.filter(g=>g.season===String(year)&&g.season_type==='regular'&&g.completed==='TRUE'&&
   g.home_division==='fbs'&&g.away_division==='fbs'&&g.home_points!==''&&g.away_points!==''&&
   Number.isFinite(+g.home_points)&&Number.isFinite(+g.away_points));
 const observations=[];
 for(let w=5;w<=13;w++){
  const next=games.filter(g=>+g.week===w);
  if(next.length<5)continue;
  const first=Math.min(...next.map(g=>Date.parse(g.start_date)));
  if(games.filter(g=>+g.week<w&&Date.parse(g.start_date)<first).length<120)continue;
  const data=score(raw,adv,first-1,year,params);
  const lookup=new Map(data.teams.map(t=>[t.name,t]));
  for(const g of next){
   const h=lookup.get(g.home_team),a=lookup.get(g.away_team);
   if(!h||!a)continue;
   const jointH=data.joint.get(h.name),jointA=data.joint.get(a.name);
   const rawDiff=(key,scale)=>(jointH[key]-jointA[key])/scale;
   const fx=[
     rawDiff('epa',.10),
     rawDiff('success',.05),
     rawDiff('explosive',.03)
   ];
   const unsupported=t=>Math.max(0,t.powerPoints)*Math.min(1.6,Math.max(0,-t.sos)/8);
   const extra=[
     (h.sos-a.sos)/4,
     -(unsupported(h)-unsupported(a))/5,
     -(fcsDeficit(h)-fcsDeficit(a))/6
   ];
   observations.push({
    year,week:w,margin:+g.home_points-(+g.away_points),
    home:g.home_team,away:g.away_team,
    homeWon:+g.home_points>+g.away_points,
    venue:g.neutral_site==='TRUE'?0:params.parameters.homePoints,
    current:h.powerPoints-a.powerPoints+(g.neutral_site==='TRUE'?0:params.parameters.homePoints),
    base:(h.power-a.power)*params.parameters.baseScale+(g.neutral_site==='TRUE'?0:params.parameters.homePoints),
    fx,extra
   });
  }
 }
 return {observations,raw,adv};
}
const data={2024:seasonGames(2024),2025:seasonGames(2025),2026:seasonGames(2026)};
function predict(g,model,coef){
 if(model==='existing')return g.current;
 const all=model==='joint'?[...g.fx]:[...g.fx,...g.extra];
 return g.base+all.reduce((s,x,i)=>s+x*(coef[i]||0),0);
}
function ridgeFit(list,full){
 const n=full?6:3;
 const ridge=full?[450,500,600,120,160,160]:[450,500,600];
 const coefficients=Array(n).fill(0);
 for(let iter=0;iter<900;iter++){
  let gap=0;
  for(let i=0;i<n;i++){
   let numerator=0,denom=ridge[i];
   for(const g of list){
    const x=full?[...g.fx,...g.extra]:g.fx;
    const predicted=g.base+x.reduce((sum,v,j)=>sum+v*coefficients[j],0);
    numerator+=x[i]*(g.margin-predicted+coefficients[i]*x[i]);
    denom+=x[i]*x[i];
   }
   const next=clamp(numerator/denom,0,8);
   gap=Math.max(gap,Math.abs(next-coefficients[i]));
   coefficients[i]=next;
  }
  if(gap<1e-9)break;
 }
 return coefficients;
}
const fitJoint=ridgeFit(data[2024].observations,false);
const fitFull=ridgeFit(data[2024].observations,true);
function calibratedScale(list,model,coef){
 let best={scale:12,loss:Infinity};
 for(let scale=6;scale<=25;scale+=.25){
  let loss=0;
  for(const g of list){
   const prob=clamp(sigmoid(predict(g,model,coef)/scale),.00001,.99999);
   loss-=g.homeWon?Math.log(prob):Math.log(1-prob);
  }
  loss/=list.length;
  if(loss<best.loss)best={scale,loss};
 }
 return best;
}
const cJoint=calibratedScale(data[2024].observations,'joint',fitJoint);
const cFull=calibratedScale(data[2024].observations,'full',fitFull);
function stat(list,model,coef,calib=8.75){
 let right=0,brier=0,logLoss=0,mae=0,rmse=0;
 for(const g of list){
  const edge=predict(g,model,coef);
  const prob=clamp(sigmoid(edge/calib),.00001,.99999);
  const y=Number(g.homeWon);
  right+=Number((edge>=0)===g.homeWon);
  brier+=(prob-y)**2;
  logLoss-=y*Math.log(prob)+(1-y)*Math.log(1-prob);
  mae+=Math.abs(edge-g.margin);rmse+=(edge-g.margin)**2;
 }
 return {games:list.length,accuracy:right/list.length,brier:brier/list.length,
  logLoss:logLoss/list.length,marginMAE:mae/list.length,marginRMSE:Math.sqrt(rmse/list.length)};
}
const metrics={};
for(const yr of [2024,2025,2026]){
 const list=data[yr].observations;
 metrics[yr]={
  current:stat(list,'existing',[],params.parameters.logisticScale),
  joint:stat(list,'joint',fitJoint,cJoint.scale),
  jointPlusSchedule:stat(list,'full',fitFull,cFull.scale)
 };
}
const current=score(data[2026].raw,data[2026].adv,Date.now(),2026,params);
const leaderboard=current.teams.map(t=>{
 const j=current.joint.get(t.name);
 const joint=fitJoint[0]*(j.epa/.10)+fitJoint[1]*(j.success/.05)+fitJoint[2]*(j.explosive/.03);
 const u=Math.max(0,t.powerPoints)*Math.min(1.6,Math.max(0,-t.sos)/8);
 const bonus=fitFull[0]*(j.epa/.10)+fitFull[1]*(j.success/.05)+fitFull[2]*(j.explosive/.03)+
   fitFull[3]*(t.sos/4)-fitFull[4]*(u/5)-fitFull[5]*(fcsDeficit(t)/6);
 return {name:t.name,oldRank:t.powerRank,oldPoints:t.powerPoints,
  jointPoints:params.parameters.baseScale*t.power+joint,
  jointPlusPoints:params.parameters.baseScale*t.power+bonus,
  sos:t.sos,netJointEPA:j.epa,netJointSuccess:j.success,netJointExplosive:j.explosive,
  fcsDeficit:fcsDeficit(t),oldRawSuccess:t.successNet,oldRawExplosive:t.explosiveNet};
});
for(const type of ['joint','jointPlus']){
 const key=type==='joint'?'jointPoints':'jointPlusPoints';
 [...leaderboard].sort((a,b)=>b[key]-a[key]).forEach((t,i)=>t[type+'Rank']=i+1);
}
const notable=['Liberty','New Mexico','Georgia','Alabama','Utah','Ohio State','Oregon','Ole Miss','Boise State'];
const output={version:'research_opponent_joint_v0.1',training:2024,validation:2025,
 coefficients:{joint:fitJoint,full:fitFull},calibration:{joint:cJoint,full:cFull},
 metrics,notable:notable.map(n=>leaderboard.find(t=>t.name===n)).filter(Boolean),
 teams:leaderboard};
fs.writeFileSync(path.join(dir,'opponent_joint_research_2026.json'),JSON.stringify(output,null,2)+'\n');
console.log('CFMI JOINT OPPONENT-NETWORK STUDY',JSON.stringify({
 coefficients:output.coefficients,calibration:output.calibration,metrics:output.metrics,
 notable:output.notable,
 top20:[...leaderboard].sort((a,b)=>a.jointPlusRank-b.jointPlusRank).slice(0,20).map(t=>({name:t.name,old:t.oldRank,joint:t.jointRank,full:t.jointPlusRank,sos:t.sos}))
}));
