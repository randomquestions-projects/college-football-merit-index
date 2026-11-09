#!/usr/bin/env node
'use strict';
/* Matchup specific conditional run/pass adjustments to baseline Power.
 * 2024 FIT: earlier season, Weeks 5–13. 2025 SELECT: full-season reused
 * validation. 2026 EXAMINE only; no 2026 labels in fit/selection.
 * Any nonzero model must improve both 2025 log loss and margin MAE.
 * If it fails, production defaults to a zero correction (Power+venue).
 */
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const SITE=path.join(__dirname,'../site'),DATA=path.join(SITE,'data');
const html=fs.readFileSync(path.join(SITE,'index.html'),'utf8');
const inline=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
const prelude=inline.slice(0,inline.indexOf('const submetric='));
const library=['model_v4.js','opponent_network_research.js','model_v5.js','preseason_prior_v1.js','model_matchup_v1.js']
 .map(f=>fs.readFileSync(path.join(SITE,f),'utf8')).join('\n');
const parse=new Function('raw',prelude+'return csvParse(raw)');
const run=new Function('scores','advanced','year','cutoff','params',
 library+'\n'+prelude+'\nstate.raw=scores;MODEL_PRESEASON_V53.enabled=false;MODEL_V5.setParameters(params);'+
 'const result=computeV5(scores,cutoff,year);attachEfficiencyV5(result.teams,advanced);'+
 'const profiles=CFMI_MATCHUP.profiles(result.teams,advanced);return {teams:result.teams,profiles,features:(home,away)=>CFMI_MATCHUP.features(home,away,profiles).values};');
const params=JSON.parse(fs.readFileSync(path.join(DATA,'model_v5_params.json'),'utf8')).parameters;
const ledger=JSON.parse(fs.readFileSync(path.join(DATA,'prediction_ledger_2025_2026.json'),'utf8'));
const read=(year)=>{
 const dir=year===2026?DATA:path.join(DATA,'history',String(year));
 return {scores:parse(fs.readFileSync(path.join(dir,'cfb_schedules_'+year+'.csv'),'utf8')),
  advanced:parse(fs.readFileSync(path.join(dir,'cfmi_advanced_'+year+'.csv'),'utf8'))};
};
const datasets={2024:read(2024),2025:read(2025),2026:read(2026)};
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const sigmoid=x=>1/(1+Math.exp(-clamp(x,-30,30)));
function season(year){
 const data=datasets[year],priorLedger=ledger.seasons[String(year)];
 const raw=data.scores;
 const played=raw.filter(g=>g.season===String(year)&&g.season_type==='regular'&&
  g.home_division==='fbs'&&g.away_division==='fbs'&&g.completed==='TRUE'&&
  g.home_points!==''&&g.away_points!==''&&Number.isFinite(+g.home_points)&&Number.isFinite(+g.away_points)&&
  +g.home_points!==+g.away_points);
 const rows=[];
 const weeks=[...new Set(played.map(g=>+g.week))].sort((a,b)=>a-b);
 for(const week of weeks){
  if(year===2024&&week<5)continue;
  const games=played.filter(g=>+g.week===week);
  const first=Math.min(...games.map(g=>Date.parse(g.start_date)));
  if(!Number.isFinite(first))continue;
  const {teams,profiles,features}=run(raw,data.advanced,year,first-1,{parameters:params});
  const byName=new Map(teams.map(t=>[t.name,t]));
  const ledgerGames=priorLedger?.weeks.find(w=>w.week===week)?.games||[];
  const byId=new Map(ledgerGames.map(g=>[String(g.gameId),g]));
  for(const game of games){
   const h=byName.get(game.home_team),a=byName.get(game.away_team);
   if(!h||!a)continue;
   const x=features(h,a);
   const neutral=game.neutral_site==='TRUE';
   const archived=byId.get(String(game.game_id));
   // 2025–2026 actual exact baseline includes the published V5.3 prior;
   // 2024 prior is not archived, so the 2024 base is raw game-only V5.2.
   const base=archived?.predictedMargin??((h.powerPoints-a.powerPoints)+(neutral?0:params.homePoints));
   rows.push({year,week,id:game.game_id,
    home:game.home_team,away:game.away_team,
    neutral,x,base,margin:+game.home_points-(+game.away_points),
    win:+game.home_points>+game.away_points?1:0,
    coverage:Math.min(profiles.get(h.name)?.coverage?.run||0,profiles.get(a.name)?.coverage?.run||0)
   });
  }
 }
 return rows;
}
const rows={2024:season(2024),2025:season(2025),2026:season(2026)};
if(rows[2024].length<350||rows[2025].length<600||rows[2026].length<450)
 throw Error('Too few original-week compatible matchup games '+JSON.stringify(Object.fromEntries(Object.entries(rows).map(([k,v])=>[k,v.length]))));
