#!/usr/bin/env node
'use strict';
/* Rebuild a shareable, versioned public metric audit without changing the model.
 * Published rows contain ONLY canonical active/supporting view fields.
 * Every source CSV, advanced input, roster input and historic archive stays intact.
 */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..','site');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const html=read('index.html'),inline=html.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
assert(inline,'Missing site model prelude');
const boundary=inline.indexOf('const submetric=');
assert(boundary>1500,'Model runtime prelude moved without updating the audit');
const prelude=inline.slice(0,boundary);
const sources=['model_v4.js','opponent_network_research.js','model_v5.js','preseason_prior_v1.js',
 'metric_view_contract.js','data/model_v5_params.json','data/preseason_prior_2026.json',
 'data/cfb_schedules_2026.csv','data/cfmi_advanced_2026.csv','data/cfmi_possession_2026.csv',
 'data/preseason_full_sources_2024_2026.json','data/neutral_wp_model.json'];
for(const file of sources)assert(fs.existsSync(path.join(root,file)),'Required input missing '+file);
const library=sources.slice(0,5).map(read).join('\n');
const params=JSON.parse(read('data/model_v5_params.json'));
const prior=JSON.parse(read('data/preseason_prior_2026.json'));
const parse=new Function('raw',prelude+'return csvParse(raw)');
const run=new Function('raw','adv','params','prior',library+'\n'+prelude+'\n'+[
 'state.raw=raw;',
 'if(!MODEL_V5.setParameters(params))throw Error("Invalid active coefficients");',
 'if(!MODEL_PRESEASON_V53.load(prior))throw Error("Invalid active prior");',
 'const result=computeV5(raw,Date.now(),2026);',
 'attachEfficiencyV5(result.teams,adv);',
 'const audit=CFMI_PUBLIC_VIEW.assertUniverse(result.teams);',
 'return {audit,teams:result.teams.map(team=>({team:CFMI_PUBLIC_VIEW.buildTeam(team),games:CFMI_PUBLIC_VIEW.allGames(team)})),',
 'definitions:CFMI_PUBLIC_VIEW.sourceDefinitions};'
 ].join('\n'));
const scores=parse(read('data/cfb_schedules_2026.csv'));
const adv=parse(read('data/cfmi_advanced_2026.csv'));
const result=run(scores,adv,params,prior);
assert(result.audit.schools>=130);
const modelAudit=JSON.parse(read('data/cfmi_ranking_audit.json'));
const byName=new Map(modelAudit.teams.map(t=>[t.name,t]));
for(const entry of result.teams){
 const source=byName.get(entry.team.team);
 assert(source,'Missing ranked audit '+entry.team.team);
 assert(Math.abs(source.merit-entry.team.merit.score)<1e-6,'Merit differs from ranking audit '+entry.team.team);
 assert(Math.abs(source.power-entry.team.power.score)<1e-6,'Power differs from ranking audit '+entry.team.team);
 assert.equal(source.powerRank,entry.team.power.rank);
 assert.equal(source.meritPublishedRank,entry.team.merit.publishedRank);
 const sum=entry.games.reduce((a,g)=>a+(g.allocatedMeritQualityUpliftPoints||0),0);
 assert(Math.abs(sum-entry.team.merit.qualityUplift)<1e-7,'Quality attribution mismatch');
}
const hashes=Object.fromEntries(sources.map(file=>[file,crypto.createHash('sha256').update(read(file)).digest('hex')]));
const generatedAtUtc=new Date().toISOString();
const manifest={
 contractSchema:result.audit.viewSchema,scoringModel:result.audit.scoringModel,
 season:2026,generatedAtUtc,sourceMode:'RECONSTRUCTED_FROM_CURRENT_PUBLIC_SOURCE_RELEASE',
 caveats:[
  'Current-week and historical model values may differ from as originally published because source releases can be revised',
  'Opponent baseline estimates are season-fitted and include the game being described; never interpret them as independent pregame ratings',
  'Raw signature-win units aggregate nonlinearly into the team quality subscore; allocated uplift is a proportional reconciliation, not causal attribution',
  'Legacy V4 diagnostic quality score and road-multiplied q are retained in source/archive but excluded from public v6 views',
  'Predictive Power research underwent repeated historical development on 2025/2026; retrospective accuracy is not a blind independent validation',
  'In-season historical conference correction is an explicitly learned conference-based component, not a conference-free model'
 ],
 population:{schools:result.audit.schools,teamGamePerspectives:result.teams.reduce((n,t)=>n+t.games.length,0),
  originalCompletedGames:modelAudit.totalGames,coreAdvancedMeasured:modelAudit.coverage.measured,
  eligibleAdvancedGames:modelAudit.coverage.eligible},
 sourceSha256:hashes,fieldDefinitions:result.definitions
};
const output={manifest,teamAudit:result.teams};
const file=path.join(root,'data','public_metric_audit_2026.json');
fs.writeFileSync(file,JSON.stringify(output)+'\n');
console.log('CFMI PUBLIC AUDIT READY',JSON.stringify({model:manifest.scoringModel,
 schools:manifest.population.schools,teamGamePerspectives:manifest.population.teamGamePerspectives,
 sources:sources.length,bytes:fs.statSync(file).size}));
