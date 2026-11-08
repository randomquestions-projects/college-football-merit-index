/* CFMI opponent-network performance adjustment, season-only.
 * Estimate team OFFENSE and DEFENSE jointly from every FBS-vs-FBS game:
 * measured offense = offense ability − opponent defensive ability + error.
 * Ridge shrinkage and recursive estimation avoid assuming raw PPA/success
 * against weak opponents are equivalent to performance against good defenses.
 * No conference names, recruiting, polls or external ratings enter.
 * Research candidate; not imported in production unless validated.
 */
'use strict';
function solveOpponentNetworkEfficiency(teams,opts={}){
 const ridge=Number.isFinite(opts.ridge)?opts.ridge:3.5;
 const maxIterations=Number.isFinite(opts.maxIterations)?opts.maxIterations:140;
 const fields=[
  ['epa','off_ppa'],['success','off_success_rate'],['explosive','off_explosive_rate']
 ];
 const names=teams.map(t=>t.name),byName=new Map(names.map((name,i)=>[name,i]));
 const result=new Map(names.map(name=>[name,{}]));
 const observations=teams.flatMap(t=>(t.advGames||[]).filter(g=>byName.has(g.gm.op))
   .map(g=>({team:byName.get(t.name),op:byName.get(g.gm.op),
     epa:g.off_ppa,success:g.off_success_rate,explosive:g.off_explosive_rate})));
 for(const [key] of fields){
   const valid=observations.filter(g=>Number.isFinite(g[key]));
   const global=valid.length?valid.reduce((z,g)=>z+g[key],0)/valid.length:0;
   const offense=Array(names.length).fill(0),defense=Array(names.length).fill(0);
   const gamesOff=Array.from({length:names.length},()=>[]),gamesDef=Array.from({length:names.length},()=>[]);
   for(const g of valid){
     gamesOff[g.team].push({opp:g.op,value:g[key]-global});
     gamesDef[g.op].push({opp:g.team,value:g[key]-global});
   }
   let solved=0;
   for(let iteration=0;iteration<maxIterations;iteration++){
     let delta=0;
     for(let i=0;i<names.length;i++){
       const games=gamesOff[i];
       const fitted=games.reduce((s,g)=>s+g.value+defense[g.opp],0)/(games.length+ridge);
       const v=.6*offense[i]+.4*fitted;
       delta=Math.max(delta,Math.abs(v-offense[i]));
       offense[i]=v;
     }
     for(let i=0;i<names.length;i++){
       const games=gamesDef[i];
       const fitted=games.reduce((s,g)=>s+offense[g.opp]-g.value,0)/(games.length+ridge);
       const v=.6*defense[i]+.4*fitted;
       delta=Math.max(delta,Math.abs(v-defense[i]));
       defense[i]=v;
     }
     solved=iteration+1;
     if(delta<1e-8)break;
   }
   for(let i=0;i<names.length;i++){
     result.get(names[i])[key]=offense[i]+defense[i];
     result.get(names[i])[key+'Offense']=offense[i];
     result.get(names[i])[key+'Defense']=defense[i];
     result.get(names[i])[key+'Coverage']=
       Math.min(gamesOff[i].length,gamesDef[i].length)/(Math.min(gamesOff[i].length,gamesDef[i].length)+ridge);
     result.get(names[i])[key+'OpponentAdjusted']=true;
     result.get(names[i])[key+'Iterations']=solved;
   }
 }
 return result;
}
