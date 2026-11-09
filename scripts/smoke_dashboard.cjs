#!/usr/bin/env node
/* CFMI V5.3 seven-tab browser smoke test with preseason + live rankings. */
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
  const model=await page.evaluate(()=>({version:MODEL_V5.version,parameters:MODEL_V5.params.source,teamCount:state.teams.length,active:state.fullModel,score:state.teams[0].score,powerScore:state.teams[0].powerScore,powerRank:state.teams[0].powerRank,coreCount:state.advCovered,expected:state.advExpected}));
  assert(model.version==="5.5.0"&&model.teamCount>=130,"Dual Merit/Power model did not run");
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
  assert(await page.locator("#v5MethodSummary").isVisible(),"V5 methodology not visible");
  assert((await page.locator("#v5MethodSummary").innerText()).includes("55%"),"V5 earned-results weighting is missing");
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
  assert(detail.includes("game performance")&&detail.includes("opponent baseline")&&detail.includes("estimated margin"),"V5 team detail audit not visible");
  await page.locator("#closeModal").click();
  // Every team popup must reconcile to its exact Power Points (including
  // pre-season adjustment), without inactive 0.00-point football statistic cards.
  const auditedPopups=await page.evaluate(()=>{
    const issues=[];
    for(const team of state.teams){
      showTeam(team.name);
      const body=document.querySelector("#detailBody")?.textContent||"";
      const heading=document.querySelector("#detailTitle")?.textContent||"";
      const total=Object.values(team.powerContributionPoints||{}).filter(Number.isFinite).reduce((s,n)=>s+n,0);
      if(!heading.includes(team.name))issues.push(team.name+": wrong heading");
      if(!body.includes("Components reconcile to"))issues.push(team.name+": bad component display");
      if(!body.includes("Measured offense and defense"))issues.push(team.name+": missing performance diagnostics");
      if(/Finishing\\s+0\\.00 pts|Consistency\\s+0\\.00 pts|Game control\\s+0\\.00 pts/.test(body))
        issues.push(team.name+": dormant coefficient shown as metric");
      if(Math.abs(total-team.powerPoints)>.015)issues.push(team.name+": Power does not reconcile");
    }
    document.getElementById("closeModal").click();
    return {count:state.teams.length,issues};
  });
  assert(auditedPopups.count>=130&&auditedPopups.issues.length===0,
    "Invalid Merit / Power team popups: "+JSON.stringify(auditedPopups));
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
  assert(await page.locator("#v5MethodSummary").isVisible(),"Current methodology not visible");
  await page.locator("#legacyMethod summary").click();
  assert(await page.locator("#method").isVisible()&&await page.locator("#variables").isVisible()&&await page.locator("#sources").isVisible(),"Historical source lineage unavailable");
  await page.locator('#pageSwitch [data-page="history"]').click();
  await page.locator("#historyMeritTrend tr").first().waitFor({timeout:15000});
  assert.equal(await page.locator("#historyMeritTrend tr").count(),25,"Merit weekly Top 25 incomplete");
  assert.equal(await page.locator("#historyPowerTrend tr").count(),25,"Power weekly Top 25 incomplete");
  const dates=await page.locator("#historyWeek option").count();
  assert(dates>=6,"Not enough historical weekly snapshots");
  const firstOption=await page.locator("#historyWeek option").first().getAttribute("value");
  assert.equal(firstOption,"0","Preseason Week 0 missing from historical snapshot picker");
  await page.locator("#historyWeek").selectOption('1');
  const earlyHistory=await page.evaluate(()=>({
    html:document.querySelector('#historyMeritTrend')?.textContent||'',
    note:document.querySelector('#historyMeritTitle')?.textContent||'',
    falseArrows:document.querySelectorAll('#historyMeritTrend .positive, #historyMeritTrend .negative').length
  }));
  assert(earlyHistory.note.includes('Provisional')&&earlyHistory.html.includes('Provisional')&&earlyHistory.falseArrows===0,
    "Early season Merit must not publish unsupported ranks or Week 0 deltas");
  await page.locator("#historyWeek").selectOption(firstOption);
  assert.equal(await page.locator("#historyPowerTrend tr").count(),25,"Week0 preseason Power Top25 unavailable");
  assert.equal(await page.locator("#historyMeritTrend tr").count(),0,"Week0 must not pretend teams earned Merit without any games");
  assert((await page.locator("#historyDetailed tr").count())>=130,"Historical all-FBS drilldown incomplete");
  await page.locator('#pageSwitch [data-page="preseason"]').click();
  await page.locator("#preseasonTable tr").first().waitFor({timeout:15000});
  assert.equal(await page.locator("#preseasonTable tr").count(),25,"Preseason Power Top 25 missing");
  await page.locator("#preseasonCount").selectOption("138");
  assert((await page.locator("#preseasonTable tr").count())>=135,"All-FBS preseason power missing");
  assert((await page.locator("#preseasonPlayoffTable tr").count())>=10,"Preseason playoff and title simulation missing");
  const priorStatus=await page.evaluate(()=>({enabled:MODEL_PRESEASON_V53.enabled,
     teams:Object.keys(MODEL_PRESEASON_V53.data?.teams||{}).length,
     champ:preseasonView.forecast?.contenders?.[0]?.team,
     latestZero:state.teams.every(t=>t.preseasonPriorWeight===0)}));
  assert(priorStatus.enabled&&priorStatus.teams>=135&&priorStatus.champ&&priorStatus.latestZero,
     "Preseason prior must be loaded and decay completely by the current week");
  await page.locator('#pageSwitch [data-page="matchups"]').click();
  await page.waitForFunction(()=>Boolean(weeklyView.predictionLedger?.seasons?.["2025"]?.weeks?.length &&
    weeklyView.predictionLedger?.seasons?.["2026"]?.weeks?.length),{timeout:45000});
  const yearEnd=await page.evaluate(()=>({
    y2025:weeklyView.predictionLedger.seasons["2025"].overall,
    y2026:weeklyView.predictionLedger.seasons["2026"].overall,
    currentYtd:document.querySelector("#matchupSummary")?.textContent
  }));
  assert(yearEnd.y2025.played>400&&yearEnd.y2026.played>300,"Both seasons must have a complete pregame matchup scorecard");
  assert(yearEnd.currentYtd.includes("year-to-date"),"Current matchups must display a YTD performance record");
  await page.locator("#matchupSeason").selectOption("2025");
  const week=await page.locator("#matchupWeek option").first().getAttribute("value");
  await page.locator("#matchupWeek").selectOption(week);
  await page.locator("#matchupGrid [data-matchup]").first().waitFor();
  const historic=await page.evaluate(()=>({
    title:document.querySelector("#matchupsTitle")?.textContent,
    summary:document.querySelector("#matchupSummary")?.textContent,
    games:weeklyView.visibleMatchups,
    stats:weeklyView.predictionLedger.seasons["2025"].weeks.find(w=>String(w.week)===String(weeklyView.matchWeek)).summary
  }));
  assert(historic.title.includes("2025")&&historic.summary.includes("YTD"),"Historical Matchups week picker/YTD failed");
  assert(historic.games.every(g=>g.asOfUtc&&new Date(g.asOfUtc)<new Date(g.kickoffUtc)),
    "Historical matchup uses future game info");
  assert(historic.games.filter(g=>g.finished).every(g=>typeof g.correct==="boolean"),
    "Actual winner comparisons missing");
  await page.locator("#matchupGrid [data-matchup]").first().click();
  await page.locator("#matchupDialog.open").waitFor();
  const matchupDetails=await page.locator("#matchupDetail").innerText();
  assert(matchupDetails.includes("Final result"),"Historical prediction outcome missing");
  assert(matchupDetails.includes("Matchup Score")&&matchupDetails.includes("rushing")&&
    matchupDetails.includes("passing")&&matchupDetails.includes("How the prediction is calculated"),
    "Matchup Score and opponent-specific offense/defense preview missing");
  const scores=await page.evaluate(()=>weeklyView.visibleMatchups.slice(0,10).map(g=>({
   total:g.homeMatchupScore+g.awayMatchupScore,
   p:g.homeWinProbability*100,
   match:g.homeMatchupScore,
   powerHome:g.homeMetrics.powerScore,
   powerAway:g.awayMetrics.powerScore
  })));
  assert(scores.every(x=>Math.abs(x.total-100)<.001&&Math.abs(x.p-x.match)<.001),
    "Matchup Score must represent calibrated game-specific win likelihood");
  await page.locator("#matchupClose").click();
  await page.locator("#matchupSeason").selectOption("2026");
  await page.locator("#matchupWeek").selectOption("current");
  assert((await page.locator("#matchupSummary").innerText()).includes("year-to-date"),"Current week YTD did not restore");
  await page.waitForFunction(()=>Boolean(weeklyView.industryBenchmark),{timeout:35000});
  const external=await page.locator("#matchupIndustryBenchmark").innerText();
  assert(external.includes("CFMI V5.3")&&external.includes("SP+")&&external.includes("FEI"),
    "Matched industry scorecard missing");

  const schedules=await page.evaluate(()=>weeklyView.data?.upcoming?.games?.length||0);
  if(schedules){
    await page.locator("#matchupGrid [data-matchup]").first().click();
    await page.locator("#matchupDialog.open").waitFor();
    const matchupText=await page.locator("#matchupDetail").innerText();
    assert(matchupText.includes("Three matchup-specific takeaways")&&matchupText.includes("How "), "Missing matchup explanations");
    await page.locator("#matchupClose").click();
  }
  await page.locator('#pageSwitch [data-page="rankings"]').click();
  assert(await page.locator('#rankings').isVisible()&&!(await page.locator('#methodologyPage').isVisible()),"Home tab did not restore rankings");
  assert.equal(errors.length,0,"Browser console exceptions: "+errors.join("; "));
  console.log("CFMI V5 BROWSER SMOKE PASSED",JSON.stringify(model));
 }catch(err){console.error("CFMI V5 BROWSER SMOKE FAILED:",err.stack||String(err));process.exitCode=1}
 finally{if(browser)await browser.close();server.kill("SIGTERM")}
})();
