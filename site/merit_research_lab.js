/* CFMI temporary research-only UI. This file contains no model formulas,
   private source code, historical datasets, or publication permissions.
   The published output snapshot is static; v5.6 official results are unchanged. */
(()=>{
'use strict';
const PAGE='research',FILE='./data/merit_research_2026_11_10.json';
const EXPECTED=['A','B','C','D','E','F'];
const LABELS={A:'50 / 15 / 35',B:'60 / 15 / 25',C:'40 / 30 / 30',D:'40 / 25 / 35',E:'40 / 20 / 40',F:'50 / 25 / 25'};
const $id=id=>document.getElementById(id);
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;',"'":'&#39;'}[c]));
const n2=n=>Number.isFinite(n)?n.toFixed(2):'—';
const settings={variant:'E',query:'',limit:25,data:null,loading:false,error:'',lastTeam:null};
let focusReturn=null;
function validate(data){
 if(data?.schema!=='cfmi-merit-research-output-v1'||data?.season!==2026||
    data?.snapshot!=='2026-11-10'||data?.freeze!==true||
    !Array.isArray(data.teams)||data.teams.length!==138||
    EXPECTED.some(k=>!data.candidates?.[k]))throw Error('Wrong or incomplete research snapshot');
 const names=new Set(),ranks=Object.fromEntries(EXPECTED.map(x=>[x,new Set()]));
 for(const team of data.teams){
  if(typeof team.team!=='string'||!team.team||names.has(team.team)||!/^\d+-\d+$/.test(team.record))throw Error('Invalid or duplicate team');
  names.add(team.team);
  for(const k of EXPECTED){
   const row=team.scores?.[k];
   if(!row||!Number.isInteger(row.rank)||row.rank<1||row.rank>138||ranks[k].has(row.rank)||
      ![row.win,row.loss,row.performance,row.merit].every(Number.isFinite)||
      Math.abs(row.win+row.loss+row.performance-row.merit)>0.003)throw Error('Research component reconciliation failure: '+team.team+' / '+k);
   const w=data.candidates[k];
   if(row.win<0||row.win>w.victory+.003||row.loss<0||row.loss>w.loss+.003||
      row.performance<0||row.performance>w.performance+.003)throw Error('Research weight mismatch: '+team.team+' / '+k);
   ranks[k].add(row.rank);
  }
 }
 if(EXPECTED.some(k=>ranks[k].size!==138))throw Error('Research ranking universe incomplete');
 return data;
}
function featureMode(){return new URLSearchParams(location.search).get('research')==='1'||location.hash==='#research'}
function activateLink(){
 if(!featureMode())return;
 const button=$id('researchNavTab');
 if(button)button.hidden=false;
 const nav=$id('navResearchLab');
 if(nav)nav.hidden=false;
}
async function load(){
 if(settings.data||settings.loading)return;
 settings.loading=true;
 const status=$id('researchLoadStatus');
 if(status)status.textContent='Loading frozen A–F scoring outputs…';
 try{
  const response=await fetch(FILE,{cache:'no-store'});
  if(!response.ok)throw Error('Snapshot unavailable (HTTP '+response.status+')');
  const data=validate(await response.json());
  settings.data=data;
  settings.error='';
  render();
 }catch(err){
  settings.error=err.message;
  const target=$id('researchLoadStatus');
  if(target)target.textContent='Research snapshot unavailable: '+err.message+'. Official Merit is unaffected.';
 }finally{settings.loading=false}
}
function locate(name){return settings.data?.teams.find(t=>t.team===name)}
function rows(){
 const q=settings.query.trim().toLowerCase();
 return (settings.data?.teams||[]).filter(t=>!q||t.team.toLowerCase().includes(q))
  .sort((a,b)=>a.scores[settings.variant].rank-b.scores[settings.variant].rank);
}
function variantSelectors(){
 const selected=settings.variant;
 const container=$id('researchVariantPicker');
 if(!container)return;
 container.innerHTML=EXPECTED.map(k=>'<button type="button" class="research-choice '+(k===selected?'research-selected':'')+'" data-research-variant="'+k+'" aria-pressed="'+(k===selected)+'" title="Sort every team by Candidate '+k+'">Candidate '+k+'<span>'+LABELS[k]+'</span></button>').join('');
 document.querySelectorAll('[data-research-candidate-column]').forEach(el=>{
  const active=el.dataset.researchCandidateColumn===selected;
  el.classList.toggle('research-active-column',active);
  el.setAttribute('aria-sort',active?'ascending':'none');
 });
}
function render(){
 if(!settings.data)return;
 variantSelectors();
 const data=rows(),limited=data.slice(0,settings.limit===138?138:settings.limit);
 const body=$id('researchRankBody');
 if(!body)return;
 body.innerHTML=limited.map(t=>{
  const active=t.scores[settings.variant], cells=EXPECTED.map(k=>{
   const x=t.scores[k];
   return '<td class="research-rank '+(k===settings.variant?'research-active-column':'')+'"><span class="research-rank-number">'+x.rank+'</span><small>'+n2(x.merit)+'</small></td>';
  }).join('');
  return '<tr><td class="research-team"><button type="button" data-research-team="'+safe(t.team)+'" title="Open complete score breakdown and schedule for '+safe(t.team)+'">'+safe(t.team)+'</button><small>'+safe(t.record)+'</small></td>'+cells+
    '<td class="research-selected-score">'+n2(active.win)+' / '+n2(active.loss)+' / '+n2(active.performance)+'</td></tr>';
 }).join('');
 const note=$id('researchLoadStatus');
 if(note)note.textContent='Frozen November 10, 2026 research · '+limited.length+' of '+data.length+' matching teams · sorted by Candidate '+settings.variant+' · click any school for score and schedule details.';
}
function scoreCard(t,k){
 const v=t.scores[k],w=settings.data.candidates[k];
 return '<button type="button" class="research-detail-card '+(k===settings.variant?'research-active-card':'')+'" data-research-detail-variant="'+k+'" aria-pressed="'+(k===settings.variant)+'"><small>Candidate '+k+' · '+LABELS[k]+'</small><strong>#'+v.rank+' · '+n2(v.merit)+'</strong><span>Wins '+n2(v.win)+' /'+w.victory+' · Losses '+n2(v.loss)+' /'+w.loss+' · Performance '+n2(v.performance)+' /'+w.performance+'</span></button>';
}
function detailHTML(t){
 const k=settings.variant,v=t.scores[k],w=settings.data.candidates[k];
 return '<section class="research-popup" aria-label="Experimental Merit ranking audit">'+
  '<div class="research-popup-head"><div><small>EXPERIMENTAL RESEARCH · November 10, 2026</small>'+
  '<h3>'+safe(t.team)+' · '+safe(t.record)+' · Candidate '+k+' · #'+v.rank+'</h3>'+
  '<p>Experimental Merit '+n2(v.merit)+' / 100 · output-only snapshot, not the official v5.6 Merit ranking.</p></div></div>'+
  '<div class="research-component-grid">'+
   [['Victory portfolio',v.win,w.victory],['Remaining loss budget',v.loss,w.loss],['Opponent-adjusted performance',v.performance,w.performance]].map(([label,val,max])=>
    '<div class="research-component"><small>'+label+'</small><strong>'+n2(val)+' <span>/ '+max+'</span></strong><div class="research-progress"><i style="width:'+Math.max(0,Math.min(100,100*val/max))+'%"></i></div></div>').join('')+
  '</div><div class="research-detail-variants">'+EXPECTED.map(s=>scoreCard(t,s)).join('')+'</div>'+
  '<p class="research-context"><strong>Score provenance:</strong> v5.8.7 joint margin/probability-loss experiment, frozen at the November 10 cutoff. Victory portfolio includes opponent-quality tiers, road/P4 credit, and bounded win-margin bonus. The remaining loss budget reflects actual losses and their modeled severity. Performance is opponent-adjusted. The schedule and advanced diagnostics below are reused from the public v5.6 team audit; <strong>their per-game v5.6 credits do not sum to these experimental portfolio points.</strong> Future weekly schedule updates may include games after this research cutoff.</p>'+
  '</section>';
}
function open(name){
 const t=locate(name);
 if(!t)return;
 settings.lastTeam=name;
 if(!window.CFMI_PUBLIC_VIEW||!Array.isArray(window.state?.teams)&&typeof state==='undefined'){
  // This check is defensive: the public core continues loading independently.
 }
 if(typeof showTeam!=='function'||!state.teams?.length){
  $id('researchLoadStatus').textContent='The official team schedule is still loading. Try opening '+name+' again shortly.';
  return;
 }
 const actual=state.teams.some(x=>x.name===name);
 if(!actual){
  $id('researchLoadStatus').textContent='Official schedule data for '+name+' is not yet available. Refresh the page when the feed finishes loading.';
  return;
 }
 showTeam(name);
 const title=$id('detailTitle'),subtitle=$id('detailSubtitle'),body=$id('detailBody');
 title.textContent=t.team+' · Research Merit Candidate '+settings.variant;
 subtitle.textContent=t.record+' · frozen as-of Nov 10, 2026 · official v5.6 schedule and Power audit below';
 body.insertAdjacentHTML('afterbegin',detailHTML(t));
 const original=body.querySelector('.merit-summary');
 if(original){
  const h=original.querySelector('h3');
  if(h)h.textContent='Official v5.6 Merit (reference only; not included in research total)';
 }
}
function change(k){
 if(!EXPECTED.includes(k))return;
 settings.variant=k;
 render();
 if(settings.lastTeam&&$id('detailScrim').classList.contains('open'))open(settings.lastTeam);
}
function init(){
 activateLink();
 const target=$id('researchRankBody');
 if(!target)return;
 document.querySelectorAll('#researchVariantPicker').forEach(el=>el.addEventListener('click',e=>{
  const btn=e.target.closest('[data-research-variant]');if(btn)change(btn.dataset.researchVariant);
 }));
 $id('researchRankHeaders').addEventListener('click',e=>{
  const h=e.target.closest('[data-research-candidate-column]');
  if(h)change(h.dataset.researchCandidateColumn);
 });
 target.addEventListener('click',e=>{
  const b=e.target.closest('[data-research-team]');
  if(b)open(b.dataset.researchTeam);
 });
 const d=$id('detailBody');
 d.addEventListener('click',e=>{
  const b=e.target.closest('[data-research-detail-variant]');
  if(b)change(b.dataset.researchDetailVariant);
 });
 $id('researchSearch').addEventListener('input',e=>{settings.query=e.target.value;render()});
 $id('researchLimit').addEventListener('change',e=>{settings.limit=Number(e.target.value);render()});
 $id('researchNavTab')?.addEventListener('click',()=>load());
 if(location.hash==='#research')load();
 window.addEventListener('hashchange',()=>{activateLink();if(location.hash==='#research')load()});
 // Reuse the platform's existing page switch; callers can also request a link
 // directly with ?research=1#research. No separate official metric is changed.
 if(window.CFMI_RESEARCH_LAB === undefined){
  window.CFMI_RESEARCH_LAB=Object.freeze({open,change,load,validate,rerender:render});
 }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
else init();
})();