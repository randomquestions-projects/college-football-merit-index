#!/usr/bin/env node
'use strict';
/* Frozen-v5.5 Power shadow study; NEVER writes deployed coefficients or ratings.
 * Current-source reconstructed weekly snapshots, not immutable original releases.
 * Preweek cutoffs exclude the target week's games from every feature.
 * 2024 development, 2025 non-blind selection inspection, 2026 exploratory.
 */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const ROOT=path.join(__dirname,'..','site'),DATA=path.join(ROOT,'data');
const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
const html=read('index.html'),inline=html.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
assert(inline,'Model page missing');const at=inline.indexOf('const submetric=');
assert(at>1500,'Model prelude changed');const prelude=inline.slice(0,at);
const library=['model_v4.js','opponent_network_research.js','model_v5.js','preseason_prior_v1.js'].map(read).join('\n');
const parse=new Function('csv',prelude+'return csvParse(csv)');
const params=JSON.parse(read('data/model_v5_params.json'));
const ledger=JSON.parse(read('data/prediction_ledger_2025_2026.json'));
const calc=new Function('raw','adv','year','cutoff','params',library+'\n'+prelude+'\n'+
  'state.raw=raw;if(!MODEL_V5.setParameters(params))throw Error("Invalid frozen Power");'+
  'const r=computeV5(raw,cutoff,year);attachEfficiencyV5(r.teams,adv);return r.teams;');
const keys=['consistency','finishing','control'];
const mean=x=>x.reduce((a,b)=>a+b,0)/Math.max(1,x.length);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const sigmoid=x=>1/(1+Math.exp(-clamp(x,-30,30)));
function profile(t){
 const spec={
   consistency:['consistencyScore','ppaNet',25,50],
   finishing:['redzoneNet','redzoneNet',1.5,0],
   control:['control','control',.2,0]
 };
 const o={};
 for(const [name,[field,measured,unit,center]] of Object.entries(spec)){
   const n=t.advMetricCounts?.[measured]||0,v=t[field];
   o[name]=n>0&&Number.isFinite(v)?((v-center)/unit)*n/(n+3):0;
 }
 return o;
}
const examples=[];
for(const season of [2024,2025,2026]){
 const folder=season===2026?'data/':'data/history/'+season+'/';
 const raw=parse(read(folder+'cfb_schedules_'+season+'.csv'));
 const adv=parse(read(folder+'cfmi_advanced_'+season+'.csv'));
 let weeks;
 if(season===2024){
   const games=raw.filter(g=>g.season_type==='regular'&&g.completed==='TRUE'&&g.home_division==='fbs'&&g.away_division==='fbs'&&Number.isFinite(+g.home_points)&&Number.isFinite(+g.away_points));
   weeks=[...new Set(games.map(g=>+g.week))].filter(w=>w>=5&&w<=13).sort((a,b)=>a-b).map(week=>({
     week,games:games.filter(g=>+g.week===week).map(g=>({
       gameId:String(g.id),home:g.home_team,away:g.away_team,
       actualMargin:(+g.home_points)-(+g.away_points),neutral:g.neutral_site==='TRUE',
       kickoffUtc:g.start_date
     }))
   }));
 }else{
   weeks=ledger.seasons[String(season)].weeks.filter(w=>w.week>=5&&w.week<=13);
 }
 for(const week of weeks){
   const all=week.games.filter(g=>season===2024||g.finished);
   if(!all.length)continue;
   const start=Math.min(...all.map(g=>Date.parse(g.kickoffUtc)));
   assert(Number.isFinite(start),'Missing kickoff '+season+'/'+week.week);
   const cutoff=start-1,teams=calc(raw,adv,season,cutoff,params);
   const lookup=new Map(teams.map(t=>[t.name,t]));
   for(const g of all){
     const h=lookup.get(g.home),a=lookup.get(g.away);
     if(!h||!a)continue;
     const xH=profile(h),xA=profile(a);
     const margin=Number(g.actualMargin);
     const base=season===2024?
       h.powerPoints-a.powerPoints+(g.neutral?0:params.parameters.homePoints):Number(g.predictedMargin);
     if(!Number.isFinite(margin)||!Number.isFinite(base))continue;
     const x=keys.map(k=>xH[k]-xA[k]);
     const reliabilityChange=(h.powerContributionPoints.scheduleReliability||0)-
       (a.powerContributionPoints.scheduleReliability||0);
     examples.push({season,week:week.week,id:String(g.gameId),actual:margin,base,x,reliabilityChange});
   }
 }
}
function ridge(rows,lambda=500){
 // Nonnegative residual factors with substantial fixed shrinkage, fitted in 2024.
 const coefficients=[0,0,0];
 for(let pass=0;pass<500;pass++){
   let move=0;
   for(let k=0;k<keys.length;k++){
     let numerator=0,denominator=lambda;
     for(const r of rows){
       const other=coefficients.reduce((sum,b,i)=>sum+(i===k?0:b*r.x[i]),0);
       numerator+=r.x[k]*(r.actual-r.base-other);
       denominator+=r.x[k]*r.x[k];
     }
     const next=clamp(numerator/denominator,0,5);
     move=Math.max(move,Math.abs(next-coefficients[k]));coefficients[k]=next;
   }
   if(move<1e-10)break;
 }
 return coefficients;
}
function score(rows,predict){
 let correct=0,mae=0,loss=0,brier=0;
 for(const r of rows){
   const m=predict(r),actual=r.actual>0?1:0,p=clamp(sigmoid(m/8.75),1e-5,1-1e-5);
   correct+=Number((m>0)===Boolean(actual));mae+=Math.abs(m-r.actual);
   loss-=actual*Math.log(p)+(1-actual)*Math.log(1-p);
   brier+=(p-actual)**2;
 }
 const n=rows.length;
 return {games:n,correct,accuracy:correct/n,marginMAE:mae/n,logLoss:loss/n,brier:brier/n};
}
const fit=examples.filter(x=>x.season===2024);
assert(fit.length>=400,'Insufficient 2024 prior-week FBS games');
const coeff=ridge(fit);
const summary={version:'v5.6-power-shadow-1',scoringModel:'v5.5 frozen Power formula',
  status:'RESEARCH_ONLY_NOT_A_DEPLOYED_SCORING_CHANGE',
  trainYear:2024,selectionYear:2025,exploratoryYear:2026,
  coefficients:Object.fromEntries(keys.map((k,i)=>[k,coeff[i]])),
  methods:['Fixed positive ridge lambda=500, 2024 fit only; baseline forecast preserved',
    'Features reconstructed immediately before kickoff of the week from current historical source releases',
    '2025 had earlier influence on CFMI base model, not an untouched evaluation',
    '2026 has been repeatedly examined during CFMI development; not a blind holdout',
    'Score aggregates are research diagnostics and do not imply statistical significance'],
  seasons:{}};
