const assert=require('node:assert/strict'),gpu=require('./litert-gpu-core.js');
(async()=>{
 const pure='@compute fn main() {}';assert.equal(gpu.fixShader(pure,true),pure);const mixed='const Bt_buffer = array<f16, 36>();\nvar I0 : vec4<f32>;\nr0 += Bt_buffer[0] * I0;';const patched=gpu.fixShader(mixed,true);assert.ok(patched.startsWith('enable f16;\n'));assert.match(patched,/f32\(Bt_buffer\[0\]\)/);assert.equal(gpu.fixShader(patched,true),patched,'Patch must be idempotent');assert.equal(gpu.fixShader(mixed,false),mixed,'FP32-only devices do not enable F16');const existing='enable f16;\n'+mixed;assert.equal(gpu.fixShader(existing,true).match(/enable f16;/g).length,1);

 const conv='fn Pack4x16float() {}\nvar r_w0 : vec4<f32>= vec4<f32>(0.);\n  r_w0 += Unpack4x16float(weights_buffer.data[weights_offset + 0]) * src_w0.x;';
 const fast=gpu.fixShader(conv,true,true);assert.match(fast,/var r_w0 : vec4<f16>/);assert.match(fast,/fma\(vec4<f16>/);assert.ok(fast.startsWith('enable f16;\n'));assert.equal(gpu.fixShader(fast,true,true),fast);assert.equal(gpu.fixShader(conv,true),conv);assert.equal(gpu.fixShader(conv,false,true),conv);const unsupported='var r_w0 : vec4<f32>= vec4<f32>(0.);\nweights_buffer; Pack4x16float;';assert.equal(gpu.fixShader(unsupported,true,true),unsupported);

 const cachedConv='fn Pack4x16float() {}\nvar r_w0 : vec4<f32>= vec4<f32>(0.);\nvar<workgroup> weights_cache : array<vec4<f32>, 32>;\n    weights_cache[lid + 0] = vec4<f32>(Unpack4x16float(weights_buffer.data[weights_offset + lid + 0]));\n    r_w0 += weights_cache[0] * src_w0.x;';
 const cached=gpu.fixShader(cachedConv,true,true,true);
 assert.match(cached,/weights_cache : array<vec4<f16>, 32>/);
 assert.match(cached,/weights_cache\[lid \+ 0\] = vec4<f16>/);
 assert.match(cached,/r_w0 = fma\(vec4<f16>\(weights_cache\[0\]\)/);
 assert.equal(gpu.fixShader(cachedConv,true,true),cachedConv,'Cached kernel stays unchanged unless explicitly enabled');
 assert.equal(gpu.fixShader(cachedConv,false,true,true),cachedConv,'FP32 path stays unchanged');
 assert.equal(gpu.fixShader(cached,true,true,true),cached,'Cached rewrite is idempotent');
 const masked=cachedConv+'\nvar src_w0 : vec4<f32>;\nsrc_w0 = Unpack4x16float(src_tensor_buffer.data[addr_w0]) * f32(in_x0 && in_y0);';const halfInput=gpu.fixShader(masked,true,true,true);assert.match(halfInput,/var src_w0 : vec4<f16>/);assert.match(halfInput,/src_w0 = vec4<f16>\(Unpack4x16float/);assert.equal(gpu.fixShader(halfInput,true,true,true),halfInput);assert.equal(gpu.fixShader(masked,true,true),masked);
 let listener,removed=false,last;const original=d=>{last=d;return {getCompilationInfo:async()=>({messages:[]})}};const device={createShaderModule:original,addEventListener:(name,f)=>listener=f,removeEventListener:()=>removed=true};const check=gpu.install(device,true);device.createShaderModule({code:mixed});await check.verify();assert.equal(last.code,patched);assert.equal(check.stats.shaderFixes,1);listener({error:{message:'invalid pipeline'}});await assert.rejects(check.verify(),/invalid pipeline/);check.close();assert.equal(removed,true);assert.equal(device.createShaderModule({code:pure}).getCompilationInfo instanceof Function,true);
 const bad={createShaderModule:()=>({getCompilationInfo:async()=>({messages:[{type:'error',message:'type mismatch'}]})})};const guard=gpu.install(bad,true);bad.createShaderModule({code:pure});await assert.rejects(guard.verify(),/type mismatch/);guard.close();console.log('PASS: FP16 Winograd casts/extension, idempotent patch, FP32 preservation, shader compile/validation error guard and cleanup');
})().catch(e=>{console.error(e);process.exitCode=1});
