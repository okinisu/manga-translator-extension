(()=>{
 // Only the validated full-FP16 convolution pattern uses half accumulators.
 // External storage layout and FP32 output conversion remain unchanged;
 // the opt-in cached path also keeps workgroup weights in FP16.
 function halfConvolution(code,cachedWeights=false){
  if(!code.includes('weights_buffer')||!code.includes('var r_w')||!code.includes('Pack4x16float'))return code;
  let count=0;const candidate=code.replace(/(var r_\w+\s*:\s*)vec4<f32>(\s*=\s*)vec4<f32>/g,'$1vec4<f16>$2vec4<f16>').replace(/^(\s*)(r_\w+) \+= (Unpack4x16float\(weights_buffer\.data\[[^\]\n]+\]\)) \* (src_\w+\.[xyzw]);$/gm,(_,indent,acc,w,x)=>{count++;return `${indent}${acc} = fma(vec4<f16>(${w}), vec4<f16>(f16(${x})), ${acc});`;});
  if(!cachedWeights)return count?candidate:code;
  const cacheHalf=candidate.replace(/(var<workgroup> weights_cache\s*:\s*array<vec4<)f32(>)/g,'$1f16$2').replace(/(weights_cache\[[^\]\n]+\] = vec4<)f32(>\(Unpack4x16float\(weights_buffer\.data\[)/g,'$1f16$2');
  const halfInput=cacheHalf.replace(/(var src_\w+\s*:\s*vec4<)f32(>)/g,'$1f16$2').replace(/(src_\w+ = )([^;\n]+);/g,'$1vec4<f16>($2);');
  const cached=halfInput.replace(/^(\s*)(r_\w+) \+= (weights_cache\[\d+\]) \* (src_\w+\.[xyzw]);$/gm,(_,indent,acc,w,x)=>{count++;return `${indent}${acc} = fma(vec4<f16>(${w}), vec4<f16>(f16(${x})), ${acc});`;});
  return count?cached:code;
 }
 function fixShader(code,halfEnabled,fastConvolution=false,cachedWeights=false){
  if(typeof code!=='string'||!halfEnabled)return code;
  if(fastConvolution)code=halfConvolution(code,cachedWeights);
  if(/vec4<f32>/.test(code)&&/const (?:Bt|At)_buffer\s*=\s*array<f16/.test(code))code=code.replace(/\b(Bt_buffer|At_buffer)\[([^\]\n]+)\]/g,(match,name,index,offset,source)=>/\bf32\(\s*$/.test(source.slice(Math.max(0,offset-24),offset))?match:`f32(${name}[${index}])`);
  if(/\bf16\b/.test(code)&&!/^\s*enable f16;/m.test(code))code='enable f16;\n'+code;
  return code;
 }
 function install(device,halfEnabled=false,fastConvolution=false,cachedWeights=false){
  const pending=new Set(),errors=[];let shaderFixes=0,compiled=0;const original=device.createShaderModule?.bind(device);
  const onError=e=>{if(errors.length<8)errors.push(e.error?.message||'GPU検証エラー');};device.addEventListener?.('uncapturederror',onError);
  if(original)device.createShaderModule=descriptor=>{const code=fixShader(descriptor.code,halfEnabled,fastConvolution,cachedWeights);if(code!==descriptor.code)shaderFixes++;const module=original(code===descriptor.code?descriptor:{...descriptor,code});compiled++;
   if(module.getCompilationInfo){const task=module.getCompilationInfo().then(info=>{for(const message of info.messages)if(message.type==='error'&&errors.length<8)errors.push(message.message);}).catch(e=>{if(errors.length<8)errors.push(e.message||String(e));});pending.add(task);task.finally(()=>pending.delete(task));}return module;
  };
  return {async verify(){if(pending.size)await Promise.all([...pending]);if(errors.length)throw Error('GPUシェーダーを実行できません：'+errors[0]);},get stats(){return {compiled,shaderFixes,validationErrors:errors.length};},close(){device.removeEventListener?.('uncapturederror',onError);if(original)device.createShaderModule=original;}};
 }
 const api={fixShader,install};if(typeof module!=='undefined')module.exports=api;else globalThis.MangaLiteRtGpu=api;
})();
