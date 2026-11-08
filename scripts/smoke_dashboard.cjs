#!/usr/bin/env node
/* CFMI V4 public web interface smoke test; checked against current site/data. */
"use strict";
const {spawn}=require("child_process");
const http=require("http");
const assert=require("assert").strict;
const path=require("path");
const {chromium}=require("playwright");
const root=path.join(__dirname,"..","site");
const server=spawn("python3",["-m","http.server","8159","--bind","127.0.0.1","--directory",root],{stdio:"ignore"});
const url="http://127.0.0.1:8159/";
async function waitForServer(){
  for(let i=0;i<60;i++){
    const up=await new Promise(resolve=>{const req=http.get(url,r=>{r.resume();resolve(r.statusCode===200)});req.on("error",()=>resolve(false));req.setTimeout(1000,()=>{req.destroy();resolve(false)})});
    if(up)return;await new Promise(r=>setTimeout(r,500));
  }
  throw Error("Local CFMI web server did not start");
}
(async()=>{
 let browser;
 try{
  await waitForServer();
  browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
  const page=await browser.newPage({viewport:{width:1360,height:900}});
  const errors=[];page.on("pageerror",error=>errors.push(String(error)));
  await page.goto(url,{waitUntil:"domcontentloaded"});
  await page.locator("#body tr[data-team]").first().waitFor({timeout:30000});
  const names=await page.locator("#body tr[data-team]").allTextContents();
  assert(names.length>=25,"Expected populated Top 50");
  const model=await page.evaluate(()=>({version:MODEL_V4.version,teamCount:state.teams.length,active:state.fullModel,score:state.teams[0].score,powerScore:state.teams[0].powerScore,powerRank:state.teams[0].powerRank,coreCount:state.advCovered,expected:state.advExpected}));
  assert(model.version==="4.1.0"&&model.teamCount>=130,"Dual Merit/Power model did not run");
  assert(Number.isFinite(model.score)&&Number.isFinite(model.powerScore)&&model.active,"Merit/Power scores not populated");
  await page.locator('#rankingLens [data-lens="power"]').click();
  const powerView=await page.evaluate(()=>({
    lens:state.lens,
    firstShown:document.querySelector('#body tr[data-team]')?.getAttribute('data-team'),
    expected:state.teams.slice().sort((a,b)=>a.powerRank-b.powerRank)[0]?.name,
    top50:document.querySelectorAll('#body tr[data-team]').length
  }));
  assert.equal(powerView.lens,"power","Power view did not activate");
  assert.equal(powerView.firstShown,powerView.expected,"Power view is not sorted by predictive power");
  assert.equal(powerView.top50,50,"Power Top 50 filter is not independent of Merit");
  await page.locator('#rankingLens [data-lens="merit"]').click();
  assert.equal(await page.locator('#rankingLens [data-lens="merit"]').getAttribute('aria-pressed'),"true");
  await page.locator('#pageSwitch [data-page="methodology"]').click();
  assert(await page.locator('.method-lens-card').count()===2,"Both methodologies must be visible");
  assert((await page.locator('.method-lens-card').nth(1).innerText()).includes("65%"),"Power methodology weight is missing");
  assert(model.coreCount/model.expected>=.70,"Core EPA coverage below required threshold");
  await page.locator('#pageSwitch [data-page="resume"]').click();
  await page.locator("#resumeControls select").first().waitFor();
  assert.equal(await page.locator("#resumeControls select").count(),5,"Expected five comparison selectors");
  assert.equal(await page.locator("#resumeHead [data-open-team]").count(),3,"Default three teams missing");
  assert(await page.locator("#resumeNarratives .resume-narrative").count()>=2,"Missing deterministic résumé narratives");
  await page.locator("#resumeTeam3").selectOption("Texas");
  assert.equal(await page.locator("#resumeHead [data-open-team]").count(),4,"Fourth team selection failed");
  await page.locator('#resumeHead [data-open-team="Georgia"]').click();
  await page.locator("#detailScrim.open").waitFor();
  const detail=(await page.locator("#detailBody").innerText()).toLowerCase();
  assert(detail.includes("game performance")&&detail.includes("opponent baseline"),"Team detail game-quality audit not visible");
  await page.locator("#closeModal").click();
  await page.locator('#pageSwitch [data-page="comparison"]').click();
  await page.locator("#compareBody tr").first().waitFor();
  assert.equal(await page.locator("#compareBody tr").count(),25,"Merit Top 25 comparison missing");
  assert.equal(await page.locator("#comparisonTable th[data-compare-sort]").count(),12,"Seven-system comparison columns missing");
  await page.locator('#comparisonBaseline').selectOption('power');
  assert.equal(await page.locator("#compareBody tr").count(),25,"Power baseline switch failed");
  const powerFirst=await page.locator('#compareBody tr[data-compare-team]').first().getAttribute('data-compare-team');
  const expectedPower=await page.evaluate(()=>state.teams.slice().sort((a,b)=>a.powerRank-b.powerRank)[0].name);
  assert.equal(powerFirst,expectedPower,"Power baseline did not order by predictive Power Rank");
  await page.locator('#comparisonBaseline').selectOption('cfp');
  assert.equal(await page.locator("#compareBody tr").count(),25,"CFP baseline switch failed");
  await page.locator('#comparisonBaseline').selectOption('merit');
  await page.locator('#comparisonCount').selectOption('all');
  assert((await page.locator("#compareBody tr").count())>=130,"All-FBS comparison view incomplete");
  await page.locator('#comparisonQuery').fill('Georgia');
  const matchingTeams=await page.locator('#compareBody tr[data-compare-team]').evaluateAll(rows=>rows.map(r=>r.getAttribute('data-compare-team')));
  assert(matchingTeams.length>=1&&matchingTeams.every(name=>name.toLowerCase().includes('georgia')),"Substring team search did not filter comparisons");
  await page.locator('#comparisonQuery').fill('');
  await page.locator('#comparisonReference').selectOption('sp_plus');
  assert((await page.locator('#meritDeltaHeader').innerText()).includes('SP+'),"Selectable rank deltas not reflected in table");
  await page.locator('#comparisonTable th[data-compare-sort="power"]').click();
  assert.equal(await page.locator('#comparisonTable th[data-compare-sort="power"]').getAttribute('aria-sort'),'ascending',"Sortable comparison headings not interactive");
  await page.locator('#pageSwitch [data-page="methodology"]').click();
  assert(await page.locator('#methodologyPage').isVisible(),"Methodology tab is not visible");
  assert(!(await page.locator('#rankings').isVisible()),"Rankings must be hidden in methodology view");
  assert(await page.locator('#method').isVisible()&&await page.locator('#variables').isVisible()&&await page.locator('#sources').isVisible(),"Complete methodology, variables, data lineage and caveats missing");
  await page.locator('#pageSwitch [data-page="rankings"]').click();
  assert(await page.locator('#rankings').isVisible()&&!(await page.locator('#methodologyPage').isVisible()),"Home tab did not restore rankings");
  assert.equal(errors.length,0,"Browser console exceptions: "+errors.join("; "));
  console.log("CFMI V4 BROWSER SMOKE PASSED",JSON.stringify(model));
 }catch(err){console.error("CFMI V4 BROWSER SMOKE FAILED:",err.stack||String(err));process.exitCode=1}
 finally{if(browser)await browser.close();server.kill("SIGTERM")}
})();
