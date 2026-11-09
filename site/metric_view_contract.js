/* CFMI v6 presentation contract, backed by v5.5 scoring.
 * This module contains NO ranking coefficients and changes NO scoring.
 * Legacy V4 fields remain in the research objects, never in this public contract.
 * All active values are taken from the scoring model and validated before rendering.
 */
'use strict';
const CFMI_PUBLIC_VIEW = Object.freeze({
 schemaVersion:'6.0.0',
 scoringVersion:'5.5.0',
 sourceDefinitions:Object.freeze({
   meritRecord:{field:'meritRecordScore',kind:'active',origin:'model_v5.js:attachEfficiencyV5',unit:'0–100 subscore'},
   meritQuality:{field:'meritQualityScore',kind:'active',origin:'model_v5.js:attachEfficiencyV5',unit:'0–100 subscore'},
   meritMargin:{field:'meritControlScore',kind:'active',origin:'model_v5.js:attachEfficiencyV5',unit:'0–100 subscore'},
   meritH2H:{field:'meritHeadToHeadAdjustment',kind:'active',origin:'model_v5.js:attachEfficiencyV5',unit:'Merit points'},
   meritFCS:{field:'meritFcsPerformancePenalty',kind:'active',origin:'model_v5.js:attachEfficiencyV5',unit:'Merit points'},
   opponentStrength:{field:'opRating',kind:'supporting',origin:'model_v4.js:computeV4',unit:'baseline neutral points'},
   gameWinQuality:{field:'meritQualityContribution',kind:'active',origin:'model_v5.js:attachEfficiencyV5',unit:'raw signature-win units'},
   gameRecordAchievement:{field:'meritResultContribution',kind:'active',origin:'model_v5.js:attachEfficiencyV5',unit:'win minus expected benchmark win'},
   gameAdjustedMargin:{field:'adjustedMOV',kind:'active',origin:'model_v5.js:attachEfficiencyV5',unit:'adjusted margin points'},
   powerPoints:{field:'powerPoints',kind:'active',origin:'model_v5.js:attachEfficiencyV5',unit:'neutral-field points'},
   powerBreakdown:{field:'powerContributionPoints',kind:'active',origin:'model_v5.js:attachEfficiencyV5',unit:'neutral-field points'},
   preseasonPrior:{field:'preseasonPriorWeight',kind:'active',origin:'preseason_prior_v1.js',unit:'fraction'},
   coreEPA:{field:'ppaNet',kind:'supporting',origin:'model_v4.js:attachEfficiencyV4',unit:'net EPA/play'},
   legacyQ:{field:'q',kind:'legacy-excluded',origin:'model_v4.js:computeV4',unit:'obsolete diagnostic'},
   legacyGamePerformance:{field:'qualityScore',kind:'legacy-excluded',origin:'model_v4.js:computeV4',unit:'obsolete diagnostic'}
 }),
 n(v){return typeof v==='number'&&Number.isFinite(v)},
 fail(label){throw Error('CFMI_PUBLIC_VIEW invalid: '+label)},
 assertTeam(team){
   if(!team||typeof team.name!=='string'||!team.name)this.fail('missing team identity');
   for(const f of ['score','powerScore','powerPoints','meritRecordScore','meritQualityScore','meritControlScore','meritHeadToHeadAdjustment','meritFcsPerformancePenalty','fbsGames','won','lost','rank','powerRank'])
     if(!this.n(team[f]))this.fail(team.name+': missing active '+f);
   const w=typeof MODEL_V5==='object'?MODEL_V5.meritWeights:{record:.55,qualityResidual:.25,control:.20};
   const sum=w.record*team.meritRecordScore+w.qualityResidual*team.meritQualityScore+
     w.control*team.meritControlScore+team.meritHeadToHeadAdjustment+team.meritFcsPerformancePenalty;
   if(Math.abs(sum-team.score)>1e-6)this.fail(team.name+': Merit does not reconcile');
   const powerEntries=Object.values(team.powerContributionPoints||{});
   if(!powerEntries.length||!powerEntries.every(this.n))this.fail(team.name+': power components missing or invalid');
   const p=powerEntries.reduce((a,b)=>a+b,0);
   if(Math.abs(p-team.powerPoints)>1e-6)this.fail(team.name+': Power does not reconcile');
   if(!Array.isArray(team.played))this.fail(team.name+': missing game ledger');
   const gameIds=new Set();
   for(const g of team.played){
     if(!g.id||gameIds.has(String(g.id)))this.fail(team.name+': duplicate/invalid game ID '+g.id);
     gameIds.add(String(g.id));
     for(const f of ['margin','adjustedMOV','expected','meritResultContribution','meritQualityContribution'])
       if(!this.n(g[f]))this.fail(team.name+': '+g.id+' missing '+f);
     if(g.win&&g.opFbs&&g.meritQualityContribution<0)this.fail(team.name+': negative win credit');
     if((!g.win||!g.opFbs)&&Math.abs(g.meritQualityContribution)>1e-8)
       this.fail(team.name+': quality win credit awarded to non-FBS win');
     if(Math.abs(g.meritResultContribution-(g.win-g.expected))>1e-8)
       this.fail(team.name+': result achievement mismatch '+g.id);
   }
   const raw=team.played.reduce((s,g)=>s+g.meritQualityContribution,0);
   if(Math.abs(raw-(team.meritRawQuality||0))>1e-6)this.fail(team.name+': quality-win sum mismatch');
   if(team.meritProvisional && team.meritPublishedRank!==null)this.fail(team.name+': published an unearned rank');
   if(!team.meritProvisional && team.meritPublishedRank!==team.rank)this.fail(team.name+': published rank disagrees with model');
   return true;
 },
 safeNumber(v){return this.n(v)?v:null},
 buildTeam(t){
   this.assertTeam(t);
   const w=MODEL_V5.meritWeights;
   const componentScore={
     record:w.record*t.meritRecordScore,
     quality:w.qualityResidual*t.meritQualityScore,
     adjustedMargin:w.control*t.meritControlScore,
     headToHead:t.meritHeadToHeadAdjustment,
     fcsPerformance:t.meritFcsPerformancePenalty
   };
   const qualityUplift=w.qualityResidual*(t.meritQualityScore-50);
   const view={
     model:'CFMI-v5.5',schema:this.schemaVersion,team:t.name,conference:t.conference,
     record:{wins:t.won,losses:t.lost,fbsGames:t.fbsGames,games:t.games},
     merit:{
       score:t.score,publishedRank:t.meritPublishedRank,provisional:!!t.meritProvisional,
       internalResearchRank:t.rank,componentScore,
       componentInputs:{record:t.meritRecordScore,quality:t.meritQualityScore,adjustedMargin:t.meritControlScore},
       adjustmentDetail:{headToHeadCap:3,fcsPenaltyFloor:-5,qualityAggregation:'Saturated sum with shrinkage; individual game raw signature units do not add directly to total Merit points'},
       qualityRaw:t.meritRawQuality,qualityUplift,
       headToHeadResults:(t.meritHeadToHeadReasons||[]).map(x=>({opponent:x.opponent,won:!!x.won,gameId:String(x.gameId)})),
       wab:t.wab,sos:t.sos,adjustedMarginRaw:t.meritMarginRaw
     },
     power:{
       score:t.powerScore,rank:t.powerRank,neutralPoints:t.powerPoints,
       components:Object.fromEntries(Object.entries(t.powerContributionPoints).filter(([,v])=>this.n(v))),
       preseasonWeight:this.safeNumber(t.preseasonPriorWeight),
       effectiveGames:this.safeNumber(t.preseasonEffectiveGames),
       priorPoints:this.safeNumber(t.preseasonPriorPoints),
       evidence:t.powerEvidence||'unverified',
       conferenceCalibration:this.safeNumber(t.powerConferenceCalibration)
     },
     diagnostics:{
       opponentBaselinePoints:this.safeNumber(t.power),baselineRank:this.safeNumber(t.baselinePowerRank),
       srsPoints:this.safeNumber(t.rating),elo:this.safeNumber(t.elo),
       offScoring:this.safeNumber(t.off),defScoring:this.safeNumber(t.def),
       netEPA:this.safeNumber(t.ppaNet),netSuccess:this.safeNumber(t.successNet),
       netExplosive:this.safeNumber(t.explosiveNet),possessionControl:this.safeNumber(t.control),
       finishing:this.safeNumber(t.redzoneNet),turnoverNet:this.safeNumber(t.turnoverNet),
       penaltyNet:this.safeNumber(t.penaltyNet),
       opponentAdjustedNetwork:t.opponentAdjustedNetwork||null
     },
     coverage:{
       coreGames:t.advCoreGames||0,eligibleGames:t.fbsGames,
       pbpGames:t.advPbpGames||0,validShare:this.safeNumber(t.advCoverage)
     }
   };
   return view;
 },
 buildGame(t,g){
   if(!g)return this.fail('missing game');
   const signatureUnits=g.meritQualityContribution;
   const extra=(t.advGames||[]).find(x=>String(x.id)===String(g.id));
   const signatureUplift=t.meritRawQuality>0?
     (.25*(t.meritQualityScore-50))*signatureUnits/t.meritRawQuality:0;
   return {
     id:String(g.id),opponent:g.op,isFbs:!!g.opFbs,site:g.site,
     win:!!g.win,loss:!!g.loss,scored:g.pf,conceded:g.pa,
     gameDate:g.date,
     opponentSeasonBaselineRank:this.safeNumber(g.oppRank),
     opponentSeasonBaselineStrength:this.safeNumber(g.opRating),
     opponentStrengthProvenance:'Season-to-date opponent SRS/Elo, includes games played through snapshot (not an independent pregame estimate)',
     benchmarkExpectedWin:this.safeNumber(g.expected),
     resultAboveBenchmark:this.safeNumber(g.meritResultContribution),
     meritSignatureWinUnits:this.safeNumber(signatureUnits),
     allocatedMeritQualityUpliftPoints:this.safeNumber(signatureUplift),
     allocatedPointsMethod:'Proportional allocation of the current team quality-subscore uplift over neutral 50; allocations sum, not independent causal marginal values',
     adjustedMargin:this.safeNumber(g.adjustedMOV),
     diagnostics:{
       neutralStatePossessionWP:this.safeNumber(extra?.possession_control_wp),
       pointsPerScoringOpportunity:this.safeNumber(extra?.off_finish_pp40),
       coreEPAMeasured:this.n(extra?.off_ppa)&&this.n(extra?.def_ppa)
     }
   };
 },
 wins(t,limit=4,order='strength'){
   this.assertTeam(t);
   const xs=t.played.filter(g=>g.win&&g.opFbs).map(g=>this.buildGame(t,g));
   if(order==='signature')xs.sort((a,b)=>b.meritSignatureWinUnits-a.meritSignatureWinUnits||
     (a.opponentSeasonBaselineRank??9999)-(b.opponentSeasonBaselineRank??9999));
   else if(order==='performance')xs.sort((a,b)=>b.adjustedMargin-a.adjustedMargin);
   else xs.sort((a,b)=>(a.opponentSeasonBaselineRank??9999)-(b.opponentSeasonBaselineRank??9999)||
     b.meritSignatureWinUnits-a.meritSignatureWinUnits);
   return limit==null?xs:xs.slice(0,limit);
 },
 allGames(t){
   this.assertTeam(t);
   return t.played.map(g=>this.buildGame(t,g)).sort((a,b)=>String(b.gameDate).localeCompare(String(a.gameDate)));
 },
 assertUniverse(teams){
   if(!Array.isArray(teams)||teams.length<130)this.fail('incomplete FBS universe');
   const names=new Set();
   for(const team of teams){
     if(names.has(team.name))this.fail('duplicate school '+team.name);
     names.add(team.name);
     this.assertTeam(team);
   }
   return {schools:teams.length,scoringModel:this.scoringVersion,viewSchema:this.schemaVersion,allScoresReconciled:true};
 }
});