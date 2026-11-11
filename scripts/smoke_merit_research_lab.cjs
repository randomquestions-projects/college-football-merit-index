#!/usr/bin/env node
"use strict";
/* Focused browser smoke for temporary gated research tab; official 7-tab suite remains intact. */
const {spawn}=require('node:child_process'),http=require('node:http'),assert=require('node:assert/strict');
const path=require('node:path'),{chromium}=require('playwright');
const root=path.join(__dirname,'..','site'),port=8160,url='http://127.0.0.1:'+port+'/';
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1','--directory',root],{stdio:'ignore'});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function up(){
 for(let i=0;i<65;i++){
  const ok=await new Promise(resolve=>{
   const req=http.get(url,res=>{res.resume();resolve(res.statusCode===200)});
   req.on('error',()=>resolve(false));req.setTimeout(1000,()=>{req.destroy();resolve(false)});
  });
  if(ok)return;await wait(350);
 }
 throw Error('Research smoke HTTP server unavailable');
}
(async()=>{
 let browser;
 try{
  await up();
  browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const desktop=await browser.newPage({viewport:{width:1440,height:900}});
  const errs=[];desktop.on('pageerror',e=>errs.push(String(e)));
  await desktop.goto(url,{waitUntil:'domcontentloaded'});
  await desktop.locator('#body tr[data-team]').first().waitFor({timeout:45000});
  assert.equal(await desktop.locator('#researchNavTab').isVisible(),false,'Research must be opt-in');
  assert.equal(await desktop.locator('#researchPage').isVisible(),false,'Research must not replace official site');
  await desktop.goto(url+'?research=1#research',{waitUntil:'domcontentloaded'});
  await desktop.waitForFunction(()=>state.teams.length===138&&Boolean(window.CFMI_RESEARCH_LAB),null,{timeout:45000});
  await desktop.locator('#researchRankBody tr').first().waitFor({timeout:12000});
  await desktop.waitForFunction(()=>document.querySelectorAll('#researchRankBody td.research-team').length===25,{timeout:14000});
  assert(await desktop.locator('#researchPage').isVisible(),'Research deep link did not activate');
  assert(await desktop.locator('#researchNavTab').isVisible(),'Research tab missing');
  assert.equal(await desktop.locator('#researchRankBody td.research-team').count(),25);
  const data=await desktop.evaluate(async()=>{
   const raw=await fetch('./data/merit_research_2026_11_10.json');return raw.json()
  });
  assert.equal(data.teams.length,138);
  for(const key of ['A','B','C','D','E','F']){
   await desktop.locator('#researchVariantPicker [data-research-variant="'+key+'"]').click();
   const first=await desktop.locator('#researchRankBody .research-team button').first().innerText();
   const expected=data.teams.find(t=>t.scores[key].rank===1).team;
   assert.equal(first,expected,'Wrong leader for candidate '+key);
   assert.equal(await desktop.locator('#researchVariantPicker [data-research-variant="'+key+'"]').getAttribute('aria-pressed'),'true');
  }
  await desktop.locator('#researchLimit').selectOption('138');
  assert.equal(await desktop.locator('#researchRankBody td.research-team').count(),138);
  await desktop.locator('#researchSearch').fill('Georgia');
  assert.equal(await desktop.locator('#researchRankBody td.research-team').count(),1);
  await desktop.locator('#researchRankBody [data-research-team="Georgia"]').click();
  await desktop.locator('#detailScrim.open .research-popup').waitFor({timeout:12000});
  const diag=await desktop.locator('#detailBody').innerText();
  assert(diag.includes('Victory portfolio')&&diag.includes('Remaining loss budget')&&
   diag.includes('Opponent-adjusted performance')&&diag.includes('research')&&
   diag.includes('Ole Miss')&&diag.includes('Alabama')&&diag.includes('v5.6'),
   'Team popup is missing research scores or complete official schedule');
  assert.equal(await desktop.locator('#detailBody [data-research-detail-variant]').count(),6);
  await desktop.locator('#detailBody [data-research-detail-variant="C"]').click();
  assert((await desktop.locator('#detailTitle').innerText()).includes('Candidate C'),
         'Changing variant inside popup did not update score breakdown');
  const needed=data.teams.find(t=>t.team==='Georgia').scores.C;
  assert((await desktop.locator('.research-popup-head').innerText()).includes(needed.merit.toFixed(2)),
         'Detail score must match exact frozen research record');
  await desktop.keyboard.press('Escape');
  assert.equal(await desktop.locator('#detailScrim.open').count(),0,'Research dialog must close');
  await desktop.locator('#pageSwitch [data-page="rankings"]').click();
  assert(await desktop.locator('#rankings').isVisible(),'Official rankings did not restore');
  assert.equal(await desktop.locator('#researchPage').isVisible(),false,'Research page leaked into official tabs');

  const mobile=await browser.newPage({viewport:{width:390,height:844}});
  const mobileErrors=[];mobile.on('pageerror',e=>mobileErrors.push(String(e)));
  await mobile.goto(url+'?research=1#research',{waitUntil:'domcontentloaded'});
  await mobile.waitForFunction(()=>document.querySelectorAll('#researchRankBody td.research-team').length===25&&state.teams.length===138,null,{timeout:45000});
  assert(await mobile.locator('#researchPage').isVisible());
  const geom=await mobile.evaluate(()=>({vw:window.innerWidth,doc:document.documentElement.scrollWidth,table:document.querySelector('.research-table-wrap').scrollWidth,container:document.querySelector('.research-table-wrap').clientWidth}));
  assert(geom.doc<=geom.vw+9,'Research introduced page-level horizontal overflow '+JSON.stringify(geom));
  await mobile.locator('#researchRankBody [data-research-team="Utah"]').first().click();
  await mobile.locator('#detailScrim.open .research-popup').waitFor({timeout:13000});
  const modalWidth=await mobile.locator('#detailScrim.open .modal').evaluate(e=>e.getBoundingClientRect().width);
  assert(modalWidth<=390&&modalWidth>=200,'Research popup mobile width '+modalWidth);
  await mobile.keyboard.press('Escape');
  assert.equal(mobileErrors.length,0,'Mobile JS errors: '+mobileErrors.join('; '));
  assert.equal(errs.length,0,'Desktop JS errors: '+errs.join('; '));
  await mobile.close();
  console.log('CFMI TEMPORARY MERIT RESEARCH BROWSER SMOKE PASSED: six rankings, detail schedule, opt-in routing, mobile');
 }catch(e){console.error('CFMI RESEARCH BROWSER SMOKE FAILED',e.stack||String(e));process.exitCode=1}
 finally{if(browser)await browser.close();server.kill('SIGTERM')}
})();