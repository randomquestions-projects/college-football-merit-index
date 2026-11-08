#!/usr/bin/env node
"use strict";
/* Independent weekly runtime audit of the SAME JavaScript CFMI engine used on the website.
 * Never uses AP/CFP or any preseason priors. Fails the publishing job for an invalid result.
 */
const fs=require("fs"),path=require("path");
const base=path.join(__dirname,"..","site"),html=fs.readFileSync(path.join(base,"index.html"),"utf8");
const match=html.match(/<script>([\s\S]*?)<\/script>/i);
if(!match)throw Error("Cannot find CFMI inline calculation engine");
const code=match[1],endpoint=code.indexOf("const submetric=");
if(endpoint<10000)throw Error("Invalid CFMI JS extraction");
const model=fs.readFileSync(path.join(base,"model_v4.js"),"utf8");
const body=code.slice(0,endpoint)+String.raw`
const records=csvParse(scores), advanced=csvParse(advCsv);
const {teams,games}=computeV4(records,'live');
state.raw=records;
attachEfficiencyV4(teams,advanced);
return {teams:teams.map(t=>({
 rank:t.rank,team:t.name,score:t.score,record:t.won+'-'+t.lost,
 sorRank:t.sorRank,movRank:t.movRank,qualityRank:t.qualityComponentRank,
 sorPct:t.sor,movPct:t.movPct,qualityPct:t.qualityComponent,effPct:t.effScore,
 efficiencyRank:t.effScoreRank,efficiencyScore:t.effScore,
 advancedGames:t.advGames.length,expectedAdvancedGames:t.fbsGames
})),gameCount:games.length,advancedCoverage:{numerator:state.advCovered,denominator:state.advExpected},fourComponentModelActive:state.fullModel};
`;
const executor=new Function("scores","advCsv",model+"\n"+body);
const csv=fs.readFileSync(path.join(base,"data","cfb_schedules_2026.csv"),"utf8");
const adv=fs.readFileSync(path.join(base,"data","cfmi_advanced_2026.csv"),"utf8");
const result=executor(csv,adv);
if(result.teams.length<130||result.gameCount<300||result.teams.some(t=>!Number.isFinite(t.score)||t.score<0||t.score>100))throw Error("CFMI V4 audit failed: invalid team scores or game count");
const georgia=result.teams.find(t=>t.team==="Georgia");
const oleMiss=csv.split(/\r?\n/).some(row=>row.includes('"Ole Miss"')&&row.includes('"Georgia"')&&row.includes(",2026,10,")&&row.includes(",42,"));
console.log("CFMI LIVE AUDIT:",JSON.stringify({gameCount:result.gameCount,Georgia:georgia,advancedCoverage:result.advancedCoverage,fourComponentModelActive:result.fourComponentModelActive,GeorgiaOleMiss42_7InScores:oleMiss,Top25:result.teams.slice(0,25)},null,2));
// Sensitivity is descriptive only; it never changes the published CFMI weights.
const compareWeighting=(weights)=>{
 const list=result.teams.map(t=>({...t,scenarioScore:weights[0]*t.sorPct/100+weights[1]*t.movPct/100+weights[2]*t.qualityPct/100+weights[3]*t.effPct/100})).sort((a,b)=>b.scenarioScore-a.scenarioScore);
 return {georgiaRank:list.findIndex(t=>t.team==='Georgia')+1,top10:list.slice(0,10).map(t=>t.team)};
};
const sensitivity={v4:compareWeighting([30,20,15,35]),v3weights:compareWeighting([35,20,20,25]),moreQuality:compareWeighting([30,20,20,30])};
console.log('CFMI WEIGHT SENSITIVITY:',JSON.stringify(sensitivity,null,2));
const dst=path.join(base,"data","cfmi_ranking_audit.json");
fs.writeFileSync(dst,JSON.stringify({compiled_at:new Date().toISOString(),...result,sensitivity},null,2)+"\n");
