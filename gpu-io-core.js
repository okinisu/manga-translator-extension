(function(root){
'use strict';
const names=['/postprocessor/Sigmoid_output_0','/postprocessor/Concat_output_0'];
function create(ort,device){
 const buffers=[],tensors=[],fetches={};let busy=false,closed=false,input,stage;
 const storage=size=>{const b=device.createBuffer({size,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST});buffers.push(b);return b;};
 function cleanup(){for(const t of tensors)try{t.dispose();}catch{}for(const b of buffers)try{b.destroy();}catch{}}
 try{
 input=ort.Tensor.fromGpuBuffer(storage(3*640*640*4),{dataType:'float32',dims:[1,3,640,640]});tensors.push(input);
 for(let i=0;i<2;i++){const channels=i+3;fetches[names[i]]=ort.Tensor.fromGpuBuffer(storage(300*channels*4),{dataType:'float32',dims:[1,300,channels]});tensors.push(fetches[names[i]]);}
 stage=device.createBuffer({size:8400,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});buffers.push(stage);
 }catch(e){cleanup();throw e;}
 return {
 async run(session,values){
  if(closed||busy)throw Error('GPU I/O is closed or busy');
  if(!(values instanceof Float32Array)||values.length!==3*640*640)throw Error('GPU input shape mismatch');
  busy=true;let outputs;
  try{
   device.queue.writeBuffer(input.gpuBuffer,0,values);outputs=await session.run({images:input},fetches);
   const encoder=device.createCommandEncoder();let offset=0;
   for(let i=0;i<2;i++){const tensor=outputs[names[i]],size=300*(i+3)*4;
    if(!tensor||tensor.location!=='gpu-buffer'||!tensor.gpuBuffer)throw Error('GPU output binding unavailable');
    encoder.copyBufferToBuffer(tensor.gpuBuffer,0,stage,offset,size);offset+=size;
   }
   device.queue.submit([encoder.finish()]);await stage.mapAsync(GPUMapMode.READ);
   const data=new Float32Array(stage.getMappedRange().slice(0));stage.unmap();
   return {[names[0]]:{data:data.subarray(0,900),dispose(){}},[names[1]]:{data:data.subarray(900),dispose(){}}};
  }finally{
   if(stage.mapState==='mapped')stage.unmap();
   if(outputs)for(const name of names){const t=outputs[name];if(t&&t!==fetches[name])try{t.dispose();}catch{}}
   busy=false;
  }
 },
 async close(){if(closed)return;closed=true;try{await device.queue.onSubmittedWorkDone();}finally{cleanup();}}
 };
}
const api={create};if(typeof module==='object')module.exports=api;else root.MangaGpuIO=api;
})(globalThis);
