/* CFMI V5.3 experimental prior overlay: independent of Merit.
 * The points-scale power prior is constructed before the season. The only
 * dynamic state is completed FBS games: no future outcomes are inputs.
 */
'use strict';
const MODEL_PRESEASON_V53={
 version:'5.3-research-v1',
 enabled:false,
 data:null,
 load(doc){
  if(!doc||doc.version!==this.version||doc.season!==2026||!doc.teams||
     !Array.isArray(doc.decayByCompletedFbsGames)||doc.decayByCompletedFbsGames.length<6)throw Error('Invalid prior document header '+JSON.stringify({version:doc?.version,expected:this.version,season:doc?.season,decay:doc?.decayByCompletedFbsGames}));
  if(Object.keys(doc.teams).length<125)throw Error('Too few preseason teams: '+Object.keys(doc.teams).length);
  for(const [name,t] of Object.entries(doc.teams)){
    if(!name||!Number.isFinite(t.priorPoints)||!Number.isFinite(t.talentIndex))throw Error('Invalid preseason rating '+name+' '+JSON.stringify({points:t.priorPoints,talent:t.talentIndex}));
  }
  this.data=doc;this.enabled=true;return true;
 },
 weight(n){
  if(!this.enabled)return 0;
  const xs=this.data.decayByCompletedFbsGames;
  return xs[Math.min(xs.length-1,Math.max(0,Math.floor(n||0)))];
 },
 apply(teams){
  if(!this.enabled)return;
  const scoreMult=typeof MODEL_V5!=='undefined'?MODEL_V5.powerScale.indexPointsPerExpectedMarginPoint:1.6;
  for(const t of teams){
    const r=this.data.teams[t.name];
    if(!r)continue;
    const weight=this.weight(t.fbsGames);
    const base=Number.isFinite(t.powerPoints)?t.powerPoints:0;
    const change=weight*(r.priorPoints-base);
    t.powerPoints=base+change;
    t.powerScore=Math.max(0,Math.min(100,50+scoreMult*t.powerPoints));
    t.preseasonPriorPoints=r.priorPoints;
    t.preseasonPriorWeight=weight;
    t.preseasonTalentIndex=r.talentIndex;
    t.preseasonTalentRank=r.talentRank;
    t.preseasonRosterCoverage=r.sourceCoverage;
    t.preseasonImputedTalent=r.imputedTalent;
    t.preseasonPreviousPower=r.components.lastYearPowerRaw;
    t.preseasonReturningProduction=r.components.returningOverall;
    t.preseasonTransferPercentile=r.components.transferNetPercentile;
    t.preseasonCoachingStatus=r.coaching||'unverified';
    t.powerWithoutPreseason=base;
    t.powerContributionPoints={...t.powerContributionPoints,preseasonPriorAdjustment:change};
    t.powerMethod=(t.powerMethod||'Opponent adjusted')+(weight>0?' · early-season talent/continuity prior':'');
    t.powerModelStatus=weight>0?'opponent_network_plus_preseason_prior':'opponent_network_adjusted';
  }
  // This rank update is required: indices/ranks, head-to-head probabilities
  // and historical as-of views must all use the same final Power values.
  const sorted=teams.slice().sort((a,b)=>b.powerPoints-a.powerPoints||a.name.localeCompare(b.name));
  sorted.forEach((t,i)=>{t.powerRank=i+1;t.powerScoreRank=i+1});
 }
};
