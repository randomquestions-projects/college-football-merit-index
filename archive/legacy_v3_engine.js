/* Archived V3-era prototype engine, retained without deletion for reproducible historical backtests.
 * NOT USED by current browser ranking, v5.5 Merit/Power or v6 public view contracts.
 * The implementation relies on shared state/parsing helpers injected by the historical evaluation harness.
 */
'use strict';

function compute(rows,cutoffMode){
  const minElapsed=0;
  const cutoff=cutoffMode==='live'?Date.now():CUTOFF[cutoffMode];
  let games=rows.filter(r=>r.season==='2026'&&r.season_type==='regular'&&r.completed==='TRUE'&&r.home_points!=='NA'&&r.away_points!=='NA'&&r.home_points!==''&&r.away_points!==''&&Date.parse(r.start_date)+minElapsed<=cutoff&&Number.isFinite(+r.home_points)&&Number.isFinite(+r.away_points)).map(r=>({id:r.game_id,week:+r.week,date:r.start_date,home:r.home_team,away:r.away_team,hConf:r.home_conference,aConf:r.away_conference,hDiv:r.home_division,aDiv:r.away_division,neutral:r.neutral_site==='TRUE',hp:+r.home_points,ap:+r.away_points}));
  // The FBS universe comes from the 2026 schedule as published by CFBD/sportsdataverse, not poll membership.
  const map=new Map();
  for(const r of rows){if(r.season!=='2026')continue;for(let side of ['home','away'])if(r[side+'_division']==='fbs') {const name=r[side+'_team'];if(!map.has(name))map.set(name,{name,conference:r[side+'_conference']||'Independent',rating:0,won:0,lost:0,ties:0,played:[],fbsG:[],roadWins:0,roadLosses:0,qualityRoadWins:0,rawMOV:0});}}
  for(const g of games){g.hfbs=map.has(g.home)&&g.hDiv==='fbs';g.afbs=map.has(g.away)&&g.aDiv==='fbs';for(const side of ['h','a']){const ishome=side==='h',name=ishome?g.home:g.away;if(!map.has(name)||!(ishome?g.hfbs:g.afbs))continue;const t=map.get(name);let op=ishome?g.away:g.home,opFbs=ishome?g.afbs:g.hfbs;const pf=ishome?g.hp:g.ap,pa=ishome?g.ap:g.hp;const site=g.neutral?'N':ishome?'H':'A';const gm={id:g.id,date:g.date,week:g.week,op,opFbs,site,pf,pa,margin:pf-pa,win:pf>pa?1:0,loss:pf<pa?1:0,neutral:g.neutral};t.played.push(gm);if(opFbs)t.fbsG.push(gm);t.won+=gm.win;t.lost+=gm.loss;if(!gm.win&&!gm.loss)t.ties++;if(site==='A'){t.roadWins+=gm.win;t.roadLosses+=gm.loss}t.rawMOV+=gm.margin;}}
  const teams=[...map.values()].sort((a,b)=>a.name.localeCompare(b.name));
  // Ridge SRS solution via damped coordinate fixed-point iterations, initialized neutrally.
  const ridge=3,H=2.5;
  for(let it=0;it<250;it++){let max=0;const next=[];for(let i=0;i<teams.length;i++){const t=teams[i];let sum=0;for(const g of t.fbsG){const opp=map.get(g.op);const venue=g.site==='N'?0:g.site==='H'?H:-H;sum+=capMargin(g.margin)-venue+opp.rating;}const value=sum/(t.fbsG.length+ridge),upd=.65*t.rating+.35*value;next.push(upd);max=Math.max(max,Math.abs(upd-t.rating));}teams.forEach((t,i)=>t.rating=next[i]);if(max<0.000001)break;}
  const rs=teams.map(t=>t.rating).sort((a,b)=>b-a),bench=rs[Math.min(24,rs.length-1)],median=rs[Math.floor(rs.length/2)];
  const natMean=games.filter(g=>g.hfbs&&g.afbs).reduce((acc,g)=>{acc.sum+=g.hp+g.ap;acc.n+=2;return acc},{sum:0,n:0});const mean=natMean.n?natMean.sum/natMean.n:27;
  for(const t of teams){t.winpct=t.played.length?t.won/t.played.length:0;t.sos=t.played.length?t.played.reduce((s,g)=>s+(g.opFbs?map.get(g.op).rating:-25),0)/t.played.length:-25;
    t.expected=0;t.wab=0;t.mov=0;t.qSum=0;t.roadQSum=0;t.qWins=0;t.qualityRoadWins=0;t.qualityGames=[];let offTotal=0,defTotal=0,ng=0;
    for(const g of t.played){const or=g.opFbs?map.get(g.op).rating:-25;const venue=g.site==='N'?0:g.site==='H'?H:-H;
      g.opRating=or;g.q=0;g.expected=sigmoid((bench-or+venue)/10);t.expected+=g.expected;
      // FCS wins cannot create positive adjusted-MOV credit; FCS defeats carry a material penalty.
      g.adjustedMOV=g.opFbs?capMargin(g.margin)-venue+or:(g.win?0:-24);
      t.mov+=g.adjustedMOV;
      if(g.win&&g.opFbs){g.q=clamp((or-median+3)/Math.max(5,(bench-median+12)),0,1.5);const mult=g.site==='A'?1.5:g.site==='N'?1.15:1;t.qSum+=g.q*mult;if(g.q>0.00001)t.qWins++;if(g.site==='A'){t.roadQSum+=g.q*1.5;if(or>median)t.qualityRoadWins++;}}
      if(g.opFbs){const opp=map.get(g.op); // exclude the game being rated; apply 2 pseudo-games at league average
        let n=Math.max(0,opp.fbsG.length-1),oppPF=opp.fbsG.reduce((s,x)=>s+x.pf,0)-g.pa,oppPA=opp.fbsG.reduce((s,x)=>s+x.pa,0)-g.pf;
        let expAllowed=(oppPA+2*mean)/(n+2),expScored=(oppPF+2*mean)/(n+2);
        offTotal+=g.pf-expAllowed;defTotal+=expScored-g.pa;ng++;
      }
    }
    t.wab=t.won-t.expected;t.mov=t.played.length?t.mov/t.played.length:0;
    const shrink=ng/(ng+2);t.off=ng?offTotal/ng*shrink:0;t.def=ng?defTotal/ng*shrink:0;
    t.fbsGames=ng;t.games=t.played.length;
    t.quality=t.qSum; t.qRoadWins=t.qualityRoadWins;
  }
  ['wab','winpct','mov','sos','quality','roadQSum','off','def','rating','roadWins','qRoadWins'].forEach(k=>pctRanks(teams,k,k));
  for(const t of teams){t.sor=.7*t.wabPct+.3*t.winpctPct;t.qualityComponent=.7*t.qualityPct+.3*t.roadQSumPct;t.balance=Math.sqrt(Math.max(0,t.offPct*t.defPct));}
  pctRanks(teams,'sor','sor');pctRanks(teams,'qualityComponent','qualityComponent');pctRanks(teams,'balance','balance');
  for(const t of teams)t.score=(.35*t.sor+.20*t.movPct+.20*t.qualityComponent)/.75;
  teams.sort((a,b)=>b.score-a.score||(b.wab-a.wab)||a.name.localeCompare(b.name));teams.forEach((t,i)=>t.rank=i+1);
  return {teams,games,bench,median,mean};
}

