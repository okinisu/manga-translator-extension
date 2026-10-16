const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
(async () => {
  const elements = new Map();
  const element = selector => { if (!elements.has(selector)) elements.set(selector, {disabled:false, textContent:'', value:''}); return elements.get(selector); };
  const stored = {batchId:'batch',id:'batch:chapter',images:[{width:690,height:1600,top:0}], records:[{id:'000001',box:{x:0,y:0,width:100,height:50},enabled:true,cropBlob:new Blob(['image'],{type:'image/png'})}]};
  const transported = JSON.parse(JSON.stringify(stored));
  assert.throws(() => URL.createObjectURL(transported.records[0].cropBlob), TypeError);
  let settingsReads=0,parallelSetting=4;let info = {ok:true}, reads=0, renders=0, failReady=false;
  const cache=new Map(),removed=[];
  const imageDraws=[];let atlasOversize=false;const canvas=()=>{let draws=0;return ({getContext:()=>({fillRect(){},clearRect(){},fillText(){draws++;},drawImage(...args){imageDraws.push(args);},getImageData(){return {data:[255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255]};}}),toBlob:fn=>fn(new Blob([atlasOversize&&draws>2?new Uint8Array(20*1024*1024+1):'atlas'],{type:'image/png'}))});};
  const context = vm.createContext({
    document:{querySelector:element,createElement:canvas}, Blob, URL, console, performance,
    EpisodeCache:{...require('./episode-cache.js'),get:async()=>null,put:async()=>true,clear:async()=>{}},MangaDebug:require('./debug-core.js'),MangaPerformance:require('./performance-core.js'),crypto:{randomUUID:()=> 'revision'}, MangaCollage:require('./collage-core.js'),
    createImageBitmap:async()=>({width:690,height:1600,close(){}}),
    chrome:{runtime:{sendMessage:async message => {
      if(message.type==='COLLAGE_READY')return failReady?{ok:false,error:'ready failed'}:{ok:true,batches:message.ids.length};
      assert.ok(['GET','COLLECTION_CHECK'].includes(message.type), 'Chapter blobs must not use JSON messaging');return info;
    }},storage:{local:{get:async()=>{settingsReads++;return {detectorParallel:parallelSetting,detectorDebug:true,detectorBackend:'wasm',detectorGpuParallel:4};}},onChanged:{addListener(){}}}},
    BatchStore:{putMany:async values=>{for(const value of values)cache.set(value.id,value);},get:async id => {assert.equal(id,'batch:chapter');reads++;return structuredClone(stored);},put:async value=>cache.set(value.id,value),remove:async id=>{removed.push(id);cache.delete(id);}},
    MangaCore:{prompt:()=> 'translation prompt'},
    fetch:async()=>({blob:async()=>new Blob(['atlas'],{type:'image/png'})})
  });
  vm.runInContext(fs.readFileSync(__dirname+'/color-core.js','utf8'),context);
  vm.runInContext(fs.readFileSync(__dirname+'/region-image.js','utf8'),context);
  vm.runInContext(fs.readFileSync(__dirname+'/review.js','utf8'),context);
  await new Promise(resolve=>setImmediate(resolve));
  context.checkRecords = chapter => {
    renders++; if(chapter.records[0].cropBlob){assert.ok(chapter.records[0].cropBlob instanceof Blob);const url=URL.createObjectURL(chapter.records[0].cropBlob);URL.revokeObjectURL(url);}else assert.ok(chapter.records[0].box);
  };
  vm.runInContext('renderRecords = () => checkRecords(chapter)',context);
  // Reopening a completed chapter must preserve Blob objects from IndexedDB.
  info = {ok:true,collection:{id:'batch',status:'ready',index:0},job:{type:'collage',image:'data:image/png;base64,aQ=='},progress:{position:1,total:1}};
  await vm.runInContext('refresh()',context);
  assert.equal(element('#status').textContent,'');
  assert.equal(element('#open').disabled,false);
  assert.match(element('#atlas').src,/^blob:/);
  // A contained crop must reuse the exact window offset; padded boundary crops use original sources.
  context.windowForTest={width:690,height:1800};
  const sourceReadsBefore=reads;
  await vm.runInContext('recrop({box:{x:10,y:205,width:20,height:30}},windowForTest,200)',context);
  assert.equal(reads,sourceReadsBefore);const windowDraw=imageDraws.find(args=>args[0]===context.windowForTest);assert.ok(windowDraw);assert.deepEqual(windowDraw.slice(1),[10,5,20,30,0,0,20,30]);
  let fallbacks=0;context.cropFallback=async()=>{fallbacks++;return canvas();};
  vm.runInContext('savedCanvasFor=canvasFor;canvasFor=cropFallback',context);
  try{await vm.runInContext('recrop({box:{x:10,y:190,width:20,height:30}},windowForTest,200)',context);await vm.runInContext('recrop({box:{x:10,y:1590,width:20,height:10}})',context);}finally{vm.runInContext('canvasFor=savedCanvasFor',context);}
  assert.equal(fallbacks,2);

  // A saved chapter without an active job must remain editable for recovery.
  info = {ok:true,collection:{id:'batch',status:'ready',index:0}};
  await vm.runInContext('refresh()',context);
  assert.equal(element('#saveEdits').disabled,false);
  assert.equal(reads,2); assert.equal(renders,2);
  // Storage refreshes must not overwrite an unsaved selection or coordinate edit.
  info = {ok:true,collection:{id:'batch',status:'ready',index:0,ids:['old-atlas']},job:{type:'collage',image:'data:image/png;base64,aQ=='},progress:{position:1,total:1}};
  vm.runInContext('chapter.records[0].box.x=37; chapter.records[0].enabled=false; dirty=true;',context);
  await vm.runInContext('refresh()',context);
  assert.equal(reads,2);
  assert.equal(vm.runInContext('chapter.records[0].box.x',context),37);
  assert.equal(vm.runInContext('chapter.records[0].enabled',context),false);
  assert.equal(vm.runInContext('dirty',context),true);
  vm.runInContext('chapter.records[0].enabled=true;',context);
  // Failure to activate a replacement must retain the old active atlas.
  cache.set('old-atlas',{});failReady=true;
  await assert.rejects(vm.runInContext('pack()',context),/ready failed/);
  assert.ok(cache.has('old-atlas'));assert.equal(removed.length,0);
  failReady=false;await vm.runInContext('pack()',context);
  assert.deepEqual(removed,['old-atlas']);assert.ok(!cache.has('old-atlas'));
  assert.ok(cache.has('revision:collage:0'));
  assert.equal(vm.runInContext('dirty',context),false);
  // Selection-only changes must reuse crops; coordinate edits recrop just that record.
  context.originalRecrop=vm.runInContext('recrop',context);
  let recrops=0;
  context.trackCrop = r => {recrops++;return {...r,cropBox:{...r.box}};};
  vm.runInContext('for(const r of chapter.records)r.cropBox={...r.box}; recrop=async r=>trackCrop(r);',context);
  await element('#saveEdits').onclick();assert.equal(recrops,0);
  vm.runInContext('for(const r of chapter.records)r.cropBox={...r.box};chapter.records[0].box.x+=1;dirty=true;',context);
  await element('#saveEdits').onclick();assert.equal(recrops,1);
  // Fully cached detection resumes without initializing the large model.
  let starts=0;
  context.ComicDetector={start:async()=>{starts++;},close:async()=>{},detect:async()=>{throw Error('cached detection must not run');}};
  context.navigator={locks:{request:async(name,options,fn)=>fn(true)}};
  context.MangaCore.slices=()=>[{y:0,height:1800,ownTop:0,ownBottom:1800}];
  context.BatchStore.get=async id=>id.includes(':source:')?{blob:new Blob(['source']),width:690,height:1600}:id.includes(':detection:')?{cacheKey:context.EpisodeCache.windowKey({url:'https://comic.naver.com/webtoon/detail?titleId=808482&no=152',urls:['image','image','image'],detectorBackend:'wasm'},context.MangaCore.slices()[0],690),detectionBackend:'TensorFlow.js cached GPU',detectionGPU:'nvidia cached',records:[{...stored.records[0],imageIndex:0,src:'image'},{...stored.records[0],id:'000002',kind:2,enabled:false,box:{x:200,y:100,width:100,height:50},imageIndex:0,src:'image'}]}:stored;
  await vm.runInContext("prepare({id:'batch',sourceTab:1,url:'https://comic.naver.com/webtoon/detail?titleId=808482&no=152',urls:['image','image','image']})",context);
  assert.equal(starts,0);assert.equal(vm.runInContext('chapter.records.find(r=>r.kind===2).enabled',context),true,'Cached free text is selected for a new queue');assert.equal(vm.runInContext('chapter.detectionBackend',context),'TensorFlow.js cached GPU');assert.match(element('#gpuStatus').textContent,/nvidia cached.*推論なし/);assert.equal(vm.runInContext('chapter.images[2].top',context),3200);
  assert.ok(!element('#status').textContent.includes('再試行'),element('#status').textContent);
  // Uncached windows must infer in parallel and retain source order despite reversed completion.
  vm.runInContext('recrop=originalRecrop',context);
  let active=0,peak=0,inference=0;const settingsBefore=settingsReads;
  context.ComicDetector.start=async(count,backend,debug,options)=>{assert.equal(count,4);assert.equal(options.gpuParallel,4);assert.equal(options.remaining,Infinity);return 4;};
  context.ComicDetector.detect=async(canvas,lane,diagnostic)=>{const n=inference++;diagnostic?.({preprocessMs:10,inferenceMs:100,postprocessMs:1,backend:'wasm',workerRoundtripMs:120});active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,n%2?1:8));active--;return [{box:{x:40,y:40,width:100,height:50},kind:n%4===0?2:1,score:.9}];};
  context.MangaCore.slices=()=>Array.from({length:4},(_,n)=>({y:n*400,height:1800,ownTop:n*400,ownBottom:(n+1)*400}));
  context.BatchStore.get=async id=>id.includes(':source:')?{blob:new Blob(['source']),width:690,height:1600}:id.includes(':detection:')?{cacheKey:'old-model-revision',detectionBackend:'old GPU',detectionGPU:'old adapter',records:[stored.records[0]]}:undefined;
  await vm.runInContext("prepare({id:'batch',sourceTab:1,url:'https://comic.naver.com/webtoon/detail?titleId=808482&no=152',urls:['image','image','image']})",context);
  assert.equal(vm.runInContext('chapter.records.find(r=>r.kind===2).enabled',context),true,'New free-text detections are selected');assert.equal(settingsReads-settingsBefore,1,'One immutable settings snapshot must serve lookup, inference and cache writes');assert.equal(peak,4);assert.equal(inference,4);for(let n=0;n<4;n++){const restored=cache.get('batch:detection:'+n);assert.ok(context.EpisodeCache.validWindow(restored,{url:'https://comic.naver.com/webtoon/detail?titleId=808482&no=152',urls:['image','image','image'],detectorBackend:'wasm'},context.MangaCore.slices()[n],690),'Each stale window must be replaced by a valid cache entry');}const report=context.MangaDebug.snapshot();assert.equal(report.windows.length,4);assert.equal(report.totalsMs.inferenceMs,400);assert.ok(report.windows.every(r=>r.cropMs>=0&&r.canvasMs>=0));assert.equal(element('#exportDebug').hidden,false);
  assert.deepEqual(Array.from(vm.runInContext('chapter.records.map(r=>r.box.y)',context)),[28,428,828,1228]);
  assert.deepEqual(Array.from(vm.runInContext('chapter.records.map(r=>r.id)',context)),['000001','000002','000003','000004']);
  assert.ok(!element('#status').textContent.includes('再試行'),element('#status').textContent);

  // Publish the first closed layout before the final inference, keeping the last
  // provisional page until later regions or the final flush close it.
  const normalPages=context.MangaCollage.pages,normalSend=context.chrome.runtime.sendMessage;
  context.MangaCollage={...context.MangaCollage,pages:records=>records.filter(r=>r.enabled!==false).map(r=>normalPages([r])[0])};
  const published=[];let finishedInference=0;
  parallelSetting=1;context.ComicDetector.start=async()=>1;
  context.ComicDetector.detect=async()=>{finishedInference++;return [{box:{x:40,y:40,width:100,height:50},kind:1,score:.9}];};
  context.BatchStore.get=async id=>id.includes(':source:')?{blob:new Blob(['source']),width:690,height:1600}:id.includes(':detection:')?undefined:cache.get(id);
  info={ok:true,collection:{id:'batch',autoMode:true,status:'loading',index:0,ids:[]}};
  context.chrome.runtime.sendMessage=async m=>{
   if(m.type==='COLLAGE_APPEND'){published.push({...m,inferences:finishedInference});return {ok:true,batches:published.filter(p=>p.id).length};}
   if(m.type==='AUTO_REPORT')return {ok:true};return normalSend(m);
  };
  await vm.runInContext("prepare({id:'batch',autoMode:true,sourceTab:1,url:'https://comic.naver.com/webtoon/detail?titleId=808482&no=152',urls:['image','image','image']})",context);
  assert.ok(published[0].inferences<4,'First image must publish before all inference completes');
  assert.equal(published.at(-1).final,true);assert.equal(published.filter(p=>p.id).length,4);
  assert.deepEqual(published.filter(p=>p.id).flatMap(p=>cache.get(p.id).records.map(r=>r.id)),['000001','000002','000003','000004']);
  context.MangaCollage={...context.MangaCollage,pages:normalPages};context.chrome.runtime.sendMessage=normalSend;
  info={ok:true,collection:{id:'batch',status:'loading',index:0,ids:[]}};
  parallelSetting=4;
  context.ComicDetector.detect=async(canvas,lane,diagnostic)=>{const n=inference++;diagnostic?.({preprocessMs:10,inferenceMs:100,postprocessMs:1,backend:'wasm',workerRoundtripMs:120});active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,n%2?1:8));active--;return [{box:{x:40,y:40,width:100,height:50},kind:1,score:.9}];};
  parallelSetting='auto';context.navigator.hardwareConcurrency=2;
  context.ComicDetector.start=async count=>{assert.equal(count,1);return 1;};
  peak=0;inference=0;
  await vm.runInContext("prepare({id:'batch',sourceTab:1,url:'https://comic.naver.com/webtoon/detail?titleId=808482&no=152',urls:['image','image','image']})",context);
  assert.equal(peak,1);assert.equal(inference,4);
  assert.ok(!element('#status').textContent.includes('再試行'),element('#status').textContent);
  // Hold the final download: the first complete inference window must run already.
  const progressMessages=[];let progressText=element('#progress').textContent;
  Object.defineProperty(element('#progress'),'textContent',{configurable:true,get:()=>progressText,set:value=>{progressText=value;progressMessages.push(value);}});
  let releaseLast,firstInference;const blockedLast=new Promise(r=>releaseLast=r),inferredEarly=new Promise(r=>firstInference=r);
  context.MangaCore.slices=require('./core.js').slices;
  context.ComicDetector.start=async()=>1;
  context.ComicDetector.detect=async()=>{firstInference();return [{box:{x:40,y:40,width:100,height:50},kind:1,score:.9}];};
  context.BatchStore.get=async id=>{if(id.includes(':source:')){if(id.endsWith(':2'))await blockedLast;return {blob:new Blob(['source']),width:690,height:1600};}return undefined;};
  const preparing=vm.runInContext("prepare({id:'batch',sourceTab:1,url:'https://comic.naver.com/webtoon/detail?titleId=808482&no=152',urls:['image','image','image']})",context);
  try{await Promise.race([inferredEarly,new Promise((_,reject)=>setTimeout(()=>reject(Error('Inference waited for all source images')),1000))]);assert.equal(vm.runInContext('chapter.images.length',context),2);}finally{releaseLast();}
  await preparing;
  assert.ok(!element('#status').textContent.includes('再試行'),element('#status').textContent);
  assert.ok(progressMessages.length>0);
  assert.ok(progressMessages.every(m=>/^画像取得：\d+\/3 ｜ 文字検出：/.test(m)),'Download/model/inference events must share one stable status layout');
  const runningAt=progressMessages.findIndex(m=>m.includes('並列・実行中'));
  assert.ok(runningAt>=0);assert.ok(progressMessages.slice(runningAt).every(m=>!m.includes('検出待ち')&&!m.includes('モデル起動中')),'Late downloads cannot replace the inference state');
  const expectedParts=require('./core.js').slices(4800,1800,400);
  for(let n=0;n<expectedParts.length;n++)assert.ok(context.EpisodeCache.validWindow(cache.get('batch:detection:'+n),{url:'https://comic.naver.com/webtoon/detail?titleId=808482&no=152',urls:['image','image','image'],detectorBackend:'wasm'},expectedParts[n],690),'Streamed windows must keep identical final geometry/cache keys');
  // Keep the four translation records used by the subsequent episode-cache tests.
  vm.runInContext('chapter.records=[...Array(4)].map((_,i)=>({id:String(i+1).padStart(6,"0"),box:{x:0,y:i*100,width:100,height:50},enabled:true,cropBlob:new Blob(["crop"],{type:"image/png"})}));',context);
  // Persistent episode reuse restores sources under the new queue ID and never starts inference.
  const retained=structuredClone(vm.runInContext('chapter',context));retained.records[0].kind=2;retained.records[0].enabled=false;
  context.EpisodeCache.get=async()=>({chapter:retained,sources:retained.images.map(im=>({blob:new Blob(['retained']),width:im.width,height:im.height}))});
  let unexpected=0;context.ComicDetector.start=async()=>{unexpected++;throw Error('cache hit must skip model');};
  context.fetch=async()=>{unexpected++;throw Error('cache hit must skip downloads');};
  context.BatchStore.get=async()=>{unexpected++;throw Error('cache hit already contains source images');};
  info={ok:true,collection:{id:'new-batch',status:'loading',index:0,ids:[]}};
  await vm.runInContext("prepare({id:'new-batch',sourceTab:1,url:'https://comic.naver.com/webtoon/detail?titleId=808482&no=152',urls:['image','image','image']})",context);
  assert.equal(unexpected,0);assert.equal(vm.runInContext('chapter.records[0].enabled',context),true,'Episode cache also gets the new selection default');assert.equal(vm.runInContext('chapter.batchId',context),'new-batch');
  assert.ok(cache.has('new-batch:source:2'));assert.equal(cache.get('new-batch:source:2').batchId,'new-batch');assert.match(element('#cacheStatus').textContent,/再利用/);
  assert.ok(!element('#status').textContent.includes('再試行'),element('#status').textContent);
  atlasOversize=true;const selected=Array.from(vm.runInContext('chapter.records.filter(r=>r.enabled!==false).map(r=>r.id)',context));assert.equal(selected.length,4);const split=await vm.runInContext('pack()',context);assert.equal(split.batches,2);const splitRecords=[cache.get('revision:collage:0'),cache.get('revision:collage:1')].flatMap(p=>p.records.map(r=>r.id));assert.deepEqual(splitRecords,selected);assert.ok([cache.get('revision:collage:0'),cache.get('revision:collage:1')].every(p=>p.blob.size<=20*1024*1024));atlasOversize=false;
  console.log('PASS: parallel window inference retains order; selective recrop and cached resume skip model; JSON Blob corruption reproduced; intact preview Blobs, unsaved edits survive refresh, old atlas removed only after successful activation');
})().catch(error=>{console.error(error);process.exitCode=1;});
