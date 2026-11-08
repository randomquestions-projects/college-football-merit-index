/* CFMI V5: earned-resume Merit and points-scale predictive Power.
 * Season-only. No AP, CFP, FPI, SP+, FEI, recruiting, preseason or conference
 * indicators enter either rating. Opponent context is inferred from games.
 * Version parameters are fitted using PRIOR seasons only (see train_v5.cjs).
 */
'use strict';
const MODEL_V5={
 version:'5.1.0',name:'CFMI V5.1 — explicit earned resume and multi-dimensional predictive Power',
 meritWeights:{record:.55,qualityResidual:.25,control:.20},
 meritScale:{wabPoints:12,qualityPoints:20,controlAmplitude:32,controlMarginScale:16},
 powerScale:{indexPointsPerExpectedMarginPoint:1.6},
 calibrated:false,validation:null,
 params:{epa:0,success:0,explosive:0,finishing:0,consistency:0,control:0,offense:0,defense:0,homePoints:2.5,logisticScale:12,
   source:'untrained_baseline_only',trainedOn:[],validatedOn:[]},
 setParameters(doc){
   const p=doc?.parameters||doc;
   if(!p||!['epa','success','explosive','finishing','consistency','control','offense','defense','homePoints','logisticScale'].every(k=>Number.isFinite(p[k])))return false;
   if(Math.abs(p.epa)>60||Math.abs(p.success)>100||Math.abs(p.explosive)>200||
       ['finishing','consistency','control','offense','defense'].some(k=>Math.abs(p[k])>200)||
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
// Source features and normalizations are shared by the browser, historical
// snapshot generator and walk-forward trainer to prevent training/serving skew.
// Per-team values are leave-game-out opponent-adjusted by attachEfficiencyV4.
const V5_POWER_FACTORS=Object.freeze([
 {key:'epa',field:'ppaNet',scale:.10,cap:.70,advanced:true},
 {key:'success',field:'successNet',scale:.05,cap:.22,advanced:true},
 {key:'explosive',field:'explosiveNet',scale:.03,cap:.13,advanced:true},
 {key:'finishing',field:'redzoneNet',scale:1,cap:3,advanced:true},
 {key:'consistency',field:'consistencyScore',scale:20,cap:50,advanced:true},
 {key:'control',field:'control',scale:.15,cap:.45,advanced:true},
 {key:'offense',field:'off',scale:4,cap:22,advanced:false},
 {key:'defense',field:'def',scale:4,cap:22,advanced:false}
]);
function v5PowerSignals(teams,advancedAvailable){
 const centers={};
 for(const f of V5_POWER_FACTORS){
   const valid=teams.filter(t=>Number.isFinite(t[f.field]) &&
     (!f.advanced||(f.field==='consistencyScore'?t.advMetricCounts?.ppaNet>0:t.advMetricCounts?.[f.field]>0)));
   centers[f.key]=valid.length?valid.reduce((z,t)=>z+t[f.field],0)/valid.length:0;
 }
 const out=new Map();
 for(const t of teams){
   const factors={};
   for(const f of V5_POWER_FACTORS){
     const coverage=f.advanced?(t.advMetricCoverage?.[f.field]||0):(t.fbsGames>0?1:0);
     const active=!f.advanced||advancedAvailable;
     const raw=active&&Number.isFinite(t[f.field])?
       v5clamp((t[f.field]-centers[f.key])*coverage,-f.cap,f.cap):0;
     factors[f.key]=raw/f.scale; // one unit is a representative signal change.
   }
   out.set(t.name,factors);
 }
 return out;
}

function computeV5(rows,cutoffMode,seasonYear=2026){
 const original=computeV4(rows,cutoffMode,seasonYear);
 for(const t of original.teams)t._v5Benchmark=original.bench;
 return {...original,modelVersion:MODEL_V5.version};
}
function attachEfficiencyV5(teams,advRows){
 attachEfficiencyV4(teams,advRows);
 const withGames=teams.filter(t=>t.games>0);
 // Merit explicitly awards accomplished wins, especially quality/road wins, and
 // recognizes an opponent-adjusted convincing win. Outcomes remain the majority.
 // FCS blowout margins do not count as proof of superiority.
 const rawQuality=new Map();
 for(const t of teams){
   t.meritRecordScore=v5clamp(50+MODEL_V5.meritScale.wabPoints*t.wab,0,100);
   t.recordTailProbability=t.games?v5PoissonBinomialTail(t.played.map(g=>g.expected),t.won):null;
   let qualityAchievement=0;
   let adjustedSum=0, eligible=0;
   for(const g of t.played){
     g.meritResultContribution=g.win-g.expected;
     const hard=g.opFbs?v5sigmoid((g.opRating-(t._v5Benchmark??0))/7.5):0;
     // Strong opponents matter disproportionately; ordinary FBS wins have
     // only small extra signature credit beyond wins above benchmark.
     const opponentCredit=g.opFbs?v5clamp(.10+1.10*hard,0,1.25):0;
     // Road and neutral difficulty already contributes through WAB; a small,
     // deliberately explicit earned-road-win bonus is an additional preference.
     const site=g.site==='A'?1.20:g.site==='N'?1.08:1;
     // Only actual wins earn positive signature credit. Losses to good teams
     // receive no "quality-loss bonus"; WAB already accounts for difficulty.
     const achievement=g.win?opponentCredit*site*(.75+.25*(1-g.expected)):0;
     g.meritQualityContribution=achievement;
     qualityAchievement+=achievement;
     // FCS win by 60 earns zero extra margin recognition. A loss to an FCS
     // school is a meaningful bad result, handled predominantly by WAB.
     if(g.opFbs){adjustedSum+=g.adjustedMOV;eligible++;}
   }
   rawQuality.set(t.name,qualityAchievement);
   t.meritRawQuality=qualityAchievement;
   t.meritMarginRaw=eligible?adjustedSum/eligible:0;
   // This deliberately excludes FCS blowouts, and uses opponent quality and
   // site-adjusted margins; capped game MOV already discounts huge blowouts.
   t.mov=t.meritMarginRaw;
   const evidence=eligible/(eligible+1.7);
   t.meritControlScore=v5clamp(50+MODEL_V5.meritScale.controlAmplitude*
       Math.tanh(t.meritMarginRaw/MODEL_V5.meritScale.controlMarginScale)*evidence,0,100);
 }
 // This component is a transparent achievement bonus rather than a second
 // estimate of expected wins: only actual FBS wins against strong opponents
 // earn extra credit. The saturating transform avoids a few marquee wins
 // overwhelming the complete season-long results record.
 for(const t of teams){
   t.meritQualityResidual=rawQuality.get(t.name);
   const shrink=t.fbsGames/(t.fbsGames+1.5);
   t.meritQualityScore=v5clamp(50+MODEL_V5.meritScale.qualityPoints*
       Math.tanh(t.meritQualityResidual/2.8)*shrink,0,100);
   t.sor=t.meritRecordScore;
   t.qualityComponent=t.meritQualityScore;
   const m=MODEL_V5.meritWeights;
   t.score=m.record*t.meritRecordScore+
       m.qualityResidual*t.meritQualityScore+m.control*t.meritControlScore;
   t.meritScore=t.score;
 }
 v5percentiles(teams,'sor');v5percentiles(teams,'qualityComponent');
 v5percentiles(teams,'meritControlScore');v5percentiles(teams,'mov');
 teams.sort((a,b)=>b.score-a.score||b.wab-a.wab||a.name.localeCompare(b.name));
 teams.forEach((t,i)=>t.rank=i+1);

 // Power considers the complete sustainable performance profile, but every
 // effect is shrunken, adjusted against the opponents actually faced, and
 // fitted on future game margins using previous-season data ONLY.
 // Offense/defense scoring form independent unit-level diagnostics; their fitted
 // incremental contributions must beat what the baseline already knows.
 const p=MODEL_V5.params;
 const features=v5PowerSignals(teams,state.fullModel);
 for(const t of teams){
   const signals=features.get(t.name);
   t.powerSignals=signals;
   const b=Number.isFinite(t.power)?t.power:0;
   const components={
      baseline:(Number.isFinite(p.baseScale)?p.baseScale:1)*b
   };
   for(const f of V5_POWER_FACTORS)components[f.key]=(p[f.key]||0)*signals[f.key];
   const advanced=V5_POWER_FACTORS.reduce((sum,f)=>sum+components[f.key],0);
   // Guard against one anomalous advanced metric overwhelming performance.
   const correction=v5clamp(advanced,-10,10);
   t.powerPoints=components.baseline+correction;
   t.powerScore=v5clamp(50+MODEL_V5.powerScale.indexPointsPerExpectedMarginPoint*t.powerPoints,0,100);
   t.powerComponents={baseline:v5clamp(50+1.6*components.baseline,0,100),
      ppa:components.epa,success:components.success,explosive:components.explosive,
      finishing:components.finishing,consistency:components.consistency,
      control:components.control,offense:components.offense,defense:components.defense};
   t.powerContributionPoints=components;
   t.powerModelStatus=state.fullModel&&p.source!=='untrained_baseline_only'?
       'regularized_margin_plus_full_spectrum_performance':'neutral_start_margin_baseline';
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
