const assert=require('node:assert/strict');
global.GPUBufferUsage={STORAGE:1,COPY_SRC:2,COPY_DST:4,MAP_READ:8};global.GPUMapMode={READ:1};
const {create}=require('./gpu-io-core.js');
(async()=>{
 let allocations=0,disposed=0;const buffers=[];let writes=0,failMap=false;
 const device={createBuffer({size}){allocations++;const b={bytes:new Uint8Array(size),mapState:'unmapped',destroyed:false,async mapAsync(){if(failMap)throw Error('readback failed');this.mapState='mapped';},getMappedRange(){return this.bytes.buffer;},unmap(){this.mapState='unmapped';},destroy(){this.destroyed=true;}};buffers.push(b);return b;},
 queue:{writeBuffer(b,offset,data){b.bytes.set(new Uint8Array(data.buffer,data.byteOffset,data.byteLength),offset);writes++;},submit(cmds){for(const ops of cmds)for(const [from,fo,to,offset,size] of ops)to.bytes.set(from.bytes.subarray(fo,fo+size),offset);},async onSubmittedWorkDone(){}},
 createCommandEncoder(){const commands=[];return {copyBufferToBuffer(...args){commands.push(args);},finish(){return commands;}};}};
 const ort={Tensor:{fromGpuBuffer(gpuBuffer,config){return {gpuBuffer,location:'gpu-buffer',...config,dispose(){disposed++;}};}}};
 const io=create(ort,device),input=new Float32Array(3*640*640);let tensor;
 const session={async run(feeds,fetches){if(tensor)assert.equal(feeds.images,tensor);tensor=feeds.images;const value=new Float32Array(feeds.images.gpuBuffer.bytes.buffer)[0];for(const [name,out] of Object.entries(fetches))new Float32Array(out.gpuBuffer.bytes.buffer).fill(value+(name.includes('Sigmoid')?1:2));return fetches;}};
 input[0]=5;const first=await io.run(session,input);input[0]=9;const second=await io.run(session,input);
 assert.equal(first['/postprocessor/Sigmoid_output_0'].data[0],6);assert.equal(second['/postprocessor/Sigmoid_output_0'].data[0],10);
 assert.equal(first['/postprocessor/Concat_output_0'].data[0],7);assert.equal(second['/postprocessor/Concat_output_0'].data[0],11);
 assert.equal(first['/postprocessor/Sigmoid_output_0'].data[0],6,'Earlier output must retain a detached snapshot');
 assert.equal(allocations,4,'All four GPU buffers are allocated once');assert.equal(writes,2);assert.equal(disposed,0,'I/O tensors must survive successive inference');
 failMap=true;await assert.rejects(io.run(session,input),/readback failed/);failMap=false;await io.run(session,input);
 await io.close();await io.close();assert.equal(disposed,3);assert.ok(buffers.every(b=>b.destroyed));await assert.rejects(io.run(session,input),/closed/);
 console.log('PASS: fixed GPU I/O reuse, fresh per-image readback, independent snapshots, error recovery and idempotent resource cleanup');
})().catch(e=>{console.error(e);process.exitCode=1;});