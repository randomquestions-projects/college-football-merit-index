#!/usr/bin/env node
'use strict';
/*
 * Promote a historical opponent-strength research candidate only if supported
 * by 2025 walk-forward evaluation against frozen V5.1. Do not select based
 * on how Liberty/New Mexico rank or on 2026 performance.
 * 2025 has already been used to select earlier models; this is incremental
 * retrospective research, not a pristine final holdout.
 */
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const dir=path.join(__dirname,'../site/data');
const file=path.join(dir,'model_v5_params.json');
const previous=JSON.parse(fs.readFileSync(file,'utf8'));
const study=JSON.parse(fs.readFileSync(path.join(dir,'opponent_joint_research_2026.json'),'utf8'));
assert.equal(previous.version,'5.1.0');
assert.equal(study.training,2024);assert.equal(study.validation,2025);
const baseline=study.metrics[2025].current;
const candidate=study.metrics[2025].jointPlusSchedule;
const candidate2026=study.metrics[2026].jointPlusSchedule;
const reference2026=study.metrics[2026].current;
const c=study.coefficients.full;
assert(Array.isArray(c)&&c.length===6&&c.every(x=>Number.isFinite(x)&&x>=0&&x<=8));
assert.equal(candidate.games,baseline.games);
assert(candidate.games>=400&&study.metrics[2024].current.games>=400);
const meetsEvidence=
 candidate.logLoss<baseline.logLoss-.0005 &&
 candidate.accuracy>=baseline.accuracy-.005 &&
 candidate.marginMAE<=baseline.marginMAE+.08 &&
 candidate.brier<baseline.brier;
const parameters={
 ...previous.parameters,
 mode:meetsEvidence?'joint_opponent_network':'validated_v5_reference',
 jointCoefficients:meetsEvidence?c:[0,0,0,0,0,0],
 logisticScale:meetsEvidence?study.calibration.full.scale:previous.parameters.logisticScale,
 source:meetsEvidence?'2024_trained_joint_opponent_network_2025_selected':'validated_v5_reference',
 trainedOn:[2024],validatedOn:[2025],
 freeze2026AsOutOfTraining:true,
 opponentNetworkRidge:3.5,
 opponentScale:'point-margin-vs-league-average',
 fcsRule:'No FCS blowout bonus; only shrunken negative evidence when an FBS team wins by less than 14 or loses'
};
const promoted={
 ...previous,
 version:'5.2.0',
 modelName:'CFMI V5.2 independently inferred opponent-strength Power',
 deployedCandidate:parameters.mode,
 parameters,
 selectionReason:meetsEvidence?
  'Joint offense-defense opponent adjustment with schedule support and FCS underperformance lowered 2025 log loss and Brier without meaningfully harming margin error or winner accuracy.' :
  'Continue V5.1 coefficients: opponent-network candidate did not meet model-selection evidence gates.',
 validation:{
  ...previous.validation,
  opponentStrengthComparison:{
   training:2024,validation:2025,selectionNotIndependent:'2025 reused in previous model selection.',
   selected:meetsEvidence,
   source:'site/data/opponent_joint_research_2026.json',
   candidates:{
    current2025:baseline,network2025:study.metrics[2025].joint,
    networkPlusOpponent2025:candidate,
    current2026:reference2026,networkPlusOpponent2026:candidate2026,
    current2024:study.metrics[2024].current,
    networkPlusOpponent2024:study.metrics[2024].jointPlusSchedule
   },
   fittedCoefficients:c,
   validationCaveats:[
    'No conference membership, recruiting, polls, published power rankings, or preseason team talent priors used.',
    '2025 is reused for selection and therefore cannot be reported as a pristine final holdout.',
    '2026 is out-of-training exploratory evidence, not used in the selection rule or coefficient fitting.',
    'Small performance gains may not survive additional seasons.'
   ]
  }
 },
 caveats:[...(previous.caveats||[]),
  'V5.2 opp-network recalibration is a retrospective incremental upgrade, not guaranteed predictive superiority.',
  'Opponent statistics are adjusted jointly from completed-season game-network evidence; sparse schedule links create uncertainty.',
  'FBS blowouts over FCS yield no extra Power credit, while unusually close FCS games contribute bounded negative evidence.'
 ]
};
fs.writeFileSync(file,JSON.stringify(promoted,null,2)+'\n');
fs.writeFileSync(path.join(dir,'backtest_v5.json'),JSON.stringify(promoted,null,2)+'\n');
console.log('CFMI OPPONENT NETWORK SELECTION',JSON.stringify({
 selected:meetsEvidence,productionMode:parameters.mode,
 baseline2025:baseline,candidate2025:candidate,
 baseline2026:reference2026,candidate2026,
 coefficients:c,calibration:parameters.logisticScale,
 transparency:'2025 reused for model selection; 2026 not fitted'
},null,2));
