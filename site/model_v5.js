/* CFMI v5.7: opponent-quality-first Merit with pairwise-only H2H; independent
 * neutral-field Power retains historically selected scoring coefficients.
 * Preseason Power prior fades with opponent-weighted effective FBS evidence.
 * Legacy V4 features are read-only research inputs; V4 final rankings are unused.
 */
'use strict';
const MODEL_V5={
 version:'5.7.0',name:'CFMI V5.7 — schedule-aware earned Merit, independently calibrated Power',
 meritWeights:{record:.45,qualityResidual:.30,control:.25},
 // Anchored scales: fixed across weeks, not percentile re-ranking or tanh saturation.
 meritScale:{wabPoints:11.5,qualityPoints:10.5,qualityBase:30,dominancePoints:1.35},
 meritTieGap:0.35,
 meritPerformanceWeights:Object.freeze({margin:.55,control:.20,efficiency:.15,finishing:.07,discipline:.03}),
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
// Out-of-season 2024 FBS interconference residual fit (ridge lambda=3).
// 2025 selected a 25% shrinkage; 2026 used only for retrospective inspection.
// NOT a hardcoded Power Four bonus: source is actual cross-league margins
// after subtracting the pregame v5.4 predicted margin. Realigned/sparse
// groupings Pac-12 and Independents are excluded from correction.
const CFMI_POWER_CONTEXT=Object.freeze({
 version:'2024-crossconference-residual-v1',factor:0.25,
 residuals:Object.freeze({
  'ACC':4.128,'American Athletic':-3.428,'Big 12':-0.666,
  'Big Ten':0.549,'Conference USA':-2.686,'Mid-American':-5.302,
  'Mountain West':-0.918,'SEC':9.347,'Sun Belt':1.456,
  'Pac-12':0,'FBS Independents':0
 })
});
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
 // Game-level dominance is measured within the observed season snapshot only:
 // opponent and venue-adjusted margin + independent possession and play quality.
 // No game-state feature is ever used to predict that same game pre-kickoff.
 const byName=new Map(teams.map(t=>[t.name,t]));
 const leagueMean=field=>{
   const xs=teams.flatMap(t=>(t.advGames||[]).map(a=>a[field]).filter(Number.isFinite));
   return xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0;
 };
 const centers={off_ppa:leagueMean('off_ppa'),def_ppa:leagueMean('def_ppa'),
   off_finish_pp40:leagueMean('off_finish_pp40'),def_finish_pp40:leagueMean('def_finish_pp40')};
 const opponentMean=(opp,id,field)=>{
   const xs=(byName.get(opp)?.advGames||[]).filter(a=>String(a.id)!==String(id))
     .map(a=>a[field]).filter(Number.isFinite);
   return (xs.reduce((a,b)=>a+b,0)+2*centers[field])/(xs.length+2);
 };
 for(const t of teams){
   t.meritWeightedAchievement=0;
   t.recordTailProbability=t.games?v5PoissonBinomialTail(t.played.map(g=>g.expected),t.won):null;
   let qualityAchievement=0;
   let adjustedSum=0, dominanceSum=0, eligible=0, dominanceObserved=0;
   t.meritDominanceGames=[];
   const teamAdvanced=new Map((t.advGames||[]).map(a=>[String(a.id),a]));
   for(const g of t.played){
     // A strong-opponent win beats a weak-opponent win in the record component,
     // while a weak-opponent loss incurs the heavier expected-win penalty.
     // Ordinary WAB is preserved separately as an auditable supporting measure.
     const difficultyFactor=g.win?
       (.65+.90*(1-g.expected)):(.70+.70*g.expected);
     g.meritResultContribution=(g.win-g.expected)*difficultyFactor;
     t.meritWeightedAchievement+=g.meritResultContribution;
     // A signature is an actual FBS victory against a measured strong opponent.
     // Keep this source-anchored and approximately linear: the old tanh transform
     // erased most separation among schools with multiple quality wins.
     const hard=g.opFbs?v5sigmoid((g.opRating-(t._v5Benchmark??0))/5.5):0;
     const venueCredit=g.site==='A'?1.25:g.site==='N'?1.08:1;
     // Road premium is an explicit résumé preference, not an accidental
     // duplicate of benchmark difficulty; FCS wins receive no bonus.
     const achievement=g.win&&g.opFbs?
       v5clamp((.10+2.10*Math.pow(hard,1.3))*venueCredit,0,3):0;
     g.meritQualityContribution=achievement;
     qualityAchievement+=achievement;
     // FCS win by 60 earns zero extra margin recognition. A loss to an FCS
     // school is a meaningful bad result, handled predominantly by WAB.
     if(g.opFbs){
       adjustedSum+=g.adjustedMOV;eligible++;
       const a=teamAdvanced.get(String(g.id))||{};
       const margin=v5clamp(g.adjustedMOV,-30,30);
       const parts={margin};const weights=MODEL_V5.meritPerformanceWeights;
       if(Number.isFinite(a.possession_control_wp))
         parts.control=v5clamp((a.possession_control_wp-.5)*30+2*Math.tanh(g.opRating/14),-12,12);
       if(Number.isFinite(a.off_ppa)&&Number.isFinite(a.def_ppa)){
         const off=a.off_ppa+.60*(centers.def_ppa-opponentMean(g.op,g.id,'def_ppa'));
         const def=a.def_ppa+.60*(centers.off_ppa-opponentMean(g.op,g.id,'off_ppa'));
         parts.efficiency=v5clamp((off-def)*7,-10,10);
       }
       if(Number.isFinite(a.off_finish_pp40)&&Number.isFinite(a.def_finish_pp40)){
         const off=a.off_finish_pp40+.50*(centers.def_finish_pp40-opponentMean(g.op,g.id,'def_finish_pp40'));
         const def=a.def_finish_pp40+.50*(centers.off_finish_pp40-opponentMean(g.op,g.id,'off_finish_pp40'));
         parts.finishing=v5clamp((off-def)*2,-8,8);
       }
       let clean=0,cleanMeasured=false;
       if(Number.isFinite(a.expected_turnover_margin)){clean+=1.6*v5clamp(a.expected_turnover_margin,-3,3);cleanMeasured=true;}
       if(Number.isFinite(a.penalty_yards)&&Number.isFinite(a.opp_penalty_yards)){
         clean+=.025*v5clamp(a.opp_penalty_yards-a.penalty_yards,-100,100);cleanMeasured=true;
       }
       if(cleanMeasured)parts.discipline=v5clamp(clean,-7,7);
       // Missing metrics fall back to neutral margin evidence; they never
       // silently become a perfect or zero observed football performance.
       let dominance=weights.margin*margin;
       for(const key of ['control','efficiency','finishing','discipline'])
         dominance+=weights[key]*(Number.isFinite(parts[key])?parts[key]:margin);
       if(Object.keys(parts).length>1)dominanceObserved++;
       // Win-margin adjustments alone leave too much easy-schedule dominance.
       // A big performance against a strong FBS opponent is more informative;
       // discount the same output against weak opponents, and do not discount
       // poor performances when the opponent is weak.
       const opponentFactor=dominance>=0?
         (.57+.90*hard):(1.12-.17*hard);
       const weightedDominance=v5clamp(dominance*opponentFactor,-30,30);
       dominanceSum+=weightedDominance;
       t.meritDominanceGames.push({gameId:String(g.id),opponent:g.op,
         opponentAdjustedMargin:margin,dominance:weightedDominance,
         rawDominance:dominance,opponentFactor,measured:Object.keys(parts).filter(x=>x!=='margin')});
     }
   }
   t.meritRecordScore=v5clamp(50+MODEL_V5.meritScale.wabPoints*t.meritWeightedAchievement,0,100);
   rawQuality.set(t.name,qualityAchievement);
   t.meritRawQuality=qualityAchievement;
   t.meritMarginRaw=eligible?adjustedSum/eligible:0;
   t.meritDominanceRaw=eligible?dominanceSum/eligible:0;
   t.meritDominanceCoverage=eligible?dominanceObserved/eligible:0;
   // This deliberately excludes FCS blowouts, and uses opponent quality and
   // site-adjusted margins; capped game MOV already discounts huge blowouts.
   t.mov=t.meritMarginRaw;
   const evidence=eligible/(eligible+1.7);
   t.meritControlScore=v5clamp(50+MODEL_V5.meritScale.dominancePoints*t.meritDominanceRaw*evidence,0,100);
   t.meritPerformanceScore=t.meritControlScore;
 }
 // FBS signature-win quality is linear until the 100-point ceiling, with a
 // fixed early-evidence shrink. Weak opponents carry only a small increment.
 // No team-relative percentiles, tanh, brand or conference label is used.
 for(const t of teams){
   t.meritQualityResidual=rawQuality.get(t.name);
   const shrink=t.fbsGames/(t.fbsGames+1);
   t.meritQualityScore=v5clamp(MODEL_V5.meritScale.qualityBase+
       MODEL_V5.meritScale.qualityPoints*t.meritQualityResidual*shrink,0,100);
   t.sor=t.meritRecordScore;
   t.qualityComponent=t.meritQualityScore;
   const m=MODEL_V5.meritWeights;
   // Poor FCS results are adverse evidence; blowouts over FCS do not earn bonus.
   const fcs=t.played.filter(g=>!g.opFbs);
   t.meritFcsPerformancePenalty=v5clamp(fcs.reduce((sum,g)=>
     sum+(g.win?-Math.min(3.5,Math.max(0,17-g.margin)*.25):-4),0),-5,0);
   t.score=m.record*t.meritRecordScore+
       m.qualityResidual*t.meritQualityScore+m.control*t.meritControlScore+
       t.meritFcsPerformancePenalty;
   t.meritScore=t.score;
 }
 // Head-to-head NEVER modifies Merit points. Keep factual direct results
 // solely for close-score pairwise explanation/rank resolution.
 for(const t of teams){
   t.meritScoreBeforeH2H=t.score;
   t.meritHeadToHeadAdjustment=0;
   t.meritHeadToHeadReasons=t.fbsG.map(g=>({
     opponent:g.op,won:!!g.win,gameId:String(g.id)
   }));
 }
 // A one-game or two-game résumé is not a credible national ranking.
 // Keep internal ordering for research; show 'Provisional' publicly until
 // the FBS median reaches four games, or this team has fewer than three.
 const fbsCounts=teams.map(t=>t.fbsGames).sort((a,b)=>a-b);
 const nationalMedian=fbsCounts[Math.floor(fbsCounts.length/2)]||0;
 const provisionalSeason=nationalMedian<4;
 for(const t of teams){
   t.meritEvidenceGames=t.fbsGames;
   t.meritProvisional=provisionalSeason||t.fbsGames<3;
   t.meritEvidenceStatus=t.meritProvisional?'provisional':'sufficient';
 }
 v5percentiles(teams,'sor');v5percentiles(teams,'qualityComponent');
 v5percentiles(teams,'meritControlScore');v5percentiles(teams,'mov');
 teams.sort((a,b)=>b.score-a.score||b.meritWeightedAchievement-a.meritWeightedAchievement||a.name.localeCompare(b.name));
 // Only adjacent, nearly identical scores may be reordered by their own
 // actual direct game. This does not transfer credit to unrelated teams.
 for(let i=1;i<teams.length;i++){
   const higher=teams[i-1],lower=teams[i];
   if(higher.score-lower.score>MODEL_V5.meritTieGap)continue;
   const head=lower.fbsG.filter(g=>g.op===higher.name);
   if(head.length===1&&head[0].win){
     teams[i-1]=lower;teams[i]=higher;
   }
 }
 teams.forEach((t,i)=>{t.rank=i+1;t.meritPublishedRank=t.meritProvisional?null:t.rank;});

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
   // Descriptive strength-of-evidence is kept separate from predicted strength.
   // This is NOT a calibrated statistical confidence interval.
   t.powerEvidenceEffectiveGames=t.fbsG.reduce((sum,g)=>{
     const rating=byName.get(g.op)?.power;
     return sum+(.35+.65*v5sigmoid((Number.isFinite(rating)?rating:0)/8));
   },0);
   t.powerEvidence=t.powerEvidenceEffectiveGames<2.5?'limited':
      t.powerEvidenceEffectiveGames<5?'developing':'broad';
   t.matchupCalibrationStatus=MODEL_V5.calibrated?'historically_calibrated':'uncalibrated';
 }

 // Empirically selected opponent-network mode. All eight advanced diagnostics
 // remain visible, but game-to-game forecast contributions come from a
 // simultaneously estimated offense-vs-defense model and separately trained
 // residual schedule reliability. Do not simply reward a Power Four label.
 // The old V5 powerPoints (computed immediately above) is a reference used
 // ONLY to quantify how much high reported strength is poorly supported.
 if(p.mode==='joint_opponent_network'){
   if(typeof solveOpponentNetworkEfficiency!=='function')
      throw Error('Required opponent-network solver was not loaded');
   const network=solveOpponentNetworkEfficiency(teams);
   const c=Array.isArray(p.jointCoefficients)&&p.jointCoefficients.length===6?
       p.jointCoefficients:null;
   if(!c||!c.every(x=>Number.isFinite(x)&&x>=0&&x<=8))
       throw Error('Opponent adjustment parameter set is missing or malformed');
   for(const t of teams){
     const metrics=network.get(t.name)||{};
     const rawPower=t.powerPoints;
     const schedule=Number.isFinite(t.sos)?t.sos:0;
     const supportRisk=Math.max(0,rawPower)*Math.min(1.6,Math.max(0,-schedule)/8);
     const fcsGames=t.played.filter(g=>!g.opFbs);
     const fcsPenalty=fcsGames.reduce((v,g)=>
         v+Math.min(30,Math.max(0,14-g.margin)),0)/(fcsGames.length+1.5);
     const components={
       baseline:(Number.isFinite(p.baseScale)?p.baseScale:1)*(t.power||0),
       epa:c[0]*((metrics.epa||0)/.10),
       success:c[1]*((metrics.success||0)/.05),
       explosive:c[2]*((metrics.explosive||0)/.03),
       schedule:c[3]*(schedule/4),
       scheduleReliability:-c[4]*(supportRisk/5),
       fcsEvidence:-c[5]*(fcsPenalty/6),
       finishing:0,consistency:0,control:0,offense:0,defense:0
     };
     t.powerPoints=Object.values(components).reduce((sum,x)=>sum+x,0);
     t.powerScore=v5clamp(50+MODEL_V5.powerScale.indexPointsPerExpectedMarginPoint*t.powerPoints,0,100);
     t.powerContributionPoints=components;
     t.powerComponents={
       baseline:v5clamp(50+1.6*components.baseline,0,100),
       ppa:components.epa,success:components.success,explosive:components.explosive,
       schedule:components.schedule,
       support:components.scheduleReliability,
       fcs:components.fcsEvidence
     };
     t.opponentAdjustedNetwork=metrics;
     t.powerOpponentSupportRisk=supportRisk;
     t.powerFcsUnderperformance=fcsPenalty;
     t.powerRawV51Points=rawPower;
     t.powerMode='opponent_network';
     t.powerMethod='joint FBS offense-defense opponent adjustment + schedule support + FCS underperformance';
     t.powerModelStatus='opponent_network_adjusted';
   }
 }
 // Preseason evidence fades based on the amount and quality of evidence.
 if(typeof MODEL_PRESEASON_V53!=='undefined'&&MODEL_PRESEASON_V53.enabled)
   MODEL_PRESEASON_V53.apply(teams);
 // The current-season empirical conference context activates only after
 // a team's first completed FBS game. Week 0 is purely roster/continuity.
 // The fit season (2024) never receives its own fitted correction.
 for(const t of teams){
   const eligible=typeof MODEL_PRESEASON_V53!=='undefined'&&MODEL_PRESEASON_V53.enabled&&t.fbsGames>=1;
   const correction=eligible?CFMI_POWER_CONTEXT.factor*(CFMI_POWER_CONTEXT.residuals[t.conference]||0):0;
   t.powerConferenceCalibration=correction;
   t.powerConferenceCalibrationVersion=CFMI_POWER_CONTEXT.version;
   t.powerPoints+=correction;
   t.powerScore=v5clamp(50+MODEL_V5.powerScale.indexPointsPerExpectedMarginPoint*t.powerPoints,0,100);
   t.powerContributionPoints={...t.powerContributionPoints,conferenceContext:correction};
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
