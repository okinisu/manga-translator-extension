const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const MangaCollage=require('./collage-core.js');
const url='https://comic.naver.com/webtoon/detail?titleId=808482&no=160',src='https://image-comic.pstatic.net/webtoon/808482/160/a.jpg';
function setup(count=16){
 let listener,serial=0;const crops=Array.from({length:count},(_,i)=>({id:String(i+1).padStart(6,'0'),kind:1,score:.9,enabled:true,box:{x:0,y:i*70,width:200,height:50},relative:{x:0,y:i*.01,width:.2,height:.01},src,cropBlob:new Blob(['crop'])}));
 const records=crops.map(({cropBlob,...r})=>r),root={id:'atlas',customInstructions:'主人公の一人称は俺',batchId:'batch',sourceTab:1,url,type:'collage',blob:new Blob(['original']),records};
 const cache=new Map([['atlas',root],['batch:chapter',{records:crops}]]),applied=[],labels=[];let bitmapsClosed=0;
 let localStore={};let state={collection:{id:'batch',sourceTab:1,url,autoMode:true,aiProvider:'chatgpt',status:'ready',index:0,ids:['atlas']},job:{...root,image:'data:image/png;base64,eA==',chatTab:2,aiProvider:'chatgpt',automation:{phase:'sent'}},chatAccess:{tabId:2,provider:'chatgpt'},autoState:{batchId:'batch',state:'running'}};
 const chrome={runtime:{getURL:p=>'chrome-extension://test/'+p,onStartup:{addListener(){}},onMessage:{addListener:f=>listener=f}},storage:{local:{get:async x=>({...x,...localStore}),set:async x=>{localStore={...localStore,...structuredClone(x)};}},session:{get:async()=>structuredClone(state),set:async v=>{state={...state,...structuredClone(v)};},remove:async keys=>keys.forEach(k=>delete state[k])}},tabs:{get:async id=>({id,url:id===1?url:'https://chatgpt.com/',windowId:9}),create:async o=>({...o,id:3}),sendMessage:async(id,m)=>{if(m.type==='APPLY')applied.push(structuredClone(m));return {ok:true};}}};
 const ctx={chrome,URL,Blob,Map,Set,Date,Error,crypto:{randomUUID:()=>String(++serial)},importScripts(){},MangaCore:require('./core.js'),MangaText:require('./text-core.js'),MangaCollage,BatchStore:{get:async id=>structuredClone(cache.get(id)),put:async x=>cache.set(x.id,structuredClone(x)),clear:async()=>cache.clear(),dataURL:async()=> 'data:image/png;base64,eA=='},createImageBitmap:async()=>({close(){bitmapsClosed++;}}),OffscreenCanvas:class{constructor(w,h){this.width=w;this.height=h;}getContext(){return {fillRect(){},fillText:t=>labels.push(t),drawImage(){}};}async convertToBlob(){return new Blob(['retry'],{type:'image/png'});}}};
 vm.runInNewContext(fs.readFileSync(__dirname+'/background.js','utf8'),ctx);
 const ai={tab:{id:2},url:'https://chatgpt.com/'};
 const send=(m,s=ai)=>new Promise(r=>listener(m,s,r));
 const answer=(ids,skips=[])=>JSON.stringify({jobId:state.job.id,items:ids.map(id=>skips.includes(id)?{id,skip:true}:{id,translated:'訳 '+id})});
 return {send,answer,get state(){return state;},cache,applied,labels,get closed(){return bitmapsClosed;},ids:records.map(r=>r.id),internal:{url:'chrome-extension://test/popup.html'}};
}
(async()=>{
 const preview=setup(2),previewText=JSON.stringify({jobId:'atlas',items:[{id:'000001',translated:'仮訳'}]});
 assert.equal((await preview.send({type:'IMPORT_PREVIEW',jobId:'atlas',text:previewText})).ok,true);
 assert.equal(preview.applied.length,1);assert.equal(preview.applied[0].provisional,true);assert.equal(preview.applied[0].blocks[0].provisional,true);
 assert.equal(preview.applied[0].jobId,'atlas:preview');assert.equal(preview.state.job.id,'atlas');assert.equal(preview.cache.get('atlas').receivedItems,undefined);assert.equal(preview.cache.get('atlas').retry,undefined);
 assert.equal((await preview.send({type:'IMPORT_PREVIEW',jobId:'other',text:previewText})).ok,false);
 assert.equal((await preview.send({type:'IMPORT_PREVIEW',jobId:'atlas',text:previewText},{tab:{id:99},url:'https://chatgpt.com/'})).ok,false);
 const previewDone=await preview.send({type:'IMPORT',automatic:true,text:preview.answer(preview.ids)});
 assert.equal(previewDone.ok,true);assert.deepEqual(Array.from(preview.applied.at(-1).clearJobIds),['atlas:preview']);
 const previewMissing=setup(2);
 await previewMissing.send({type:'IMPORT_PREVIEW',jobId:'atlas',text:previewText});
 await previewMissing.send({type:'IMPORT',automatic:true,text:previewMissing.answer(['000001'])});
 assert.deepEqual(Array.from(previewMissing.applied.at(-1).clearJobIds),['atlas:preview']);
 const t=setup();
 const first=await t.send({type:'IMPORT',automatic:true,text:t.answer([t.ids[0]])});
 assert.equal(first.ok,true);assert.equal(first.retry,true);assert.equal(first.count,1);assert.equal(first.retryCount,12);assert.equal(first.appliedPosition,1);
 assert.equal(t.applied[0].blocks[0].original,'');assert.equal(t.applied[0].blocks[0].ja,'訳 '+t.ids[0]);assert.equal(t.applied.length,1);assert.equal(t.applied[0].incremental,true);assert.equal(t.applied[0].blocks[0].blockId,'atlas:0');
 assert.equal(t.state.job.customInstructions,'主人公の一人称は俺');assert.ok(MangaCollage.prompt(t.state.job).includes('主人公の一人称は俺'));assert.equal(t.state.job.records.length,12);assert.equal(t.state.job.recoveryRoot,'atlas');assert.ok(!t.state.job.automation);
 assert.deepEqual(Array.from(t.state.collection.ids),['atlas']);assert.equal(t.state.collection.completed,undefined);
 assert.ok(!t.labels.includes('ID '+t.ids[0]),'Already received ID must not appear in retry image');assert.equal(t.closed,12);
 const nextIds=t.state.job.records.map(r=>r.id);await t.send({type:'AUTOMATION_MARK',jobId:t.state.job.id,phase:'sent'});
 const second=await t.send({type:'IMPORT',automatic:true,text:t.answer(nextIds.slice(0,11),[nextIds[0]])});
 assert.equal(second.retryCount,4);assert.equal(second.count,10);assert.equal(t.applied.length,2);
 const lastIds=t.state.job.records.map(r=>r.id);assert.equal(new Set(lastIds).size,4);assert.ok(!lastIds.includes(t.ids[0]));
 await t.send({type:'AUTOMATION_MARK',jobId:t.state.job.id,phase:'sent'});
 // Stop/resume preserves the exact sent retry ID and does not start a new request.
 const sentId=t.state.job.id;await t.send({type:'AUTO_STOP'});
 assert.equal((await t.send({type:'IMPORT',automatic:true,text:t.answer(lastIds)})).ok,false);
 assert.equal((await t.send({type:'AUTO_START',sourceTab:1,provider:'chatgpt'},t.internal)).ok,true);assert.equal(t.state.job.id,sentId);assert.equal(t.state.job.automation.phase,'sent');
 const final=await t.send({type:'IMPORT',automatic:true,text:t.answer(lastIds)});
 assert.equal(final.ok,true);assert.equal(final.hasNext,false);assert.equal(final.count,4);assert.equal(t.applied.length,3,'Only newly returned IDs are drawn, no final redraw of earlier IDs');
 const blocks=t.applied.flatMap(m=>m.blocks);assert.equal(blocks.length,15);assert.equal(new Set(blocks.map(b=>b.blockId)).size,15);assert.ok(blocks.every(b=>b.jobId==='atlas'));
 assert.equal(t.state.autoState.state,'complete');
 // Repeated empty responses stop after 3 requests for an individual ID.
 const stalled=setup(1);
 for(let n=0;n<3;n++){const result=await stalled.send({type:'IMPORT',automatic:true,text:stalled.answer([])});assert.equal(result.ok,true);await stalled.send({type:'AUTOMATION_MARK',jobId:stalled.state.job.id,phase:'sent'});}
 const limited=await stalled.send({type:'IMPORT',automatic:true,text:stalled.answer([])});assert.equal(limited.ok,false);assert.match(limited.error,/3回/);assert.equal(stalled.cache.get('atlas').retryAttempts['000001'],3);
 // Malformed, duplicate, foreign and wrong-job rows cannot be partially applied.
 for(const items of [[{id:'unknown',skip:true}],[{id:'000001',original:'x',translated:'y'},{id:'000001',skip:true}],[{id:'000001',original:'x'}]]){
  const invalid=setup(2);assert.equal((await invalid.send({type:'IMPORT',automatic:true,text:JSON.stringify({jobId:'atlas',items})})).ok,false);assert.equal(invalid.applied.length,0);
 }

 // Exercise the actual manga page handler: adding/repeating an ID must keep
 // previous overlays and another batch, while normal full replacement still works.
 let pageListener,persisted;const pageContext={};
 const element=()=>({style:{},append(){},replaceChildren(){},attachShadow(){return element();}});
 const pageChrome={runtime:{id:'test',onMessage:{addListener:f=>pageListener=f}},storage:{local:{get:async()=>({}),set:async value=>{persisted=structuredClone(value);}}}};
 vm.runInNewContext(fs.readFileSync(__dirname+'/comic.js','utf8').replace('  function save(){','  globalThis.testBlocks=()=>blocks;\n  function save(){'),Object.assign(pageContext,{location:{href:url},document:{createElement:element,documentElement:element(),images:[],addEventListener(){}},chrome:pageChrome,ResizeObserver:class{observe(){}},addEventListener(){},requestAnimationFrame(){},Date,Set}));
 await Promise.resolve();
 const draw=(jobId,ids,incremental=false,extra={})=>new Promise(resolve=>pageListener({type:'APPLY',url,jobId,incremental,...extra,blocks:ids.map(id=>({jobId,blockId:jobId+':'+id,src,...(extra.provisional?{provisional:true}:{})}))},{id:'test'},resolve));
 await draw('other',['0']);await draw('atlas',['0'],true);await draw('atlas',['1'],true);await draw('atlas',['1'],true);
 assert.equal(persisted['manga:'+url].blocks.length,3);assert.equal(new Set(persisted['manga:'+url].blocks.map(b=>b.blockId)).size,3);
 await draw('atlas',['2']);assert.equal(persisted['manga:'+url].blocks.length,2);assert.ok(persisted['manga:'+url].blocks.some(b=>b.jobId==='other'));
 await draw('atlas:preview',['3'],false,{provisional:true});
 assert.equal(pageContext.testBlocks().length,3,'Preview is visible in page memory');assert.equal(persisted['manga:'+url].blocks.length,2,'Preview must not be persisted');
 await draw('atlas:preview',['5'],false,{provisional:true});assert.equal(pageContext.testBlocks().length,3,'Updated preview replaces, rather than duplicates, prior preview');
 await draw('atlas:preview',[],false,{provisional:true});assert.equal(pageContext.testBlocks().length,2,'Final skip/removal clears provisional IDs');
 await draw('atlas:preview',['3'],false,{provisional:true});
 await draw('atlas',['4'],true,{clearJobIds:['atlas:preview']});
 assert.equal(persisted['manga:'+url].blocks.length,3);
 assert.ok(!persisted['manga:'+url].blocks.some(b=>b.jobId.endsWith(':preview')));assert.ok(!pageContext.testBlocks().some(b=>b.provisional),'Final import clears provisional overlays from memory');
 console.log('PASS: immediate per-ID apply, missing-only 12-crop retries, stable overlay/queue IDs, skip tracking, sent retry stop/resume, per-ID retry limit, invalid-response rejection');
})().catch(e=>{console.error(e);process.exitCode=1;});
