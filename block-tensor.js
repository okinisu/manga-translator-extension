/* Experimental, opt-in. Only the known LiteRT packed FP16 convolution ABI is eligible. */
(()=>{
function grouping(code){const m=code.match(/DST_S \*= (\d+);/);return m?Number(m[1]):1;}
function fused(code){return code.includes('@binding(5) var<uniform> U: Scalars;')&&code.includes('interm_value_link2 = res + second_value;')&&code.includes('var weights_offset : i32= DST_S * 4 * U.i2.w;')&&code.includes('var ds : i32= U.i2.z;')&&code.includes('res_final = max(interm_value_link2, vec4<f32>(U.f0.x))');}
function eligible(code){return code.includes('array<vec2<u32>>')&&[1,2,4].includes(grouping(code))&&code.includes('var r_w0_h0_s0')&&!code.includes('res_final = min(')&&(fused(code)||(code.includes('var weights_offset : i32= DST_S * 4 * U.i2.y;')&&code.includes('var ds : i32= U.i2.x;')&&code.includes('res_final = max(res, vec4<f32>(U.f0.x))'))||(code.includes('var weights_offset : i32= DST_S * 4 * U.i1.y;')&&code.includes('var ds : i32= U.i1.x;')&&!code.includes('res_final')));}

function prepareInt8Shader(blockSize=64){return `enable f16;
enable subgroups;
struct Packed{data:array<vec2<u32>>};struct I8{data:array<i32>};struct Scale{data:array<f32>};
@group(0) @binding(0) var<storage,read> src:Packed;
@group(0) @binding(1) var<storage,read_write> a:I8;
@group(0) @binding(2) var<storage,read> weights:Packed;
@group(0) @binding(3) var<storage,read_write> b:I8;
@group(0) @binding(4) var<uniform> p:vec4<u32>;
@group(0) @binding(5) var<storage,read_write> sa:Scale;
@group(0) @binding(6) var<storage,read_write> sb:Scale;
fn unpack(v:vec2<u32>)->vec4<f32>{return vec4<f32>(unpack2x16float(v.x),unpack2x16float(v.y));}
fn peak(v:vec4<f32>)->f32{let a=abs(v);return max(max(a.x,a.y),max(a.z,a.w));}
fn weight(ic:u32,oc:u32)->vec4<f32>{let os=oc/4u;let wi=(os/4u)*16u*p.y+ic*16u+(os%4u)*4u;let c=oc%4u;return vec4<f32>(unpack(weights.data[wi])[c],unpack(weights.data[wi+1u])[c],unpack(weights.data[wi+2u])[c],unpack(weights.data[wi+3u])[c]);}
@compute @workgroup_size(256) fn main(@builtin(workgroup_id) g:vec3<u32>,@builtin(subgroup_id) sg:u32,@builtin(subgroup_invocation_id) lane:u32){
 let row=g.x*8u+sg;let blocks=p.y/${blockSize/4}u;
 for(var block=0u;block<blocks;block++){
  let q=block*${blockSize/4}u+lane;var v=0.0;if(lane<${blockSize/4}u&&row<p.x){v=peak(unpack(src.data[q*p.x+row]));}let scale=max(subgroupMax(v)/127.0,1e-20);
  if(row<arrayLength(&sa.data)/blocks){if(lane==0u){sa.data[row*blocks+block]=scale;}if(lane<${blockSize/4}u){var x=vec4<f32>(0.0);if(row<p.x){x=unpack(src.data[q*p.x+row]);}a.data[row*p.y+q]=bitcast<i32>(pack4xI8(vec4<i32>(clamp(round(x/scale),vec4<f32>(-127.0),vec4<f32>(127.0)))));}}
  if(p.w!=0u){let oc=row;var w=0.0;if(lane<${blockSize/4}u&&oc<p.z*4u){w=peak(weight(q,oc));}let ws=max(subgroupMax(w)/127.0,1e-20);if(oc<p.z*4u){if(lane==0u){sb.data[oc*blocks+block]=ws;}if(lane<${blockSize/4}u){b.data[oc*p.y+q]=bitcast<i32>(pack4xI8(vec4<i32>(clamp(round(weight(q,oc)/ws),vec4<f32>(-127.0),vec4<f32>(127.0)))));}}}
 }
}`;}
function cachedInt8Shader(blockSize=64){return `enable f16;
enable chromium_experimental_subgroup_matrix;
struct Packed{data:array<vec2<u32>>};struct I8{data:array<i32>};struct Scale{data:array<f32>};struct Scalars{f0:vec4<f32>,i1:vec4<i32>,i2:vec4<i32>,i3:vec4<i32>};
@group(0) @binding(0) var<storage,read> bias:Packed;
@group(0) @binding(1) var<storage,read_write> dst:Packed;
@group(0) @binding(2) var<storage,read> src:I8;
@group(0) @binding(3) var<storage,read> weights:I8;
@group(0) @binding(4) var<uniform> U:Scalars;
@group(0) @binding(5) var<storage,read> sa:Scale;
@group(0) @binding(6) var<storage,read> sb:Scale;
var<workgroup> c:array<i32,1024>;
fn unpack(v:vec2<u32>)->vec4<f32>{return vec4<f32>(unpack2x16float(v.x),unpack2x16float(v.y));}
@compute @workgroup_size(64) fn main(@builtin(workgroup_id) g:vec3<u32>,@builtin(subgroup_id) sg:u32,@builtin(local_invocation_index) lane:u32){
 let pixels=u32(U.i1.z*U.i1.x);let slices=u32(U.i1.y);let ins=u32(U.i2.y);let channels=ins*4u;let blocks=channels/${blockSize}u;
 var totals:array<vec4<f32>,4>;
 for(var block=0u;block<blocks;block++){
  var acc=subgroup_matrix_result<i32,16,16>(0);var acc1=subgroup_matrix_result<i32,16,16>(0);
  for(var offset=0u;offset<${blockSize}u;offset+=32u){let k=block*${blockSize}u+offset;let ma=subgroupMatrixLoad<subgroup_matrix_left<i8,32,16>>(&src.data,(g.x*32u+sg*16u)*channels+k,false,channels);let mb=subgroupMatrixLoad<subgroup_matrix_right<i8,16,32>>(&weights.data,g.y*32u*channels+k,true,channels);let mb1=subgroupMatrixLoad<subgroup_matrix_right<i8,16,32>>(&weights.data,(g.y*32u+16u)*channels+k,true,channels);acc=subgroupMatrixMultiplyAccumulate(ma,mb,acc);acc1=subgroupMatrixMultiplyAccumulate(ma,mb1,acc1);}
  subgroupMatrixStore(&c,sg*512u,acc,false,16u);subgroupMatrixStore(&c,sg*512u+256u,acc1,false,16u);workgroupBarrier();
  for(var t=0u;t<4u;t++){let q=lane+t*64u;let row=g.x*32u+q/8u;let os=g.y*8u+q%8u;let j=(q/128u)*512u+((q%8u)/4u)*256u+((q/8u)%16u)*16u+(q%4u)*4u;
   if(row<pixels&&os<slices){totals[t]+=vec4<f32>(f32(c[j]),f32(c[j+1u]),f32(c[j+2u]),f32(c[j+3u]))*sa.data[row*blocks+block]*vec4<f32>(sb.data[(os*4u)*blocks+block],sb.data[(os*4u+1u)*blocks+block],sb.data[(os*4u+2u)*blocks+block],sb.data[(os*4u+3u)*blocks+block]);}}
  workgroupBarrier();
 }
 for(var t=0u;t<4u;t++){let q=lane+t*64u;let row=g.x*32u+q/8u;let os=g.y*8u+q%8u;if(row<pixels&&os<slices){let v=max(totals[t]+unpack(bias.data[os]),vec4<f32>(U.f0.x));dst.data[os*pixels+row]=vec2<u32>(pack2x16float(v.xy),pack2x16float(v.zw));}}
}`;}
function install(device,mode="int8",blockSize=64){
 if(![64,128].includes(blockSize))throw Error("Unsupported INT8 K block size.");
 if(mode!=="int8")throw Error("Block matrix path requires INT8 mode.");
 const tuning={rows:32,columns:32,blockSize};
 const supported=device.features.has('chromium-experimental-subgroup-matrix');
 const stats={mode,tuning,supported,eligiblePipelines:0,tensorDispatches:0,fallbackDispatches:0,fusedDispatches:0,allocatedBuffers:0,allocatedBytes:0};if(!supported)return {stats,close(){}};
 const originals={},codes=new WeakMap(),pipelines=new WeakMap(),groups=new WeakMap(),writes=new WeakMap(),prepared=new WeakMap(),weightCache=new WeakMap(),owned=[];
 function wrap(object,key,fn){const old=object[key].bind(object);originals[key]=old;object[key]=fn(old);}
 wrap(device,'createShaderModule',old=>d=>{const m=old(d);codes.set(m,d.code);return m;});
 wrap(device,'createBindGroup',old=>d=>{const g=old(d);groups.set(g,d.entries);return g;});
 wrap(device.queue,'writeBuffer',old=>(buffer,offset,data,dataOffset,size)=>{
  if(buffer.usage & GPUBufferUsage.UNIFORM){const v=ArrayBuffer.isView(data)?new Uint8Array(data.buffer,data.byteOffset,data.byteLength):new Uint8Array(data);const unit=ArrayBuffer.isView(data)?data.BYTES_PER_ELEMENT||1:1;const start=(dataOffset||0)*unit;let copy=writes.get(buffer);if(!copy){copy=new Uint8Array(buffer.size);writes.set(buffer,copy);}copy.set(v.subarray(start,size===undefined?v.length:start+size*unit),offset);}
  return old(buffer,offset,data,dataOffset,size);
 });
 const rawShader=originals.createShaderModule,rawPipeline=device.createComputePipeline.bind(device);const modules=new Map();const prepPipelines=new Map();function getPrep(group){let pipeline=prepPipelines.get(group);if(!pipeline){let code=prepareInt8Shader(blockSize);code=code.replace('(os/4u)*16u*p.y+ic*16u+(os%4u)*4u','(os/'+group+'u)*'+(group*4)+'u*p.y+ic*'+(group*4)+'u+(os%'+group+'u)*4u').replace('(os/4u)*16u*ins+(ic/4u)*16u+(os%4u)*4u','(os/'+group+'u)*'+(group*4)+'u*ins+(ic/4u)*'+(group*4)+'u+(os%'+group+'u)*4u');pipeline=rawPipeline({label:'manga-block-prepare-'+mode+'-g'+group,layout:'auto',compute:{module:rawShader({code}),entryPoint:'main'}});prepPipelines.set(group,pipeline);}return pipeline;}

 function remember(p,d){if(eligible(codes.get(d.compute.module)||'')){
  const source=codes.get(d.compute.module)||'',isFused=fused(source),relu=source.includes('res_final = max');const key=relu+':'+isFused;let module=modules.get(key);if(!module){let code=cachedInt8Shader(blockSize);if(isFused){code=code.replace('let ins=u32(U.i2.y)','let ins=u32(U.i2.w)').replace('@group(0) @binding(4) var<uniform> U:Scalars;', '@group(0) @binding(4) var<uniform> U:Scalars;\n@group(0) @binding(7) var<storage,read> residual:Packed;').replace('+unpack(bias.data[os]),','+unpack(bias.data[os])+unpack(residual.data[os*pixels+row]),');}if(!relu){code=code.replace('f0:vec4<f32>,','').replace(/i([123]):vec4<i32>/g,(_,n)=>'i'+(Number(n)-1)+':vec4<i32>').replace(/U\.i([123])\./g,(_,n)=>'U.i'+(Number(n)-1)+'.');code=code.replace('let v=max(', 'let v=(').replace(',vec4<f32>(U.f0.x))',')');}module=rawShader({code});modules.set(key,module);}const layout=mode==='int8'||isFused?'auto':device.createPipelineLayout({bindGroupLayouts:[p.getBindGroupLayout(0)]});const replacement=rawPipeline({label:'manga-block-'+mode,layout,compute:{module,entryPoint:'main'}});pipelines.set(p,{replacement,relu,isFused,grouping:grouping(source)});stats.eligiblePipelines++;
 }return p;}
 wrap(device,'createComputePipeline',old=>d=>remember(old(d),d));
 wrap(device,'createComputePipelineAsync',old=>async d=>remember(await old(d),d));
 wrap(device,'createCommandEncoder',old=>d=>{const enc=old(d),begin=enc.beginComputePass.bind(enc);enc.beginComputePass=d=>{
  const pass=begin(d),set=pass.setPipeline.bind(pass),bind=pass.setBindGroup.bind(pass),dispatch=pass.dispatchWorkgroups.bind(pass);let original,replacement,entries,originalGroup,dynamic=false;
  pass.setPipeline=p=>{original=p;replacement=pipelines.get(p)?.replacement;set(p);};
  pass.setBindGroup=(i,g,...args)=>{if(i===0){originalGroup=g;entries=groups.get(g);dynamic=!!args[0]?.length;}return bind(i,g,...args);};
  pass.dispatchWorkgroups=(...args)=>{if(replacement&&!dynamic){const info=pipelines.get(original),isFused=info.isFused;const u=entries?.find(e=>e.binding===(isFused?5:4))?.resource;const bytes=u&&writes.get(u.buffer);if(bytes){const off=u.offset||0;const relu=pipelines.get(original).relu;const v=new Int32Array(bytes.buffer,off,Math.min(16,(bytes.length-off)/4));const shift=relu?4:0;const h=v[shift],w=v[shift+2],slices=v[shift+1],ins=v[isFused?11:shift+5],srcH=v[isFused?9:shift+3],srcW=v[isFused?12:shift+6],stride=v[isFused?10:shift+4];
   // Only contiguous, stride-one 1x1 convolutions. Everything else keeps LiteRT's pipeline.
   if(w===srcW&&h===srcH&&stride===w*h&&slices>0&&ins>0&&(!isFused||(v[7]===h&&v[8]===w))){
    {
     if(slices%(tuning.columns/4)||ins%(blockSize/4)||w*h<256||(!isFused&&info.grouping===4&&w*h>=1024)){stats.fallbackDispatches++;return dispatch(...args);}
     let state=prepared.get(originalGroup);if(!state){const prepPipeline=getPrep(info.grouping);const create=(size,usage=GPUBufferUsage.STORAGE)=>{const b=device.createBuffer({size,usage});owned.push(b);stats.allocatedBuffers++;stats.allocatedBytes+=size;return b;};const srcEntry=entries.find(e=>e.binding===(isFused?3:2)).resource,weightEntry=entries.find(e=>e.binding===(isFused?4:3)).resource;
      let byOffset=weightCache.get(weightEntry.buffer);if(!byOffset){byOffset=new Map();weightCache.set(weightEntry.buffer,byOffset);}const key=[weightEntry.offset||0,slices,ins,info.grouping].join(':');let weight=byOffset.get(key);if(!weight){weight={buffer:create(ins*4*slices*(mode==='int8'?4:8)),scale:mode==='int8'?create(slices*16*(ins/(blockSize/4))):null,ready:false};byOffset.set(key,weight);}
      const padded=Math.ceil(w*h/128)*128,input=create(padded*ins*(mode==='int8'?4:8)),scale=mode==='int8'?create(padded*4*(ins/(blockSize/4))):null,params=create(16,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST),steadyParams=create(16,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST);originals.writeBuffer(steadyParams,0,new Uint32Array([w*h,ins,slices,0]));originals.writeBuffer(params,0,new Uint32Array([w*h,ins,slices,weight.ready?0:1]));
      const prepEntries=[{binding:0,resource:srcEntry},{binding:1,resource:{buffer:input}},{binding:2,resource:weightEntry},{binding:3,resource:{buffer:weight.buffer}},{binding:4,resource:{buffer:params}},...(mode==='int8'?[{binding:5,resource:{buffer:scale}},{binding:6,resource:{buffer:weight.scale}}]:[])];
      const prep=device.createBindGroup({layout:prepPipeline.getBindGroupLayout(0),entries:prepEntries});
      const steadyPrep=device.createBindGroup({layout:prepPipeline.getBindGroupLayout(0),entries:prepEntries.map(e=>e.binding===4?{...e,resource:{buffer:steadyParams}}:e)});
      const group=device.createBindGroup({layout:replacement.getBindGroupLayout(0),entries:[...(isFused?[entries.find(e=>e.binding===0),entries.find(e=>e.binding===1),{binding:2,resource:srcEntry},{binding:3,resource:weightEntry},{binding:4,resource:u},{binding:7,resource:entries.find(e=>e.binding===2).resource}]:entries).map(e=>e.binding===2?{...e,resource:{buffer:input}}:e.binding===3?{...e,resource:{buffer:weight.buffer}}:e),...(mode==='int8'?[{binding:5,resource:{buffer:scale}},{binding:6,resource:{buffer:weight.scale}}]:[])]});
      state={prepPipeline,prep,steadyPrep,group,params,weight,ins,pixels:w*h,slices,initial:true};prepared.set(originalGroup,state);
     }
     set(state.prepPipeline);bind(0,state.initial&&!state.weight.ready?state.prep:state.steadyPrep);dispatch(mode==='int8'?Math.ceil(Math.max(Math.ceil(w*h/128)*128,state.initial&&!state.weight.ready?slices*4:0)/8):Math.ceil(Math.max(Math.ceil(w*h/128)*128*state.ins,state.initial&&!state.weight.ready?state.ins*4*slices:0)/256),1,1);state.initial=false;state.weight.ready=true;
     set(replacement);bind(0,state.group);dispatch(Math.ceil(w*h/tuning.rows),Math.ceil(slices/(tuning.columns/4)),1);set(original);bind(0,originalGroup);
    }
    stats.tensorDispatches++;if(isFused)stats.fusedDispatches++;return;
   }
  }stats.fallbackDispatches++;}return dispatch(...args);};return pass;
 };return enc;});
 return {stats,close(){for(const b of owned)b.destroy();for(const [key,fn]of Object.entries(originals)){if(key==='writeBuffer')device.queue[key]=fn;else device[key]=fn;}}};
}
const api={grouping,fused,eligible,prepareInt8Shader,cachedInt8Shader,install};if(typeof module!=='undefined')module.exports=api;else globalThis.MangaBlockTensor=api;
})();
