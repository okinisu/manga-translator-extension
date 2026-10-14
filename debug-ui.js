(() => {
 const roots=new WeakMap();
 function render(root,view){
  if(!view){root.replaceChildren();roots.delete(root);return;}
  let nodes=roots.get(root);
  if(!nodes){
   root.classList.add('debug-panel');
   root.innerHTML='<div class="debug-heading"><strong id="debug-title">診断</strong><span class="debug-state"></span></div><dl class="debug-stats"></dl><h3>工程別の平均</h3><dl class="debug-phases"></dl><p class="debug-note"></p><details class="debug-details"><summary>待ち時間・内訳</summary><dl></dl><p class="debug-timeline-note"></p></details><p class="debug-dropped" hidden>記録上限に達したため、一部の計測は省略されています。</p>';
   const doc=root.ownerDocument;
   function rows(selector,items,stats=false){const list=root.querySelector(selector);return items.map(item=>{const row=doc.createElement('div'),label=doc.createElement('dt'),value=doc.createElement('dd');row.append(label,value);list.append(row);if(stats){const number=doc.createElement('span'),unit=doc.createElement('small');value.append(number,unit);return {label,number,unit};}return {label,value};});}
   nodes={state:root.querySelector('.debug-state'),stats:rows('.debug-stats',view.stats,true),phases:rows('.debug-phases',view.phases),details:rows('.debug-details dl',view.details),note:root.querySelector('.debug-note'),timeline:root.querySelector('.debug-timeline-note'),dropped:root.querySelector('.debug-dropped')};roots.set(root,nodes);
  }
  const set=(node,text)=>{if(node.textContent!==text)node.textContent=text;};
  set(nodes.state,view.state);root.dataset.state=view.state==='エラー'?'error':view.state==='完了'?'complete':'active';
  view.stats.forEach(([,label,value,unit],i)=>{set(nodes.stats[i].label,label);set(nodes.stats[i].number,value);set(nodes.stats[i].unit,value==='—'?'':unit);});
  for(const key of ['phases','details'])view[key].forEach(([label,value],i)=>{set(nodes[key][i].label,label);set(nodes[key][i].value,value);});
  set(nodes.note,view.note);set(nodes.timeline,view.timelineNote);nodes.dropped.hidden=!view.dropped;
 }
 globalThis.MangaDebugUI={render};
})();
