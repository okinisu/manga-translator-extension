const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),{CropPool,mapLimit}=require('./performance-core.js');
(async()=>{
 let closed=0,messages=[],canvases=[],bad=false;
 class Canvas{constructor(w,h){this.width=w;this.height=h;canvases.push(this);}getContext(){return {fillRect(){},drawImage(...args){this.draw=args;},getImageData(){return {data:[240,241,242,255]};}};}async convertToBlob(){if(bad)throw Error('encode failed');return new Blob(['png'],{type:'image/png'});}}
 const ctx=vm.createContext({OffscreenCanvas:Canvas,Number,Math,MangaPerformance:{mapLimit},importScripts(){},postMessage:m=>messages.push(m)});
 vm.runInContext(fs.readFileSync(__dirname+'/crop-worker.js','utf8'),ctx);
 const bitmap={width:690,height:1800,close(){closed++;}},records=[{box:{x:5,y:1410,width:101,height:52}},{box:{x:8,y:1480,width:90,height:40}}];
 await ctx.onmessage({data:{id:1,bitmap,records,windowY:1400}});
 assert.equal(messages[0].records.length,2);assert.equal(messages[0].records[0].background,'#f0f1f2');assert.equal(messages[0].records[0].foreground,'#111111');assert.equal(messages[0].records[0].cropBlob.type,'image/png');assert.ok(canvases.every(c=>c.width===1&&c.height===1));assert.equal(closed,1);
 bad=true;await ctx.onmessage({data:{id:2,bitmap,records,windowY:1400}});assert.match(messages[1].error,/encode failed/);assert.equal(closed,2);
 bad=false;await ctx.onmessage({data:{id:3,bitmap,records:[{box:{x:-1,y:0,width:10,height:10}}],windowY:0}});assert.match(messages[2].error,/不正/);assert.equal(closed,3);
 assert.equal(await new CropPool().run({},records,0),null,'Unsupported environments use the existing main-thread path');
 let worker,terminated=0,bitmapClosed=0;
 const poolCtx=vm.createContext({module:{exports:{}},Worker:class{constructor(){worker=this;}postMessage(m){this.message=m;}terminate(){terminated++;}},chrome:{runtime:{getURL:v=>v}},createImageBitmap:async()=>({close(){bitmapClosed++;}}),setTimeout,clearTimeout,Promise,Map,performance});
 vm.runInContext(fs.readFileSync(__dirname+'/performance-core.js','utf8'),poolCtx);const Pool=poolCtx.module.exports.CropPool,pool=new Pool(1);
 const work=pool.run({},records,0);await new Promise(setImmediate);assert.equal(worker.message.records,records);worker.onmessage({data:{id:999,records:[]}});worker.onmessage({data:{id:worker.message.id,records:[{cropBlob:'result'}]}});assert.equal((await work)[0].cropBlob,'result');assert.equal(bitmapClosed,0,'Transferred bitmap belongs to worker');
 const failed=pool.run({},records,0);await new Promise(setImmediate);worker.onerror();assert.equal(await failed,null);assert.ok(terminated>0);assert.equal(await pool.run({},records,0),null);pool.close();
 console.log('PASS: crop geometry, PNG output, colors, bitmap/canvas cleanup, unsupported-worker fallback, matching replies and worker failure recovery');
})().catch(e=>{console.error(e);process.exitCode=1;});
