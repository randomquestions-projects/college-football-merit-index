#!/usr/bin/env node
'use strict';
/* v5.7 Merit: prove opponent quality, head-to-head neutrality, and unchanged Power. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..','site');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('index.html');
const inline=html.match(/<script>([\s\S]*?)<\/script>/i);
assert(inline,'Missing dashboard inline calculation');
const boundary=inline[1].indexOf('const submetric=');
assert(boundary>1500,'Unknown dashboard prelude');
const prelude=inline[1].slice(0,boundary);
const model=['model_v4.js','opponent_network_research.js','model_v5.js','preseason_prior_v1.js','metric_view_contract.js'].map(read).join('\n');
const run=new Function('csv','advancedCsv','params','prior',
 model+'\n'+prelude+'\n'+[
  'const rows=csvParse(csv),adv=csvParse(advancedCsv);',
  'if(!MODEL_V5.setParameters(params))throw Error("Power params");',
  'if(!MODEL_PRESEASON_V53.load(prior))throw Error("Preseason prior");',
  'const {teams}=computeV5(rows,Date.now(),2026);',
  'attachEfficiencyV5(teams,adv);',
  'const audit=CFMI_PUBLIC_VIEW.assertUniverse(teams);',
  'return {teams,audit,weights:MODEL_V5.meritWeights,tieGap:MODEL_V5.meritTieGap};'
 ].join('\n'));
const result=run(read('data/cfb_schedules_2026.csv'),read('data/cfmi_advanced_2026.csv'),
 JSON.parse(read('data/model_v5_params.json')),JSON.parse(read('data/preseason_prior_2026.json')));
assert.equal(result.audit.scoringModel,'5.7.0');
assert.equal(result.teams.length,138);
assert.deepEqual({...result.weights},{record:.45,qualityResidual:.30,control:.25});
const by=new Map(result.teams.map(t=>[t.name,t]));
for(const t of result.teams){
 const sum=.45*t.meritRecordScore+.30*t.meritQualityScore+.25*t.meritPerformanceScore+t.meritFcsPerformancePenalty;
 assert(Math.abs(sum-t.score)<1e-7,'Merit reconciliation '+t.name);
 assert.equal(t.meritHeadToHeadAdjustment,0,'Head-to-head globally changed '+t.name);
 assert(t.played.every(g=>g.meritQualityContribution===0||g.win&&g.opFbs),'Non-win quality credit');
 assert(t.played.every(g=>Math.abs(g.meritResultContribution-(g.win-g.expected)*(g.win?(.65+.90*(1-g.expected)):(.70+.70*g.expected)))<1e-8),'Weighted record identity');
 assert(t.played.filter(g=>g.opFbs).every(g=>t.meritDominanceGames.some(d=>d.gameId===String(g.id))),'Missing dominance game');
}
for(const name of ['UCLA','Utah','Notre Dame','Georgia','Alabama','Texas','Miami','Boise State','Wake Forest','New Mexico','Tennessee','USC','BYU','North Dakota State','Liberty','Arizona'])
 assert(by.has(name),'Missing regression school '+name);
const nd=by.get('Notre Dame'),ndMiami=nd.played.find(g=>g.op==='Miami'),ndNavy=nd.played.find(g=>g.op==='Navy');
assert(ndMiami.meritQualityContribution>ndNavy.meritQualityContribution*2,'Elite win not sufficiently differentiated');
const byu=by.get('BYU'),ndWin=byu.played.find(g=>g.op==='Notre Dame'),cstateWin=byu.played.find(g=>g.op==='Colorado State');
assert(ndWin.meritQualityContribution>cstateWin.meritQualityContribution*3,'ND marquee win not significant');
const ndsu=by.get('North Dakota State');
assert(ndsu.meritHeadToHeadAdjustment===0,'NDSU must not get a global H2H bonus');
const allTop=result.teams.slice().sort((a,b)=>b.score-a.score).slice(0,25);
const qualityRange=(Math.max(...allTop.map(t=>t.meritQualityScore))-Math.min(...allTop.map(t=>t.meritQualityScore)))*.30;
assert(qualityRange>5,'Quality contribution is compressed');
for(const [name1,name2] of [['BYU','Notre Dame'],['Georgia','Alabama']]){
 const a=by.get(name1),b=by.get(name2);
 assert(a.fbsG.some(g=>g.op===b.name)||b.fbsG.some(g=>g.op===a.name),'Missing direct matchup '+name1+'/'+name2);
 assert(a.meritHeadToHeadAdjustment===0&&b.meritHeadToHeadAdjustment===0);
}
assert(Math.abs((result.teams.find(t=>t.name==='UCLA').powerPoints||0)-14.800390972525253)<1e-7,
 'Power regression vs frozen v5.6 2026 deployment');
console.log('CFMI v5.7 MERIT PROPERTY TESTS PASSED',JSON.stringify({
 schools:result.teams.length,
 weights:result.weights,
 top25QualityPointRange:qualityRange,
 byuNotreDameWinUnits:ndWin.meritQualityContribution,
 byuColoradoStateWinUnits:cstateWin.meritQualityContribution,
 boiseRank:by.get('Boise State').rank,
 newMexicoRank:by.get('New Mexico').rank,
 byuRank:byu.rank,
 ndsuRank:ndsu.rank,
 libertyRank:by.get('Liberty').rank
}));
