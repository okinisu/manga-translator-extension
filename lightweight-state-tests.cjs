const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
let listener;const reads=[],writes=[];
const collection={id:'batch',status:'loading',autoMode:true,index:0,ids:[],urls:['PRIVATE_IMAGE_URL'],sourceTab:1},autoState={batchId:'batch',state:'preparing'};
const chrome={runtime:{getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener:f=>listener=f},onStartup:{addListener(){}}},tabs:{},storage:{session:{get:async keys=>{reads.push(keys);assert.ok(!keys.includes('job'),'Lightweight paths must never read the image-bearing job');return Object.fromEntries(keys.map(k=>[k,k==='collection'?collection:k==='autoState'?autoState:undefined]));},set:async value=>{writes.push(value);if(value.autoState)Object.assign(autoState,value.autoState);}}}};
vm.runInNewContext(fs.readFileSync(__dirname+'/background.js','utf8'),{chrome,URL,Map,Set,Date,Error,setTimeout,clearTimeout,importScripts(){}});
const send=(message,sender={url:'chrome-extension://test/review.html'})=>new Promise(r=>listener(message,sender,r));
(async()=>{
 const response=await send({type:'COLLECTION_CHECK',batchId:'batch'});assert.equal(response.ok,true);assert.equal(response.collection.id,'batch');assert.ok(!JSON.stringify(response).includes('PRIVATE'));assert.ok(!Object.hasOwn(response,'job'));assert.deepEqual(Array.from(reads.at(-1)),['collection']);
 assert.equal((await send({type:'COLLECTION_CHECK',batchId:'wrong'})).ok,false);
 collection.stopRequested=true;assert.match((await send({type:'COLLECTION_CHECK',batchId:'batch'})).error,/停止/);collection.stopRequested=false;
 const count=reads.length;assert.equal((await send({type:'COLLECTION_CHECK',batchId:'batch'},{url:'https://example.com/'})).ok,false);assert.equal(reads.length,count,'Foreign pages must fail before storage access');
 await send({type:'AUTO_REPORT',batchId:'batch',message:'working'});assert.equal(writes.at(-1).autoState.message,'working');
 autoState.state='running';const before=writes.length;await send({type:'AUTO_REPORT',batchId:'batch',message:'ignored'});assert.equal(writes.length,before);
 await send({type:'AUTO_REPORT',batchId:'batch',error:true,message:'failed'});assert.equal(autoState.state,'error');
 console.log('PASS: detection checks/progress do not load or return job images, stop/stale/origin guards and automatic report semantics');
})().catch(e=>{console.error(e);process.exitCode=1;});
