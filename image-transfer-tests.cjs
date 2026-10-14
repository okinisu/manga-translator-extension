const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
(async()=>{
 for(const native of [false,true]){
  class Bytes extends Uint8Array{}
  let calls=0;
  Object.defineProperty(Bytes.prototype,'toBase64',{value:native?function(){calls++;return Buffer.from(this).toString('base64');}:undefined});
  const context=vm.createContext({Uint8Array:Bytes,btoa:s=>Buffer.from(s,'binary').toString('base64')});
  vm.runInContext(fs.readFileSync(__dirname+'/batch-store.js','utf8'),context);
  for(const size of [0,1,2,3,32767,32768,32769,100000]){
   const data=Uint8Array.from({length:size},(_,i)=>(i*17+31)%256),blob=new Blob([data],{type:'image/png'});
   assert.equal(await context.BatchStore.dataURL(blob),'data:image/png;base64,'+Buffer.from(data).toString('base64'));
  }
  assert.equal(calls,native?8:0);
 }
 console.log('PASS: native and legacy Base64 produce byte-identical data URLs, including all padding and chunk boundaries');
})().catch(e=>{console.error(e);process.exitCode=1;});
