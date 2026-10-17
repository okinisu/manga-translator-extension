/* Experimental, opt-in. Only the known LiteRT packed FP16 convolution ABI is eligible. */
(()=>{
function eligible(code){return code.includes('array<vec2<u32>>')&&code.includes('DST_S *= 4;')&&code.includes('var r_w0_h0_s0')&&!code.includes('res_final = min(')&&((code.includes('var weights_offset : i32= DST_S * 4 * U.i2.y;')&&code.includes('var ds : i32= U.i2.x;')&&code.includes('res_final = max(res, vec4<f32>(U.f0.x))'))||(code.includes('var weights_offset : i32= DST_S * 4 * U.i1.y;')&&code.includes('var ds : i32= U.i1.x;')&&!code.includes('res_final')));}

function shader(){return `enable f16;
enable chromium_experimental_subgroup_matrix;
struct Packed {data:array<vec2<u32>>};
struct Scalars {f0:vec4<f32>,i1:vec4<i32>,i2:vec4<i32>,i3:vec4<i32>};
@group(0) @binding(0) var<storage,read> bias:Packed;
@group(0) @binding(1) var<storage,read_write> dst:Packed;
@group(0) @binding(2) var<storage,read> src:Packed;
@group(0) @binding(3) var<storage,read> weights:Packed;
@group(0) @binding(4) var<uniform> U:Scalars;
var<workgroup> a:array<f16,256>;
var<workgroup> b:array<f16,256>;
var<workgroup> c:array<f32,256>;
fn unpack(v:vec2<u32>)->vec4<f32>{return vec4<f32>(unpack2x16float(v.x),unpack2x16float(v.y));}
@compute @workgroup_size(32)
fn main(@builtin(workgroup_id) g:vec3<u32>,@builtin(local_invocation_index) lane:u32){
 let pixels=u32(U.i1.z*U.i1.x);let slices=u32(U.i1.y);let ins=u32(U.i2.y);
 var acc=subgroup_matrix_result<f32,16,16>(0.0);
 for(var k=0u;k<ins*4u;k+=16u){
  for(var q=lane;q<256u;q+=32u){
   let row=g.x*16u+q/16u;let channel=k+q%16u;
   var av=0.0;if(row<pixels&&channel<ins*4u){av=unpack(src.data[(channel/4u)*u32(U.i2.x)+row])[channel%4u];}
   a[q]=f16(av);
   let ic=k+q/16u;let oc=g.y*16u+q%16u;var bv=0.0;
   if(ic<ins*4u&&oc<slices*4u){let os=oc/4u;let wi=(os/4u)*16u*ins+(ic/4u)*16u+(os%4u)*4u+ic%4u;bv=unpack(weights.data[wi])[oc%4u];}
   b[q]=f16(bv);
  }
  workgroupBarrier();
  let ma=subgroupMatrixLoad<subgroup_matrix_left<f16,16,16>>(&a,0u,false,16u);
  let mb=subgroupMatrixLoad<subgroup_matrix_right<f16,16,16>>(&b,0u,false,16u);
  acc=subgroupMatrixMultiplyAccumulate(ma,mb,acc);
  workgroupBarrier();
 }
 subgroupMatrixStore(&c,0u,acc,false,16u);workgroupBarrier();
 for(var q=lane;q<64u;q+=32u){let row=g.x*16u+q/4u;let os=g.y*4u+q%4u;
  if(row<pixels&&os<slices){let j=(q/4u)*16u+(q%4u)*4u;let v=max(vec4<f32>(c[j],c[j+1u],c[j+2u],c[j+3u])+unpack(bias.data[os]),vec4<f32>(U.f0.x));dst.data[os*pixels+row]=vec2<u32>(pack2x16float(v.xy),pack2x16float(v.zw));}
 }
}`;}
function fastShader(){
 let code=shader().replace('struct Packed {data:array<vec2<u32>>};','struct Packed {data:array<vec2<u32>>};\nstruct Half {data:array<f16>};').replace('var<storage,read> src:Packed','var<storage,read> src:Half').replace('var<storage,read> weights:Packed','var<storage,read> weights:Half');
 code=code.replace('a:array<f16,256>','a:array<f16,2048>').replace('c:array<f32,256>','c:array<f32,2048>').replace('@workgroup_size(32)','@workgroup_size(256)').replace('@builtin(local_invocation_index) lane:u32','@builtin(local_invocation_index) lane:u32,@builtin(subgroup_id) sg:u32');
 const start=code.indexOf('  for(var q=lane;q<256u;');const end=code.indexOf('  workgroupBarrier();',start);
 code=code.slice(0,start)+`
  for(var q=lane;q<2048u;q+=256u){let row=g.x*128u+q/16u;let channel=k+q%16u;var av=f16(0.0);if(row<pixels&&channel<ins*4u){av=src.data[(channel/4u)*u32(U.i2.x)*4u+row*4u+channel%4u];}a[q]=av;}
  let ic=k+lane/16u;let oc=g.y*16u+lane%16u;var bv=f16(0.0);
  if(ic<ins*4u&&oc<slices*4u){let os=oc/4u;let wi=(os/4u)*16u*ins+(ic/4u)*16u+(os%4u)*4u+ic%4u;bv=weights.data[wi*4u+oc%4u];}b[lane]=bv;
`+code.slice(end);
 code=code.replace('(&a,0u,false,16u)','(&a,sg*256u,false,16u)').replace('(&c,0u,acc,false,16u)','(&c,sg*256u,acc,false,16u)').replace('q<64u;q+=32u','q<512u;q+=256u').replace('row=g.x*16u+q/4u','row=g.x*128u+q/4u');return code;
}
function directShader(relu){
 let code=fastShader();const a=code.indexOf(' for(var k=');const b=code.indexOf(' subgroupMatrixStore',a);
 code=code.slice(0,a)+`
 for(var k=0u;k<ins*4u;k+=16u){
  let ma=subgroupMatrixLoad<subgroup_matrix_left<f16,16,16>>(&src.data,(g.x*128u+sg*16u)*ins*4u+k,false,ins*4u);
  let mb=subgroupMatrixLoad<subgroup_matrix_right<f16,16,16>>(&weights.data,k*slices*4u+g.y*16u,false,slices*4u);
  acc=subgroupMatrixMultiplyAccumulate(ma,mb,acc);
 }
`+code.slice(b);
 return code;
}
function prepareShader(){return `struct Packed{data:array<vec2<u32>>};
@group(0) @binding(0) var<storage,read> src:Packed;
@group(0) @binding(1) var<storage,read_write> a:Packed;
@group(0) @binding(2) var<storage,read> weights:Packed;
@group(0) @binding(3) var<storage,read_write> b:Packed;
@group(0) @binding(4) var<uniform> p:vec4<u32>;
@compute @workgroup_size(256) fn main(@builtin(global_invocation_id) g:vec3<u32>){let q=g.x;
 if(q<arrayLength(&a.data)){var value=vec2<u32>(0u);if(q<p.x*p.y){value=src.data[(q%p.y)*p.x+q/p.y];}a.data[q]=value;}
 if(p.w!=0u&&q<p.y*4u*p.z){let ic=q/p.z;let os=q%p.z;let wi=(os/4u)*16u*p.y+(ic/4u)*16u+(os%4u)*4u+ic%4u;b.data[q]=weights.data[wi];}
}`;}
// Quantize activations once per input row and weights once per output channel.
// The cached weights are immutable LiteRT constants; intermediates are never cached across runs.
function prepareInt8Shader(){return `enable f16;
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
 let row=g.x*8u+sg;var v=0.0;
 for(var q=lane;q<p.y;q+=32u){if(row<p.x){v=max(v,peak(unpack(src.data[q*p.x+row])));}}
 let scale=max(subgroupMax(v)/127.0,1e-20);
 if(row<arrayLength(&sa.data)){if(lane==0u){sa.data[row]=scale;}for(var q=lane;q<p.y;q+=32u){var x=vec4<f32>(0.0);if(row<p.x){x=unpack(src.data[q*p.x+row]);}a.data[row*p.y+q]=bitcast<i32>(pack4xI8(vec4<i32>(clamp(round(x/scale),vec4<f32>(-127.0),vec4<f32>(127.0)))));}}
 if(p.w!=0u){let oc=row;var w=0.0;for(var q=lane;q<p.y;q+=32u){if(oc<p.z*4u){w=max(w,peak(weight(q,oc)));}}let ws=max(subgroupMax(w)/127.0,1e-20);
  if(oc<p.z*4u){if(lane==0u){sb.data[oc]=ws;}for(var q=lane;q<p.y;q+=32u){b.data[oc*p.y+q]=bitcast<i32>(pack4xI8(vec4<i32>(clamp(round(weight(q,oc)/ws),vec4<f32>(-127.0),vec4<f32>(127.0)))));}}
 }
}`;}
function cachedInt8Shader(tuning={rows:128,columns:16}){
 let code=directShader(true).replace('struct Half {data:array<f16>};','struct Half {data:array<i32>};\nstruct Scale {data:array<f32>};\n@group(0) @binding(5) var<storage,read> sa:Scale;\n@group(0) @binding(6) var<storage,read> sb:Scale;').replace('c:array<f32,2048>','c:array<i32,2048>');
 code=code.replace('var acc=subgroup_matrix_result<f32,16,16>(0.0);','var acc=subgroup_matrix_result<i32,16,16>(0);').replace('k+=16u','k+=32u').replace('subgroup_matrix_left<f16,16,16>','subgroup_matrix_left<i8,32,16>').replace('subgroup_matrix_right<f16,16,16>','subgroup_matrix_right<i8,16,32>');
 code=code.replace('&weights.data,k*slices*4u+g.y*16u,false,slices*4u','&weights.data,g.y*16u*ins*4u+k,true,ins*4u');
 code=code.replace('vec4<f32>(c[j],c[j+1u],c[j+2u],c[j+3u])','vec4<f32>(f32(c[j]),f32(c[j+1u]),f32(c[j+2u]),f32(c[j+3u]))*sa.data[row]*vec4<f32>(sb.data[os*4u],sb.data[os*4u+1u],sb.data[os*4u+2u],sb.data[os*4u+3u])'); if(tuning.columns===32){
  code=code.replace('var acc=subgroup_matrix_result<i32,16,16>(0);','var acc=subgroup_matrix_result<i32,16,16>(0);var acc1=subgroup_matrix_result<i32,16,16>(0);');
  code=code.replace('g.y*16u*ins*4u+k','g.y*32u*ins*4u+k');
  code=code.replace('  acc=subgroupMatrixMultiplyAccumulate(ma,mb,acc);','  let mb1=subgroupMatrixLoad<subgroup_matrix_right<i8,16,32>>(&weights.data,(g.y*32u+16u)*ins*4u+k,true,ins*4u);\n  acc=subgroupMatrixMultiplyAccumulate(ma,mb,acc);acc1=subgroupMatrixMultiplyAccumulate(ma,mb1,acc1);');
  code=code.replace('subgroupMatrixStore(&c,sg*256u,acc,false,16u);','subgroupMatrixStore(&c,sg*512u,acc,false,16u);subgroupMatrixStore(&c,sg*512u+256u,acc1,false,16u);');
  code=code.replace('q<512u;q+=256u','q<1024u;q+=256u').replace('row=g.x*128u+q/4u','row=g.x*128u+q/8u').replace('os=g.y*4u+q%4u','os=g.y*8u+q%8u').replace('let j=(q/4u)*16u+(q%4u)*4u','let j=(q/128u)*512u+((q%8u)/4u)*256u+((q/8u)%16u)*16u+(q%4u)*4u');
 }
 code=code.replace('var<workgroup> a:array<f16,2048>;','').replace('var<workgroup> b:array<f16,256>;','');
 code=code.replace('c:array<i32,2048>','c:array<i32,'+(tuning.rows*tuning.columns)+'>').replace('@workgroup_size(256)','@workgroup_size('+(tuning.rows*2)+')').replaceAll('g.x*128u','g.x*'+tuning.rows+'u').replace('q<'+(tuning.columns===32?1024:512)+'u;q+=256u','q<'+(tuning.rows*tuning.columns/4)+'u;q+='+tuning.rows*2+'u');
 return code;
}
function install(device,mode="fp16"){
 const tuning=mode==='int8'?{rows:32,columns:32}:{rows:128,columns:16};
 const supported=device.features.has('chromium-experimental-subgroup-matrix');
 const stats={mode,tuning,supported,eligiblePipelines:0,tensorDispatches:0,fallbackDispatches:0,allocatedBuffers:0,allocatedBytes:0};if(!supported)return {stats,close(){}};
 const originals={},codes=new WeakMap(),pipelines=new WeakMap(),groups=new WeakMap(),writes=new WeakMap(),prepared=new WeakMap(),weightCache=new WeakMap(),owned=[];
 function wrap(object,key,fn){const old=object[key].bind(object);originals[key]=old;object[key]=fn(old);}
 wrap(device,'createShaderModule',old=>d=>{const m=old(d);codes.set(m,d.code);return m;});
 wrap(device,'createBindGroup',old=>d=>{const g=old(d);groups.set(g,d.entries);return g;});
 wrap(device.queue,'writeBuffer',old=>(buffer,offset,data,dataOffset,size)=>{
  if(buffer.usage & GPUBufferUsage.UNIFORM){const v=ArrayBuffer.isView(data)?new Uint8Array(data.buffer,data.byteOffset,data.byteLength):new Uint8Array(data);const unit=ArrayBuffer.isView(data)?data.BYTES_PER_ELEMENT||1:1;const start=(dataOffset||0)*unit;let copy=writes.get(buffer);if(!copy){copy=new Uint8Array(buffer.size);writes.set(buffer,copy);}copy.set(v.subarray(start,size===undefined?v.length:start+size*unit),offset);}
  return old(buffer,offset,data,dataOffset,size);
 });
 const rawShader=originals.createShaderModule,rawPipeline=device.createComputePipeline.bind(device);const modules=new Map();const prepPipeline=rawPipeline({label:'manga-tensor-prepare-'+mode,layout:'auto',compute:{module:rawShader({code:mode==="int8"?prepareInt8Shader():prepareShader()}),entryPoint:'main'}});
 function remember(p,d){if(eligible(codes.get(d.compute.module)||'')){
  const relu=(codes.get(d.compute.module)||'').includes('res_final = max');let module=modules.get(relu);if(!module){let code=mode==="int8"?cachedInt8Shader(tuning):directShader(relu);if(!relu){code=code.replace('f0:vec4<f32>,','').replace(/i([123]):vec4<i32>/g,(_,n)=>'i'+(Number(n)-1)+':vec4<i32>').replace(/U\.i([123])\./g,(_,n)=>'U.i'+(Number(n)-1)+'.');code=code.replace('let v=max(', 'let v=(').replace(',vec4<f32>(U.f0.x))',')');}module=rawShader({code});modules.set(relu,module);}const layout=mode==='int8'?'auto':device.createPipelineLayout({bindGroupLayouts:[p.getBindGroupLayout(0)]});const replacement=rawPipeline({label:'manga-tensor-'+mode,layout,compute:{module,entryPoint:'main'}});pipelines.set(p,{replacement,relu});stats.eligiblePipelines++;
 }return p;}
 wrap(device,'createComputePipeline',old=>d=>remember(old(d),d));
 wrap(device,'createComputePipelineAsync',old=>async d=>remember(await old(d),d));
 wrap(device,'createCommandEncoder',old=>d=>{const enc=old(d),begin=enc.beginComputePass.bind(enc);enc.beginComputePass=d=>{
  const pass=begin(d),set=pass.setPipeline.bind(pass),bind=pass.setBindGroup.bind(pass),dispatch=pass.dispatchWorkgroups.bind(pass);let original,replacement,entries,originalGroup,dynamic=false;
  pass.setPipeline=p=>{original=p;replacement=pipelines.get(p)?.replacement;set(p);};
  pass.setBindGroup=(i,g,...args)=>{if(i===0){originalGroup=g;entries=groups.get(g);dynamic=!!args[0]?.length;}return bind(i,g,...args);};
  pass.dispatchWorkgroups=(...args)=>{if(replacement&&!dynamic){const u=entries?.find(e=>e.binding===4)?.resource;const bytes=u&&writes.get(u.buffer);if(bytes){const off=u.offset||0;const relu=pipelines.get(original).relu;const v=new Int32Array(bytes.buffer,off,Math.min(16,(bytes.length-off)/4));const shift=relu?4:0;const h=v[shift],w=v[shift+2],slices=v[shift+1];
   // Only contiguous, stride-one 1x1 convolutions. Everything else keeps LiteRT's pipeline.
   if(w===v[shift+6]&&h===v[shift+3]&&v[shift+4]===w*h&&slices>0&&v[shift+5]>0){
    {
     if(slices%(tuning.columns/4)||v[shift+5]%(mode==='int8'?8:4)||w*h<1024){stats.fallbackDispatches++;return dispatch(...args);}
     let state=prepared.get(originalGroup);if(!state){const ins=v[shift+5];const create=(size,usage=GPUBufferUsage.STORAGE)=>{const b=device.createBuffer({size,usage});owned.push(b);stats.allocatedBuffers++;stats.allocatedBytes+=size;return b;};const srcEntry=entries.find(e=>e.binding===2).resource,weightEntry=entries.find(e=>e.binding===3).resource;
      let byOffset=weightCache.get(weightEntry.buffer);if(!byOffset){byOffset=new Map();weightCache.set(weightEntry.buffer,byOffset);}const key=[weightEntry.offset||0,slices,ins].join(':');let weight=byOffset.get(key);if(!weight){weight={buffer:create(ins*4*slices*(mode==='int8'?4:8)),scale:mode==='int8'?create(slices*16):null,ready:false};byOffset.set(key,weight);}
      const padded=Math.ceil(w*h/128)*128,input=create(padded*ins*(mode==='int8'?4:8)),scale=mode==='int8'?create(padded*4):null,params=create(16,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST),steadyParams=create(16,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST);originals.writeBuffer(steadyParams,0,new Uint32Array([w*h,ins,slices,0]));originals.writeBuffer(params,0,new Uint32Array([w*h,ins,slices,weight.ready?0:1]));
      const prepEntries=[{binding:0,resource:srcEntry},{binding:1,resource:{buffer:input}},{binding:2,resource:weightEntry},{binding:3,resource:{buffer:weight.buffer}},{binding:4,resource:{buffer:params}},...(mode==='int8'?[{binding:5,resource:{buffer:scale}},{binding:6,resource:{buffer:weight.scale}}]:[])];
      const prep=device.createBindGroup({layout:prepPipeline.getBindGroupLayout(0),entries:prepEntries});
      const steadyPrep=device.createBindGroup({layout:prepPipeline.getBindGroupLayout(0),entries:prepEntries.map(e=>e.binding===4?{...e,resource:{buffer:steadyParams}}:e)});
      const group=device.createBindGroup({layout:replacement.getBindGroupLayout(0),entries:[...entries.map(e=>e.binding===2?{...e,resource:{buffer:input}}:e.binding===3?{...e,resource:{buffer:weight.buffer}}:e),...(mode==='int8'?[{binding:5,resource:{buffer:scale}},{binding:6,resource:{buffer:weight.scale}}]:[])]});
      state={prep,steadyPrep,group,params,weight,ins,pixels:w*h,slices,initial:true};prepared.set(originalGroup,state);
     }
     set(prepPipeline);bind(0,state.initial&&!state.weight.ready?state.prep:state.steadyPrep);dispatch(mode==='int8'?Math.ceil(Math.max(Math.ceil(w*h/128)*128,state.initial&&!state.weight.ready?slices*4:0)/8):Math.ceil(Math.max(Math.ceil(w*h/128)*128*state.ins,state.initial&&!state.weight.ready?state.ins*4*slices:0)/256),1,1);state.initial=false;state.weight.ready=true;
     set(replacement);bind(0,state.group);dispatch(Math.ceil(w*h/tuning.rows),Math.ceil(slices/(tuning.columns/4)),1);set(original);bind(0,originalGroup);
    }
    stats.tensorDispatches++;return;
   }
  }stats.fallbackDispatches++;}return dispatch(...args);};return pass;
 };return enc;});
 return {stats,close(){for(const b of owned)b.destroy();for(const [key,fn]of Object.entries(originals)){if(key==='writeBuffer')device.queue[key]=fn;else device[key]=fn;}}};
}
const api={eligible,shader,fastShader,directShader,prepareShader,prepareInt8Shader,cachedInt8Shader,install};if(typeof module!=='undefined')module.exports=api;else globalThis.MangaTensorConvolution=api;
})();
