#!/usr/bin/env node
"use strict";
/* Regression gate for the temporary output-only research preview. */
const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.join(__dirname,'..','site');
const f=p=>fs.readFileSync(path.join(root,p),'utf8');
const data=JSON.parse(f('data/merit_research_2026_11_10.json'));
const expected={A:[50,15,35],B:[60,15,25],C:[40,30,30],D:[40,25,35],E:[40,20,40],F:[50,25,25]};
const keys=Object.keys(expected);
assert.equal(data.schema,'cfmi-merit-research-output-v1');
assert.equal(data.season,2026);
assert.equal(data.snapshot,'2026-11-10');
assert.equal(data.freeze,true);
assert.equal(data.teams.length,138);
assert.deepEqual(Object.keys(data.candidates).sort(),keys);
const nameSet=new Set(data.teams.map(t=>t.team));
assert.equal(nameSet.size,138);
for(const k of keys){
 const w=data.candidates[k];
 assert.deepEqual([w.victory,w.loss,w.performance],expected[k],'Incorrect model weights '+k);
 const ranks=new Set();
 for(const t of data.teams){
  const s=t.scores[k];
  assert.match(t.record,/^\d+-\d+$/);
  assert(s && Number.isInteger(s.rank) && s.rank>=1 && s.rank<=138);
  assert(!ranks.has(s.rank),'Duplicate '+k+' rank #'+s.rank);
  ranks.add(s.rank);
  assert([s.win,s.loss,s.performance,s.merit].every(Number.isFinite));
  assert(Math.abs(s.win+s.loss+s.performance-s.merit)<0.003,
   'Research score components do not reconcile '+t.team+'/'+k);
  assert(s.win>=0&&s.win<=w.victory+.003&&s.loss>=0&&s.loss<=w.loss+.003&&
         s.performance>=0&&s.performance<=w.performance+.003,'Component exceeds weight '+k);
 }
 assert.equal(ranks.size,138);
}
const html=f('index.html'),ui=f('merit_research_lab.js');
assert(html.includes('id="researchPage"') && html.includes('id="researchNavTab"'));
assert(html.includes("location.hash==='#research'?'research'"),'Deep link for research tab absent');
assert(html.includes('./merit_research_lab.js'));
assert(ui.includes('showTeam(name)'),'Research lab must reuse full official popup schedule');
assert(ui.includes('Official v5.6 Merit (reference only'),'Research vs official audit labels absent');
assert(ui.includes('not the official'),'Prominent experimental label absent');
const forbidden=['fetch("https://','AWS_SECRET','GH_TOKEN','BEGIN PRIVATE KEY','private-research','site/model_v5.js ='];
assert(!forbidden.some(x=>ui.includes(x)),'Disallowed research UI payload');
const checked=['Georgia','Miami','Notre Dame','Alabama','UCLA','Utah','Texas','Boise State','New Mexico'];
for(const name of checked)assert(nameSet.has(name),'Missing regression team '+name);
console.log('CFMI TEMPORARY RESEARCH SNAPSHOT CONTRACT PASSED: 138 teams × 6 output-only variants');