function attachEfficiency(teams,rows){
 const byTeamName=new Map(teams.map(t=>[normalizeTeam(t.name),t]));
 const valid=new Map(),byTeam=new Map();let matched=0;
 for(const row of rows){
   const t=byTeamName.get(normalizeTeam(row.team)),key=String(row.game_id||'').trim();if(!t||!t.fbsG.some(g=>String(g.id)===key))continue;
   const values={};let ok=true;
   for(const k of ADV_HEADERS.slice(2)) {let x=String(row[k]??'').trim();if(x===''||x.toLowerCase()==='na'){ok=false;break}let n=Number(x);if(!Number.isFinite(n)){ok=false;break}if(['off_success_rate','def_success_rate','off_explosive_rate','def_explosive_rate','lead_share'].includes(k)&&n>1&&n<=100)n/=100;values[k]=n;}
   if(!ok||Math.abs(values.off_ppa)>10||Math.abs(values.def_ppa)>10)continue;
   if(['off_success_rate','def_success_rate','off_explosive_rate','def_explosive_rate','lead_share'].some(k=>values[k]<0||values[k]>1))continue;
   if(['penalty_yards','opp_penalty_yards','turnovers_lost','turnovers_gained','redzone_td','redzone_trips','opp_redzone_td','opp_redzone_trips'].some(k=>values[k]<0))continue;
   if(values.redzone_td>values.redzone_trips||values.opp_redzone_td>values.opp_redzone_trips)continue;
   let obj={...values,id:key,team:t,gm:t.fbsG.find(g=>String(g.id)===key)};
   valid.set(key+'|'+normalizeTeam(t.name),obj);
 }
 for(const t of teams){t.advGames=[];for(const gm of t.fbsG){const x=valid.get(String(gm.id)+'|'+normalizeTeam(t.name));if(x)t.advGames.push(x)}t.advCoverage=t.fbsGames?t.advGames.length/t.fbsGames:1;t.effScore=NaN;for(const k of ADV_RANK_FIELDS)t[k]=NaN;}
 const observed=teams.flatMap(t=>t.advGames),expected=teams.reduce((x,t)=>x+t.fbsGames,0),covered=observed.length;
 const eligible=teams.filter(t=>t.fbsGames>0);
 // Keep the 35/20/20/25 model running whenever any verified advanced games exist.
 // Missing team-games are NOT fabricated: observed efficiency is reliability-shrunk.
 // A severe source outage should not masquerade as a valid on-field rating.
 // With >=70% FBS team-game coverage, rank using shrinkage; below it, label the
 // result as a résumé-only fallback while scores/results still refresh.
 const full=expected>0 && covered/expected>=.70;
 state.advCovered=covered;state.advExpected=expected;state.fullModel=full;
 if(!full){for(const t of teams)t.score=(.35*t.sor+.20*t.movPct+.20*t.qualityComponent)/.75;rankTeams(teams);return;}
 for(const o of observed){if(!byTeam.has(o.team.name))byTeam.set(o.team.name,[]);byTeam.get(o.team.name).push(o)}
 const base={};for(const k of ['off_ppa','def_ppa','off_success_rate','def_success_rate','off_explosive_rate','def_explosive_rate'])base[k]=meanArr(observed.map(r=>r[k]));
 const oppAverage=(opp,id,key)=>{const r=(byTeam.get(opp)||[]).filter(a=>a.id!==id);return (r.reduce((s,a)=>s+a[key],0)+2*base[key])/(r.length+2)};
 const effTeams=eligible;
 for(const t of teams){if(!t.advGames.length){t.ppaNet=0;t.successNet=0;t.control=0;t.explosiveNet=0;t.penaltyNet=0;t.turnoverNet=0;t.redzoneNet=0;t.effWinRate=0;t.effStability=0;continue;}
  let ep=[],es=[],ex=[],controls=[],pn=[],to=[],offVol=[],defVol=[],rzOff=0,rzOffTrips=0,rzDef=0,rzDefTrips=0;
  for(const a of t.advGames){const other=a.gm.op,id=a.id,f=.5;
   const op=f*(base.def_ppa-oppAverage(other,id,'def_ppa'))+a.off_ppa;
   const dp=f*(base.off_ppa-oppAverage(other,id,'off_ppa'))+a.def_ppa;
   offVol.push(op);defVol.push(dp);ep.push(op-dp);
   es.push(a.off_success_rate+f*(base.def_success_rate-oppAverage(other,id,'def_success_rate')) - (a.def_success_rate+f*(base.off_success_rate-oppAverage(other,id,'off_success_rate'))));
   ex.push(a.off_explosive_rate+f*(base.def_explosive_rate-oppAverage(other,id,'def_explosive_rate')) - (a.def_explosive_rate+f*(base.off_explosive_rate-oppAverage(other,id,'off_explosive_rate'))));
   controls.push(a.lead_share-.5+clamp(a.gm.opRating/60,-.15,.15));
   pn.push(a.opp_penalty_yards-a.penalty_yards);to.push(clamp(a.turnovers_gained-a.turnovers_lost,-3,3));
   rzOff+=a.redzone_td;rzOffTrips+=a.redzone_trips;rzDef+=a.opp_redzone_td;rzDefTrips+=a.opp_redzone_trips;
  }
  const n=ep.length,shr=n/(n+2);
  t.ppaNet=meanArr(ep)*shr;t.successNet=meanArr(es)*shr;t.explosiveNet=meanArr(ex)*shr;t.control=meanArr(controls)*shr;
  t.penaltyNet=meanArr(pn)*shr;t.turnoverNet=meanArr(to)*n/(n+3);
  t.redzoneNet=(rzOff+4*.6)/(rzOffTrips+4)-(rzDef+4*.6)/(rzDefTrips+4);
  t.effWinRate=ep.filter(x=>x>0).length/n;
  t.effStability=-((std(offVol)+std(defVol))*n/(n+4)+.45*4/(n+4));
 }
 for(const k of ADV_RANK_FIELDS)pctRanks(teams,k,k);
 for(const t of teams)t.consistencyScore=.6*t.effWinRatePct+.4*t.effStabilityPct;
 pctRanks(teams,'consistencyScore','consistencyScore');
 for(const t of teams){
  const observedEfficiency=.10*t.ppaNetPct+.10*t.successNetPct+.16*t.controlPct+.16*t.explosiveNetPct+.08*t.penaltyNetPct+.12*t.turnoverNetPct+.16*t.consistencyScore+.12*t.redzoneNetPct;
  // Missing games contribute no positive or negative evidence. Shrink the
  // *entire* efficiency score toward neutral (50), proportional to measured
  // game coverage. A team with zero advanced games receives neutral 50.
  t.effScore=t.advGames.length?50+t.advCoverage*(observedEfficiency-50):50;
 }
 pctRanks(teams,'effScore','effScore');
 for(const t of teams)t.score=.35*t.sor+.20*t.movPct+.20*t.qualityComponent+.25*t.effScore;
 rankTeams(teams);
}
