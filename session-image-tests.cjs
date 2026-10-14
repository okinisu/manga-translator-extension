const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
(async()=>{
 for(const size of [8*1024*1024,20*1024*1024]){
  let listener,encodes=0,maxSession=0;
  const root={id:'atlas',batchId:'batch',type:'collage',sourceTab:1,url:'https://comic.naver.com/webtoon/detail?titleId=1&no=1',blob:new Blob([new Uint8Array(size)],{type:'image/png'}),records:[{id:'000001'}]};
  const cache=new Map([['atlas',root]]);let stored={collection:{id:'batch',status:'loading',autoMode:false,index:0,ids:[]}};
  const chrome={runtime:{getURL:p=>'chrome-extension://test/'+p,onStartup:{addListener(){}},onMessage:{addListener:f=>listener=f}},storage:{session:{get:async()=>structuredClone(stored),set:async values=>{const next={...stored,...structuredClone(values)},bytes=Buffer.byteLength(JSON.stringify(next));maxSession=Math.max(maxSession,bytes);if(bytes>10485760)throw Error('QUOTA_BYTES quota exceeded');stored=next;},remove:async keys=>keys.forEach(k=>delete stored[k])}},tabs:{sendMessage:async()=>({ok:true})}};
  const load=()=>{const ctx=vm.createContext({chrome,URL,Map,Set,Date,Error,importScripts(){},MangaCore:require('./core.js'),MangaCollage:require('./collage-core.js'),BatchStore:{get:async id=>cache.get(id),dataURL:async blob=>{encodes++;return 'data:'+blob.type+';base64,'+Buffer.from(await blob.arrayBuffer()).toString('base64');}}});vm.runInContext(fs.readFileSync(__dirname+'/background.js','utf8'),ctx);return ctx;};
  let ctx=load();const internal={url:'chrome-extension://test/review.html'},ai={url:'https://chatgpt.com/',tab:{id:2}};
  const send=(m,s=internal)=>new Promise(r=>listener(m,s,r));
  assert.equal((await send({type:'COLLAGE_READY',batchId:'batch',ids:['atlas']})).ok,true);
  assert.equal(encodes,0,'Preparing a job must not encode its image into session storage');assert.equal(stored.job.image,undefined);assert.equal(stored.job.blob,undefined);assert.equal(stored.job.imageRef.storeId,'atlas');
  stored.job.chatTab=2;stored.job.aiProvider='chatgpt';
  assert.equal((await send({type:'GET'},{url:'https://other.test/',tab:{id:2}})).ok,false);assert.equal(encodes,0);
  const first=await send({type:'GET'},ai);assert.equal(first.ok,true);assert.equal(first.job.image.length,22+4*Math.ceil(size/3));assert.equal(encodes,1);
  const known=await send({type:'GET',knownImageId:'atlas'},ai);assert.equal(known.imageUnchanged,true);assert.equal(known.job.image,undefined);assert.equal(encodes,1);
  assert.equal((await send({type:'GET_STATUS'},ai)).job.image,undefined);
  const again=await send({type:'GET'},ai);assert.equal(again.job.image,first.job.image);assert.equal(encodes,1,'Concurrent/repeated image requests share a transient conversion');
  ctx=load();assert.equal((await send({type:'GET'},ai)).job.image.length,first.job.image.length);assert.equal(encodes,2,'Worker restart restores image bytes from IndexedDB reference');
  root.retry={id:'atlas:retry:1',blob:new Blob(['retry'],{type:'image/png'}),records:[{id:'000001'}]};
  const retry=await ctx.makeJob('atlas',2);await chrome.storage.session.set({job:retry});
  const retried=await send({type:'GET'},ai);assert.equal(retried.ok,true);assert.equal(Buffer.from(retried.job.image.split(',')[1],'base64').toString(),'retry');assert.equal(stored.job.image,undefined);assert.equal(stored.job.imageRef.imageId,'atlas:retry:1');
  assert.ok(maxSession<10000,'Session size must stay small even at the maximum 20 MiB PNG limit');
  console.log('PASS: '+size+' bytes remain outside session storage; authorized transfer, known-image reuse, restart and retry reference verified; peak session '+maxSession+' bytes');
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
