#!/usr/bin/env node
'use strict';
/* Research-only 2026 preseason CFP scenario simulation.
 * Honest caveats: selection and conference-tiebreaker rules are approximated,
 * neither the committee's private judgement nor injuries/roster changes are
 * forecast. The official 2026 CFP field includes four P4 conference champions,
 * the top-ranked team from G6, and seven at-larges (Notre Dame top-12 rule).
 */
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const DATA=path.join(__dirname,'../site/data');
const doc=JSON.parse(fs.readFileSync(path.join(DATA,'preseason_prior_2026.json'),'utf8'));
const params=JSON.parse(fs.readFileSync(path.join(DATA,'model_v5_params.json'),'utf8'));
const rows=fs.readFileSync(path.join(DATA,'cfb_schedules_2026.csv'),'utf8');
// Minimal RFC-4180 parser sufficient for quoted commas/newlines.
function csvParse(text){
 const out=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else quoted=!quoted}
  else if(c===','&&!quoted){row.push(cell);cell=''}
  else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;
   row.push(cell);if(row.length>1)out.push(row);row=[];cell=''
  }else cell+=c;
 }
 if(cell||row.length){row.push(cell);out.push(row)}
 const header=out.shift();
 return out.map(values=>Object.fromEntries(header.map((h,i)=>[h,values[i]??''])));
}
const raw=csvParse(rows).filter(g=>+g.season===2026&&g.season_type==='regular');
const scores=doc.teams,names=Object.keys(scores);
if(names.length<135)throw Error('Incomplete preseason rankings');
const site=params.parameters.homePoints;
const scale=params.parameters.logisticScale;
const sigmoid=x=>1/(1+Math.exp(-Math.max(-30,Math.min(30,x))));
const seedInit=20260801;let seed=seedInit;
function rand(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}
const conference=new Map();
for(const g of raw){
 for(const side of ['home','away']){
  const team=g[side+'_team'],conf=g[side+'_conference'];
  if(scores[team]&&conf&&conf!=='NA')conference.set(team,conf);
 }
}
const P4=['ACC','Big Ten','Big 12','SEC'],G6=['American','American Athletic','Conference USA','MAC','Mountain West','Pac-12','Sun Belt'];
const games=raw.filter(g=>(scores[g.home_team]||scores[g.away_team])&&
  ['fbs','fcs'].includes(g.home_division)&&['fbs','fcs'].includes(g.away_division));
