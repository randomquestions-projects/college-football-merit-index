/* CFMI Matchup Index V1 — third METRIC, not a third team ranking.
 * Merit and neutral-field Power are not touched. Predicted point margin =
 * existing (home.powerPoints - away.powerPoints) + calibrated home edge
 * + validated opponent-specific run/pass mismatch residual.
 *
 * Every profile uses only game IDs already in teams' as-of FBS schedules;
 * the same game data appear for both sides to estimate defensive prevention.
 * Regularization prevents a 1-game rush explosion from overpowering Power.
 */
'use strict';
const CFMI_MATCHUP={
 version:'matchup-1.0-research',
 keys:['runExploit','passExploit','runFit','passFit','runStyle','firstDownFit','explosiveFit'],
 coefficients:null,
 selection:null,
 setParameters(doc){
  if(!doc||doc.version!=='matchup-1.0-research'||!doc.parameters)throw Error('Missing matchup research model');
  const values=doc.parameters.coefficients;
  if(!Array.isArray(values)||values.length!==this.keys.length||!values.every(x=>Number.isFinite(x)&&Math.abs(x)<=8))
   throw Error('Malformed matchup coefficients');
  this.coefficients=values;
  this.selection=doc;
  return true;
 },
 clamp(x,a,b){return Math.max(a,Math.min(b,x))},
 logistic(x){return 1/(1+Math.exp(-this.clamp(x,-30,30)))},
 // Team-game advanced observations have corresponding completed *FBS* team-game IDs.
 // Do not accept source rows merely because they are dated in the same season.
 profiles(teams,advRows){
  const byName=new Map(teams.map(t=>[t.name,t]));
  const norm=x=>String(x||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const byNormalized=new Map(teams.map(t=>[norm(t.name),t]));
  const gameIdMap=new Map();
  for(const team of teams)for(const g of team.fbsG||[])
   gameIdMap.set(String(g.id)+'|'+norm(team.name),{team,opp:g.op});
  const records=[];
  const validNumber=x=>x===''||x===null||x===undefined||/^(NA|null|nan|none)$/i.test(String(x))?null:
   (Number.isFinite(Number(x))?Number(x):null);
  const fields={
   run:['off_rush_ppa','def_rush_ppa'],
   pass:['off_pass_ppa','def_pass_ppa'],
   runSuccess:['off_rush_firstdown_rate','def_rush_firstdown_rate'],
   passSuccess:['off_pass_firstdown_rate','def_pass_firstdown_rate'],
   runExplosive:['off_rush_explosive_rate','def_rush_explosive_rate'],
   passExplosive:['off_pass_explosive_rate','def_pass_explosive_rate']
  };
  for(const row of advRows||[]){
   const hit=gameIdMap.get(String(row.game_id)+'|'+norm(row.team));
   if(!hit||!byName.has(hit.opp))continue;
   const values={},o={};
   for(const [metric,[off,def]] of Object.entries(fields)){
    let x=validNumber(row[off]),d=validNumber(row[def]);
    if(metric!=='run'&&metric!=='pass'){
     if(x!==null&&x>1&&x<=100)x/=100;
     if(d!==null&&d>1&&d<=100)d/=100;
     if(x!==null&&(x<0||x>1))x=null;
     if(d!==null&&(d<0||d>1))d=null;
    }else{
     if(x!==null&&Math.abs(x)>4)x=null;
     if(d!==null&&Math.abs(d)>4)d=null;
    }
    values[metric]=x;
    o[metric]=d;
   }
   let share=validNumber(row.off_pass_share),runs=validNumber(row.off_rushes),passes=validNumber(row.off_passes);
   if((share===null||share<0||share>1)&&runs!==null&&passes!==null&&runs+passes>0)
    share=passes/(runs+passes);
   if(share!==null&&(share<0||share>1))share=null;
   records.push({team:hit.team.name,opp:hit.opp,values,allow:o,passShare:share});
  }
  const ridge=3.5,names=teams.map(t=>t.name);
  const out=new Map(names.map(name=>[name,{coverage:{},passShare:0.52,passCoverage:0}]));
  // fit phase-wise offensive ability and defense allowed simultaneously, as deviations
  // from the observed FBS mean. A positive defense value means *vulnerable*.
  for(const field of Object.keys(fields)){
   const observations=records.filter(g=>Number.isFinite(g.values[field]));
   const avg=observations.length?observations.reduce((s,g)=>s+g.values[field],0)/observations.length:0;
   const entries=new Map(names.map(n=>[n,[]]));
   const defenseEntries=new Map(names.map(n=>[n,[]]));
   for(const g of observations){
    entries.get(g.team).push({op:g.opp,value:g.values[field]-avg});
    defenseEntries.get(g.opp).push({off:g.team,value:g.values[field]-avg});
   }
   const O=new Map(names.map(n=>[n,0])),D=new Map(names.map(n=>[n,0]));
   for(let step=0;step<110;step++){
    let moved=0;
    for(const name of names){
     const x=entries.get(name),v=x.reduce((s,g)=>s+g.value-D.get(g.op),0)/(x.length+ridge);
     const next=.6*O.get(name)+.4*v;moved=Math.max(moved,Math.abs(next-O.get(name)));O.set(name,next);
    }
    for(const name of names){
     const x=defenseEntries.get(name),v=x.reduce((s,g)=>s+g.value-O.get(g.off),0)/(x.length+ridge);
     const next=.6*D.get(name)+.4*v;moved=Math.max(moved,Math.abs(next-D.get(name)));D.set(name,next);
    }
    if(moved<1e-8)break;
   }
   for(const name of names){
    const x=out.get(name);
    x[field+'Off']=O.get(name);x[field+'Weak']=D.get(name);
    x.coverage[field]=Math.min(entries.get(name).length,defenseEntries.get(name).length);
   }
  }
  const passes=new Map(names.map(n=>[n,[]]));
  for(const g of records)if(Number.isFinite(g.passShare))passes.get(g.team).push(g.passShare);
  for(const n of names){
   const x=passes.get(n),mean=x.length?x.reduce((a,b)=>a+b,0)/x.length:.52;
   out.get(n).passShare=(x.length*mean+3*.52)/(x.length+3);
   out.get(n).passCoverage=x.length;
  }
  return out;
 },
 features(home,away,profiles){
  const H=profiles.get(home.name),A=profiles.get(away.name);
  const fallback={values:this.keys.map(()=>0),coverage:0,explanation:{},home:null,away:null};
  if(!H||!A)return fallback;
  const n=Math.min(H.coverage.run||0,H.coverage.pass||0,A.coverage.run||0,A.coverage.pass||0);
  const evidence=n/(n+3.5);
  const z=(o,field,kind)=>this.clamp((o[field+kind]||0)/
   (field==='run'||field==='pass'?.22:.08),-2.5,2.5);
  const scored=(O,D)=>{
   const rushO=z(O,'run','Off'),rushD=z(D,'run','Weak');
   const passO=z(O,'pass','Off'),passD=z(D,'pass','Weak');
   const sr=z(O,'runSuccess','Off'),sd=z(D,'runSuccess','Weak');
   const sp=z(O,'passSuccess','Off'),pd=z(D,'passSuccess','Weak');
   const er=z(O,'runExplosive','Off'),ed=z(D,'runExplosive','Weak');
   const ep=z(O,'passExplosive','Off'),pe=z(D,'passExplosive','Weak');
   const runWeight=1-O.passShare,passWeight=O.passShare;
   return {
    runExploit:runO*rushD,
    passExploit:passO*passD,
    runFit:runWeight*(runO+rushD), // style-specific matchup evidence
    passFit:passWeight*(passO+passD),
    runStyle:(.52-O.passShare)*(rushD-passD),
    firstDownFit:runWeight*sr*sd+passWeight*sp*pd,
    explosiveFit:runWeight*er*ed+passWeight*ep*pe
   };
  };
  const h=scored(H,A),a=scored(A,H);
  const x=this.keys.map(k=>this.clamp((h[k]-a[k])*evidence,-4,4));
  return {values:x,coverage:evidence,explanation:{home:h,away:a},
   home:{rushOffEPA:H.runOff,rushDefenseWeak:A.runWeak,passOffEPA:H.passOff,
    passDefenseWeak:A.passWeak,passShare:H.passShare},
   away:{rushOffEPA:A.runOff,rushDefenseWeak:H.runWeak,passOffEPA:A.passOff,
    passDefenseWeak:H.passWeak,passShare:A.passShare}};
 },
 predict(home,away,neutral,profiles,parameters){
  const base=(home.powerPoints||0)-(away.powerPoints||0);
  const venue=neutral?0:(parameters.homePoints||0);
  const measured=this.features(home,away,profiles);
  const coeff=this.coefficients||this.keys.map(()=>0);
  const component=Object.fromEntries(this.keys.map((k,i)=>[k,coeff[i]*measured.values[i]]));
  const raw=Object.values(component).reduce((z,v)=>z+v,0);
  const correction=this.clamp(raw,-4,4);
  const edge=base+venue+correction;
  const p=this.logistic(edge/(parameters.logisticScale||12));
  return {home:home.name,away:away.name,basePoints:base,homePoints:venue,
   matchupAdjustment:correction,marginHome:edge,winner:edge>=0?home.name:away.name,
   homeMatchupScore:100*p,awayMatchupScore:100*(1-p),
   homeWinProbability:p,awayWinProbability:1-p,
   components:component,featureValues:measured.values,
   evidence:measured.coverage,opponentStyles:{home:measured.home,away:measured.away},
   version:this.version,validated:!!this.coefficients?.some(c=>c!==0)};
 }
};
