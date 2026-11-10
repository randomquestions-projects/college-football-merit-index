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
  try{
    await page.waitForFunction(()=>state.fullModel===true &&
      state.metricContractAudit?.allScoresReconciled===true &&
      state.teams.length>=130,null,{timeout:30000});
  }catch(err){
    const detail=await page.evaluate(()=>({fullModel:state.fullModel,metricAudit:state.metricContractAudit||null,
      status:document.querySelector('#stamp')?.textContent,
      tableStatus:document.querySelector('#tableStatus')?.textContent,
      scores:state.teams.slice(0,2).map(t=>({team:t.name,score:t.score,powerScore:t.powerScore})),
      scripts:[...document.scripts].filter(s=>s.src).map(s=>s.src)}));
    throw Error('Dashboard metric contract failed to reach ready state: '+JSON.stringify({detail,errors}));
  }
  const names=await page.locator("#body tr[data-team]").allTextContents();
  assert(names.length>=25,"Expected populated Top 50");
  const model=await page.evaluate(()=>({version:MODEL_V5.version,parameters:MODEL_V5.params.source,teamCount:state.teams.length,active:state.fullModel,score:state.teams[0].score,powerScore:state.teams[0].powerScore,powerRank:state.teams[0].powerRank,coreCount:state.advCovered,expected:state.advExpected}));
  assert(model.version==="5.6.0"&&model.teamCount>=130,"Dual Merit/Power model did not run");
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
  assert(await page.locator("#purposeMethodTitle").isVisible(),"Purpose & Methodology not visible");
  const purpose=await page.locator('#methodologyPage').innerText();
  assert(purpose.includes('Who deserves to be ranked highest?') &&
    purpose.includes('Who is actually the strongest team?') &&
    purpose.includes('Two questions. Two independent answers.') &&
    purpose.includes('Credibility and independence were always essential') &&
    purpose.includes('biases and inertia') &&
    purpose.includes('Matchup Predictor'),
    "Original purpose, Merit, Power, credibility and secondary matchup language must be visible");
  for(const exact of [
    'Wins and losses: Results matter, but not every win is equal.',
    'Strength of schedule: Beating Alabama should be worth significantly more than beating a weak opponent.',
    'Quality wins: Reward teams that beat elite competition.',
    'Head-to-head: Direct results should carry meaningful weight when comparing similarly accomplished teams.',
    'Quality of losses: A narrow road loss to an elite team shouldn',
    'EPA, success rate, explosiveness, scoring performance',
    'Comprehensive, high-quality football data',
    'Statistically defensible methodologies',
    'Historical analysis and validation',
    'Clear explanations for why teams are ranked where they are'
  ])assert(purpose.includes(exact),'Original screenshot-derived passage missing: '+exact);
  assert(!/V4\.1|V5\.5|55% \/ 25%|how to recreate|Historical held-out check|SRS\(team\)/.test(purpose),
    "Detailed model/version implementation leaked into public purpose page");
  assert(model.coreCount/model.expected>=.70,"Core EPA coverage below required threshold");
  await page.locator('#pageSwitch [data-page="resume"]').click();
  await page.locator("#resumeControls select").first().waitFor();
  assert.equal(await page.locator("#resumeControls select").count(),5,"Expected five comparison selectors");
  assert.equal(await page.locator("#resumeHead [data-open-team]").count(),3,"Default three teams missing");
  assert(await page.locator("#resumeNarratives .resume-narrative").count()>=2,"Missing deterministic résumé narratives");
  const ndAudit=await page.evaluate(()=>{
    const nd=state.teams.find(x=>x.name==='Notre Dame');
    const miami=CFMI_PUBLIC_VIEW.wins(nd,null,'signature').find(x=>x.opponent==='Miami');
    const unc=CFMI_PUBLIC_VIEW.wins(nd,null,'signature').find(x=>x.opponent==='North Carolina');
    const card=[...document.querySelectorAll('#resumeGames .resume-games-card')]
      .find(e=>e.querySelector('h3')?.textContent.includes('Notre Dame'));
    return {miami:miami?.meritSignatureWinUnits,unc:unc?.meritSignatureWinUnits,
       firstWin:card?.querySelector('p strong')?.textContent,
       hasLegacyMarkup:card?.textContent.includes('performance 81/100')||card?.textContent.includes('quality credit 1.52'),
       contract:state.metricContractAudit};
  });
  assert(ndAudit.miami>ndAudit.unc&&ndAudit.firstWin==='Miami'&&!ndAudit.hasLegacyMarkup,
    "Notre Dame best-win card must reflect active Merit over V4 road bonus");
  assert(ndAudit.contract?.allScoresReconciled&&ndAudit.contract?.schools>=130,
    "Full-FBS view contracts not verified before serving");
  await page.locator("#resumeTeam3").selectOption("Texas");
  assert.equal(await page.locator("#resumeHead [data-open-team]").count(),4,"Fourth team selection failed");
  await page.locator('#resumeHead [data-open-team="Georgia"]').click();
  await page.locator("#detailScrim.open").waitFor();
  const detail=(await page.locator("#detailBody").innerText()).toLowerCase();
  assert(detail.includes("signature-win")&&detail.includes("opponent")&&detail.includes("estimated margin"),"V6 team audit not aligned to active Merit");
  await page.locator("#closeModal").click();
  await page.locator('#resumeHead [data-open-team="Georgia"]').focus();
  await page.keyboard.press('Enter');
  await page.locator('#detailScrim.open').waitFor();
  assert((await page.locator('#detailTitle').textContent()).includes('Georgia'),'Keyboard team header did not open popup');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#detailScrim.open').count(),0,'Escape must close team details');
  assert.equal(await page.locator('#resumeHead [data-open-team="Georgia"]').evaluate(e=>document.activeElement===e),true,
    'Team dialog should restore keyboard focus to invoking header');

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
      if(!body.includes("Reconciled:"))issues.push(team.name+": bad component display");
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
  await page.locator('#pageSwitch [data-page="rankings"]').click();
  const firstRow=page.locator('#body tr[data-team]').first();
  await firstRow.focus();
  await page.keyboard.press('Enter');
  await page.locator('#detailScrim.open').waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#detailScrim.open').count(),0,'Ranking row must be operable via keyboard');
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
  assert(await page.locator('#purposeMethodTitle').innerText()==='Purpose & Methodology',
    "Public methodology heading mismatch");
  assert.equal(await page.locator('#methodologyPage .purpose-index-card').count(),2,
    "Expected separate Merit and Power explanation cards");
  assert.equal(await page.locator('#legacyMethod').count(),0,
    "Superseded archived methodology must not appear in public page");
  assert.equal(await page.locator('#methodologyPage table').count(),0,
    "Public purpose should not display reproducible model weighting tables");
  await page.locator('#methodologyPage [data-focus-page="matchups"]').click();
  assert(await page.locator('#matchupsPage').isVisible(),"Secondary matchup link does not work");
  await page.locator('#pageSwitch [data-page="methodology"]').click();
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
     latestZero:state.teams.filter(t=>t.fbsGames>=6).every(t=>t.preseasonPriorWeight===0)}));
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
  assert(external.includes("CFMI")&&external.includes("SP+")&&external.includes("FEI"),
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
  const auditDataset=await page.evaluate(async()=>{
    const res=await fetch('./data/public_metric_audit_2026.json',{cache:'no-store'});
    if(!res.ok)throw Error('Public audit dataset missing: HTTP '+res.status);
    const audit=await res.json();
    const nd=audit.teamAudit.find(x=>x.team.team==='Notre Dame');
    const wins=nd?.games.filter(x=>x.win&&x.isFbs).sort((a,b)=>b.meritSignatureWinUnits-a.meritSignatureWinUnits);
    return {schools:audit.manifest.population.schools,fields:Object.keys(audit.manifest.fieldDefinitions||{}).length,
      hashes:Object.keys(audit.manifest.sourceSha256||{}).length,model:audit.manifest.scoringModel,
      firstNotreDameWin:wins?.[0]?.opponent,viewContract:audit.manifest.contractSchema};
  });
  assert(auditDataset.schools>=130&&auditDataset.fields>=15&&auditDataset.hashes>=10&&
    auditDataset.firstNotreDameWin==='Miami'&&auditDataset.model==='5.6.0',
    'Public audit export not reconciled with active published rankings');
  const mobile=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
  const mobileErrors=[];mobile.on('pageerror',error=>mobileErrors.push(String(error)));
  await mobile.goto(url,{waitUntil:'domcontentloaded'});
  await mobile.waitForFunction(()=>Boolean(state.metricContractAudit?.allScoresReconciled&&state.fullModel),null,{timeout:35000});
  const mobileLayout=await mobile.evaluate(()=>({
    width:window.innerWidth,documentWidth:document.documentElement.scrollWidth,
    rankScrollWidth:document.querySelector('#rankingTable')?.scrollWidth,
    containerWidth:document.querySelector('#rankingTable')?.closest('.table-scroll')?.clientWidth
  }));
  assert(mobileLayout.documentWidth<=mobileLayout.width+8,
    'Mobile dashboard has uncontrolled horizontal overflow: '+JSON.stringify(mobileLayout));
  const mobileRow=mobile.locator('#body tr[data-team]').first();
  await mobileRow.focus();
  await mobile.keyboard.press('Enter');
  await mobile.locator('#detailScrim.open').waitFor();
  const modalWidth=await mobile.evaluate(()=>document.querySelector('#detailScrim .modal')?.getBoundingClientRect().width);
  assert(modalWidth<=390&&modalWidth>=250,'Mobile team audit dialog cannot fit viewport: '+modalWidth);
  await mobile.keyboard.press('Escape');
  assert.equal(await mobile.locator('#detailScrim.open').count(),0,'Mobile team popup must close via keyboard');
  assert.equal(mobileErrors.length,0,'Mobile browser exception: '+mobileErrors.join('; '));
  await mobile.close();
  assert.equal(errors.length,0,"Browser console exceptions: "+errors.join("; "));
  console.log("CFMI V5 BROWSER SMOKE PASSED",JSON.stringify(model));
 }catch(err){console.error("CFMI V5 BROWSER SMOKE FAILED:",err.stack||String(err));process.exitCode=1}
 finally{if(browser)await browser.close();server.kill("SIGTERM")}
})();
