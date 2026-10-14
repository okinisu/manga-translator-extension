const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const tick=()=>new Promise(r=>setImmediate(r));
(async()=>{
 let slots=[],fail=[],starts=[];
 class Worker {
  constructor(){this.index=slots.length;this.requests=[];this.terminated=false;slots.push(this);}
  postMessage(m){if(m.type==='start'){starts.push(m);queueMicrotask(()=>this.onmessage({data:fail.includes(this.index)?{id:m.id,error:'start failed'}:{id:m.id,result:{backend:m.backend==='wasm'?'wasm':'webgpu',threads:m.threads,gpuInfo:{description:'NVIDIA test',shaderF16:true}}}}));}else this.requests.push(m);}
  finish(value){const m=this.requests.shift();assert.ok(m);this.onmessage({data:{id:m.id,result:value}});}
  terminate(){this.terminated=true;}
 }
 const context=vm.createContext({performance,setTimeout,clearTimeout,Worker,chrome:{runtime:{getURL:x=>x}},createImageBitmap:async()=>({close(){}})});
 vm.runInContext(fs.readFileSync(__dirname+'/detector.js','utf8'),context);const d=context.ComicDetector;
 assert.equal(await d.start(2),2);
 const a=d.detect({width:690,height:1800}),b=d.detect({width:690,height:1800});await tick();
 assert.equal(slots[0].requests.length,1);assert.equal(slots[1].requests.length,1,'Two independent workers must be running together');
 slots[1].finish(['second']);assert.deepEqual(await b,['second']);
 const c=d.detect({width:690,height:1800});await tick();assert.equal(slots[1].requests.length,1,'Next window uses the idle worker, not the busy worker');
 slots[1].finish(['third']);assert.deepEqual(await c,['third']);slots[0].finish(['first']);assert.deepEqual(await a,['first']);
 const x=d.detect({width:1,height:1},0),y=d.detect({width:1,height:1},0);await tick();assert.equal(slots[0].requests.length,1);
 slots[0].finish([]);await x;await tick();assert.equal(slots[0].requests.length,1);slots[0].finish([]);await y;
 const stopped=d.detect({width:1,height:1});const rejection=assert.rejects(stopped,/中止/);await tick();await d.close();await rejection;assert.ok(slots.every(w=>w.terminated));
 slots=[];fail=[1];assert.equal(await d.start(2),1);assert.ok(slots[1].terminated);await d.close();
 slots=[];fail=[0,1];await assert.rejects(d.start(2),/start failed/);assert.equal(d.size,0);assert.ok(slots.every(w=>w.terminated));
 slots=[];fail=[];assert.equal(await d.start(),4);const four=Array.from({length:4},()=>d.detect({width:690,height:1800}));await tick();assert.ok(slots.every(w=>w.requests.length===1));for(const w of slots)w.finish([]);await Promise.all(four);await d.close();
 slots=[];assert.equal(await d.start(99),8);const eight=Array.from({length:8},()=>d.detect({width:690,height:1800}));await tick();assert.equal(slots.length,8);assert.ok(slots.every(w=>w.requests.length===1));for(const w of slots)w.finish([]);await Promise.all(eight);await d.close();
 slots=[];fail=[];assert.equal(await d.start(4,'auto',false,{gpuParallel:1}),1);assert.equal(d.backend,'WebGPU＋CPU補助');assert.equal(slots.length,1);assert.match(d.gpuLabel,/NVIDIA test/);assert.match(d.gpuLabel,/デバイスで有効/);const gpuTask=d.detect({width:1,height:1});await tick();slots[0].finish({backend:'wasm',gpuInfo:null,reason:'device lost',detections:[]});await gpuTask;assert.match(d.gpuLabel,/使用していません/);assert.equal(d.gpuInfo,null);await d.close();
 slots=[];fail=[0];assert.equal(await d.start(4,'auto',false,{gpuParallel:1}),4);assert.equal(d.backend,'CPU（WASM）');assert.match(d.reason,/start failed/);assert.ok(slots[0].terminated);await d.close();
 slots=[];fail=[0];await assert.rejects(d.start(4,'webgpu',false,{gpuParallel:1}),/start failed/);assert.equal(d.size,0);
 slots=[];fail=[];assert.equal(await d.start(8,'wasm',true,{threads:4}),2);assert.equal(d.threads,4);await d.close();
 slots=[];fail=[];assert.equal(await d.start(1,'webgpu'),2);const pair=[d.detect({width:1,height:1}),d.detect({width:1,height:1})];await tick();assert.equal(slots.length,2);assert.ok(slots.every(w=>w.requests.length===1));slots[1].finish(['gpu-second']);slots[0].finish(['gpu-first']);assert.deepEqual(await Promise.all(pair),[['gpu-first'],['gpu-second']]);await d.close();
 slots=[];fail=[];assert.equal(await d.start(1,'webgpu',false,{gpuParallel:4}),4);const gpuFour=Array.from({length:4},()=>d.detect({width:1,height:1}));await tick();assert.ok(slots.every(w=>w.requests.length===1));for(const w of slots)w.finish([]);await Promise.all(gpuFour);await d.close();
 slots=[];fail=[1];assert.equal(await d.start(1,'webgpu'),1);assert.ok(slots[1].terminated);assert.match(d.reason,/2並列のうち1/);await d.close();
 slots=[];fail=[];assert.equal(await d.start(1,'webgpu',false,{gpuParallel:4,remaining:1}),1);await d.close();
 slots=[];fail=[];await d.start(1,'webgpu',true,{gpuParallel:1});let firstTiming,secondTiming;
 const timedFirst=d.detect({width:1,height:1},0,t=>{firstTiming=t;}),timedSecond=d.detect({width:1,height:1},0,t=>{secondTiming=t;});await tick();await new Promise(r=>setTimeout(r,10));
 const diagnosticResult={backend:'webgpu',detections:[],debug:{preprocessMs:1,inferenceMs:2,postprocessMs:1}};
 slots[0].finish(diagnosticResult);await timedFirst;await tick();slots[0].finish(diagnosticResult);await timedSecond;
 assert.equal(firstTiming.workerIndex,0);assert.ok(firstTiming.requestEndedAt>=firstTiming.requestStartedAt);assert.ok(secondTiming.sessionQueueMs>=8,'Second request records blocked session time separately from inference');assert.equal(secondTiming.inferenceMs,2);await d.close();
 for(const graphCapture of ['auto','off','on','bogus']){slots=[];starts=[];await d.start(1,'webgpu',false,{gpuParallel:1,graphCapture});assert.equal(starts[0].graphCapture,graphCapture==='bogus'?'auto':graphCapture);await d.close();}
 // Simulate a stalled GPU worker and verify all queued work rejects instead of hanging.
 const timers=new Map();let timerId=0,silentWorker;
 class SilentWorker{constructor(){silentWorker=this;}postMessage(m){this.last=m;}terminate(){this.terminated=true;}}
 const stalled=vm.createContext({Worker:SilentWorker,setTimeout:(fn,ms)=>{const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),chrome:{runtime:{getURL:x=>x}},createImageBitmap:async()=>({close(){}})});
 vm.runInContext(fs.readFileSync(__dirname+'/detector.js','utf8'),stalled);const sd=stalled.ComicDetector;
 const startup=sd.start(1,'webgpu',false,{gpuParallel:1}),startupRejected=assert.rejects(startup,/120秒/);await tick();assert.equal([...timers.values()][0].ms,120000);[...timers.values()][0].fn();await startupRejected;assert.equal(timers.size,0);assert.ok(silentWorker.terminated);
 const ready=sd.start(1,'webgpu',false,{gpuParallel:1});await tick();silentWorker.onmessage({data:{id:silentWorker.last.id,result:{backend:'webgpu',gpuInfo:{shaderF16:false,adapterShaderF16:null}}}});await ready;assert.equal(timers.size,0);assert.match(sd.gpuLabel,/対応可否不明・デバイスで未有効/);
 const hung=sd.detect({width:1,height:1}),queued=sd.detect({width:1,height:1});const rejections=[assert.rejects(hung,/60秒/),assert.rejects(queued,/60秒/)];await tick();assert.equal([...timers.values()][0].ms,60000);[...timers.values()][0].fn();await Promise.all(rejections);assert.equal(timers.size,0);assert.ok(silentWorker.terminated);await sd.close();
 console.log('PASS: default 4 and maximum 8 simultaneous workers; simultaneous independent worker inference, idle-worker scheduling, per-session serialization, out-of-order replies, cancellation and startup fallback');
})().catch(e=>{console.error(e);process.exitCode=1;});
