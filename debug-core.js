(()=>{
 const phases=['canvasMs','preprocessMs','inferenceMs','postprocessMs','cropMs','storeMs','workerRoundtripMs','sessionQueueMs','inputBitmapMs','bitmapQueueMs','bitmapWorkMs','publishQueueMs','publishWorkMs','controlMs','windowMs','storeControlMs','postQueueMs'];
 let report=null,start=0;
 function version(){try{return (typeof chrome!=='undefined'&&chrome.runtime?.getManifest?.()?.version)||'unknown';}catch{return 'unknown';}}
 function elapsed(at=performance.now()){return report?at-start:undefined;}
 // Host-side request overlap is not GPU kernel utilization. Clip intervals to
 // the measured detection period; summed waits may overlap across workers.
 function overlap(intervals,begin,end){
  const events=[];for(const pair of intervals){if(!Array.isArray(pair)||pair.length!==2||!pair.every(Number.isFinite))continue;const a=Math.max(begin,pair[0]),b=Math.min(end,pair[1]);if(b>a)events.push([a,1],[b,-1]);}
  events.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);let last=begin,count=0,max=0,sum=0;const durations={};
  for(const [at,change] of events){const length=at-last;durations[count]=(durations[count]||0)+length;sum+=length*count;count+=change;max=Math.max(max,count);last=at;}
  durations[count]=(durations[count]||0)+Math.max(0,end-last);const total=Math.max(0,end-begin),idle=durations[0]||0;
  return {elapsedMs:total,idleMs:idle,coveredMs:total-idle,averageInFlight:total?sum/total:0,maxInFlight:max,durationsByInFlight:durations};
 }
 function clean(text){return String(text||'').replace(/(?:https?:|chrome-extension:)\/\/[^\s]+/g,'[URL]').slice(0,700);}
 function begin(enabled,config={}){report=enabled?{schema:2,version:version(),startedAt:new Date().toISOString(),config:{backend:config.backend,parallel:config.parallel},events:[],windows:[],dropped:0,limits:'Wall times only. GPU/CPU utilization, power and per-operator assignment are not measured.'}:null;start=performance.now();}
 function event(type,data={}){if(!report)return;if(report.events.length>=100){report.dropped++;return;}const entry={type:String(type).slice(0,40),elapsedMs:Math.round(performance.now()-start)};if(Number.isInteger(data.parallel)&&data.parallel>0)entry.parallel=data.parallel;if(data.message)entry.message=clean(data.message);if(data.backend)entry.backend=String(data.backend);if(typeof data.ms==='number')entry.ms=data.ms;if(data.gpuInfo)entry.gpuInfo=data.gpuInfo;if(data.runtime)entry.runtime=data.runtime;report.events.push(entry);if(type==='complete'||type==='error')report.finishedElapsedMs=entry.elapsedMs;}
 function window(data){if(!report)return;if(report.windows.length>=1000){report.dropped++;return;}const row={index:data.index,regions:data.regions,backend:data.backend};for(const key of phases)if(Number.isFinite(data[key]))row[key]=Math.round(data[key]*100)/100;if(Number.isInteger(data.workerIndex)&&data.workerIndex>=0)row.workerIndex=data.workerIndex;if(Number.isFinite(data.requestStartMs)&&Number.isFinite(data.requestEndMs)&&data.requestStartMs>=0&&data.requestEndMs>=data.requestStartMs){row.requestStartMs=data.requestStartMs;row.requestEndMs=data.requestEndMs;}report.windows.push(row);}
 function snapshot(){if(!report)return null;const result=JSON.parse(JSON.stringify(report));result.elapsedMs=result.finishedElapsedMs??Math.round(performance.now()-start);result.totalsMs={};for(const key of phases)result.totalsMs[key]=Math.round(result.windows.reduce((n,r)=>n+(r[key]||0),0));const detectionStart=result.events.find(e=>e.type==='detector-start');const detectionEnd=result.events.find(e=>e.type==='detection-complete');if(detectionStart&&result.windows.length){result.detectionElapsedMs=Math.max(0,(detectionEnd?.elapsedMs??result.elapsedMs)-detectionStart.elapsedMs);result.effectiveWindowMs=result.detectionElapsedMs/result.windows.length;const intervals=result.windows.filter(w=>Number.isFinite(w.requestStartMs)&&Number.isFinite(w.requestEndMs)).map(w=>[w.requestStartMs,w.requestEndMs]);if(intervals.length){result.parallelRequests={...overlap(intervals,detectionStart.elapsedMs,detectionStart.elapsedMs+result.detectionElapsedMs),measuredWindows:intervals.length,recordedWindows:result.windows.length,completeTimeline:!!detectionEnd&&intervals.length===result.windows.length&&result.dropped===0,note:'Host dispatch-to-response intervals include CPU helpers, preprocessing/postprocessing and transfer/synchronization; this is not GPU utilization or pure GPU compute time. In-progress windows are absent from partial snapshots.'};}}return result;}

 function view(r=snapshot()){
  if(!r)return null;
  const n=r.windows.length,cache=r.events.some(e=>e.type==='cache-hit'),failed=r.events.some(e=>e.type==='error'),complete=r.events.some(e=>e.type==='complete');
  const average=key=>{const values=r.windows.map(w=>w[key]).filter(Number.isFinite);return values.length?Math.round(values.reduce((a,b)=>a+b,0)/values.length)+'ms':'—';};
  const timeline=r.parallelRequests?.completeTimeline;
  const stats=[['count','処理済み',String(n),'区間'],['elapsed','経過時間',(r.elapsedMs/1000).toFixed(1),'秒'],['effective','検出工程の実効',Number.isFinite(r.effectiveWindowMs)?String(Math.round(r.effectiveWindowMs)):'—','ms/区間'],['concurrency','同時依頼（平均）',timeline?r.parallelRequests.averageInFlight.toFixed(2):'—','件']];
  const phases=[['前処理',average('preprocessMs')],['推論応答待ち',average('inferenceMs')],['切り出し / PNG',average('cropMs')],['保存',average('storeMs')]];
  const details=[['元画像の描画',average('canvasMs')],['推論後の整形',average('postprocessMs')],['ワーカー往復',average('workerRoundtripMs')],['推論依頼の順番待ち',average('sessionQueueMs')],['切り出しの順番待ち',average('postQueueMs')],['画像読込の順番待ち',average('bitmapQueueMs')],['画像組立待ち',average('publishQueueMs')],['画像の組立',average('publishWorkMs')],['依頼を出していない時間',timeline?(r.parallelRequests.idleMs/1000).toFixed(1)+'秒':'—']];
  return {state:failed?'エラー':cache&&!n?'キャッシュ利用':complete?'完了':'計測中',stats,phases,details,note:cache&&!n?'キャッシュから復元したため、今回は推論していません。':!n?'検出結果が届くと工程別の時間を表示します。':'工程別の値は1区間あたりの平均です。並列中の応答待ちは重なるため、合計は経過時間と一致しません。',timelineNote:timeline?'同時依頼はワーカーへの依頼数で、GPU使用率ではありません。':'同時依頼の平均は検出完了後に表示します。',dropped:r.dropped||0};
 }
 function summary(){const v=view();if(!v)return '';return ['診断：'+v.state,...v.stats.map(([,label,value,unit])=>label+' '+value+(value==='—'?'':unit)),'',...v.phases.map(([label,value])=>label+' '+value),'',...v.details.map(([label,value])=>label+' '+value),v.note,v.timelineNote].join('\n');}
 const api={begin,event,window,snapshot,summary,view,elapsed,overlap};if(typeof module==='object')module.exports=api;else globalThis.MangaDebug=api;
})();
