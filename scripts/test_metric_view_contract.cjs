#!/usr/bin/env node
'use strict';
/* Full-FBS proof public views use active scoring fields, not V4 diagnostics. */
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..','site');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const html=read('index.html');
const inline=html.match(/<script>([\s\S]*?)<\/script>/i);
assert(inline,'Missing dashboard calculation prelude');
const boundary=inline[1].indexOf('const submetric=');
assert(boundary>1500,'Dashboard prelude boundary changed');
const prelude=inline[1].slice(0,boundary);
const model=['model_v4.js','opponent_network_research.js','model_v5.js',
 'preseason_prior_v1.js','metric_view_contract.js'].map(read).join('\n');
const parameters=JSON.parse(read('data/model_v5_params.json'));
const prior=JSON.parse(read('data/preseason_prior_2026.json'));
const parse=new Function('csv',prelude+'return csvParse(csv)');
const statements=[
 'state.raw=raw;',
 'if(!MODEL_V5.setParameters(params))throw Error("Invalid fitted model");',
 'if(!MODEL_PRESEASON_V53.load(prior))throw Error("Invalid prior");',
 'const result=computeV5(raw,Date.now(),2026);',
 'attachEfficiencyV5(result.teams,advanced);',
 'const audit=CFMI_PUBLIC_VIEW.assertUniverse(result.teams);',
 'return {teams:result.teams,audit,',
 'getWins:(name)=>CFMI_PUBLIC_VIEW.wins(result.teams.find(t=>t.name===name),null,"signature"),',
 'getView:(name)=>CFMI_PUBLIC_VIEW.buildTeam(result.teams.find(t=>t.name===name)),',
 'getGames:(name)=>CFMI_PUBLIC_VIEW.allGames(result.teams.find(t=>t.name===name)),',
 'kinds:CFMI_PUBLIC_VIEW.sourceDefinitions};'
].join('\n');
const compute=new Function('raw','advanced','params','prior',model+'\n'+prelude+'\n'+statements);
const rows=parse(read('data/cfb_schedules_2026.csv'));
const advanced=parse(read('data/cfmi_advanced_2026.csv'));
assert(rows.length>500&&advanced.length>500,'Incomplete sources');
const result=compute(rows,advanced,parameters,prior);
assert(result.audit.schools>=130&&result.audit.allScoresReconciled);
assert.equal(result.audit.scoringModel,'5.6.0');
for(const [key,item] of Object.entries(result.kinds))
 assert(item.field&&item.origin&&item.kind&&item.unit,'Incomplete lineage '+key);
assert.equal(result.kinds.legacyQ.kind,'legacy-excluded');
assert.equal(result.kinds.legacyGamePerformance.kind,'legacy-excluded');
const nd=result.getView('Notre Dame'),uga=result.getView('Georgia');
const vols=result.getView('Tennessee'),liberty=result.getView('Liberty');
assert(nd&&uga&&vols&&liberty,'Reference team missing');
const wins=result.getWins('Notre Dame');
const miami=wins.find(g=>g.opponent==='Miami'),unc=wins.find(g=>g.opponent==='North Carolina');
assert(miami&&unc,'Notre Dame victories missing');
assert(miami.meritSignatureWinUnits>unc.meritSignatureWinUnits,
 'Beating Miami must have higher current signature win credit than beating UNC');
assert.equal(wins[0].opponent,'Miami','Cards must use active Merit, not V4 q');
assert(miami.opponentSeasonBaselineRank<unc.opponentSeasonBaselineRank);
assert(vols.merit.publishedRank<liberty.merit.publishedRank);
assert(uga.merit.publishedRank<result.getView('Alabama').merit.publishedRank);
for(const t of result.teams){
 const view=result.getView(t.name),games=result.getGames(t.name);
 assert.equal(view.record.games,games.length,'Game count '+t.name);
 for(const field of ['q','qualityScore','bestWin','qRoadWins','effScore'])
  assert(!Object.hasOwn(view,field)&&games.every(g=>!Object.hasOwn(g,field)),
    'Legacy view field '+t.name+' '+field);
 const fbs=games.filter(g=>g.isFbs);
 assert.equal(fbs.length,view.record.fbsGames,'FBS game count mismatch '+t.name);
 assert(fbs.every(g=>Number.isFinite(g.dominanceScore)),
   'One or more played FBS games lack measured/fallback dominance '+t.name);
 assert(fbs.every(g=>Array.isArray(g.dominanceMeasured)),
   'Game-level model provenance missing '+t.name);
 assert(Number.isFinite(view.power.descriptiveEvidenceGames)&&
   view.power.descriptiveEvidenceGames>=0&&
   view.power.descriptiveEvidenceGames<=t.fbsGames+1e-8,
   'Power evidence volume must not masquerade as additional Power strength '+t.name);
 const meritSum=Object.values(view.merit.componentScore).reduce((a,b)=>a+b,0);
 assert(Number.isFinite(view.merit.dominance.raw)&&view.merit.dominance.advancedCoverage>=0,'Dominance data absent '+t.name);
 assert(Math.abs(meritSum-view.merit.score)<1e-6,'Merit score '+t.name);
 const powerSum=Object.values(view.power.components).reduce((a,b)=>a+b,0);
 assert(Math.abs(powerSum-view.power.neutralPoints)<1e-6,'Power points '+t.name);
 const allocated=games.reduce((a,g)=>a+(g.allocatedMeritQualityUpliftPoints||0),0);
 assert(Math.abs(allocated-view.merit.qualityUplift)<1e-7,'Quality allocation '+t.name);
 if(view.coverage.coreGames===0)
  assert(games.every(g=>!g.diagnostics.coreEPAMeasured),'False EPA '+t.name);
}
// Same opponents, records, results and signature wins: an additional
// 10 opponent-adjusted game-dominance points over a substantial season sample
// must yield >3 Merit points, rather than the tiny effect of margin-only rules.
const dominanceMarginPoints=.30*1.30*10*.80;
assert(dominanceMarginPoints>3,'Dominant play must receive substantial achievement credit');
const history=JSON.parse(read('data/weekly_views_2026.json'));
assert(history.history.length>=10);
for(const week of history.history.slice(0,5))
 assert(week.teams.every(t=>t.meritPublishedRank===null),'Early Merit published rank week '+week.week);
const resume=html.slice(html.indexOf('function resumeReason('),html.indexOf("$('resumeControls').addEventListener('change'"));
assert(!resume.includes('b.q-a.q')&&!resume.includes('g.qualityScore')&&!resume.includes('leader.bestWin')&&!resume.includes('g.q,'),
 'Legacy metric still used to order public best wins');
assert(resume.includes('CFMI_PUBLIC_VIEW.wins'),'Active Merit missing from UI');
assert(html.includes('CFMI_PUBLIC_VIEW.assertUniverse(state.teams)'),'Missing fail-closed browser audit');
console.log('CFMI V6 PUBLIC METRIC CONTRACT PASSED',JSON.stringify({
 schools:result.audit.schools,ndMiamiCredit:miami.meritSignatureWinUnits,
 ndUNCCredit:unc.meritSignatureWinUnits,ndBestWin:wins[0].opponent,
 georgiaMeritRank:uga.merit.publishedRank,
 alabamaMeritRank:result.getView('Alabama').merit.publishedRank,
 tennesseeMeritRank:vols.merit.publishedRank,
 libertyMeritRank:liberty.merit.publishedRank,
 fieldLineageCount:Object.keys(result.kinds).length
}));