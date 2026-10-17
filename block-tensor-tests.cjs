const assert=require('node:assert/strict');
const Block=require('./block-tensor.js'),Legacy=require('./tensor-convolution.js');
global.GPUBufferUsage={STORAGE:128,UNIFORM:64,COPY_DST:8};
function gpu(){const events=[],buffers=[],writes=[];const d={features:new Set(['chromium-experimental-subgroup-matrix']),queue:{writeBuffer(...x){writes.push(x);}},createShaderModule:x=>({x}),createBindGroup:x=>({x}),createPipelineLayout:x=>x,createComputePipeline:x=>({x,getBindGroupLayout:()=>({})}),async createComputePipelineAsync(x){return this.createComputePipeline(x);},createBuffer:x=>{const b={...x,destroyed:false,destroy(){this.destroyed=true;}};buffers.push(b);return b;},createCommandEncoder:()=>({beginComputePass:()=>({setPipeline:p=>events.push(['pipeline',p]),setBindGroup:(i,g)=>events.push(['group',g]),dispatchWorkgroups:(...x)=>events.push(['dispatch',...x])})})};return{d,events,buffers,writes};}
function fixture(g,{fused=false,group=4,pixels=400,ins=64}={}){
 const code=['array<vec2<u32>>',...(group===1?[]:[`DST_S *= ${group};`]),'var r_w0_h0_s0',fused?'@binding(5) var<uniform> U: Scalars;\ninterm_value_link2 = res + second_value;\nvar weights_offset : i32= DST_S * 4 * U.i2.w;\nvar ds : i32= U.i2.z;\nres_final = max(interm_value_link2, vec4<f32>(U.f0.x))':'var weights_offset : i32= DST_S * 4 * U.i2.y;\nvar ds : i32= U.i2.x;\nres_final = max(res, vec4<f32>(U.f0.x))'].join('\n');
 const v=new Int32Array(16);v.set([1,64,pixels,1,pixels,ins,pixels,1],4);if(fused)v.set([1,64,pixels,1,pixels,1,pixels,ins,pixels],4);
 const u=g.d.createBuffer({size:64,usage:64});g.d.queue.writeBuffer(u,0,v);const entries=Array.from({length:fused?5:4},(_,binding)=>({binding,resource:{buffer:{size:32*1024*1024,usage:128}}}));entries.push({binding:fused?5:4,resource:{buffer:u}});const m=g.d.createShaderModule({code}),p=g.d.createComputePipeline({compute:{module:m}}),binding=g.d.createBindGroup({entries});return{p,binding};
}
for(const spec of [{group:1},{group:2},{fused:true},{fused:true,pixels:1600}]){
 const g=gpu(),block=Block.install(g.d,'int8'),legacy=Legacy.install(g.d,'int8'),f=fixture(g,spec),p=g.d.createCommandEncoder().beginComputePass();p.setPipeline(f.p);p.setBindGroup(0,f.binding);p.dispatchWorkgroups(1,1,1);
 assert.equal(block.stats.tensorDispatches,1);assert.equal(legacy.stats.tensorDispatches,0);const bytes=block.stats.allocatedBytes,count=block.stats.allocatedBuffers,writes=g.writes.length;
 p.dispatchWorkgroups(1,1,1);assert.equal(block.stats.tensorDispatches,2);assert.equal(block.stats.allocatedBytes,bytes);assert.equal(block.stats.allocatedBuffers,count);assert.equal(g.writes.length,writes);assert.equal(g.events.at(-2)[1],f.p);assert.equal(g.events.at(-1)[1],f.binding);
 legacy.close();block.close();assert.equal(g.buffers.filter(b=>b.destroyed).length,count);
}
{
 const g=gpu(),block=Block.install(g.d,'int8'),legacy=Legacy.install(g.d,'int8'),f=fixture(g,{group:4,pixels:8400}),p=g.d.createCommandEncoder().beginComputePass();p.setPipeline(f.p);p.setBindGroup(0,f.binding);p.dispatchWorkgroups(1,1,1);assert.equal(block.stats.tensorDispatches,0);assert.equal(legacy.stats.tensorDispatches,1,'previously validated large group-4 kernels must stay on their previous path');legacy.close();block.close();
}
{
 const g=gpu(),block=Block.install(g.d,'int8'),f=fixture(g,{group:2,ins:8}),p=g.d.createCommandEncoder().beginComputePass();p.setPipeline(f.p);p.setBindGroup(0,f.binding);p.dispatchWorkgroups(7,8,9);assert.equal(block.stats.tensorDispatches,0);assert.deepEqual(g.events.at(-1),['dispatch',7,8,9]);block.close();
}
assert.equal(Block.grouping('DST_S *= 2;'),2);assert.equal(Block.grouping('DST_S *= 4;'),4);assert.equal(Block.grouping('var DST_S;'),1);assert.throws(()=>Block.install(gpu().d,'fp16'),/INT8/);
console.log('PASS: additional matrix layouts, residual bindings, nested old/new paths, buffer reuse, nonaligned channels and cleanup');

for(const ins of [16,32]){const g=gpu(),block=Block.install(g.d,'int8',128),f=fixture(g,{group:1,ins}),p=g.d.createCommandEncoder().beginComputePass();p.setPipeline(f.p);p.setBindGroup(0,f.binding);p.dispatchWorkgroups(7,8,9);assert.equal(block.stats.tensorDispatches,ins===32?1:0);assert.equal(block.stats.tuning.blockSize,128);if(ins===16)assert.deepEqual(g.events.at(-1),['dispatch',7,8,9]);block.close();}
assert.throws(()=>Block.install(gpu().d,'int8',96),/Unsupported/);
assert.match(Block.prepareInt8Shader(128),/let blocks=p.y\/32u/);assert.match(Block.cachedInt8Shader(128),/let blocks=channels\/128u/);
