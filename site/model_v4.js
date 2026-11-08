/* CFMI V4 — independent 2026 season-only merit and opponent-adjusted performance.
   No preseason, brand, poll or conference prestige inputs are used.
   Design influences: FEI/SP+ opponent adjustment, Massey/Colley season-only
   inference, and Elo expected-outcome information; all formulas are original. */
'use strict';
const MODEL_V4={
  version:"4.0.0", name:"CFMI V4 — merit + opponent-adjusted performance",
  weights:{sor:.30,mov:.20,quality:.15,eff:.35},
  efficiency:{ppa:10,success:7,explosive:5,consistency:4,control:3,redzone:3,turnovers:2,penalties:1},
  ridge:3.5,homePoints:2.5,eloHome:55,eloK:26,
  minimumAdvancedCoverage:.70
};
const v4clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const v4mean=xs=>xs.length?xs.reduce((s,v)=>s+v,0)/xs.length:0;
const v4sd=xs=>{if(xs.length<2)return .6;const m=v4mean(xs);return Math.sqrt(v4mean(xs.map(x=>(x-m)*(x-m))))};
const v4sigmoid=x=>1/(1+Math.exp(-v4clamp(x,-32,32)));
const v4margin=m=>Math.sign(m)*(Math.min(Math.abs(m),17)+.42*Math.min(Math.max(0,Math.abs(m)-17),45));
function computeV4(rows,cutoffMode){
  const cutoff=cutoffMode==='live'?Date.now():CUTOFF[cutoffMode];
  const games=rows.filter(r=>r.season==='2026'&&r.season_type==='regular'&&r.completed==='TRUE'
    &&r.home_points!==''&&r.away_points!==''&&r.home_points!=='NA'&&r.away_points!=='NA'
    &&Number.isFinite(Number(r.home_points))&&Number.isFinite(Number(r.away_points))
    &&Date.parse(r.start_date)<=cutoff).map(r=>({
      id:String(r.game_id),week:Number(r.week),date:r.start_date,
      home:r.home_team,away:r.away_team,hConf:r.home_conference,aConf:r.away_conference,
      hDiv:r.home_division,aDiv:r.away_division,neutral:r.neutral_site==='TRUE',
      hp:Number(r.home_points),ap:Number(r.away_points)
    }));
  const map=new Map();
  for(const r of rows){
    if(r.season!=='2026')continue;
    for(const side of ['home','away']){
      if(r[side+'_division']!=='fbs')continue;
      const name=r[side+'_team'];
      if(!map.has(name))map.set(name,{
        name,conference:r[side+'_conference']||'Independent',rating:0,elo:1500,power:0,
        won:0,lost:0,ties:0,played:[],fbsG:[],roadWins:0,roadLosses:0,
        rawMOV:0,top25Wins:0,top25RoadWins:0,closeQualityLosses:0,qualityWins:0
      });
    }
  }
  const teams=[...map.values()].sort((a,b)=>a.name.localeCompare(b.name));
  for(const g of games){
    g.hfbs=map.has(g.home)&&g.hDiv==='fbs';
    g.afbs=map.has(g.away)&&g.aDiv==='fbs';
    for(const side of ['h','a']){
      const ish=side==='h',own=ish?g.home:g.away,team=map.get(own);
      if(!team || !(ish?g.hfbs:g.afbs))continue;
      const op=ish?g.away:g.home,pf=ish?g.hp:g.ap,pa=ish?g.ap:g.hp;
      const site=g.neutral?'N':ish?'H':'A';
      const gm={id:g.id,week:g.week,date:g.date,op,opFbs:ish?g.afbs:g.hfbs,
        site,pf,pa,margin:pf-pa,win:pf>pa?1:0,loss:pf<pa?1:0,
        neutral:g.neutral,oppRank:null,eloSurprise:0,qualityScore:0};
      team.played.push(gm);
      if(gm.opFbs)team.fbsG.push(gm);
      team.won+=gm.win;team.lost+=gm.loss;team.ties+=Number(!gm.win&&!gm.loss);
      team.rawMOV+=gm.margin;
      if(site==='A'){team.roadWins+=gm.win;team.roadLosses+=gm.loss}
    }
  }
  // Batch opponent strength — regularized SRS based strictly on completed FBS games.
  // Runs to convergence; no preseason seed, poll ranking, recruiting or conf weights.
  const H=MODEL_V4.homePoints,ridge=MODEL_V4.ridge;
  for(let iter=0;iter<260;iter++){
    let diff=0;const updates=[];
    for(const t of teams){
      const numerator=t.fbsG.reduce((sum,g)=>{
        const opp=map.get(g.op),venue=g.site==='H'?H:g.site==='A'?-H:0;
        return sum+v4margin(g.margin)-venue+(opp?.rating||0);
      },0);
      const raw=numerator/(t.fbsG.length+ridge);
      const next=.67*t.rating+.33*raw;updates.push(next);diff=Math.max(diff,Math.abs(next-t.rating));
    }
    teams.forEach((t,i)=>t.rating=updates[i]);
    if(diff<1e-7)break;
  }
  // Season-only chronological Elo, neutral 1500 start for EVERY program. Schedule
  // difficulty emerges from actual results, with diminishing margin multiplier.
  const ordered=games.filter(g=>g.hfbs&&g.afbs).slice().sort((a,b)=>Date.parse(a.date)-Date.parse(b.date)||a.id.localeCompare(b.id));
  const elos=new Map(teams.map(t=>[t.name,1500]));
  const nRatedGames=new Map(teams.map(t=>[t.name,0]));
  for(const g of ordered){
    const a=elos.get(g.home),b=elos.get(g.away);
    const homeAdv=g.neutral?0:MODEL_V4.eloHome;
    const expected=v4sigmoid(((a+homeAdv)-b)*Math.log(10)/400);
    const actual=g.hp>g.ap?1:g.hp<g.ap?0:.5;
    const marginMultiplier=v4clamp(1+.12*Math.log1p(Math.max(0,Math.abs(g.hp-g.ap)-3)),1,1.5);
    // A chess-inspired K schedule starts responsive when every team has
    // little evidence, then stabilizes without using preseason priors.
    const n=Math.min(nRatedGames.get(g.home),nRatedGames.get(g.away));
    const adaptiveK=MODEL_V4.eloK*(.70+.30*Math.sqrt(6/(6+n)));
    const delta=adaptiveK*marginMultiplier*(actual-expected);
    nRatedGames.set(g.home,nRatedGames.get(g.home)+1);
    nRatedGames.set(g.away,nRatedGames.get(g.away)+1);
    elos.set(g.home,a+delta);elos.set(g.away,b-delta);
  }
  for(const t of teams){
    t.elo=elos.get(t.name)||1500;
    t.power=.78*t.rating+.22*(t.elo-1500)/12;
  }
  const powerRank=teams.slice().sort((a,b)=>b.power-a.power).map((t,i)=>[t.name,i+1]);
  const powerRanks=new Map(powerRank);
  for(const t of teams)t.powerRank=powerRanks.get(t.name);
  const powerSorted=teams.map(t=>t.power).sort((a,b)=>b-a);
  const bench=powerSorted[Math.min(24,powerSorted.length-1)];
  const median=powerSorted[Math.floor(powerSorted.length/2)];
  // Opponent power, not conference name, determines all opponent-quality credit.
  // A top-25 opponent is TOP 25 IN CFMI'S INDEPENDENT SEASON-ONLY POWER,
  // never AP/CFP. That opponent's power and the game's site modify every
  // expectation and the per-game performance estimate.
  const basePoints=games.filter(g=>g.hfbs&&g.afbs).reduce((x,g)=>({sum:x.sum+g.hp+g.ap,n:x.n+2}),{sum:0,n:0});
  const scoringMean=basePoints.n?basePoints.sum/basePoints.n:27;
  for(const t of teams){
    t.winpct=t.played.length?t.won/t.played.length:0;
    t.expected=0;t.wab=0;t.mov=0;t.qSum=0;t.roadQSum=0;t.qWins=0;
    t.qualityRoadWins=0;t.off=0;t.def=0;t.bestWin=null;
    let offTotal=0,defTotal=0,nScoring=0,opStrengthTotal=0,opStrengthN=0;
    for(const g of t.played){
      const opp=map.get(g.op);
      const or=g.opFbs&&opp?opp.power:-26;
      const venue=g.site==='H'?H:g.site==='A'?-H:0;
      const prob=v4sigmoid((bench-or+venue)/9);
      g.expected=prob;
      g.opRating=or;g.oppRank=g.opFbs?powerRanks.get(g.op):null;
      g.q=0;g.qualityScore=0;g.eloSurprise=0;
      t.expected+=prob;
      if(g.opFbs){opStrengthTotal+=or;opStrengthN++}
      // A blowout over an FCS opponent is a win, but not evidence of
      // top-tier FBS ability. Always below even weak-FBS win credit.
      const adjusted=g.opFbs?v4margin(g.margin)-venue+or:(g.win?-18:-34);
      g.adjustedMOV=adjusted;t.mov+=adjusted;
      const originalMarginExpected=v4sigmoid(((t.power-or+venue))/7);
      g.eloSurprise=g.win-originalMarginExpected;
      // Distinguish earned game performance from the record. A 3-point loss
      // on the road against an elite team can be a strong on-field showing.
      g.qualityScore=v4clamp(50+1.65*adjusted+(g.win?5:g.loss?-5:0),0,100);
      if(g.win&&g.opFbs){
        // Smooth opponent merit: even a weak FBS team retains modest credit,
        // but beating a top-25 strength team produces 2–4x the quality credit.
        const opponentMerit=.20+1.35*v4sigmoid((or-median)/6.5);
        const surprise=1+.22*(1-prob);
        const siteMultiplier=g.site==='A'?1.52:g.site==='N'?1.16:1;
        g.q=opponentMerit*surprise*siteMultiplier;
        t.qSum+=g.q;
        if(g.site==='A')t.roadQSum+=g.q;
        if(or>median)t.qWins++;
        if(g.oppRank<=25){t.top25Wins++;if(g.site==='A')t.top25RoadWins++}
        if(!t.bestWin||g.q>t.bestWin.q)t.bestWin=g;
      }
      if(g.loss&&g.opFbs&&g.margin>=-7&&g.oppRank<=25)t.closeQualityLosses++;
      if(g.opFbs&&opp){
        // Scoring diagnostics exclude the measured game from opponent's box
        // score baseline and borrow two neutral games to stabilize small samples.
        const remaining=opp.fbsG.filter(x=>x.id!==g.id);
        const oppPF=v4mean(remaining.map(x=>x.pf));
        const oppPA=v4mean(remaining.map(x=>x.pa));
        const expAllowed=(remaining.length*oppPA+2*scoringMean)/(remaining.length+2);
        const expScored=(remaining.length*oppPF+2*scoringMean)/(remaining.length+2);
        offTotal+=g.pf-expAllowed;defTotal+=expScored-g.pa;nScoring++;
      }
    }
    t.wab=t.won-t.expected;
    t.mov=t.played.length?t.mov/t.played.length:0;
    t.off=nScoring?(offTotal/nScoring)*nScoring/(nScoring+2):0;
    t.def=nScoring?(defTotal/nScoring)*nScoring/(nScoring+2):0;
    t.fbsGames=t.fbsG.length;t.games=t.played.length;
    t.sos=opStrengthN?opStrengthTotal/opStrengthN:-26;
    t.opponentQualityAverage=t.sos;
    t.eloGames=nRatedGames.get(t.name);
    t.quality=t.qSum;t.qRoadWins=t.top25RoadWins;
    t.qualityRoadWins=t.top25RoadWins;
  }
  ['wab','winpct','mov','sos','quality','roadQSum','off','def','rating','power','elo','roadWins','qRoadWins','top25Wins','top25RoadWins'].forEach(k=>pctRanks(teams,k,k));
  for(const t of teams){
    t.sor=.85*t.wabPct+.15*t.winpctPct;
    t.qualityComponent=.75*t.qualityPct+.25*t.roadQSumPct;
  }
  pctRanks(teams,'sor','sor');pctRanks(teams,'qualityComponent','qualityComponent');
  for(const t of teams)t.score=(MODEL_V4.weights.sor*t.sor+MODEL_V4.weights.mov*t.movPct+MODEL_V4.weights.quality*t.qualityComponent)/.65;
  rankTeams(teams);
  return {teams,games,bench,median,mean:scoringMean,modelVersion:MODEL_V4.version};
}
function attachEfficiencyV4(teams,rows){
  const teamByName=new Map(teams.map(t=>[normalizeTeam(t.name),t]));
  const byKey=new Map();
  const fields=['off_ppa','def_ppa','off_success_rate','def_success_rate','off_explosive_rate','def_explosive_rate',
    'lead_share','penalty_yards','opp_penalty_yards','turnovers_lost','turnovers_gained',
    'redzone_td','redzone_trips','opp_redzone_td','opp_redzone_trips','expected_turnover_margin'];
  for(const row of rows){
    const t=teamByName.get(normalizeTeam(row.team)),id=String(row.game_id||'');
    if(!t||!t.fbsG.some(g=>String(g.id)===id))continue;
    const v={id,team:t,gm:t.fbsG.find(g=>String(g.id)===id)};
    for(const k of fields){
      let x=String(row[k]??'').trim(),n=x!==''&&!/^(NA|null|nan|none)$/i.test(x)?Number(x):NaN;
      if(!Number.isFinite(n))continue;
      if(['off_success_rate','def_success_rate','off_explosive_rate','def_explosive_rate','lead_share','redzone_td','opp_redzone_td'].includes(k)&&n>1&&n<=100)n/=100;
      if(['off_success_rate','def_success_rate','off_explosive_rate','def_explosive_rate','lead_share','redzone_td','opp_redzone_td'].includes(k)&&!(n>=0&&n<=1))continue;
      if(['off_ppa','def_ppa'].includes(k)&&Math.abs(n)>10)continue;
      if(['penalty_yards','opp_penalty_yards','turnovers_lost','turnovers_gained','redzone_trips','opp_redzone_trips'].includes(k)&&n<0)continue;
      v[k]=n;
    }
    // At least one observable play-level measure; other fields may be missing.
    if(!['off_ppa','off_success_rate','off_explosive_rate','lead_share'].some(k=>Number.isFinite(v[k])))continue;
    byKey.set(id+'|'+normalizeTeam(t.name),v);
  }
  for(const t of teams){
    t.advGames=t.fbsG.map(g=>byKey.get(String(g.id)+'|'+normalizeTeam(t.name))).filter(Boolean);
    // "Advanced coverage" is CORE offensive+defensive EPA, never just a
    // score-derived quarter-lead or a partial box-score observation.
    t.advCoreGames=t.advGames.filter(g=>Number.isFinite(g.off_ppa)&&Number.isFinite(g.def_ppa)).length;
    t.advAnyGames=t.advGames.length;
    t.advCoverage=t.fbsGames?t.advCoreGames/t.fbsGames:0;
    t.advMetricCoverage={};t.advMetricCounts={};
    t.effScore=NaN;
  }
  const observations=teams.flatMap(t=>t.advGames);
  const expected=teams.reduce((s,t)=>s+t.fbsGames,0);
  const covered=observations.filter(g=>Number.isFinite(g.off_ppa)&&Number.isFinite(g.def_ppa)).length;
  state.advCovered=covered;state.advExpected=expected;
  state.fullModel=expected>0&&covered/expected>=MODEL_V4.minimumAdvancedCoverage;
  if(!state.fullModel){
    for(const t of teams){
      t.effScore=50;
      t.score=(MODEL_V4.weights.sor*t.sor+MODEL_V4.weights.mov*t.movPct+MODEL_V4.weights.quality*t.qualityComponent)/.65;
    }
    rankTeams(teams);
    return;
  }
  const base={};
  const tracked=['off_ppa','def_ppa','off_success_rate','def_success_rate','off_explosive_rate','def_explosive_rate','redzone_td','opp_redzone_td','penalty_yards','turnovers_lost','turnovers_gained'];
  for(const field of tracked){
    const vals=observations.map(x=>x[field]).filter(Number.isFinite);
    base[field]=vals.length?v4mean(vals):0;
  }
  const byTeam=new Map(teams.map(t=>[t.name,t.advGames]));
  // Leave the measured matchup out of each opponent baseline. Two league-average
  // pseudo-games guard against sparse schedules and self-referential overfitting.
  function opponentMean(name,id,field){
    const other=(byTeam.get(name)||[]).filter(x=>x.id!==id).map(x=>x[field]).filter(Number.isFinite);
    return (other.reduce((s,x)=>s+x,0)+2*base[field])/(other.length+2);
  }
  const rawMetrics=['ppaNet','successNet','explosiveNet','control','penaltyNet','turnoverNet','redzoneNet','effWinRate','effStability'];
  for(const t of teams){
    const sample=Object.fromEntries(rawMetrics.map(k=>[k,[]]));
    const volOff=[],volDef=[];
    for(const a of t.advGames){
      const opp=a.gm.op,id=a.id;
      const f=.80;
      const oPPA=Number.isFinite(a.off_ppa)?a.off_ppa+f*(base.def_ppa-opponentMean(opp,id,'def_ppa')):null;
      const dPPA=Number.isFinite(a.def_ppa)?a.def_ppa+f*(base.off_ppa-opponentMean(opp,id,'off_ppa')):null;
      if(oPPA!==null&&dPPA!==null){
        const net=oPPA-dPPA;
        sample.ppaNet.push(net);sample.effWinRate.push(net>0?1:0);
        volOff.push(oPPA);volDef.push(dPPA);
      }
      if(Number.isFinite(a.off_success_rate)&&Number.isFinite(a.def_success_rate)){
        const off=a.off_success_rate+f*(base.def_success_rate-opponentMean(opp,id,'def_success_rate'));
        const def=a.def_success_rate+f*(base.off_success_rate-opponentMean(opp,id,'off_success_rate'));
        sample.successNet.push(off-def);
      }
      if(Number.isFinite(a.off_explosive_rate)&&Number.isFinite(a.def_explosive_rate)){
        const off=a.off_explosive_rate+f*(base.def_explosive_rate-opponentMean(opp,id,'def_explosive_rate'));
        const def=a.def_explosive_rate+f*(base.off_explosive_rate-opponentMean(opp,id,'off_explosive_rate'));
        sample.explosiveNet.push(off-def);
      }
      if(Number.isFinite(a.lead_share)){
        const venue=a.gm.site==='A'?.04:a.gm.site==='H'?-.04:0;
        sample.control.push(a.lead_share-.5+venue+.15*Math.tanh((a.gm.opRating||0)/12));
      }
      if(Number.isFinite(a.penalty_yards)&&Number.isFinite(a.opp_penalty_yards)){
        // Net discipline, corrected slightly for opposition's own typical
        // penalty tendencies so an undisciplined foe can't dominate the signal.
        const net=a.opp_penalty_yards-a.penalty_yards;
        sample.penaltyNet.push(net-.25*(opponentMean(opp,id,'penalty_yards')-base.penalty_yards));
      }
      if(Number.isFinite(a.expected_turnover_margin)){
        sample.turnoverNet.push(v4clamp(a.expected_turnover_margin,-3,3));
      }else if(Number.isFinite(a.turnovers_lost)&&Number.isFinite(a.turnovers_gained)){
        // Substantially shrink raw turnover differential; recoveries are noisy.
        sample.turnoverNet.push(.45*v4clamp(a.turnovers_gained-a.turnovers_lost,-3,3));
      }
      if(Number.isFinite(a.redzone_td)&&Number.isFinite(a.opp_redzone_td)){
        const off=a.redzone_td+.6*(base.opp_redzone_td-opponentMean(opp,id,'opp_redzone_td'));
        const def=a.opp_redzone_td+.6*(base.redzone_td-opponentMean(opp,id,'redzone_td'));
        sample.redzoneNet.push(off-def);
      }
    }
    if(sample.ppaNet.length){
      const n=sample.ppaNet.length;
      sample.effStability.push(-((v4sd(volOff)+v4sd(volDef))*n/(n+3)+.5*3/(n+3)));
    }
    t._v4Samples=sample;
    for(const key of rawMetrics){
      t.advMetricCounts[key]=key==='effStability'?sample.ppaNet.length:sample[key].length;
      t.advMetricCoverage[key]=t.fbsGames?Math.min(1,t.advMetricCounts[key]/t.fbsGames):0;
      t[key]=sample[key].length?v4mean(sample[key]):0;
    }
  }
  function rankMeasured(field,countField=field){
    const eligible=teams.filter(t=>t.advMetricCounts[countField]>0);
    if(eligible.length)pctRanks(eligible,field,field);
    for(const t of teams)if(!(t.advMetricCounts[countField]>0)){
      t[field+'Pct']=50;t[field+'Rank']='—';
    }
  }
  for(const field of rawMetrics)rankMeasured(field,field);
  for(const t of teams){
    t.consistencyScore=.60*t.effWinRatePct+.40*t.effStabilityPct;
    t.advMetricCoverage.consistencyScore=t.advMetricCoverage.ppaNet;
  }
  rankMeasured('consistencyScore','ppaNet');
  const e=MODEL_V4.efficiency;
  const components=[
    ['ppaNet',e.ppa],['successNet',e.success],['explosiveNet',e.explosive],
    ['consistencyScore',e.consistency],['control',e.control],['redzoneNet',e.redzone],
    ['turnoverNet',e.turnovers],['penaltyNet',e.penalties]
  ];
  for(const t of teams){
    t.effScore=components.reduce((sum,[key,weight])=>{
      const metricCoverage=t.advMetricCoverage[key]||0;
      return sum+weight*(50+metricCoverage*(t[key+'Pct']-50));
    },0)/35;
  }
  pctRanks(teams,'effScore','effScore');
  for(const t of teams){
    t.score=MODEL_V4.weights.sor*t.sor+MODEL_V4.weights.mov*t.movPct+
      MODEL_V4.weights.quality*t.qualityComponent+MODEL_V4.weights.eff*t.effScore;
  }
  rankTeams(teams);
}
