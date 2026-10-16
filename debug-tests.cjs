const assert=require('node:assert/strict'),debug=require('./debug-core.js');
debug.begin(false);debug.window({index:1,inferenceMs:100});assert.equal(debug.snapshot(),null);
debug.begin(true,{backend:'wasm',parallel:4,url:'secret'});debug.event('error',{message:'failed https://example.com/private/path',image:'secret'});debug.window({index:1,regions:3,backend:'wasm',preprocessMs:12,inferenceMs:100,cropMs:40,storeMs:5,text:'SECRET',blob:'SECRET'});debug.window({index:2,regions:4,inferenceMs:200});let report=debug.snapshot();assert.equal(report.totalsMs.inferenceMs,300);assert.ok(!JSON.stringify(report).includes('SECRET'));assert.ok(!JSON.stringify(report).includes('private/path'));assert.ok(!report.config.url);assert.match(debug.summary(),/推論・1並列換算（概算） 150ms/);report.windows[0].inferenceMs=900;assert.equal(debug.snapshot().windows[0].inferenceMs,100);
for(let i=0;i<1100;i++)debug.window({index:i,inferenceMs:1});assert.equal(debug.snapshot().windows.length,1000);assert.ok(debug.snapshot().dropped>0);debug.begin(true);assert.equal(debug.snapshot().windows.length,0);console.log('PASS: opt-in timing, sanitized export, bounded recording, parallel sums, detached snapshots and reset');

debug.begin(true);debug.event("detector-start");debug.window({index:1,inferenceMs:100});debug.window({index:2,inferenceMs:100});debug.event("detection-complete");const timed=debug.snapshot();assert.equal(timed.effectiveWindowMs,timed.detectionElapsedMs/2);assert.match(debug.summary(),/検出工程の実効/);assert.equal(timed.totalsMs.inferenceMs,200);debug.event("complete");assert.equal(debug.snapshot().detectionElapsedMs,timed.detectionElapsedMs);

const concurrent=debug.overlap([[10,50],[30,70]],0,100);
assert.equal(concurrent.idleMs,40);assert.equal(concurrent.coveredMs,60);assert.equal(concurrent.averageInFlight,.8);assert.equal(concurrent.maxInFlight,2);assert.deepEqual(concurrent.durationsByInFlight,{0:40,1:40,2:20});
const serial=debug.overlap([[10,30],[40,60]],0,100);assert.equal(serial.maxInFlight,1);assert.equal(serial.idleMs,60);
const clipped=debug.overlap([[-10,20],[80,120],[NaN,5],[60,50]],0,100);assert.equal(clipped.coveredMs,40);assert.equal(clipped.idleMs,60);
assert.equal(debug.overlap([[0,10]],0,0).averageInFlight,0);
debug.begin(true);debug.event('detector-start');const offset=debug.elapsed();assert.ok(offset>=0);debug.window({index:1,requestStartMs:offset,requestEndMs:offset,workerIndex:0,publishQueueMs:40,bitmapQueueMs:15,sessionQueueMs:5,secret:'PRIVATE'});assert.equal(debug.snapshot().parallelRequests.completeTimeline,false);debug.event('detection-complete');assert.equal(debug.snapshot().parallelRequests.completeTimeline,true);assert.equal(debug.snapshot().totalsMs.publishQueueMs,40);assert.ok(!JSON.stringify(debug.snapshot()).includes('PRIVATE'));assert.match(debug.summary(),/画像組立待ち 40ms/);
console.log('PASS: overlapping/serial/clipped request intervals, idle time, average/max concurrency, pending snapshot labeling and queue metrics');

debug.begin(true);debug.window({index:1,inferenceMs:10});debug.window({index:2,preprocessMs:8,inferenceMs:30});const layout=debug.view();assert.equal(layout.phases.find(r=>r[0]==='前処理')[1],'8ms','Missing measurements are not counted as zero');assert.equal(layout.phases.find(r=>r[0]==='推論・1並列換算（概算）')[1],'20ms');assert.equal(layout.phases.find(r=>r[0]==='保存')[1],'—');assert.equal(layout.stats.find(r=>r[0]==='concurrency')[2],'—');assert.match(debug.summary(),/\n前処理 8ms/);debug.event('error');assert.equal(debug.view().state,'エラー');
debug.begin(true);debug.event('cache-hit');debug.event('complete');assert.equal(debug.view().state,'キャッシュ利用');assert.match(debug.view().note,/推論していません/);debug.begin(false);assert.equal(debug.view(),null);
console.log('PASS: structured readable metrics, missing-value semantics, incomplete concurrency, error/cache states and multiline export');

// Preserve preprocessing subphases in exported diagnostics and visible details.
debug.begin(true);
const prep={inputCanvasSetupMs:1,inputDrawMs:2,inputBitmapCloseMs:3,inputReadbackMs:200,inputNormalizeMs:8};
debug.window({index:1,preprocessMs:214,...prep});
for(const [key,value] of Object.entries(prep))assert.equal(debug.snapshot().windows[0][key],value);
assert.deepEqual(debug.view().details.find(row=>row[0]==='入力画素の読み出し'),['入力画素の読み出し','200ms']);
console.log('PASS: preprocessing subphase export and display');

debug.begin(true);debug.event('detector-start',{parallel:2});debug.window({index:1,backend:'webgpu',inferenceMs:100,inferenceParallel:2});assert.equal(debug.view().phases.find(r=>r[0]==='推論・1並列換算（概算）')[1],'50ms');assert.equal(debug.snapshot().windows[0].inferenceMs,100);assert.equal(debug.view().details.find(r=>r[0]==='推論応答待ち（実測）')[1],'100ms');
