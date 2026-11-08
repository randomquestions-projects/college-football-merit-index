/* CFMI V5: earned-resume Merit and points-scale predictive Power.
 * Season-only. No AP, CFP, FPI, SP+, FEI, recruiting, preseason or conference
 * indicators enter either rating. Opponent context is inferred from games.
 * Version parameters are fitted using PRIOR seasons only (see train_v5.cjs).
 */
'use strict';
const MODEL_V5={
 version:'5.0.0',name:'CFMI V5 — independently optimized Merit and Power',
 meritWeights:{record:.75,qualityResidual:.15,control:.10},
 meritScale:{wabPoints:12,qualityPoints:22,controlAmplitude:25,controlMarginScale:15},
 powerScale:{indexPointsPerExpectedMarginPoint:1.6},
 calibrated:false,validation:null,
 params:{epa:0,success:0,explosive:0,homePoints:2.5,logisticScale:12,
   source:'untrained_baseline_only',trainedOn:[],validatedOn:[]},
 setParameters(doc){
   const p=doc?.parameters||doc;
   if(!p||!['epa','success','explosive','homePoints','logisticScale'].every(k=>Number.isFinite(p[k])))return false;
   if(Math.abs(p.epa)>60||Math.abs(p.success)>100||Math.abs(p.explosive)>200||
       p.homePoints<0||p.homePoints>6||p.logisticScale<5||p.logisticScale>35)return false;
   Object.assign(this.params,p);
   this.calibrated=doc?.probabilitiesCalibrated===true;
   this.validation=doc?.validation||null;
   return true;
 }
};
const v5clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
const v5sigmoid=x=>1/(1+Math.exp(-v5clamp(x,-30,30)));
function v5percentiles(rows,key,rankKey=key){
 const sorted=rows.slice().sort((a,b)=>b[key]-a[key]||a.name.localeCompare(b.name));
 sorted.forEach((t,i)=>t[rankKey+'Rank']=i+1);
}
function v5PoissonBinomialTail(probs,wins){
 let dist=[1];
 for(const p of probs){const next=Array(dist.length+1).fill(0);for(let i=0;i<dist.length;i++){next[i]+=dist[i]*(1-p);next[i+1]+=dist[i]*p}dist=next}
 return v5clamp(dist.slice(Math.max(0,wins)).reduce((a,b)=>a+b,0),0,1);
}
// Reuse V4's independently inferred, regularized opponent-strength inputs
// and game ledger, NOT V4's Merit or final Power scores.
function computeV5(rows,cutoffMode,seasonYear=2026){
 const original=computeV4(rows,cutoffMode,seasonYear);
 return {...original,modelVersion:MODEL_V5.version};
}
function attachEfficiencyV5(teams,advRows){
 attachEfficiencyV4(teams,advRows);
 const withGames=teams.filter(t=>t.games>0);
 // A top-25-strength neutral benchmark already accounts for opponent difficulty
 // and venue in each individual expected game outcome. Thus no separate multiplier
 // for wins on the road and no "signature win" reward that ignores expected wins.
 const rawQuality=new Map();
 for(const t of teams){
   t.meritRecordScore=v5clamp(50+MODEL_V5.meritScale.wabPoints*t.wab,0,100);
   t.recordTailProbability=t.games?v5PoissonBinomialTail(t.played.map(g=>g.expected),t.won):null;
   let q=0;
   for(const g of t.played){
     // This positive weight is applied to the signed result-vs-expectation
     // residual, so an elite-team loss is never rewarded as a win.
     const hard=g.opFbs?v5sigmoid((g.opRating-(t._v5Benchmark??0))/9):0;
     // Uses absolute opponent-rating anchor rather than AP/CFP top-25 labels.
     const quality=v5clamp((hard-.15)/.85,0,1);
     g.meritResultContribution=g.win-g.expected;
     g.meritQualityContribution=(g.win-g.expected)*quality;
     q+=g.meritQualityContribution;
   }
   rawQuality.set(t.name,q);
 }
 // Cross-sectional orthogonal projection: remove the overlap with WAB
 // instead of assigning the same win additional arbitrary road/quality credit.
 const denom=withGames.reduce((x,t)=>x+t.wab*t.wab,0)+2;
 const slope=withGames.reduce((x,t)=>x+t.wab*rawQuality.get(t.name),0)/denom;
 for(const t of teams){
   t.meritQualityResidual=rawQuality.get(t.name)-slope*t.wab;
   t.meritQualityScore=v5clamp(50+MODEL_V5.meritScale.qualityPoints*t.meritQualityResidual,0,100);
   const evidence=t.fbsGames/(t.fbsGames+2);
   t.meritControlScore=v5clamp(50+MODEL_V5.meritScale.controlAmplitude*
        Math.tanh(t.mov/MODEL_V5.meritScale.controlMarginScale)*evidence,0,100);
   // Preserves old dashboard factor cells while changing their meaning.
   t.sor=t.meritRecordScore;
   t.qualityComponent=t.meritQualityScore;
   const m=MODEL_V5.meritWeights;
   t.score=m.record*t.meritRecordScore+
        m.qualityResidual*t.meritQualityScore+m.control*t.meritControlScore;
   t.meritScore=t.score;
   // Unplayed teams are unranked ahead of one another only by name.
 }
 v5percentiles(teams,'sor');v5percentiles(teams,'qualityComponent');
 v5percentiles(teams,'meritControlScore');
 teams.sort((a,b)=>b.score-a.score||b.wab-a.wab||a.name.localeCompare(b.name));
 teams.forEach((t,i)=>t.rank=i+1);

 // The predictive strength is measured in POINTS vs an average FBS team.
 // Cross-sectional centering leaves an unbiased no-coverage fallback.
 const p=MODEL_V5.params;
 const metrics=['ppaNet','successNet','explosiveNet'];
 const center={};
 for(const k of metrics){
   const valid=teams.filter(t=>Number.isFinite(t[k])&&t.advMetricCounts?.[k]>0);
   center[k]=valid.length?valid.reduce((a,t)=>a+t[k],0)/valid.length:0;
 }
 for(const t of teams){
   const signal=(key,maxAbs)=>{
     const coverage=t.advMetricCoverage?.[key]||0;
     return state.fullModel&&Number.isFinite(t[key])?
       v5clamp((t[key]-center[key])*coverage,-maxAbs,maxAbs):0;
   };
   const epa=signal('ppaNet',.7),success=signal('successNet',.22),
       explosive=signal('explosiveNet',.13);
   const b=Number.isFinite(t.power)?t.power:0;
   const contributions={
     baseline:b,epa:p.epa*epa,success:p.success*success,explosive:p.explosive*explosive
   };
   // Cap additive advanced correction to 35% of baseline typical scale:
   // prevents tiny advanced samples dominating repeatable scoring evidence.
   const correction=v5clamp(contributions.epa+contributions.success+
        contributions.explosive,-8,8);
   t.powerPoints=b+correction;
   t.powerScore=v5clamp(50+MODEL_V5.powerScale.indexPointsPerExpectedMarginPoint*t.powerPoints,0,100);
   t.powerComponents={
     baseline:v5clamp(50+1.6*contributions.baseline,0,100),
     ppa:contributions.epa,success:contributions.success,explosive:contributions.explosive
   };
   t.powerContributionPoints=contributions;
   t.powerModelStatus=state.fullModel&&p.source!=='untrained_baseline_only'?
      'regularized_margin_plus_efficiency':'neutral_start_margin_baseline';
   t.powerMethod=t.powerModelStatus;
   t.powerEvidence=t.fbsGames<4?'low':t.fbsGames<8?'moderate':'season_sample';
   t.matchupCalibrationStatus=MODEL_V5.calibrated?'historically_calibrated':'uncalibrated';
 }
 v5percentiles(teams,'powerScore','powerScore');
 for(const t of teams)t.powerRank=t.powerScoreRank;
 // Original V4 raw "baselinePowerRank" still shown separately in diagnostics.
}
function predictMatchupV5(home,away,neutral=false){
 const edge=(home.powerPoints||0)-(away.powerPoints||0)+
     (neutral?0:MODEL_V5.params.homePoints);
 const p=MODEL_V5.calibrated?v5sigmoid(edge/MODEL_V5.params.logisticScale):null;
 return {homeEdgePoints:edge,winner:edge>=0?home.name:away.name,
   homeWinProbability:p,awayWinProbability:p===null?null:1-p,
   parameters:MODEL_V5.params,modelVersion:MODEL_V5.version,
   calibrated:MODEL_V5.calibrated};
}