const keys=['runExploit','passExploit','runFit','passFit','runStyle','firstDownFit','explosiveFit'];
function fitRidge(games,lambda){
 const d=keys.length,coef=Array(d).fill(0);
 // Efficient deterministic coordinate-descent ridge regression:
 // y is observed actual margin LESS V5.3's predicted expected margin.
 const y=games.map(g=>g.margin-g.base);
 const xx=games.map(g=>g.x);
 for(let t=0;t<250;t++){
  let difference=0;
  for(let j=0;j<d;j++){
   let numerator=0,denominator=lambda;
   for(let i=0;i<games.length;i++){
    let partial=y[i];
    for(let k=0;k<d;k++)if(k!==j)partial-=xx[i][k]*coef[k];
    numerator+=xx[i][j]*partial;
    denominator+=xx[i][j]**2;
   }
   const value=clamp(numerator/Math.max(denominator,0.0001),-4,4);
   difference=Math.max(difference,Math.abs(coef[j]-value));coef[j]=value;
  }
  if(difference<1e-8)break;
 }
 return coef;
}
function calc(games,coef){
 let correct=0,ll=0,brier=0,mae=0,rmse=0;
 let flipped=0,powerWrongToRight=0,powerRightToWrong=0,corrections=0;
 for(const g of games){
  const raw=g.x.reduce((sum,x,i)=>sum+x*coef[i],0);
  const adjustment=clamp(raw,-4,4),prediction=g.base+adjustment;
  const prob=clamp(sigmoid(prediction/params.logisticScale),1e-5,1-1e-5);
  const basePick=g.base>=0,nowPick=prediction>=0;
  flipped+=Number(basePick!==nowPick);
  powerWrongToRight+=Number(basePick!==Boolean(g.win)&&nowPick===Boolean(g.win));
  powerRightToWrong+=Number(basePick===Boolean(g.win)&&nowPick!==Boolean(g.win));
  correct+=Number(nowPick===Boolean(g.win));
  ll-=g.win*Math.log(prob)+(1-g.win)*Math.log(1-prob);
  brier+=(prob-g.win)**2;
  mae+=Math.abs(prediction-g.margin);
  rmse+=(prediction-g.margin)**2;
  corrections+=Math.abs(adjustment);
 }
 const n=games.length;
 return {games:n,correct,accuracy:correct/n,logLoss:ll/n,brier:brier/n,
  marginMAE:mae/n,marginRMSE:Math.sqrt(rmse/n),flipped,powerWrongToRight,powerRightToWrong,
  meanAbsAdjustment:corrections/n};
}
const zero=Array(keys.length).fill(0);
const candidates=[];
for(const lambda of [.2,1,5,20,80,250,600]){
 const fitted=fitRidge(rows[2024],lambda);
 for(const multiplier of [.25,.5,1]){
  const coefficients=fitted.map(x=>x*multiplier);
  candidates.push({lambda,multiplier,coefficients,
   fit2024:calc(rows[2024],coefficients),
   selection2025:calc(rows[2025],coefficients),
   exploratory2026:calc(rows[2026],coefficients)});
 }
}
const baseline={2024:calc(rows[2024],zero),2025:calc(rows[2025],zero),2026:calc(rows[2026],zero)};
const qualified=candidates.filter(c=>
 c.selection2025.logLoss<baseline[2025].logLoss-.0005&&
 c.selection2025.marginMAE<baseline[2025].marginMAE-.02&&
 c.selection2025.accuracy>=baseline[2025].accuracy-.002);
qualified.sort((a,b)=>a.selection2025.logLoss-b.selection2025.logLoss);
const selected=qualified[0]||null;
const doc={version:'matchup-1.0-research',
 deployCandidate:selected!==null,modelFamily:'regularized run/pass opponent-style matchup residual',
 training:[2024],selection:[2025],inspectionOnly:[2026],
 parameters:{coefficients:selected?selected.coefficients:zero,
  capPoints:4,probabilityScale:params.logisticScale,
  source:selected?'2024 fit / 2025 selected':'no significant validated improvement — zero adjustment',
  keys},
 baseline,selected,
 candidateGrid:candidates,
 caveats:[
  '2025 was previously used to select Power, not a pristine untouched holdout.',
  '2026 motivated the project and is never used to select coefficients.',
  'Historical play-level sources can be revised after original weeks.',
  'No conference/recruiting/poll/market prior in matchup residual.',
  'Rushing/passing efficiency is simultaneously opponent adjusted with ridge shrinkage.',
  'Matchup Score is a game-specific probability score, not a global school ranking.',
  'Neither Merit nor Power points, indexes, or ranks are changed.'
 ]};
fs.writeFileSync(path.join(DATA,'model_matchup_params.json'),JSON.stringify(doc,null,2)+'\n');
console.log('CFMI MATCHUP VALIDATION',JSON.stringify({
 keys,counts:Object.fromEntries(Object.entries(rows).map(([k,v])=>[k,v.length])),
 baseline,eligible:candidates.length,qualifying:qualified.length,
 selected:selected&&{lambda:selected.lambda,multiplier:selected.multiplier,
  coefficients:selected.coefficients,fit2024:selected.fit2024,
  selection2025:selected.selection2025,exploratory2026:selected.exploratory2026},
 bestExploratoryNotUsed:candidates.slice().sort((a,b)=>a.exploratory2026.logLoss-b.exploratory2026.logLoss)[0]?.exploratory2026,
 noForcedDeployment:selected===null
}));
