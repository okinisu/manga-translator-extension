const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),path=require('path');
const dir=__dirname;
for(const name of fs.readdirSync(dir).filter(n=>n.endsWith('.js')))new vm.Script(fs.readFileSync(path.join(dir,name),'utf8'),{filename:name});
const collageCore=require('./collage-core.js');global.MangaCollage=collageCore;
const textCore=require('./text-core.js');global.MangaText=textCore;
const core=require('./core.js'),page='https://comic.naver.com/webtoon/detail?titleId=808482&no=155&week=thu';
const src='https://image-comic.pstatic.net/webtoon/808482/155/panel.jpg';
assert.equal(core.episodeImage(src,page),true);
for(const url of [src.replace('/155/','/154/'),src.replace('image-comic.pstatic.net','evil.example'),src.replace('https:','http:'),src.replace('panel.jpg','thumbnail_202x120.jpg'),'https://image-comic.pstatic.net@evil.example/webtoon/808482/155/panel.jpg'])assert.equal(core.episodeImage(url,page),false);
for(const height of [1,472,1600,1800,1801,3200,5000,60000]){
 const slices=core.slices(height);assert.equal(slices[0].y,0);assert.equal(slices.at(-1).y+slices.at(-1).height,height);assert.equal(slices[0].ownTop,0);assert.equal(slices.at(-1).ownBottom,height);
 for(let i=0;i<slices.length;i++){assert.ok(slices[i].height<=1800);if(i)assert.equal(slices[i-1].ownBottom,slices[i].ownTop);}
}
const j={id:'test-id',rect:{x:0,y:1600,width:690,height:1800},images:[{src,x:0,y:0,width:690,height:5000}]};
const payload={jobId:j.id,blocks:[{box:[100,100,200,100],ja:'こんにちは'}]};
const b=core.parse('```json\n'+JSON.stringify(payload)+'\n```',j.id)[0];assert.equal(core.anchor(b,j).relative.y,1780/5000);
assert.throws(()=>core.parse(JSON.stringify(payload),'wrong-id'));
assert.throws(()=>core.parse(JSON.stringify({...payload,blocks:[{box:[900,0,200,10],ja:'範囲外'}]}),j.id));
let localStore={},listener,stored={},cache=new Map(),counter=10,captured=0,sent=[],notifications=[];
const tabs=new Map([[1,{id:1,url:page,windowId:9}]]);
const chrome={runtime:{getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener:f=>listener=f},onStartup:{addListener:()=>{}}},storage:{local:{get:async defaults=>({...defaults,...localStore}),set:async values=>{localStore={...localStore,...structuredClone(values)};}},session:{get:async()=>({...stored}),set:async values=>{stored={...stored,...values};},remove:async keys=>{for(const k of Array.isArray(keys)?keys:[keys])delete stored[k];}}},tabs:{get:async id=>{if(!tabs.has(id))throw Error('no tab');return tabs.get(id);},create:async options=>{const tab={...options,id:++counter};tabs.set(tab.id,tab);return tab;},update:async(id,values)=>{if(!tabs.has(id))throw Error('no tab');Object.assign(tabs.get(id),values);return tabs.get(id);},sendMessage:async(id,m)=>{if(m.type==='APPLY')sent.push(m);else notifications.push(m);return {ok:true};},query:async()=>[tabs.get(1)],captureVisibleTab:async()=>{captured++;return 'image';}}};
const context=vm.createContext({chrome,crypto:{randomUUID:()=> 'batch-test'},console,URL,Map,Set,Date,Error,importScripts:()=>{},MangaCore:core,MangaText:textCore,MangaCollage:collageCore,BatchStore:{clear:async()=>cache.clear(),put:async j=>cache.set(j.id,j),get:async id=>cache.get(id),remove:async id=>cache.delete(id),dataURL:async()=> 'data:image/png;base64,test'}});
vm.runInContext(fs.readFileSync(path.join(dir,'background.js'),'utf8'),context);
const send=(m,s={url:'chrome-extension://test/review.html'})=>new Promise(resolve=>listener(m,s,resolve));
(async()=>{
 let r=await send({type:'BATCH_START',urls:[src,src]},{url:page,tab:tabs.get(1)});assert.equal(r.ok,true);assert.equal(stored.collection.urls.length,1);assert.equal(captured,0);
 r=await send({type:'GET'},{url:'https://evil.example/',tab:{id:999}});assert.equal(r.ok,false);
 r=await send({type:'BATCH_READY',batchId:'batch-test',ids:['missing']});assert.equal(r.ok,false);
 const base={batchId:'batch-test',sourceTab:1,url:page,rect:{x:0,y:0,width:690,height:1600},images:[{src,x:0,y:0,width:690,height:1600}],blob:{}};
 cache.set('part-1',{...base,id:'part-1'});cache.set('part-2',{...base,id:'part-2'});
 r=await send({type:'BATCH_READY',batchId:'batch-test',ids:['part-1','part-2']});assert.equal(r.ok,true);assert.equal(stored.job.id,'part-1');
 r=await send({type:'OPEN_CHAT'});assert.equal(r.ok,true);const chatId=stored.job.chatTab;
 const chatSender={url:'https://chatgpt.com/',tab:tabs.get(chatId)};
 r=await send({type:'GET_STATUS'},chatSender);assert.equal(r.ok,true);assert.equal(r.job.id,'part-1');assert.equal(r.job.image,undefined);assert.equal(r.progress.total,2);
 r=await send({type:'GET_STATUS'},{url:'https://chatgpt.com/',tab:{id:999}});assert.equal(r.ok,false);
 r=await send({type:'IMPORT',automatic:true,text:JSON.stringify({jobId:'part-1',blocks:[]})},chatSender);assert.equal(r.ok,false);
 r=await send({type:'AUTOMATION_MARK',jobId:'part-1',phase:'sending'},chatSender);assert.equal(r.ok,true);
 r=await send({type:'AUTOMATION_MARK',jobId:'wrong',phase:'sent'},chatSender);assert.equal(r.ok,false);
 r=await send({type:'AUTOMATION_MARK',jobId:'part-1',phase:'sent'},chatSender);assert.equal(r.ok,true);
 r=await send({type:'IMPORT',automatic:true,text:JSON.stringify({jobId:'part-1',blocks:[{box:[100,100,200,100],ja:'第一画像'}]})},chatSender);assert.notEqual(tabs.get(1).active,true);assert.equal(r.ok,true);assert.equal(r.hasNext,true);assert.equal(stored.job.id,'part-2');assert.equal(stored.job.chatTab,chatId);assert.equal(cache.has('part-1'),true);assert.equal(notifications.at(-1).type,'QUEUE_CHANGED');assert.equal(notifications.at(-1).finished,false);assert.equal(sent[0].jobId,'part-1');
 r=await send({type:'IMPORT',text:JSON.stringify({jobId:'part-1',blocks:[]})});assert.equal(r.ok,false);assert.equal(stored.job.id,'part-2');
 tabs.get(1).url='https://comic.naver.com/webtoon/list?titleId=808482';
 r=await send({type:'IMPORT',text:JSON.stringify({jobId:'part-2',blocks:[]})});assert.equal(r.ok,false);assert.equal(stored.job.id,'part-2');
 tabs.get(1).url=page;
 r=await send({type:'IMPORT',text:JSON.stringify({jobId:'part-2',blocks:[]})});assert.equal(r.ok,true);assert.equal(r.hasNext,false);assert.equal(stored.job,undefined);assert.equal(stored.collection,undefined);assert.equal(notifications.at(-1).finished,true);assert.equal(cache.size,0);
 r=await send({type:'GET_STATUS'},chatSender);assert.equal(r.ok,true);assert.equal(r.job,null);
 r=await send({type:'GET'},chatSender);assert.equal(r.ok,false);
 r=await send({type:'GET_STATUS'},{url:'https://evil.example/',tab:{id:chatId}});assert.equal(r.ok,false);
 r=await send({type:'BATCH_START',urls:[src.replace('/155/','/154/')]},{url:page,tab:tabs.get(1)});assert.equal(r.ok,false);
 // Text jobs need no image and preserve canonical positions through OCR editing and import.
 r=await send({type:'BATCH_START',urls:[src]},{url:page,tab:tabs.get(1)});assert.equal(r.ok,true);
 const record={id:'speech-1',original:'안녕하세요.',confidence:90,enabled:true,src,imageIndex:0,relative:{x:.1,y:.2,width:.3,height:.1}};
 cache.set('batch-test:chapter',{id:'batch-test:chapter',batchId:'batch-test',records:[record]});
 r=await send({type:'TEXT_READY',batchId:'wrong'});assert.equal(r.ok,false);
 r=await send({type:'TEXT_READY',batchId:'batch-test'});assert.equal(r.ok,true);assert.equal(r.batches,1);assert.equal(stored.job.type,'text');assert.equal(stored.job.image,undefined);
 r=await send({type:'UPDATE_OCR',batchId:'batch-test',edits:[{id:record.id,original:'좋은 날입니다.',enabled:true,relative:{x:0}}]});assert.equal(r.ok,true);assert.deepEqual(stored.job.records[0].relative,record.relative);
 r=await send({type:'OPEN_CHAT'});assert.equal(r.ok,true);
 r=await send({type:'IMPORT',text:JSON.stringify({jobId:stored.job.id,translations:[{id:record.id,ja:'よい日ですね。'}]})});assert.equal(r.ok,true);assert.equal(r.count,1);assert.deepEqual(sent.at(-1).blocks[0].relative,record.relative);assert.equal(sent.at(-1).blocks[0].ja,'よい日ですね。');assert.equal(cache.size,0);
 // Numbered image batches retain source geometry and translated context across jobs.
 r=await send({type:'BATCH_START',urls:[src]},{url:page,tab:tabs.get(1)});assert.equal(r.ok,true);
 cache.set('atlas1',{id:'atlas1',batchId:'batch-test',type:'collage',sourceTab:1,url:page,blob:{},records:[record]});cache.set('atlas2',{id:'atlas2',batchId:'batch-test',type:'collage',sourceTab:1,url:page,blob:{},records:[{...record,id:'speech-2'}]});
 r=await send({type:'COLLAGE_READY',batchId:'batch-test',ids:['missing']});assert.equal(r.ok,false);
 r=await send({type:'COLLAGE_READY',batchId:'batch-test',ids:['atlas1','atlas2']});assert.equal(r.ok,true);assert.equal(stored.job.type,'collage');assert.equal(stored.job.image,undefined);assert.ok(stored.job.imageRef);
 r=await send({type:'IMPORT',text:JSON.stringify({jobId:'atlas1',items:[{id:record.id,ko:'안녕하세요.',ja:'こんにちは。'}]})});assert.equal(r.ok,true);assert.equal(r.hasNext,true);assert.equal(stored.job.context[0].ja,'こんにちは。');assert.deepEqual(sent.at(-1).blocks[0].relative,record.relative);
 r=await send({type:'COLLAGE_READY',batchId:'batch-test',ids:['atlas1']});assert.equal(r.ok,false);
 r=await send({type:'IMPORT',text:JSON.stringify({jobId:'atlas2',items:[{id:'speech-2',skip:true}]})});assert.equal(r.ok,true);assert.equal(r.count,0);assert.equal(stored.job,undefined);assert.equal(cache.size,0);
 // Manual queue navigation retains previous image data and never marks skipped jobs complete.
 r=await send({type:'BATCH_START',urls:[src]},{url:page,tab:tabs.get(1)});assert.equal(r.ok,true);
 for(let i=1;i<=3;i++)cache.set('manual-'+i,{...base,id:'manual-'+i,type:'collage',records:[{...record,id:'000001'}]});
 r=await send({type:'COLLAGE_READY',batchId:'batch-test',ids:['manual-1','manual-2','manual-3']});assert.equal(r.ok,true);
 r=await send({type:'OPEN_CHAT'});assert.equal(r.ok,true);const manualSender={url:'https://chatgpt.com/',tab:tabs.get(stored.job.chatTab)};
 r=await send({type:'SELECT_QUEUE',jobId:'manual-1',position:2},{url:'https://chatgpt.com/',tab:{id:999}});assert.equal(r.ok,false);
 for(const position of [0,4,1.5,'2']){r=await send({type:'SELECT_QUEUE',jobId:'manual-1',position},manualSender);assert.equal(r.ok,false);assert.equal(stored.collection.index,0);}
 r=await send({type:'SELECT_QUEUE',jobId:'stale',position:2},manualSender);assert.equal(r.ok,false);
 r=await send({type:'AUTOMATION_MARK',jobId:'manual-1',phase:'sent'},manualSender);assert.equal(r.ok,true);
 r=await send({type:'SELECT_QUEUE',jobId:'manual-1',position:3},manualSender);assert.equal(r.ok,true);assert.equal(stored.collection.index,2);assert.equal(stored.job.id,'manual-3');assert.equal(stored.job.chatTab,manualSender.tab.id);assert.deepEqual(Array.from(stored.collection.completed),[]);
 r=await send({type:'SELECT_QUEUE',jobId:'manual-3',position:1},manualSender);assert.equal(r.ok,true);assert.equal(stored.job.automation.phase,'sent');
 r=await send({type:'SELECT_QUEUE',jobId:'manual-1',position:3},manualSender);assert.equal(r.ok,true);
 const doneBefore=sent.length;
 r=await send({type:'IMPORT',text:JSON.stringify({jobId:'manual-3',items:[{id:'000001',ko:'셋',ja:'三'}]})},manualSender);assert.equal(r.ok,true);assert.equal(r.hasNext,true);assert.equal(stored.job.id,'manual-1');assert.equal(sent.length,doneBefore+1);assert.deepEqual(Array.from(stored.collection.completed),['manual-3']);assert.ok(cache.has('manual-3'));
 r=await send({type:'SELECT_QUEUE',jobId:'manual-1',position:3},manualSender);assert.equal(r.ok,true,'Applied jobs remain navigable');assert.equal(stored.job.automation.phase,'sent');
 r=await send({type:'SELECT_QUEUE',jobId:'manual-3',position:2},manualSender);assert.equal(r.ok,true);
 r=await send({type:'IMPORT',text:JSON.stringify({jobId:'manual-2',items:[{id:'000001',ko:'둘',ja:'二'}]})},manualSender);assert.equal(r.ok,true);assert.equal(r.hasNext,true);assert.equal(stored.job.id,'manual-1');
 r=await send({type:'IMPORT',text:JSON.stringify({jobId:'manual-1',items:[{id:'000001',ko:'하나',ja:'一'}]})},manualSender);assert.equal(r.ok,true);assert.equal(r.hasNext,false);assert.equal(cache.size,0);
 // Resume a pre-3.4 queue whose already-applied images were deleted.
 r=await send({type:'BATCH_START',urls:[src]},{url:page,tab:tabs.get(1)});assert.equal(r.ok,true);
 for(let i=1;i<=2;i++)cache.set('legacy-'+i,{...base,id:'legacy-'+i,type:'collage',records:[{...record,id:'000001'}]});
 r=await send({type:'COLLAGE_READY',batchId:'batch-test',ids:['legacy-1','legacy-2']});assert.equal(r.ok,true);
 stored.collection.index=1;delete stored.collection.completed;stored.job={...cache.get('legacy-2'),image:'data:image/png;base64,test'};cache.delete('legacy-1');
 r=await send({type:'IMPORT',text:JSON.stringify({jobId:'legacy-2',items:[{id:'000001',ko:'둘',ja:'二'}]})});assert.equal(r.ok,true);assert.equal(r.hasNext,false);assert.equal(cache.size,0);
 // A manual reply belongs to its jobId even when a different image is selected.
 r=await send({type:'BATCH_START',urls:[src]},{url:page,tab:tabs.get(1)});assert.equal(r.ok,true);
 for(let i=1;i<=3;i++)cache.set('route-'+i,{...base,id:'route-'+i,type:'collage',records:[{...record,id:'region-'+i}]});
 r=await send({type:'COLLAGE_READY',batchId:'batch-test',ids:['route-1','route-2','route-3']});assert.equal(r.ok,true);
 const routed=JSON.stringify({jobId:'route-2',items:[{id:'region-2',ko:'둘',ja:'二'}]});
 const countBefore=sent.length;
 for(const bad of [routed.replace('route-2','foreign-job'),routed.replace('region-2','region-1'),JSON.stringify({jobId:'route-2',items:[]}),JSON.stringify({jobId:'route-2',items:[{id:'region-2',skip:true},{id:'region-2',skip:true}]}),'```json\n'+routed+'\n```\n```json\n'+routed.replace('route-2','route-3')+'\n```']){r=await send({type:'IMPORT',text:bad});assert.equal(r.ok,false);assert.equal(stored.job.id,'route-1');assert.equal(sent.length,countBefore);}
 r=await send({type:'IMPORT',text:'```json\n'+routed+'\n```'});assert.equal(r.ok,true);assert.equal(r.appliedJobId,'route-2');assert.equal(r.appliedPosition,2);assert.equal(sent.at(-1).jobId,'route-2');assert.equal(sent.at(-1).blocks[0].ja,'二');assert.equal(stored.job.id,'route-1');assert.deepEqual(Array.from(stored.collection.completed),['route-2']);
 r=await send({type:'IMPORT',text:JSON.stringify({jobId:'route-1',items:[{id:'region-1',skip:true}]})});assert.equal(r.ok,true);assert.equal(stored.job.id,'route-3');
 r=await send({type:'IMPORT',text:JSON.stringify({jobId:'route-3',items:[{id:'region-3',skip:true}]})});assert.equal(r.ok,true);assert.equal(r.hasNext,false);
 console.log('PASS: manual jumps/backtracking, range/auth/stale checks, sent-state preservation and skipped-job completion; syntax, episode URL filtering, complete split coverage, coordinate mapping, queue advance, wrong-job rejection, page navigation rejection, cache cleanup, access restrictions');
})().catch(e=>{console.error(e);process.exitCode=1;});
