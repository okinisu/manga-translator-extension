const assert=require('node:assert/strict');
const {install}=require('./tensor-convolution.js');
global.GPUBufferUsage={STORAGE:128,UNIFORM:64,COPY_DST:8};
function gpu(supported=true){
 const writes=[],buffers=[],events=[];
 const device={features:new Set(supported?['chromium-experimental-subgroup-matrix']:[]),queue:{writeBuffer(...args){writes.push(args);}},createShaderModule:d=>({d}),createBindGroup:d=>({d}),createPipelineLayout:d=>d,createComputePipeline:d=>({d,getBindGroupLayout:()=>({})}),async createComputePipelineAsync(d){return this.createComputePipeline(d);},createBuffer:d=>{const b={...d,destroyed:false,destroy(){this.destroyed=true;}};buffers.push(b);return b;},createCommandEncoder:()=>({beginComputePass:()=>({setPipeline:p=>events.push(['pipeline',p]),setBindGroup:(i,g)=>events.push(['group',g]),dispatchWorkgroups:(...n)=>events.push(['dispatch',...n])})})};
 return {device,writes,buffers,events};
}
const code=['array<vec2<u32>>','DST_S *= 4;','var r_w0_h0_s0','var weights_offset : i32= DST_S * 4 * U.i2.y;','var ds : i32= U.i2.x;','res_final = max(res, vec4<f32>(U.f0.x))'].join('\n');
function fixture(g){const d=g.device,u=d.createBuffer({size:64,usage:64}),v=new Int32Array(16);v.set([1,64,8400,1,8400,64,8400,4200],4);d.queue.writeBuffer(u,0,v);const m=d.createShaderModule({code}),p=d.createComputePipeline({compute:{module:m}}),entries=[0,1,2,3].map(binding=>({binding,resource:{buffer:{size:16*1024*1024,usage:128}}}));entries.push({binding:4,resource:{buffer:u}});const group=d.createBindGroup({entries});return {p,group,entries,u,v};}
for(const mode of ['fp16','int8']){
 const g=gpu(),guard=install(g.device,mode),f=fixture(g),pass=g.device.createCommandEncoder().beginComputePass();pass.setPipeline(f.p);pass.setBindGroup(0,f.group);pass.dispatchWorkgroups(1,1,1);
 assert.equal(guard.stats.tensorDispatches,1);const allocations=guard.stats.allocatedBuffers,bytes=guard.stats.allocatedBytes,writes=g.writes.length;
 pass.dispatchWorkgroups(1,1,1);assert.equal(guard.stats.tensorDispatches,2);assert.equal(guard.stats.allocatedBuffers,allocations);assert.equal(guard.stats.allocatedBytes,bytes);assert.equal(g.writes.length,writes,'steady inference must not upload parameter buffers');
 assert.equal(g.events.at(-2)[1],f.p);assert.equal(g.events.at(-1)[1],f.group,'original bindings must be restored');
 pass.setBindGroup(0,f.group,[256]);pass.dispatchWorkgroups(7,8,9);assert.deepEqual(g.events.at(-1),['dispatch',7,8,9]);assert.equal(guard.stats.tensorDispatches,2,'dynamic offsets must keep original kernel');
 pass.setBindGroup(0,f.group);f.v[10]=12;g.device.queue.writeBuffer(f.u,0,f.v);pass.dispatchWorkgroups(4,5,6);assert.deepEqual(g.events.at(-1),['dispatch',4,5,6]);assert.equal(guard.stats.tensorDispatches,2,'noncontiguous tensors must keep original kernel');
 guard.close();assert.equal(g.buffers.filter(b=>b.destroyed).length,allocations,'all owned GPU buffers must be destroyed');
}
const g=gpu(false),old=g.device.createShaderModule,off=install(g.device,'int8');assert.equal(off.stats.supported,false);assert.equal(g.device.createShaderModule,old);assert.equal(g.buffers.length,0);off.close();
console.log('PASS: stable GPU buffers, no steady parameter upload, binding restoration, unsupported layout/adapter fallback and cleanup');
