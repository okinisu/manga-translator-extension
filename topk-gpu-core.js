/* Exact stable top-300 for the validated packed-half 8400-score ABI. */
(()=>{
const thresholdShader=`struct Packed{data:array<vec2<u32>>};
@group(0) @binding(0) var<storage,read> src:Packed;
@group(0) @binding(1) var<storage,read_write> indices:array<u32>;
var<workgroup> bins:array<atomic<u32>,256>;
fn key(bits:u32)->u32{return select(bits^32768u,(~bits)&65535u,(bits&32768u)!=0u);}
@compute @workgroup_size(256) fn coarse(@builtin(local_invocation_index) lane:u32){
atomicStore(&bins[lane],0u);workgroupBarrier();for(var q=lane;q<2100u;q+=256u){let p=src.data[q];for(var c=0u;c<4u;c++){let bits=(p[c/2u]>>((c%2u)*16u))&65535u;atomicAdd(&bins[key(bits)>>8u],1u);}}
workgroupBarrier();if(lane==0u){var greater=0u;for(var b=255i;b>=0;b--){let count=atomicLoad(&bins[u32(b)]);if(greater+count>=300u){indices[301]=u32(b);indices[302]=300u-greater;break;}greater+=count;}}}
@compute @workgroup_size(256) fn fine(@builtin(local_invocation_index) lane:u32){
atomicStore(&bins[lane],0u);workgroupBarrier();let bucket=indices[301];for(var q=lane;q<2100u;q+=256u){let p=src.data[q];for(var c=0u;c<4u;c++){let bits=(p[c/2u]>>((c%2u)*16u))&65535u;let k=key(bits);if(k>>8u==bucket){atomicAdd(&bins[k&255u],1u);}}}
workgroupBarrier();if(lane==0u){var greater=0u;for(var b=255i;b>=0;b--){let count=atomicLoad(&bins[u32(b)]);if(greater+count>=indices[302]){let k=bucket*256u+u32(b);let bits=select((~k)&65535u,k^32768u,k>=32768u);indices[300]=bitcast<u32>(unpack2x16float(bits).x);break;}greater+=count;}}}`;
const rankShader=`struct Packed{data:array<vec2<u32>>};
@group(0) @binding(0) var<storage,read> src:Packed;
@group(0) @binding(1) var<storage,read_write> indices:array<u32>;
fn unpack(v:vec2<u32>)->vec4<f32>{return vec4<f32>(unpack2x16float(v.x),unpack2x16float(v.y));}
@compute @workgroup_size(128) fn main(@builtin(global_invocation_id) g:vec3<u32>){let i=g.x;if(i>=8400u){return;}let value=unpack(src.data[i/4u])[i%4u];if(value<bitcast<f32>(indices[300])){return;}var rank=0u;
for(var w=0u;w<2100u;w++){let v=unpack(src.data[w]);for(var c=0u;c<4u;c++){let j=w*4u+c;if(v[c]>value||(v[c]==value&&j<i)){rank++;}}if(rank>=300u){return;}}
indices[rank]=i;}`;
const packShader=`struct Packed{data:array<vec2<u32>>};
@group(0) @binding(0) var<storage,read> src:Packed;
@group(0) @binding(1) var<storage,read> indices:array<u32>;
@group(0) @binding(2) var<storage,read_write> dstIndices:array<vec4<i32>>;
@group(0) @binding(3) var<storage,read_write> dstValues:Packed;
fn unpack(v:vec2<u32>)->vec4<f32>{return vec4<f32>(unpack2x16float(v.x),unpack2x16float(v.y));}
@compute @workgroup_size(128) fn main(@builtin(global_invocation_id) g:vec3<u32>){let q=g.x;if(q>=75u){return;}var ix:vec4<i32>;var v:vec4<f32>;for(var c=0u;c<4u;c++){let i=indices[q*4u+c];ix[c]=i32(i);v[c]=unpack(src.data[i/4u])[i%4u];}dstIndices[q]=ix;dstValues.data[q]=vec2<u32>(pack2x16float(v.xy),pack2x16float(v.zw));}`;
// Exact generated-source signatures: an unknown runtime/shader uses the original path.
const signatures={"991858326": "first", "841281551": "next", "351783886": "copy-half", "3238503166": "copy-int"};
function fingerprint(code){let h=2166136261;for(let i=0;i<code.length;i++)h=Math.imul(h^code.charCodeAt(i),16777619);return h>>>0;}
function kind(code){if(typeof code!=='string'||code.length>20000||!code.includes('dst_'))return null;return signatures[fingerprint(code)]||null;}

function install(device){
 const modules=new WeakMap(),pipelines=new WeakMap(),groups=new WeakMap(),uniforms=new WeakMap(),cache=new WeakMap();const original={shader:device.createShaderModule.bind(device),pipeline:device.createComputePipeline.bind(device),pipelineAsync:device.createComputePipelineAsync.bind(device),group:device.createBindGroup.bind(device),encoder:device.createCommandEncoder.bind(device),write:device.queue.writeBuffer.bind(device.queue)};let threshold,thresholdFine,rank,pack,scratch,closed=false,active=false,lastK=0,pairs=null,inputResource=null;const stats={sorts:0,skipped:0,copiesSkipped:0,fallbacks:0};
 function prepare(){if(rank)return;scratch=device.createBuffer({size:1212,usage:GPUBufferUsage.STORAGE});const module=original.shader({code:thresholdShader}),layout=device.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:'read-only-storage'}},{binding:1,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}}]}),shared=device.createPipelineLayout({bindGroupLayouts:[layout]});threshold=original.pipeline({layout:shared,compute:{module,entryPoint:'coarse'}});thresholdFine=original.pipeline({layout:shared,compute:{module,entryPoint:'fine'}});rank=original.pipeline({layout:'auto',compute:{module:original.shader({code:rankShader}),entryPoint:'main'}});pack=original.pipeline({layout:'auto',compute:{module:original.shader({code:packShader}),entryPoint:'main'}});}
 device.createShaderModule=d=>{const m=original.shader(d),k=kind(d.code);if(k)modules.set(m,k);return m;};
 for(const [name,f] of [['createComputePipeline',original.pipeline],['createComputePipelineAsync',original.pipelineAsync]])device[name]=d=>{const k=modules.get(d.compute?.module),r=f(d);const remember=p=>{if(k)pipelines.set(p,k);return p;};return r.then?r.then(remember):remember(r);};
 device.createBindGroup=d=>{const g=original.group(d);groups.set(g,d.entries);return g;};
 device.queue.writeBuffer=(b,offset,data,dataOffset=0,size)=>{if((b.usage&GPUBufferUsage.UNIFORM)&&b.size<=1048576){const unit=data.BYTES_PER_ELEMENT||1,src=new Uint8Array(data.buffer||data,(data.byteOffset||0)+dataOffset*unit,size===undefined?data.byteLength-dataOffset*unit:size*unit);let dst=uniforms.get(b);if(!dst){dst=new Uint8Array(b.size);uniforms.set(b,dst);}dst.set(src,offset);}return original.write(b,offset,data,dataOffset,size);};
 device.createCommandEncoder=(...args)=>{const encoder=original.encoder(...args),begin=encoder.beginComputePass.bind(encoder);encoder.beginComputePass=d=>{const pass=begin(d),set=pass.setPipeline.bind(pass),bind=pass.setBindGroup.bind(pass),dispatch=pass.dispatchWorkgroups.bind(pass);let current,currentGroup,dynamic=false;pass.setPipeline=p=>{current=p;return set(p);};pass.setBindGroup=(i,g,...args)=>{if(i===0){currentGroup=g;dynamic=!!args[0]?.length;}return bind(i,g,...args);};pass.dispatchWorkgroups=(x,y=1,z=1)=>{const k=pipelines.get(current),entries=groups.get(currentGroup);if(!k||!entries||dynamic){if(k)active=false;return dispatch(x,y,z);}const r=i=>entries.find(e=>e.binding===i)?.resource;if(k.startsWith('copy-')){if(active&&lastK>=1&&pairs){const a=r(0),b=r(1),pair=pairs[k==='copy-half'?1:0],u=r(2),bytes=u&&uniforms.get(u.buffer);const same=(x,y)=>x.buffer===y.buffer&&(x.offset||0)===(y.offset||0)&&x.size===y.size;const related=pair&&((same(a,pair[0])&&same(b,pair[1]))||(same(a,pair[1])&&same(b,pair[0])));if(bytes&&related&&a.size===(k==='copy-half'?600:1200)){const v=new Int32Array(bytes.buffer,u.offset||0,8);if(v[0]===1&&v[1]===75&&v[2]===1&&v[3]===1&&v[4]===1){stats.copiesSkipped++;return;}}}return dispatch(x,y,z);}const u=r(k==='first'?3:5),bytes=u&&uniforms.get(u.buffer);if(!bytes||x!==1||y!==1||z!==1){active=false;stats.fallbacks++;return dispatch(x,y,z);}const v=new Int32Array(bytes.buffer,u.offset||0,k==='first'?16:20);
 if(v[4]!==1||v[5]!==1||v[6]!==1||v[7]!==1||v[9]!==2100||v[10]!==1||v[11]!==2100||v[12]!==4||r(0).size!==1200||r(1).size!==600||r(2).size!==16800){active=false;stats.fallbacks++;return dispatch(x,y,z);}
 if(k==='next'){if(active&&r(2).buffer===inputResource.buffer&&(r(2).offset||0)===(inputResource.offset||0)&&v[8]===lastK+1&&v[8]<=74){if(v[8]===1)pairs=[[pairs[0][0],r(0)],[pairs[1][0],r(1)]];lastK=v[8];stats.skipped++;if(v[8]===74)active=false;return;}return dispatch(x,y,z);}
 prepare();let pair=cache.get(currentGroup);if(!pair){pair=[original.group({layout:rank.getBindGroupLayout(0),entries:[{binding:0,resource:r(2)},{binding:1,resource:{buffer:scratch}}]}),original.group({layout:pack.getBindGroupLayout(0),entries:[{binding:0,resource:r(2)},{binding:1,resource:{buffer:scratch}},{binding:2,resource:r(0)},{binding:3,resource:r(1)}]}),original.group({layout:threshold.getBindGroupLayout(0),entries:[{binding:0,resource:r(2)},{binding:1,resource:{buffer:scratch}}]})];cache.set(currentGroup,pair);}const thresholdGroup=pair[2];set(threshold);bind(0,thresholdGroup);dispatch(1,1,1);set(thresholdFine);bind(0,thresholdGroup);dispatch(1,1,1);set(rank);bind(0,pair[0]);dispatch(66,1,1);set(pack);bind(0,pair[1]);dispatch(1,1,1);set(current);bind(0,currentGroup);active=true;inputResource=r(2);lastK=0;pairs=[[r(0)],[r(1)]];stats.sorts++;};return pass;};return encoder;};
 return {stats,close(){if(closed)return;closed=true;device.createShaderModule=original.shader;device.createComputePipeline=original.pipeline;device.createComputePipelineAsync=original.pipelineAsync;device.createBindGroup=original.group;device.createCommandEncoder=original.encoder;device.queue.writeBuffer=original.write;scratch?.destroy();}};
}
const api={kind,fingerprint,install,rankShader,packShader,thresholdShader};if(typeof module!=='undefined')module.exports=api;else globalThis.MangaTopKGpu=api;
})();
