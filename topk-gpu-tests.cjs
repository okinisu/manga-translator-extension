const assert=require('node:assert/strict'),api=require('./topk-gpu-core.js'),fixtures=require('./topk-shader-fixtures.json'),fs=require('node:fs');
for(const [kind,code] of Object.entries(fixtures)){assert.equal(api.kind(code),kind);assert.equal(api.kind(code+'\n'),null,'Unknown shader must retain the original path');}
assert.equal(api.kind(null),null);assert.equal(api.kind('@compute fn main() {}'),null);
global.GPUBufferUsage={STORAGE:128,UNIFORM:64};global.GPUShaderStage={COMPUTE:4};
const calls=[],buffers=[],bindGroups=[];
const device={queue:{writeBuffer(){}},createShaderModule:desc=>({desc}),createComputePipeline:desc=>({desc,getBindGroupLayout:()=>({})}),createComputePipelineAsync:async desc=>({desc,getBindGroupLayout:()=>({})}),createBindGroupLayout:desc=>desc,createPipelineLayout:desc=>desc,createBindGroup:desc=>{const g={desc};bindGroups.push(g);return g;},createBuffer:desc=>{const b={...desc,destroyed:0,destroy(){this.destroyed++;}};buffers.push(b);return b;},createCommandEncoder:()=>({beginComputePass:()=>{let pipeline;return {setPipeline:p=>pipeline=p,setBindGroup(){},dispatchWorkgroups:(...args)=>calls.push({pipeline,args})};}})};
const guard=api.install(device),pipelines=Object.fromEntries(Object.keys(fixtures).map(k=>[k,device.createComputePipeline({layout:'auto',compute:{module:device.createShaderModule({code:fixtures[k]}),entryPoint:'main'}})]));
const resource=size=>({buffer:{size,usage:128},size,offset:0}),ia=resource(1200),ib=resource(1200),va=resource(600),vb=resource(600),source=resource(16800),uniform={buffer:{size:1024,usage:64},size:80,offset:0};
const group=resources=>device.createBindGroup({entries:resources.map((resource,binding)=>({binding,resource}))}),first=group([ia,va,source,{...uniform,size:64}]);
function params(k=0){const v=new Int32Array(k?20:16);v[0]=-947920896;v.set([1,1,1,1],4);v.set([k,2100,1,2100,4],8);if(k)v.set([1,1,1,1],13);return v;}
function run(k,g,dynamic){const p=device.createCommandEncoder().beginComputePass();p.setPipeline(pipelines[k]);p.setBindGroup(0,g,dynamic);p.dispatchWorkgroups(1,1,1);}
function start(){device.queue.writeBuffer(uniform.buffer,0,params());run('first',first);}
start();assert.equal(guard.stats.sorts,1);assert.equal(calls.length,4);assert.equal(buffers.length,1);
for(let k=1;k<=74;k++){
 const srcI=k%2?ia:ib,dstI=k%2?ib:ia,srcV=k%2?va:vb,dstV=k%2?vb:va;const copyU={...uniform,size:32};device.queue.writeBuffer(uniform.buffer,0,new Int32Array([1,75,1,1,1,0,0,0]));run('copy-half',group([dstV,srcV,copyU]));run('copy-int',group([dstI,srcI,copyU]));device.queue.writeBuffer(uniform.buffer,0,params(k));run('next',group([dstI,dstV,source,srcI,srcV,uniform]));
}
assert.equal(guard.stats.skipped,74);assert.equal(guard.stats.copiesSkipped,146);assert.equal(calls.length,6);
const created=bindGroups.length;start();assert.equal(bindGroups.length,created,'Reuse custom bind groups');assert.equal(buffers.length,1,'Reuse scratch storage');
const wrong=params();wrong[9]=2099;device.queue.writeBuffer(uniform.buffer,0,wrong);let before=calls.length;run('first',first);assert.equal(calls.length,before+1,'Unexpected shape retains original dispatch');assert.equal(guard.stats.fallbacks,1);
start();before=calls.length;run('first',first,new Uint32Array([256]));assert.equal(calls.length,before+1,'Dynamic offsets retain original dispatch');device.queue.writeBuffer(uniform.buffer,0,params(1));run('next',group([ib,vb,source,ia,va,uniform]));assert.equal(calls.length,before+2,'Unsafe sequence disables skipping');
guard.close();guard.close();assert.equal(buffers[0].destroyed,1);
const worker=fs.readFileSync('detector-worker.js','utf8');assert.match(worker,/fullHalf&&!tensorMode&&config\.gpuTopK\?\.validated===true&&gpuInfo\?\.vendor==='nvidia'&&gpuInfo\?\.architecture==='lovelace'/);assert.ok(worker.indexOf('globalThis.topkGuard?.close()')<worker.indexOf('gpuCheck?.close()'));
console.log('PASS: shader signatures, shape/sequence/dynamic-offset fallback, persistent resources, cleanup and native FP16 vendor gate');
