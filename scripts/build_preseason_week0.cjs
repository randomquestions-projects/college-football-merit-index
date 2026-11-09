#!/usr/bin/env node
'use strict';
/* Build a true zero-completed-game Power ranking for all 2026 FBS teams.
 * Inputs: 2025 completed performance + 2026 season-tagged talent, portal
 * and returning production. The prototype does NOT hallucinate staff grades.
 */
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const SITE=path.join(__dirname,'../site'),DATA=path.join(SITE,'data');
const source=JSON.parse(fs.readFileSync(path.join(DATA,'preseason_full_sources_2024_2026.json'),'utf8'));
const model=JSON.parse(fs.readFileSync(path.join(DATA,'model_v5_params.json'),'utf8'));
const existing=JSON.parse(fs.readFileSync(path.join(DATA,'research_full_preseason_backtest.json'),'utf8'));
if(existing.chosenOn2025.curve!=='zero_after_4'||existing.chosenOn2025.intensity!==1)
 throw Error('Candidate parameters drifted from published 2025 model-selection result');
const html=fs.readFileSync(path.join(SITE,'index.html'),'utf8');
const inline=html.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
const prelude=inline.slice(0,inline.indexOf('const submetric='));
const lib=['model_v4.js','opponent_network_research.js','model_v5.js'].map(f=>fs.readFileSync(path.join(SITE,f),'utf8')).join('\n');
const parse=new Function('raw',prelude+'return csvParse(raw)');
const computePrevious=new Function('raw',lib+'\n'+prelude+'\nstate.raw=raw;return computeV4(raw,Infinity,2025).teams;');
const schedule2025=parse(fs.readFileSync(path.join(DATA,'history/2025/cfb_schedules_2025.csv'),'utf8'));
const schedule2026=parse(fs.readFileSync(path.join(DATA,'cfb_schedules_2026.csv'),'utf8'));
const previous=computePrevious(schedule2025);
const toIds=(rows,year)=>{
 const result=new Map();
 for(const r of rows){if(Number(r.season)!==year)continue;
  for(const side of ['home','away'])
   if(r[side+'_division']==='fbs')result.set(r[side+'_team'],String(r[side+'_id']));
 }
 return result;
};
const idsPrev=toIds(schedule2025,2025),idsNow=toIds(schedule2026,2026);
const prevStrength=new Map(previous.filter(t=>idsPrev.has(t.name))
 .map(t=>[idsPrev.get(t.name),t.power]));
const clip=(v,a,b)=>Math.min(b,Math.max(a,v));
const teams={};
for(const [name,id] of idsNow){
 const r=source.seasons['2026'].teams[id];
 if(!r)throw Error('Missing preseason team '+name+' '+id);
 const tPct=Number.isFinite(r.talentCompositePct)?r.talentCompositePct:.25;
 const blue=Number.isFinite(r.blueChipRatioPct)?r.blueChipRatioPct:.5;
 const talentIndex=100*(.88*tPct+.12*blue);
 const talentPoints=(talentIndex/100-.5)*26;
 const lastYearPowerRaw=prevStrength.get(id);
 const baseline=Number.isFinite(lastYearPowerRaw)?clip(lastYearPowerRaw,-25,25):0;
 const returningOverall=Number.isFinite(r.returningOverall)?r.returningOverall:.50;
 const continuity=clip(.65+.45*(returningOverall-.50),.4,.95);
 const priorLast=baseline*continuity;
 const transferNetPercentile=Number.isFinite(r.netTransferTalentPct)?r.netTransferTalentPct:.5;
 const transferPoints=clip((transferNetPercentile-.5)*2.4,-1.2,1.2);
 const priorPoints=.55*priorLast+.45*talentPoints+transferPoints;
 teams[name]={
  team:name,teamId:id,priorPoints,unadjustedPriorPoints:priorPoints,
  talentIndex,sourceCoverage:r.preseasonSourceCoverage||{},
  imputedTalent:r.talentIsImputed===true,
  coaching:null,
  components:{lastYearPowerRaw:Number.isFinite(lastYearPowerRaw)?lastYearPowerRaw:null,
   returningOverall:Number.isFinite(r.returningOverall)?r.returningOverall:null,
   returningOffense:r.returningOffense,returningDefense:r.returningDefense,
   transferNetPercentile,transferPoints,talentPoints,continuity,
   previousYearWeight:.55,currentRosterWeight:.45,
   blueChipRatio:r.blueChipRatio,
   talentComposite:r.talentComposite,
   rosterN:r.rosterN,
   portalShare:r.portalShare,
   headCoachChanged:null,offCoordinatorChanged:null,defCoordinatorChanged:null},
  evidence:{starsTop30Available:false,depthTop50Available:false,
   coachingVerified:false,portalMeasured:r.preseasonSourceCoverage?.portal===true,
   returnProductionMeasured:r.preseasonSourceCoverage?.returning===true}
 };
}
assert(Object.keys(teams).length>=135);
const mean=Object.values(teams).reduce((z,t)=>z+t.priorPoints,0)/Object.keys(teams).length;
for(const t of Object.values(teams))t.priorPoints-=mean;
const rated=Object.values(teams).sort((a,b)=>b.priorPoints-a.priorPoints||a.team.localeCompare(b.team));
rated.forEach((t,i)=>{t.powerRank=i+1;t.talentRank=i+1;t.week0PowerIndex=clip(50+1.6*t.priorPoints,0,100)});
const doc={
 version:'5.3-research-v1',season:2026,generatedAtUtc:new Date().toISOString(),
 deployed:false,availableForReview:true,
 modelLineage:{baseline:'CFMI V5.2 opponent-strength model',baseParameters:model.version,
   trainingYear:2025,evaluationYear:2026,selection:existing.chosenOn2025.curve,
   retrospectiveSources:true},
 decayByCompletedFbsGames:[1,.55,.35,.20,.08,0],
 decayPolicy:'FBS games completed; 0 games prior=100%, after 1=55%, after 2=35%, after 3=20%, after 4=8%, after 5+=0%.',
 priorFormula:'55% reliability-adjusted 2025 opponent strength + 45% 2026 roster composite with modest blue-chip support + bounded incremental portal change.',
 sourceLimitations:'Not verified immutable preseason originals; historical coaching changes and coordinator changes are unmeasured, not zero; top30/depth player ratings not verified across all FBS.',
 missingTalentFallback:'FBS 25th percentile, not P4 25th percentile; source missingness remains explicit.',
 coverage:source.seasons['2026'].coverage,
 teams,
 preseasonTop25:rated.slice(0,25).map(t=>({
  team:t.team,rank:t.powerRank,powerIndex:t.week0PowerIndex,
  powerPoints:t.priorPoints,talentIndex:t.talentIndex,previousPower:t.components.lastYearPowerRaw,
  returning:t.components.returningOverall,portal:t.components.portalShare
 }))
};
fs.writeFileSync(path.join(DATA,'preseason_prior_2026.json'),JSON.stringify(doc,null,2)+'\n');
console.log('CFMI V5.3 WEEK0 TOP25',JSON.stringify(doc.preseasonTop25));
console.log('CFMI V5.3 PRIOR COVERAGE',JSON.stringify({teams:Object.keys(teams).length,
 imputedTalent:Object.values(teams).filter(t=>t.imputedTalent).length,
 returningMeasured:Object.values(teams).filter(t=>t.evidence.returnProductionMeasured).length,
 portalMeasured:Object.values(teams).filter(t=>t.evidence.portalMeasured).length}));
