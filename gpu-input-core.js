(()=>{
function create(device,buffer){
 const texture=device.createTexture({size:[640,640],format:'rgba8unorm',usage:GPUTextureUsage.COPY_DST|GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.RENDER_ATTACHMENT});
 try{const module=device.createShaderModule({code:`@group(0) @binding(0) var source: texture_2d<f32>; @group(0) @binding(1) var<storage,read_write> output: array<f32>; @compute @workgroup_size(16,16) fn main(@builtin(global_invocation_id) p:vec3<u32>){if(p.x>=640u||p.y>=640u){return;}let c=textureLoad(source,vec2<i32>(p.xy),0);let i=(p.y*640u+p.x)*3u;output[i]=c.r;output[i+1u]=c.g;output[i+2u]=c.b;}`});
 const pipeline=device.createComputePipeline({layout:'auto',compute:{module,entryPoint:'main'}}),group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:texture.createView()},{binding:1,resource:{buffer}}]});
 let closed=false;return {write(bitmap){if(closed)throw Error('GPU入力は終了しました。');if(bitmap.width!==640||bitmap.height!==640)throw Error('GPU入力画像の寸法が不正です。');device.queue.copyExternalImageToTexture({source:bitmap},{texture,premultipliedAlpha:false},[640,640]);const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(40,40);pass.end();device.queue.submit([encoder.finish()]);},close(){if(!closed){closed=true;texture.destroy();}}};}catch(error){texture.destroy();throw error;}
}

const api={create};if(typeof module!=='undefined')module.exports=api;else globalThis.MangaGPUInput=api;
})();
