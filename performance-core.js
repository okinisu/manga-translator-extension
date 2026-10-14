(function(root){
 'use strict';
 // Byte-bounded decoded-image cache. Callbacks lease entries until drawing ends.
 class BitmapCache {
  constructor(limit=32*1024*1024){this.limit=limit;this.entries=new Map();this.bytes=0;this.queue=Promise.resolve();}
  trim(){for(const [key,e] of this.entries){if(this.bytes<=this.limit)break;if(!e.users){this.entries.delete(key);this.bytes-=e.bytes;e.bitmap.close();}}}
  use(key,load,draw,onTiming){const queuedAt=onTiming?performance.now():0;const task=this.queue.then(async()=>{const began=onTiming?performance.now():0;try{return await this.run(key,load,draw);}finally{onTiming?.({queueMs:began-queuedAt,workMs:performance.now()-began});}});this.queue=task.catch(()=>{});return task;}
  async run(key,load,draw){let e=this.entries.get(key);
   if(!e){const bitmap=await load();e={bitmap,bytes:bitmap.width*bitmap.height*4,users:0};if(e.bytes>this.limit){try{return await draw(bitmap);}finally{bitmap.close();}}this.entries.set(key,e);this.bytes+=e.bytes;}
   this.entries.delete(key);this.entries.set(key,e);e.users++;this.trim();
   try{return await draw(e.bitmap);}finally{e.users--;this.trim();}
  }
  clear(){const task=this.queue.then(()=>this.reset());this.queue=task.catch(()=>{});return task;}
  reset(){for(const e of this.entries.values())e.bitmap.close();this.entries.clear();this.bytes=0;}
 }

 // A small lazy pool keeps PNG encoding off the review page. A failed worker
 // disables the pool; callers still own their source canvas and can recrop.
 class CropPool {
  constructor(limit=2){this.limit=limit;this.slots=[];this.next=0;this.failed=false;this.closed=false;}
  async run(canvas,records,windowY){
   if(!records.length)return [];
   if(this.closed||this.failed||typeof Worker!=='function'||typeof createImageBitmap!=='function')return null;
   let slot=this.slots.find(s=>!s.busy);
   if(!slot){if(this.slots.length>=this.limit)return null;try{
    slot={worker:new Worker(chrome.runtime.getURL('crop-worker.js')),busy:false,request:null};this.slots.push(slot);
    slot.worker.onmessage=({data:m})=>{if(slot.request?.id===m.id){const request=slot.request;slot.request=null;clearTimeout(request.timer);if(m.error){this.disable();request.resolve(null);}else request.resolve(m.records);}};
    slot.worker.onerror=slot.worker.onmessageerror=()=>this.disable();
   }catch{this.disable();return null;}}
   slot.busy=true;let bitmap;
   try{
    bitmap=await createImageBitmap(canvas);
    if(this.closed||this.failed){bitmap.close();return null;}
    const id=++this.next;
    return await new Promise(resolve=>{
     const timer=setTimeout(()=>this.disable(),60000);slot.request={id,resolve,timer};
     try{slot.worker.postMessage({id,bitmap,records,windowY},[bitmap]);bitmap=null;}catch{bitmap?.close();bitmap=null;this.disable();}
    });
   }catch{this.disable();return null;}finally{bitmap?.close();slot.busy=false;}
  }
  disable(){this.failed=true;for(const s of this.slots){s.worker.terminate();if(s.request){clearTimeout(s.request.timer);s.request.resolve(null);s.request=null;}}this.slots=[];}
  close(){this.closed=true;this.disable();}
 }
 async function mapLimit(items,limit,fn){const result=new Array(items.length);let next=0,error;
  await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(!error&&next<items.length){const i=next++;try{result[i]=await fn(items[i],i);}catch(e){error=e;}}}));
  if(error)throw error;return result;
 }
 // Bounded two-stage pipeline: release inference lanes before crop/store work.
 // On failure stop dispatching, drain active work, and dispose queued outputs.
 async function pipeline(items,producerLimit,consumerLimit,produce,consume,{capacity=producerLimit+consumerLimit,dispose=()=>{}}={}){
  const result=[],queue=[],waiters=new Set();let next=0,held=0,error,ended=false;
  const iterator=items[Symbol.asyncIterator]?.()||items[Symbol.iterator]();let pullTail=Promise.resolve();
  const pull=()=>{const task=pullTail.then(async()=>{if(error||ended)return {done:true};const item=await iterator.next();if(item.done)ended=true;return item;});pullTail=task.catch(()=>{});return task;};
  const producers=Math.max(1,Math.min(items.length??Infinity,Math.floor(producerLimit)||1)),consumers=Math.max(1,Math.floor(consumerLimit)||1);
  capacity=Math.max(producers,Math.floor(capacity)||producers);let remaining=producers;
  const wait=()=>new Promise(resolve=>waiters.add(resolve)),wake=()=>{for(const resolve of waiters)resolve();waiters.clear();},fail=e=>{if(!error)error=e;wake();};
  const producer=async()=>{try{while(!error&&!ended){while(!error&&held>=capacity)await wait();if(error||ended)break;held++;let item;try{item=await pull();}catch(e){held--;fail(e);break;}if(item.done){held--;wake();break;}const index=next++;let value;
   try{value=await produce(item.value,index);}catch(e){held--;fail(e);break;}
   if(error){try{await dispose(value);}catch(e){fail(e);}held--;wake();break;}
   queue.push({index,value});wake();
  }}finally{remaining--;wake();}};
  const consumer=async()=>{while(true){while(!error&&!queue.length&&remaining)await wait();if(error||!queue.length&&!remaining)return;const {index,value}=queue.shift();
   try{result[index]=await consume(value,index);}catch(e){fail(e);}finally{held--;wake();}
  }};
  await Promise.all([...Array.from({length:producers},producer),...Array.from({length:consumers},consumer)]);
  for(const {value} of queue)try{await dispose(value);}catch(e){fail(e);}
  if(error)throw error;return result;
 }
 const sameBox=(a,b)=>!!a&&['x','y','width','height'].every(k=>a[k]===b[k]);
 function parallelism(setting,hardware={},remaining=Infinity){let count=Number(setting);if(setting==='auto'){const cores=hardware.hardwareConcurrency,memory=hardware.deviceMemory;count=Math.min(4,Number.isFinite(cores)?Math.max(1,Math.floor(cores/2)):4,Number.isFinite(memory)?(memory<4?1:memory<8?2:4):4);}else if(!Number.isInteger(count)||count<1||count>8)count=4;return Math.max(1,Math.min(count,remaining));}
 const api={CropPool,BitmapCache,mapLimit,pipeline,sameBox,parallelism};if(typeof module==='object')module.exports=api;else root.MangaPerformance=api;
})(globalThis);
