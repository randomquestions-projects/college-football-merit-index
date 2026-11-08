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
  const model=await page.evaluate(()=>({version:MODEL_V4.version,teamCount:state.teams.length,active:state.fullModel,score:state.teams[0].score,coreCount:state.advCovered,expected:state.advExpected}));
  assert(model.version==="4.0.0"&&model.teamCount>=130,"V4 model did not run");
  assert(Number.isFinite(model.score)&&model.active,"V4 computed score not populated");
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
  assert(detail.includes("game performance")&&detail.includes("opponent power"),"Team detail game-quality audit not visible");
  await page.locator("#closeModal").click();
  await page.locator('#pageSwitch [data-page="comparison"]').click();
  await page.locator("#compareBody tr").first().waitFor();
  assert.equal(await page.locator("#compareBody tr").count(),25,"AP/CFP Top 25 comparison missing");
  await page.locator('#comparisonBaseline [data-baseline="cfp"]').click();
  assert.equal(await page.locator("#compareBody tr").count(),25,"CFP baseline switch failed");
  assert.equal(errors.length,0,"Browser console exceptions: "+errors.join("; "));
  console.log("CFMI V4 BROWSER SMOKE PASSED",JSON.stringify(model));
 }catch(err){console.error("CFMI V4 BROWSER SMOKE FAILED:",err.stack||String(err));process.exitCode=1}
 finally{if(browser)await browser.close();server.kill("SIGTERM")}
})();
