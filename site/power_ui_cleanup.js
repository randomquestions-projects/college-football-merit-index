/* CFMI Power audit presentation: never manufacture zero-point contributions for
 * measurements with no separately selected model coefficient. Presentation only.
 * The model's Power Points, index and ranks are not modified by this file. */
'use strict';
const CFMI_POWER_UI = Object.freeze({
  names: Object.freeze({
    baseline:'Opponent-adjusted scoring baseline',
    conferenceContext:'Historically fitted cross-schedule calibration',
    preseasonPriorAdjustment:'Early-season talent / continuity prior',
    epa:'Joint opponent-adjusted EPA',
    success:'Joint opponent-adjusted success',
    explosive:'Joint opponent-adjusted explosiveness',
    schedule:'Strength of opponents played',
    scheduleReliability:'Weak-schedule evidence discount',
    fcsEvidence:'Close FCS performance adjustment',
    finishing:'Drive finishing',
    consistency:'Consistency',
    control:'Possession control',
    offense:'Offense',
    defense:'Defense'
  }),
  escape(value){return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));},
  breakdown(team,fmt){
    const components=team.powerContributionPoints||{};
    const active=Object.entries(components).filter(([k,v])=>Number.isFinite(v) && (k==='baseline'||Math.abs(v)>=.005));
    const points=active.map(([key,value])=>{
      const label=this.names[key]||key.replace(/([A-Z])/g,' $1');
      const valueText=(value>0?'+':'')+fmt(value,2)+' pts';
      const direction=value<0?'weak':value>0?'good':'';
      return '<div><small>'+this.escape(label)+'</small><strong class="'+direction+'">'+valueText+'</strong></div>';
    }).join('');
    const total=Object.values(components).filter(Number.isFinite).reduce((sum,v)=>sum+v,0);
    const agrees=Number.isFinite(team.powerPoints)&&Math.abs(team.powerPoints-total)<.015;
    return '<div class="power-breakdown">'+points+'</div>'+
      '<p class="note">Only terms contributing to the <strong>current</strong> Power formula are shown here. '+
      'Drive finishing, consistency, game control, offense and defense remain separately measured diagnostics when their independent Power coefficients are zero. '+
      (agrees?'Components reconcile to '+fmt(team.powerPoints,2)+' neutral-field points.':'The component total is not reconciled; check this snapshot before interpreting the breakdown.')+'</p>';
  },
  breakdownFromView(power,fmt){
    const components=power.components||{};
    const active=Object.entries(components).filter(([key,val])=>Number.isFinite(val)&&(key==='baseline'||Math.abs(val)>=.005));
    const rows=active.map(([key,val])=>'<div><small>'+this.escape(this.names[key]||key)+'</small><strong class="'+(val>0?'good':val<0?'weak':'')+'">'+(val>0?'+':'')+fmt(val,2)+' pts</strong></div>').join('');
    const total=Object.values(components).reduce((a,b)=>a+b,0);
    if(!Number.isFinite(power.neutralPoints)||Math.abs(total-power.neutralPoints)>1e-6)
      throw Error('Power view model does not reconcile to its component sum');
    return '<div class="power-breakdown">'+rows+'</div><p class="note"><strong>Reconciled:</strong> '+fmt(power.neutralPoints,2)+' neutral-field Power points. Only nonzero active formula components appear above; measured but inactive features are presented separately.</p>';
  },
  priorFromView(power,fmt){
    const weight=power.preseasonWeight;
    if(!Number.isFinite(weight))return '<p class="note">Preseason-prior weight not measured in this snapshot. Coaching continuity is not an active verified source.</p>';
    const sources=power.priorSources||{};
    return '<p class="note"><strong>Preseason prior:</strong> '+fmt(100*weight,1)+'%'+
      (Number.isFinite(power.effectiveGames)?' after '+fmt(power.effectiveGames,2)+' effective FBS games':'')+
      '. Roster talent: '+(Number.isFinite(sources.rosterTalentIndex)?fmt(sources.rosterTalentIndex,2):'not measured')+
      '; returning production: '+(Number.isFinite(sources.returningProduction)?fmt(100*sources.returningProduction,1)+'%':'not verified')+
      '; transfer percentile: '+(Number.isFinite(sources.transferPercentile)?fmt(100*sources.transferPercentile,1):'not measured')+
      '; coaching continuity: not a verified model input.</p>';
  },
  networkFromView(diagnostics,fmt){
    const s=diagnostics.opponentAdjustedNetwork;
    if(!s)return '<p class="note">Opponent-adjusted offense and defense splits are unavailable for this snapshot.</p>';
    const fields=[
      ['EPA · offense','epaOffense','EPA/play relative to FBS mean'],
      ['EPA · defense','epaDefense','EPA/play prevented relative to FBS mean'],
      ['Success · offense','successOffense','Rate relative to FBS mean'],
      ['Success · defense','successDefense','Rate prevented relative to FBS mean'],
      ['Explosiveness · offense','explosiveOffense','Rate relative to FBS mean'],
      ['Explosiveness · defense','explosiveDefense','Rate prevented relative to FBS mean']
    ];
    return '<h4>Measured offense and defense · opponent-adjusted</h4><p class="note">These are football performance diagnostics, not additional independently weighted Power points. Unavailable inputs are not displayed as zeros.</p><div class="power-support-grid">'+
      fields.map(([name,key,desc])=>'<div><small>'+name+'</small><strong>'+(Number.isFinite(s[key])?fmt(s[key],3):'Not measured')+'</strong><small>'+desc+'</small></div>').join('')+'</div>';
  },
  prior(team,fmt){
    const weight=team.preseasonPriorWeight;
    if(!Number.isFinite(weight))return '<p class="note">Preseason-prior contribution unavailable for this snapshot. Coaching continuity is not included in the scoring model.</p>';
    if(weight===0)return '<p class="note"><strong>Preseason prior:</strong> 0% after sufficient opponent-adjusted FBS evidence. Current Power is based on the on-field model and historical interconference calibration. <strong>Coaching changes:</strong> not yet a verified input.</p>';
    return '<p class="note"><strong>Preseason prior:</strong> '+fmt(weight*100,0)+'% of Power after '+(team.fbsGames||0)+' FBS games (effective evidence: '+(Number.isFinite(team.preseasonEffectiveGames)?fmt(team.preseasonEffectiveGames,2):'not measured')+'). '+
      'Prior strength: '+(Number.isFinite(team.preseasonPriorPoints)?fmt(team.preseasonPriorPoints,2)+' neutral points':'unavailable')+
      '; returning production: '+(Number.isFinite(team.preseasonReturningProduction)?fmt(team.preseasonReturningProduction*100,0)+'%':'unverified')+
      '; transfer percentile: '+(Number.isFinite(team.preseasonTransferPercentile)?fmt(team.preseasonTransferPercentile*100,0)+'th':'unverified')+
      '. Coaching changes are not a verified scoring input.</p>';
  },
  network(team,fmt){
    const s=team.opponentAdjustedNetwork;
    if(!s)return '<p class="note">Opponent-adjusted offense and defense split is not available for this snapshot.</p>';
    const fields=[
      ['EPA · offense','epaOffense','EPA/play relative to FBS mean'],
      ['EPA · defense','epaDefense','EPA/play prevented relative to FBS mean'],
      ['Success · offense','successOffense','Rate relative to FBS mean'],
      ['Success · defense','successDefense','Rate prevented relative to FBS mean'],
      ['Explosiveness · offense','explosiveOffense','Rate relative to FBS mean'],
      ['Explosiveness · defense','explosiveDefense','Rate prevented relative to FBS mean']
    ];
    return '<h4>Measured offense and defense · opponent-adjusted</h4><p class="note">These are performance estimates in their original units, <strong>not additional Power points</strong>. Positive defensive estimates indicate stronger suppression. They feed the joint EPA/success/explosive components shown above.</p>'+
      '<div class="power-support-grid">'+fields.map(([name,key,desc])=>'<div><small>'+name+'</small><strong>'+(Number.isFinite(s[key])?fmt(s[key],3):'Not measured')+'</strong><small>'+desc+'</small></div>').join('')+'</div>';
  }
});