for(const y of [2024,2025,2026]){
 const rows=examples.filter(x=>x.season===y);
 const original=score(rows,r=>r.base);
 const plus=score(rows,r=>r.base+coeff.reduce((z,b,i)=>z+b*r.x[i],0));
 const noPenalty=score(rows,r=>r.base-r.reliabilityChange);
 const weeks=[...new Set(rows.map(r=>r.week))].sort((a,b)=>a-b);
 summary.seasons[y]={original,consistencyFinishingControlCandidate:plus,
   weakSchedulePenaltyRemovedCandidate:noPenalty,
   perWeek:weeks.map(week=>({week,original:score(rows.filter(r=>r.week===week),r=>r.base),
     candidate:score(rows.filter(r=>r.week===week),r=>r.base+coeff.reduce((z,b,i)=>z+b*r.x[i],0))}))};
}
// A prospective promotion gate requires repeatable performance over untouched
// periods. Neither 2025 nor 2026 qualifies as one here; never auto-promote.
summary.promote=false;
const out=path.join(__dirname,'..','research_results','power_v56_shadow.json');
fs.mkdirSync(path.dirname(out),{recursive:true});
fs.writeFileSync(out,JSON.stringify(summary,null,2)+'\n');
console.log('CFMI POWER V5.6 SHADOW EXPERIMENT',JSON.stringify({
 fit:fit.length,coefs:summary.coefficients,
 seasons:Object.fromEntries(Object.entries(summary.seasons).map(([y,x])=>[y,{
  original:x.original,candidate:x.consistencyFinishingControlCandidate,
  penaltyAblation:x.weakSchedulePenaltyRemovedCandidate}])),
 promote:false,artifact:out
}));