const benchmark=names.map(name=>scores[name].priorPoints).sort((a,b)=>b-a)[Math.floor(names.length*.25)];
function drawGame(a,b,neutral=false){
 const ap=scores[a]?.priorPoints,bp=scores[b]?.priorPoints;
 if(!Number.isFinite(ap)||!Number.isFinite(bp))throw Error('Unknown FBS team in simulation');
 const p=sigmoid((ap-bp+(neutral?0:site))/scale);
 return rand()<p?a:b;
}
function pickIndex(g){
 const a=g.home_team,b=g.away_team,neutral=g.neutral_site==='TRUE';
 const afbs=!!scores[a],bfbs=!!scores[b];
 if(afbs&&bfbs)return drawGame(a,b,neutral);
 // FCS schedule contribution: no blowout bonus, conservative FBS win
 // probability; this proxy does NOT infer individual FCS strength.
 if(afbs&&!bfbs)return rand()<.96?a:b;
 if(!afbs&&bfbs)return rand()<.96?b:a;
 return null;
}
const trials=5000,progress=Object.fromEntries(names.map(name=>[name,{
 team:name,conference:conference.get(name)||'Independent',playoff:0,
 title:0,final:0,semifinal:0,conferenceTitle:0,winTotal:0,rankAverage:0
}]));
function createRecords(){
 return Object.fromEntries(names.map(name=>[name,{
  wins:0,losses:0,conferenceWins:0,conferenceLosses:0,expected:0,sos:0,opponents:0
 }]));
}
function scoreRecords(records){
 const ratings=names.map(name=>{
  const r=records[name],power=scores[name].priorPoints;
  // CFMI-inspired proxy to approximate end-of-year achieved resume, not
  // the formal trained Merit calculation, which requires simulated margins.
  const wab=r.wins-r.expected;
  const strength=r.opponents?r.sos/r.opponents:0;
  return {name,conference:conference.get(name)||'Independent',
   wins:r.wins,confWins:r.conferenceWins,confLosses:r.conferenceLosses,
   wab,score:4*wab+.28*(r.wins-6)+.025*power,
   power,opponentStrength:strength};
 });
 ratings.sort((a,b)=>b.score-a.score||b.wins-a.wins||b.power-a.power);
 return ratings;
}
const selectChamp=(all,conf,records)=>{
 const eligible=all.filter(t=>t.conference===conf);
 eligible.sort((a,b)=>{
  const aRec=records[a.name],bRec=records[b.name];
  const aPct=aRec.conferenceWins/Math.max(1,aRec.conferenceWins+aRec.conferenceLosses);
  const bPct=bRec.conferenceWins/Math.max(1,bRec.conferenceWins+bRec.conferenceLosses);
  return bPct-aPct||bRec.conferenceWins-aRec.conferenceWins||b.score-a.score;
 });
 const first=eligible[0],second=eligible[1];
 if(!first)return null;
 return second?drawGame(first.name,second.name,true):first.name;
};
function bracket(field){
 const [s1,s2,s3,s4,s5,s6,s7,s8,s9,s10,s11,s12]=field;
 const round1=[
  drawGame(s8.name,s9.name,false),
  drawGame(s5.name,s12.name,false),
  drawGame(s7.name,s10.name,false),
  drawGame(s6.name,s11.name,false)
 ];
 const q1=drawGame(s1.name,round1[0],true);
 const q4=drawGame(s4.name,round1[1],true);
 const q2=drawGame(s2.name,round1[2],true);
 const q3=drawGame(s3.name,round1[3],true);
 for(const name of [q1,q4,q2,q3])progress[name].semifinal++;
 const f1=drawGame(q1,q4,true),f2=drawGame(q2,q3,true);
 progress[f1].final++;progress[f2].final++;
 return drawGame(f1,f2,true);
}
let bracketCount=0;
for(let run=0;run<trials;run++){
 const rec=createRecords();
 for(const g of games){
  const a=g.home_team,b=g.away_team,afbs=!!scores[a],bfbs=!!scores[b];
  const win=pickIndex(g);
  if(!win)continue;
  const neutral=g.neutral_site==='TRUE';
  for(const [team,op,side] of [[a,b,'H'],[b,a,'A']]){
   if(!scores[team])continue;
   const winFlag=win===team;
   rec[team][winFlag?'wins':'losses']++;
   const oppPoints=scores[op]?.priorPoints??-22;
   const venueEdge=neutral?0:side==='H'?site:-site;
   rec[team].expected+=sigmoid((benchmark-oppPoints+venueEdge)/scale);
   rec[team].sos+=oppPoints;rec[team].opponents++;
   if(afbs&&bfbs&&conference.get(a)===conference.get(b)&&
      conference.get(a)!=='Independent'&&g.conference_game==='TRUE'){
     rec[team][winFlag?'conferenceWins':'conferenceLosses']++;
   }
  }
 }
 const ranked=scoreRecords(rec);
 for(const r of ranked)progress[r.name].winTotal+=r.wins;
 const champions=P4.map(conf=>selectChamp(ranked,conf,rec)).filter(Boolean);
 if(champions.length!==4)throw Error('Required four P4 conferences not available');
 for(const name of champions)progress[name].conferenceTitle++;
 const topG=ranked.find(r=>G6.includes(r.conference));
 if(!topG)throw Error('No Group of Six candidate identified');
 const automatic=new Set([...champions,topG.name]);
 const field=ranked.filter(r=>automatic.has(r.name)).concat(
  ranked.filter(r=>!automatic.has(r.name)).slice(0,7));
 // Seed by CFP proxy. Mandatory AQ outside top twelve is still included.
 field.sort((a,b)=>b.score-a.score);
 if(field.length!==12)throw Error('Invalid simulated playoff count');
 for(const r of field)progress[r.name].playoff++;
 const champion=bracket(field);
 progress[champion].title++;
 bracketCount++;
 for(let i=0;i<ranked.length;i++)progress[ranked[i].name].rankAverage+=i+1;
}
const result=Object.values(progress).map(x=>({
 team:x.team,conference:x.conference,preseasonPowerRank:scores[x.team].powerRank,
 talentRank:scores[x.team].talentRank,priorPoints:scores[x.team].priorPoints,
 playoffPct:100*x.playoff/trials,championPct:100*x.title/trials,
 nationalFinalPct:100*x.final/trials,semifinalPct:100*x.semifinal/trials,
 projectedWins:x.winTotal/trials,simAverageCFPProxyRank:x.rankAverage/trials,
 conferenceTitlePct:100*x.conferenceTitle/trials
})).sort((a,b)=>b.championPct-a.championPct||a.preseasonPowerRank-b.preseasonPowerRank);
const output={
 season:2026,version:'CFMI V5.3 exploratory preseason playoff outlook',
 generatedAtUtc:new Date().toISOString(),trials,randomSeed:seedInit,
 ratingInput:'2026 Week0 Power prior only; no 2026 game outcomes included',
 note:'Illustrative independent 12-team CFP bracket scenario simulation, NOT an official CFP selection forecast or verified historical preseason publication.',
 rules:'Four ACC/Big Ten/Big 12/SEC champion proxies, highest-ranked from six non-P4 conferences, seven remaining at-large; first-round higher seeds host, top four byes.',
 limitations:[
  'Official CFP committee ranking is not mathematically reproduced. Committee selection is replaced by a simplified CFMI record-vs-schedule achievement proxy.',
  'Conference championship participants and tiebreakers are approximated from conference win percentage; actual conference championship formats and tie procedures vary.',
  'The talent-prior source archives were downloaded after the season began, and original preseason publication timestamps have not been independently verified.',
  'Head coach and coordinator changes, reliable top30 active starters and player injuries are not yet quantified.',
  'FCS games use a fixed 96% FBS-win assumption; this is not an opponent-specific FCS model.',
  'Game forecasts treat team-strength estimates as fixed and are not calibrated for correlated team-season performance changes.',
  'Most college football schedules were retrieved from current revisions, not immutable preseason fixtures.',
  'No market odds, external power ratings or conference reputation are used to raise Power points.'
 ],
 contenders:result.slice(0,25),teams:result
};
fs.writeFileSync(path.join(DATA,'preseason_playoff_forecast_2026.json'),JSON.stringify(output,null,2)+'\n');
console.log('CFMI V5.3 PRESEASON CFP OUTLOOK',JSON.stringify({trials,top10:result.slice(0,10)}));
