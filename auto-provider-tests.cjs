const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const core=require('./core.js'),collage=require('./collage-core.js'),text=require('./text-core.js');
const page='https://comic.naver.com/webtoon/detail?titleId=808482&no=154&week=thu',src='https://image-comic.pstatic.net/webtoon/808482/154/a.jpg';
let listener,stored={},serial=1,batchModeSetting="accuracy",localStore={},hideAIURLs=false;const cache=new Map(),created=[],updates=[],messages=[],tabs=new Map([[1,{id:1,url:page,windowId:9}]]);
const internal={url:'chrome-extension://test/popup.html'};
const send=(m,s=internal)=>new Promise(resolve=>listener(m,s,resolve));
const chrome={runtime:{getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener:f=>listener=f},onStartup:{addListener(){}}},storage:{local:{get:async d=>({...d,...localStore,batchMode:batchModeSetting}),set:async d=>{localStore={...localStore,...structuredClone(d)};}},session:{get:async()=>({...stored}),set:async v=>{stored={...stored,...v};},remove:async keys=>keys.forEach(k=>delete stored[k])}},tabs:{query:async({url})=>Array.from(tabs.values()).filter(t=>t.url===url),get:async id=>{if(!tabs.has(id))throw Error('no tab');const tab=tabs.get(id);if(hideAIURLs&&id!==1){const {url,...masked}=tab;return masked;}return tab;},create:async o=>{const t={...o,id:++serial};created.push(t);tabs.set(t.id,t);return t;},update:async(id,o)=>{updates.push({id,...o});return Object.assign(tabs.get(id),o);},sendMessage:async(id,m)=>{messages.push({id,...m});if(m.type==='AI_PROBE'){const url=tabs.get(id)?.url||'';return {ok:true,provider:url.startsWith('https://chatgpt.com/')?'chatgpt':url.startsWith('https://gemini.google.com/')?'gemini':'unknown'};}if(m.type==='WHOLE')return send({type:'BATCH_START',urls:[src],automatic:m.automatic,provider:m.provider},{url:page,tab:tabs.get(1)});return {ok:true};}}};
vm.runInNewContext(fs.readFileSync(__dirname+'/background.js','utf8'),{chrome,URL,Map,Set,Date,Error,setTimeout,clearTimeout,crypto:{randomUUID:()=>String(++serial)},importScripts(){},MangaCore:core,MangaCollage:collage,MangaText:text,BatchStore:{get:async id=>cache.get(id),put:async j=>cache.set(j.id,j),clear:async()=>cache.clear(),dataURL:async()=> 'data:image/png;base64,test'}});
function saveJobs(){const id=stored.collection.id;for(let i=0;i<2;i++)cache.set('atlas'+i,{id:'atlas'+i,batchId:id,sourceTab:1,url:page,type:'collage',blob:{},records:[{id:'000001',src,relative:{x:0,y:0,width:1,height:1}}]});return id;}
(async()=>{
 assert.equal((await send({type:'AUTO_START',sourceTab:1,provider:'unknown'})).ok,false);
 assert.equal((await send({type:'AUTO_START',sourceTab:1,provider:'gemini'})).ok,true);
 const preloaded=stored.collection.chatTab;assert.equal(tabs.get(preloaded).url,'https://gemini.google.com/app');assert.equal(stored.job,undefined,'Preloading must not create a sendable placeholder job');assert.equal(created[0].url,'https://gemini.google.com/app');assert.ok(created.some(t=>t.url.endsWith('review.html')));assert.ok(!messages.some(m=>m.type==='AUTO_WAKE'),'Do not start translation before an image exists');
 assert.equal(stored.collection.batchMode,"accuracy");batchModeSetting="compact";assert.equal(stored.collection.autoMode,true);assert.equal(stored.autoState.state,'preparing');assert.equal(created[0].active,false);
 assert.equal((await send({type:'AUTO_START',sourceTab:1,provider:'gemini'})).ok,false,'Repeated start cannot create extra tabs');
 await send({type:'AUTO_STOP'});assert.equal(stored.collection.stopRequested,true);
 assert.equal((await send({type:'AUTO_START',sourceTab:1,provider:'gemini'})).ok,true);assert.equal(stored.collection.stopRequested,false);assert.equal(stored.collection.batchMode,"accuracy","Resume preserves the original batch layout");
 assert.equal(stored.collection.chatTab,preloaded);assert.equal(created.filter(t=>t.url==='https://gemini.google.com/app').length,1,'Resume preparation must reuse the preloaded tab');
 const batchId=saveJobs();assert.equal((await send({type:'COLLAGE_READY',batchId,ids:['atlas0','atlas1']})).ok,true);
 const j=stored.job,ai={url:'https://gemini.google.com/app/abc',tab:tabs.get(j.chatTab),documentId:'doc1'};
 assert.equal(j.chatTab,preloaded,'First ready image must reuse the preloaded tab');assert.equal(created.filter(t=>t.url==='https://gemini.google.com/app').length,1);
 assert.equal(tabs.get(j.chatTab).url,'https://gemini.google.com/app');assert.equal(tabs.get(j.chatTab).active,false);assert.equal(j.aiProvider,'gemini');
 assert.equal((await send({type:'GET'},ai)).ok,true);
 const knownImage=await send({type:'GET',knownImageId:j.id},ai);assert.equal(knownImage.imageUnchanged,true);assert.equal(knownImage.job.id,j.id);assert.equal(knownImage.job.image,undefined);assert.equal(stored.job.image,j.image,'Omitting an image never mutates storage');
 const wrongImage=await send({type:'GET',knownImageId:'stale'},ai);assert.equal(wrongImage.job.image,'data:image/png;base64,test');assert.equal(j.image,undefined);assert.ok(j.imageRef);
 assert.equal((await send({type:'GET',knownImageId:j.id},{...ai,url:'https://chatgpt.com/'})).ok,false,'Image cache handshake does not widen provider access');
 
 assert.equal((await send({type:'GET'},{...ai,url:'https://chatgpt.com/'})).ok,false,'Other provider cannot use bound tab');
 assert.equal((await send({type:'GET'},{...ai,url:'https://gemini.google.com.evil.example/'})).ok,false);
 const claims=await Promise.all([send({type:'AI_READY'},ai),send({type:'AI_READY'},ai)]);assert.equal(claims.filter(x=>x.start).length,1);
 assert.equal((await send({type:'AI_READY'},ai)).start,false,'Wake does not restart running content');
 // Recovery must match the same job, provider, pending phase and attempt.
 const attempt=await send({type:'AUTOMATION_MARK',jobId:j.id,phase:'sending'},ai);assert.ok(attempt.attemptId);
 assert.equal((await send({type:'AUTOMATION_MARK',jobId:j.id,phase:'sending'},ai)).ok,false,'A stale reader cannot overwrite a pending send');assert.equal(stored.job.automation.attemptId,attempt.attemptId);
 for(const [jobId,attemptId,sender] of [[j.id,'stale',ai],['other',attempt.attemptId,ai],[j.id,attempt.attemptId,{...ai,url:'https://chatgpt.com/'}]])assert.equal((await send({type:'AUTOMATION_UNSENT',jobId,attemptId},sender)).ok,false);
 assert.equal(stored.job.automation.phase,'sending');assert.equal((await send({type:'AUTOMATION_UNSENT',jobId:j.id,attemptId:attempt.attemptId},ai)).ok,true);assert.equal(stored.job.automation,undefined);
 const newAttempt=await send({type:'AUTOMATION_MARK',jobId:j.id,phase:'sending'},ai);assert.notEqual(newAttempt.attemptId,attempt.attemptId);
 assert.equal((await send({type:'AUTOMATION_MARK',jobId:j.id,phase:'sent',attemptId:attempt.attemptId},ai)).ok,false);
 await send({type:'AUTOMATION_MARK',jobId:j.id,phase:'sent',attemptId:newAttempt.attemptId},ai);
 assert.equal((await send({type:'AUTOMATION_UNSENT',jobId:j.id,attemptId:newAttempt.attemptId},ai)).ok,false,'Never reset a sent attempt');
 await send({type:'AUTO_STOP'});
 assert.equal((await send({type:'AUTO_RESUME_AI',jobId:'wrong'},ai)).ok,false);
 assert.equal((await send({type:'AUTO_RESUME_AI',jobId:j.id},{...ai,url:'https://chatgpt.com/'})).ok,false);
 assert.equal((await send({type:'AUTO_RESUME_AI',jobId:j.id},ai)).ok,true);assert.equal(stored.autoState.state,'running');assert.equal(stored.collection.stopRequested,false);assert.equal(stored.job.automation.phase,'sent','Small-window resume preserves sent state');
 assert.equal((await send({type:'AUTO_RESUME_AI',jobId:j.id},{...ai,documentId:'other-doc'})).ok,false,'Another document cannot steal a running task');
 await send({type:'AUTOMATION_MARK',jobId:j.id,phase:'sent'},ai);
 await send({type:'AUTO_STOP'});assert.equal(stored.autoState.state,'paused');assert.equal((await send({type:'AUTOMATION_MARK',jobId:j.id,phase:'sending'},ai)).ok,false);
 const payload=id=>JSON.stringify({jobId:id,items:[{id:'000001',original:'안녕',translated:'こんにちは'}]});
 assert.equal((await send({type:'IMPORT',automatic:true,text:payload(j.id)},ai)).ok,false);
 assert.equal((await send({type:'AUTO_START',sourceTab:1,provider:'chatgpt'})).ok,false,'Sent image cannot switch provider');
 assert.equal((await send({type:'AUTO_START',sourceTab:1,provider:'gemini'})).ok,true);assert.equal(stored.job.automation.phase,'sent');
 assert.equal((await send({type:'AI_READY'},ai)).start,true);
 assert.equal((await send({type:'IMPORT',automatic:true,text:payload('atlas0')},ai)).ok,true);
 assert.equal(stored.job.aiProvider,'gemini');assert.equal(stored.job.chatTab,j.chatTab);assert.equal(stored.autoState.position,2);
 await send({type:'AUTOMATION_MARK',jobId:'atlas1',phase:'sent'},ai);
 assert.equal((await send({type:'IMPORT',automatic:true,text:payload('atlas1')},ai)).ok,true);
 assert.equal(stored.autoState.state,'complete');assert.equal(stored.job,undefined);assert.equal(updates.length,0,'Background preparation, sending and final import never activate a tab');
 assert.equal((await send({type:'GET_STATUS'})).autoState.state,'complete');

 // First page starts immediately; an empty queue waits without deleting sources.
 const geminiCount=created.filter(t=>t.url==='https://gemini.google.com/app').length;await send({type:'AUTO_START',sourceTab:1,provider:'gemini'});assert.equal(stored.collection.chatTab,preloaded);assert.equal(created.filter(t=>t.url==='https://gemini.google.com/app').length,geminiCount,'Next episode must keep the existing conversation tab');const streamBatch=saveJobs();
 assert.equal((await send({type:'COLLAGE_APPEND',batchId:streamBatch,revision:'stream',id:'atlas0'})).ok,true);
 const streamJob=stored.job,streamAI={url:'https://gemini.google.com/app/stream',tab:tabs.get(streamJob.chatTab),documentId:'stream-doc'};
 assert.equal(stored.collection.producing,true);assert.equal(stored.autoState.state,'running');
 await send({type:'AUTOMATION_MARK',jobId:'atlas0',phase:'sent'},streamAI);
 const early=await send({type:'IMPORT',automatic:true,text:payload('atlas0')},streamAI);
 assert.equal(early.hasNext,true);assert.equal(stored.collection.waiting,true);assert.ok(cache.has('atlas1'));
 assert.equal((await send({type:'GET'},streamAI)).waiting,true);assert.equal((await send({type:'GET'},streamAI)).job,null);
 assert.equal((await send({type:'COLLAGE_APPEND',batchId:streamBatch,revision:'stream',id:'atlas1'})).ok,true);
 assert.equal(stored.job.id,'atlas1');assert.equal(stored.job.chatTab,streamJob.chatTab);assert.equal(stored.job.context.length,1);
 await send({type:'AUTOMATION_MARK',jobId:'atlas1',phase:'sent'},streamAI);
 await send({type:'IMPORT',automatic:true,text:payload('atlas1')},streamAI);
 assert.equal(stored.autoState.state,'running','No premature completion while producer remains active');
 assert.equal((await send({type:'COLLAGE_APPEND',batchId:streamBatch,revision:'stream',final:true})).ok,true);
 assert.equal(stored.autoState.state,'complete');assert.equal(stored.collection,undefined);assert.equal((await send({type:'GET'},streamAI)).finished,true,'Waiting runner can observe final completion from its bound AI tab');
 // A last image published before detection finishes completes normally after its reply.
 await send({type:'AUTO_START',sourceTab:1,provider:'gemini'});const lastBatch=saveJobs();
 await send({type:'COLLAGE_APPEND',batchId:lastBatch,revision:'last',id:'atlas0'});
 const lastAI={url:'https://gemini.google.com/app/last',tab:tabs.get(stored.job.chatTab)};
 await send({type:'COLLAGE_APPEND',batchId:lastBatch,revision:'last',final:true});
 await send({type:'AUTOMATION_MARK',jobId:'atlas0',phase:'sent'},lastAI);
 assert.equal((await send({type:'IMPORT',automatic:true,text:payload('atlas0')},lastAI)).hasNext,false);
 assert.equal(stored.autoState.state,'complete');

 // An append racing with reply import must not lose the newly queued page.
 await send({type:'AUTO_START',sourceTab:1,provider:'gemini'});const racingBatch=saveJobs();
 await send({type:'COLLAGE_APPEND',batchId:racingBatch,revision:'racing',id:'atlas0'});
 const racingAI={url:'https://gemini.google.com/app/race',tab:tabs.get(stored.job.chatTab)};
 await send({type:'AUTOMATION_MARK',jobId:'atlas0',phase:'sent'},racingAI);
 const raced=await Promise.all([send({type:'IMPORT',automatic:true,text:payload('atlas0')},racingAI),send({type:'COLLAGE_APPEND',batchId:racingBatch,revision:'racing',id:'atlas1'})]);
 assert.ok(raced.every(r=>r.ok));assert.deepEqual(Array.from(stored.collection.ids),['atlas0','atlas1']);assert.equal(stored.job.id,'atlas1');assert.equal(stored.collection.waiting,false);assert.equal(stored.autoState.total,2);
 await send({type:'AUTO_STOP'});
 assert.equal((await send({type:'COLLAGE_APPEND',batchId:racingBatch,revision:'racing',final:true})).ok,false,'Stopped producer cannot finalize or append');
 assert.equal((await send({type:'AUTO_START',sourceTab:1,provider:'gemini'})).ok,true);assert.equal(stored.collection.stopRequested,false);
 assert.equal((await send({type:'COLLAGE_APPEND',batchId:racingBatch,revision:'racing',final:true})).ok,true);

 await send({type:'AUTOMATION_MARK',jobId:stored.job.id,phase:'sent'},racingAI);
 await send({type:'IMPORT',automatic:true,text:payload(stored.job.id)},racingAI);
 async function finishOne(key){const b=saveJobs();await send({type:'COLLAGE_READY',batchId:b,ids:['atlas0']});const target={url:key==='chatgpt'?'https://chatgpt.com/c/test':'https://gemini.google.com/app/test',tab:tabs.get(stored.job.chatTab)};await send({type:'AUTOMATION_MARK',jobId:'atlas0',phase:'sent'},target);assert.equal((await send({type:'IMPORT',automatic:true,text:payload('atlas0')},target)).ok,true);}
 // Switching AI providers remembers each conversation independently.
 await send({type:'AUTO_START',sourceTab:1,provider:'chatgpt'});const chatgptTab=stored.collection.chatTab;assert.notEqual(chatgptTab,preloaded);await finishOne('chatgpt');
 const createdBeforeSwitch=created.length;await send({type:'AUTO_START',sourceTab:1,provider:'gemini'});assert.equal(stored.collection.chatTab,preloaded);assert.equal(created.length,createdBeforeSwitch,'Review and AI tabs are reused when switching back');await finishOne('gemini');
 // Closed and navigated-away tabs must be replaced without navigating user tabs.
 tabs.delete(preloaded);await send({type:'AUTO_START',sourceTab:1,provider:'gemini'});const replacement=stored.collection.chatTab;assert.notEqual(replacement,preloaded);await finishOne('gemini');
 tabs.get(replacement).url='https://example.com/';await send({type:'AUTO_START',sourceTab:1,provider:'gemini'});assert.notEqual(stored.collection.chatTab,replacement);assert.equal(tabs.get(replacement).url,'https://example.com/');await finishOne('gemini');

 // Reproduce Chrome hiding Tab.url: probe must reuse the same tab.
 hideAIURLs=true;const keptTab=localStore.aiReuseTabs['chatgpt:temporary'];const priorCount=created.length;
 await send({type:'AUTO_START',sourceTab:1,provider:'chatgpt'});assert.equal(stored.collection.chatTab,keptTab);assert.equal(created.length,priorCount,'Neither review nor AI tab is duplicated when URL is unavailable');await finishOne('chatgpt');
 // Extension reload loses session data but retains a non-sensitive tab ID.
 stored={};const afterReload=created.length;
 await send({type:'AUTO_START',sourceTab:1,provider:'chatgpt'});assert.equal(stored.collection.chatTab,keptTab);assert.equal(created.length,afterReload);await finishOne('chatgpt');
 const manifest=JSON.parse(fs.readFileSync(__dirname+'/manifest.json','utf8'));assert.deepEqual(manifest.host_permissions,['https://image-comic.pstatic.net/*'],'Reuse does not add site-wide host permissions');
 console.log('PASS: AI selection, background preparation/open/completion, binding and origin checks, single claim, stop/resume without resend, sent provider lock and progress');
})().catch(e=>{console.error(e);process.exitCode=1;});
