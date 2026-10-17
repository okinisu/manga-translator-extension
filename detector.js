(()=>{
 let workers=[],nextId=0,nextLane=0,fallbackReason='',lastInferenceMs=0;const pending=new Map();
 function failSlot(slot,message){slot.failed=message;slot.worker.terminate();for(const [id,p] of pending)if(p.slot===slot){clearTimeout(p.timer);pending.delete(id);p.reject(Error(message));}}
 function send(slot,type,payload={},transfer=[]){if(slot.failed)return Promise.reject(Error(slot.failed));const id=++nextId;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>failSlot(slot,type==='start'?'文字検出モデルの起動が120秒以内に完了しませんでした。再開してください。':'文字検出の返答が60秒以内にありませんでした。GPU停止などの可能性があります。再開してください。'),type==='start'?120000:60000);pending.set(id,{resolve,reject,slot,timer});try{slot.worker.postMessage({id,type,...payload},transfer);}catch(e){clearTimeout(timer);pending.delete(id);reject(e);}});}

 async function close(){for(const slot of workers){slot.failed='文字検出を中止しました。';slot.worker.terminate();}workers=[];lastInferenceMs=0;for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('文字検出を中止しました。'));}pending.clear();}
 function makeWorker(){const slot={worker:new Worker(chrome.runtime.getURL('detector-worker.js')),tail:Promise.resolve(),load:0,failed:null};
  slot.worker.onmessage=({data:m})=>{const p=pending.get(m.id);if(!p||p.slot!==slot)return;clearTimeout(p.timer);pending.delete(m.id);if(m.error)p.reject(Error(m.error));else p.resolve(m.result);};
  slot.worker.onerror=e=>failSlot(slot,e.message||'文字検出Workerの起動に失敗しました。');
  slot.worker.onmessageerror=()=>failSlot(slot,'文字検出Workerの返答を読み取れません。再開してください。');
  return slot;
 }
 async function start(count=4,backend='wasm',debug=false,options={}){await close();fallbackReason='';
  const threads=Math.max(1,Math.min(4,Math.floor(options.threads)||1)),gpuRuntime=options.gpuRuntime==='native'?'native':'jsep',powerPreference=options.powerPreference==='low-power'?'low-power':'high-performance';
  if(!['auto','wasm','webgpu'].includes(backend))throw Error('検出方式が不正です。');
  if(backend!=='wasm'){
   const gpuCount=Math.max(1,Math.min(4,Math.floor(options.gpuParallel)||2,options.remaining||Infinity));
   try{
    for(let i=0;i<gpuCount;i++)workers.push(makeWorker());
    const results=[],ready=[];let failure;for(const slot of workers)try{results.push({status:'fulfilled',value:await send(slot,'start',{backend,debug,threads:1,gpuRuntime,powerPreference,graphCapture:['on','off'].includes(options.graphCapture)?options.graphCapture:'auto',precision:['fp32','fp16','fp16-full','tensor-fp16','tensor-int8'].includes(options.precision)?options.precision:'auto'})});}catch(reason){results.push({status:'rejected',reason});}
    for(let i=0;i<results.length;i++){const slot=workers[i],r=results[i];if(r.status==='fulfilled'&&r.value.backend==='webgpu'){Object.assign(slot,{backend:r.value.backend,reason:r.value.reason,gpuInfo:r.value.gpuInfo,graphCaptureEnabled:r.value.graphCaptureEnabled,debug:r.value.debug,threads:1});ready.push(slot);}else{failure=r.status==='rejected'?r.reason:Error(r.value.reason||'WebGPUを起動できません。');slot.failed=failure.message;slot.worker.terminate();}}
    workers=ready;nextLane=0;if(ready.length){if(ready.length<gpuCount)fallbackReason=`GPU ${gpuCount}並列のうち${ready.length}並列で起動：${failure?.message||'起動失敗'}`;return ready.length;}throw failure||Error('WebGPUを起動できません。');
   }catch(e){await close();if(backend==='webgpu')throw e;fallbackReason=e.message;}
  }
const requested=Math.max(1,Math.min(8,Math.floor(count)||1,Math.floor(8/threads)));
  try{for(let i=0;i<requested;i++)workers.push(makeWorker());}catch(e){await close();throw e;}
  const results=await Promise.allSettled(workers.map(slot=>send(slot,'start',{backend:'wasm',debug,threads}))),ready=[];let failure;
  for(let i=0;i<results.length;i++){if(results[i].status==='fulfilled'){workers[i].backend='wasm';workers[i].debug=results[i].value.debug;workers[i].threads=results[i].value.threads||1;ready.push(workers[i]);}else{failure=results[i].reason;workers[i].failed=failure.message;workers[i].worker.terminate();}}
  workers=ready;nextLane=0;if(!workers.length)throw failure||Error('文字検出モデルを起動できません。');return workers.length;
 }
 function detect(canvas,lane,onDiagnostic,options={}){if(!workers.length)return Promise.reject(Error('文字検出モデルが未起動です。'));const slot=lane===undefined?workers.reduce((best,w)=>w.load<best.load?w:best,workers[nextLane++%workers.length]):workers[lane%workers.length];slot.load++;
  // One inference per session; independent workers execute different windows together.
  const queuedAt=onDiagnostic?performance.now():0;
  const task=slot.tail.then(async()=>{if(slot.failed)throw Error(slot.failed);const bitmapAt=onDiagnostic?performance.now():0;let bitmap;try{bitmap=await createImageBitmap(canvas,{resizeWidth:640,resizeHeight:640,resizeQuality:'low'});}catch{bitmap=await createImageBitmap(canvas);}if(slot.failed){bitmap.close();throw Error(slot.failed);}try{const diagnosticAt=typeof performance!=='undefined'?performance.now():0;const result=await send(slot,'detect',{bitmap,width:canvas.width,height:canvas.height,opaque:options.opaque===true},[bitmap]);if(Array.isArray(result))return result;slot.backend=result.backend;slot.reason=result.reason;slot.gpuInfo=result.gpuInfo;slot.graphCaptureEnabled=result.graphCaptureEnabled;slot.inferenceMs=result.inferenceMs;lastInferenceMs=result.inferenceMs||0;slot.threads=result.threads||slot.threads||1;const responseAt=onDiagnostic?performance.now():0;if(onDiagnostic&&result.debug)onDiagnostic({...result.debug,backend:result.backend,inferenceParallel:result.backend==='webgpu'?Math.max(1,workers.filter(w=>w.backend==='webgpu').length):1,workerRoundtripMs:responseAt-diagnosticAt,sessionQueueMs:bitmapAt-queuedAt,inputBitmapMs:diagnosticAt-bitmapAt,requestStartedAt:diagnosticAt,requestEndedAt:responseAt,workerIndex:workers.indexOf(slot)});return result.detections;}catch(e){try{bitmap.close();}catch{}throw e;}});
  const finished=task.finally(()=>{slot.load--;});slot.tail=finished.catch(()=>{});return finished;
 }
 function gpuLabel(){const slot=workers.find(w=>w.backend==='webgpu');if(!slot)return 'GPU：使用していません（CPU検出）';const info=slot.gpuInfo;if(!info||info.unavailable)return '使用GPU：情報を取得できません（WebGPU動作中）';const name=info.description||[info.vendor,info.architecture,info.device].filter(Boolean).join(' / ');return '使用GPU：'+(name||'名称非公開（WebGPU動作中）')+(info.isFallbackAdapter===true?' — フォールバックアダプター':'')+' ／ FP16：'+(info.adapterShaderF16===true?'アダプター対応あり':info.adapterShaderF16===false?'アダプター対応なし':'対応可否不明')+'・'+(info.shaderF16===true?'デバイスで有効':info.shaderF16===false?'デバイスで未有効':'有効状態不明')+'（現在のモデルは'+(info.modelPrecision||'FP32')+'） ／ Capture: '+(slot.graphCaptureEnabled?'ON':'OFF');}
 globalThis.ComicDetector={start,detect,close,get threads(){return workers[0]?.threads||1;},get startupDebug(){return workers.map(w=>({backend:w.backend,...w.debug}));},get gpuInfo(){return workers.find(w=>w.backend==='webgpu')?.gpuInfo||null;},get gpuLabel(){return gpuLabel();},get size(){return workers.length;},get backend(){return workers.some(w=>w.backend==='webgpu')?'TFLite／LiteRT.js（WebGPU＋CPU補助）':'TFLite／LiteRT.js（CPU）';},get reason(){return workers.find(w=>w.reason)?.reason||fallbackReason;},get inferenceMs(){return lastInferenceMs;},get normalizedInferenceMs(){return lastInferenceMs/Math.max(1,workers.filter(w=>w.backend==='webgpu').length);}};
})();
