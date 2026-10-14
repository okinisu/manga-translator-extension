(()=>{
 const mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null;
 const median=a=>{const b=[...a].sort((x,y)=>x-y),n=b.length;return n?(n%2?b[(n-1)/2]:(b[n/2-1]+b[n/2])/2):null;};
 function summarize(report){
  const baseline=report.results.find(r=>!r.profile),profile=report.results.find(r=>r.profile);if(!baseline||!profile)throw Error('通常推論とプロファイルの両方が必要です。');
  const runs=profile.runs,n=runs.length;if(!n)throw Error('計測結果がありません。');
  const gpuTypes=new Map(),gpuNodes=new Map();let zero=0,queries=0;
  const gpuTotals=runs.map(run=>{let total=0;for(const row of run.gpuRows){const ms=(row.endTime-row.startTime)/1e6;if(!Number.isFinite(ms)||ms<0)continue;total+=ms;queries++;if(ms===0)zero++;for(const [map,key]of [[gpuTypes,row.kernelType],[gpuNodes,row.kernelName]]){const item=map.get(key)||{name:key,totalMs:0,dispatches:0};item.totalMs+=ms;item.dispatches++;map.set(key,item);}}return total;});
  const table=map=>[...map.values()].map(v=>({...v,meanMsPerRun:v.totalMs/n,dispatchesPerRun:v.dispatches/n})).sort((a,b)=>b.totalMs-a.totalMs);
  const events=[];for(const line of profile.finish.logs)try{const v=JSON.parse(line.replace(/,\s*$/,''));if(v&&Number.isFinite(v.ts)&&Number.isFinite(v.dur))events.push(v);}catch{}
  const modelRuns=events.filter(e=>e.name==='model_run').slice(-n);
  const inside=e=>modelRuns.some(r=>e.ts>=r.ts&&e.ts+e.dur<=r.ts+r.dur+10);
  const nodes=events.filter(e=>e.cat==='Node'&&e.args?.provider&&inside(e));
  const cpuTypes=new Map(),providerTotals={};for(const e of nodes){const provider=e.args.provider;providerTotals[provider]=(providerTotals[provider]||0)+e.dur/1000;if(provider==='CPUExecutionProvider'){const key=e.args.op_name||e.name,item=cpuTypes.get(key)||{name:key,totalMs:0,dispatches:0};item.totalMs+=e.dur/1000;item.dispatches++;cpuTypes.set(key,item);}}
  const averageTransfer={};for(const key of Object.keys(runs[0].transfer||{}))averageTransfer[key]=mean(runs.map(r=>r.transfer?.[key]||0));
  const gpuMean=mean(gpuTotals),wallMean=mean(runs.map(v=>v.wallMs));
  return {schema:1,fixtureCount:report.fixtureCount,runs:n,vendor:profile.startup.vendor,architecture:profile.startup.architecture,baselineMeanWallMs:mean(baseline.runs.map(v=>v.wallMs)),baselineMedianWallMs:median(baseline.runs.map(v=>v.wallMs)),profileMeanWallMs:wallMean,profileMedianWallMs:median(runs.map(v=>v.wallMs)),profileMeanGpuKernelMs:gpuMean,profileMeanWallMinusGpuKernelMs:wallMean-gpuMean,gpuDispatchesPerRun:queries/n,zeroDurationTimestampFraction:queries?zero/queries:0,gpuTypes:table(gpuTypes),gpuTopNodes:table(gpuNodes).slice(0,15),cpuTypes:table(cpuTypes),cpuMeanOperatorMs:(providerTotals.CPUExecutionProvider||0)/n,providerMeanNodeWallMs:Object.fromEntries(Object.entries(providerTotals).map(([key,value])=>[key,value/n])),placementLogs:profile.finish.logs.filter(l=>l.includes('Number of nodes')),averageTransfer,traceModelRuns:modelRuns.length,dropped:Math.max(profile.finish.dropped||0,...runs.map(r=>r.dropped||0)),limitations:['GPU timestamps are quantized; short operations may read 0.','Profiling splits passes and adds readback/CPU logging overhead; profiled timings must not be substituted for normal inference timings.','Wall minus GPU kernels includes CPU scheduling, allocation, copies and synchronization; it is not pure CPU execution.','Tensor mapAsync wait includes previously queued GPU work; wait times overlap GPU kernel times and must not be added to them.','JsExecutionProvider CPU trace timings measure host calls and waits, not actual GPU kernel durations.','CPU warmup trace is excluded; startup is excluded from all sample means.']};
 }
 const api={summarize};if(typeof module==='object')module.exports=api;else globalThis.GpuOperatorProfile=api;
})();
