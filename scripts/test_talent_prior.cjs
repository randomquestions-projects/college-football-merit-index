#!/usr/bin/env node
'use strict';
/* Research ONLY: talent/last-season preseason prior with rapid decay.
  2025 is parameter-selection (not pristine holdout, base CFMI trained on it);
  2026 is a later out-of-training inspection, but 2026 rankings motivated design.
  No roster/coach values from after season start may be deliberately injected.
  2024 and 2025 archived roster pages are not independently timestamp frozen.
*/
const fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'../site'),DATA=path.join(ROOT,'data');
const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const inline=html.match(/<script>([\s\S]*?)<\/script>/i)[1];
const prelude=inline.slice(0,inline.indexOf('const submetric='));
const lib=['model_v4.js','opponent_network_research.js','model_v5.js'].map(f=>fs.readFileSync(path.join(ROOT,f),'utf8')).join('\n');
const parse=new Function('raw',prelude+'return csvParse(raw)');
const evaluate=new Function('scores','adv','season','cutoff','params',lib+'\n'+prelude+'\n'+[
 'MODEL_V5.setParameters(params);',
 'state.raw=scores;',
 'const r=computeV5(scores,cutoff,season);',
 'attachEfficiencyV5(r.teams,adv);',
 'return r.teams;'
].join('\n'));
const basic=new Function('scores','season',lib+'\n'+prelude+'\n'+[
 'state.raw=scores;return computeV4(scores,Infinity,season).teams;'
].join('\n'));
const params=JSON.parse(fs.readFileSync(path.join(DATA,'model_v5_params.json'),'utf8'));
const talents=JSON.parse(fs.readFileSync(path.join(DATA,'research_talent_2024_2026.json'),'utf8'));
const sigmoid=x=>1/(1+Math.exp(-Math.max(-30,Math.min(30,x))));
const avg=a=>a.reduce((s,x)=>s+x,0)/Math.max(a.length,1);
const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const aliases={mississippi:'olemiss',miamifl:'miami',miamiflorida:'miami',floridainternational:'fiu',appalachianstate:'appstate',northcarolinastate:'ncstate',brighamyoung:'byu',connecticut:'uconn',centralflorida:'ucf',louisianalafayette:'louisiana',massachusetts:'umass'};
const key=s=>aliases[norm(s)]||norm(s);
const scorePrior=(talent,last=0,ratio=.55)=>{
 const roster=(talent-50)*.28; // 50th percentile league average, 14 pt extremes
 return ratio*last+(1-ratio)*roster;
};
const weights=[1,.55,.35,.20,.08,.05,.05,.05,.05,.05,.05,.05,.05,.05,.05];
function getYear(year){
 const sub=year===2026?DATA:path.join(DATA,'history',String(year));
 return {
  games:parse(fs.readFileSync(path.join(sub,'cfb_schedules_'+year+'.csv'),'utf8')),
  adv:parse(fs.readFileSync(path.join(sub,'cfmi_advanced_'+year+'.csv'),'utf8'))
 };
}
const data={2024:getYear(2024),2025:getYear(2025),2026:getYear(2026)};
const byTalent={};
for(const y of [2024,2025,2026])byTalent[y]=new Map(talents.years[y].map(t=>[key(t.team),t]));
const baselineLast={};
for(const y of [2025,2026]){
 const prev=basic(data[y-1].games,y-1);
 baselineLast[y]=new Map(prev.map(t=>[key(t.name),t.power]));
}
function sample(year){
 const rows=data[year].games,advanced=data[year].adv;
 const future=rows.filter(g=>g.season===String(year)&&g.season_type==='regular'&&g.completed==='TRUE'&&
  g.home_division==='fbs'&&g.away_division==='fbs'&&g.home_points!==''&&g.away_points!==''&&
  Number.isFinite(+g.home_points)&&Number.isFinite(+g.away_points));
 const result=[];
 for(let week=1;week<=10;week++){
  const target=future.filter(g=>Number(g.week)===week);
  if(target.length<5)continue;
  const kickoff=Math.min(...target.map(g=>Date.parse(g.start_date)));
  const teams=evaluate(rows,advanced,year,kickoff-1,params);
  const teamMap=new Map(teams.map(t=>[key(t.name),t]));
  for(const game of target){
   const home=teamMap.get(key(game.home_team)),away=teamMap.get(key(game.away_team));
   if(!home||!away)continue;
   const pHome=byTalent[year].get(key(game.home_team));
   const pAway=byTalent[year].get(key(game.away_team));
   if(!pHome||!pAway)continue;
   const prevH=baselineLast[year].get(key(game.home_team));
   const prevA=baselineLast[year].get(key(game.away_team));
   if(!Number.isFinite(prevH)||!Number.isFinite(prevA))continue;
   const priorH=scorePrior(pHome.talentIndexProxy,prevH);
   const priorA=scorePrior(pAway.talentIndexProxy,prevA);
   const neutral=game.neutral_site==='TRUE';
   result.push({
    week,year,home:game.home_team,away:game.away_team,neutral,
    margin:Number(game.home_points)-Number(game.away_points),
    won:Number(game.home_points)>Number(game.away_points)?1:0,
    onfield:home.powerPoints-away.powerPoints+(neutral?0:params.parameters.homePoints),
    prior:priorH-priorA+(neutral?0:params.parameters.homePoints),
    priorHome:priorH,priorAway:priorA,
    talentHome:pHome.talentIndexProxy,talentAway:pAway.talentIndexProxy
   });
  }
 }
 if(result.length<100)throw Error('Insufficient 2025/26 talent-linked games '+year+' '+result.length);
 return result;
}
const samples={2025:sample(2025),2026:sample(2026)};
function pickEdge(g,intensity){
 const weight=Math.min(1,weights[Math.min(weights.length-1,g.week-1)]*intensity);
 return (1-weight)*g.onfield+weight*g.prior;
}
function metrics(games,intensity,window='all'){
 const arr=window==='early'?games.filter(g=>g.week<=4):window==='later'?games.filter(g=>g.week>=5):games;
 let correct=0,brier=0,ll=0,mae=0;
 for(const g of arr){
  const pred=pickEdge(g,intensity),p=Math.max(1e-5,Math.min(1-1e-5,sigmoid(pred/params.parameters.logisticScale)));
  correct+=Number((pred>=0)===Boolean(g.won));
  brier+=(p-g.won)**2;
  ll-=g.won*Math.log(p)+(1-g.won)*Math.log(1-p);
  mae+=Math.abs(pred-g.margin);
 }
 return {games:arr.length,correct,accuracy:correct/arr.length,brier:brier/arr.length,
  logLoss:ll/arr.length,marginMAE:mae/arr.length};
}
const variants=[0,.4,.7,1];
const train=variants.map(intensity=>({
 intensity,all:metrics(samples[2025],intensity),
 early:metrics(samples[2025],intensity,'early'),
 later:metrics(samples[2025],intensity,'later')
}));
const selected=train.slice().sort((a,b)=>a.all.logLoss-b.all.logLoss)[0];
const comparison={
 version:'research_early_talent_prior_0.1',trainedOn:2025,checkedOn:2026,
 paramsSource:params.version,
 caveat:'2025 used in V5.2 model-selection, not a clean new holdout. Archived historical talent pages may include retrospectively refreshed ratings. 2026 motivated investigation and is not an untouched original-inception test.',
 talentMethod:'Top30 tier-score 75% + depth31-80 tier-score 25%, national within-year percentiles; no conference prior; no unobserved coaching values.',
 priorFormula:'55% previous season completed-game SRS + 45% season-roster talent index transformed to point rating; provisional, not separately fitted.',
 weightingByCompletedGames:weights,selection:'Lowest 2025 game-ahead log loss among fixed prior-intensity candidates',
 trainingResults:train,selectedIntensity:selected.intensity,
 laterYear2026:variants.map(intensity=>({
  intensity,all:metrics(samples[2026],intensity),
  early:metrics(samples[2026],intensity,'early'),
  later:metrics(samples[2026],intensity,'later')
 })),
 retainedFields:['player star tier composition','top30 proxy','next-50 depth proxy','2026 full roster composite','bluechip ratio','prior-year SRS']
};
fs.writeFileSync(path.join(DATA,'research_preseason_prior_2025_2026.json'),JSON.stringify(comparison,null,2)+'\n');
console.log('CFMI TALENT PRIOR EXPERIMENT',JSON.stringify({
 eligible2025:samples[2025].length,eligible2026:samples[2026].length,
 best2025:selected.intensity,comparison2025:train,
 comparison2026:comparison.laterYear2026
 }));
