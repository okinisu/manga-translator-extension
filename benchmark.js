const $=s=>document.querySelector(s);let result;
$('#run').onclick=async()=>{
 let worker;$('#run').disabled=true;$('#save').disabled=true;
 try{
  const file=$('#file').files[0];if(!file)throw Error('画像を選択してください。');worker=new Worker('detector-worker.js');let id=0;const pending=new Map();
  worker.onmessage=({data:m})=>{const entry=pending.get(m.id);if(!entry)return;pending.delete(m.id);clearTimeout(entry.timer);m.error?entry.reject(Error(m.error)):entry.resolve(m.result);};
  worker.onerror=e=>{for(const entry of pending.values()){clearTimeout(entry.timer);entry.reject(Error(e.message));}pending.clear();};
  const call=(type,data={},transfer=[])=>new Promise((resolve,reject)=>{const key=++id,timer=setTimeout(()=>{pending.delete(key);reject(Error('120秒以内に応答がありません。'));},120000);pending.set(key,{resolve,reject,timer});worker.postMessage({id:key,type,...data},transfer);});
  $('#status').textContent='モデル起動中…';const startup=await call('start',{backend:$('#accelerator').value,precision:$('#precision').value,powerPreference:'high-performance',threads:2,debug:true});
  const source=await createImageBitmap(file),width=source.width,height=source.height;source.close();const inputCanvas=new OffscreenCanvas(640,640),inputContext=inputCanvas.getContext('2d');inputContext.fillStyle='#fff';inputContext.fillRect(0,0,640,640);const scaled=await createImageBitmap(file,{resizeWidth:640,resizeHeight:640,resizeQuality:'low'});inputContext.drawImage(scaled,0,0);scaled.close();const rows=[];for(let n=0;n<7;n++){
   $('#status').textContent=(n<2?'ウォームアップ':'測定')+' '+(n<2?n+1:n-1);const bitmap=await createImageBitmap(inputCanvas);
   const at=performance.now();const reply=await call('detect',{bitmap,width,height,opaque:true},[bitmap]);if(n>=2)rows.push({...reply.debug,roundtripMs:performance.now()-at,regions:reply.detections.length});
  }
  const sorted=rows.map(r=>r.inferenceMs).sort((a,b)=>a-b);result={runtime:'LiteRT.js 2.5.3',startup,measuredRuns:5,medianInferenceMs:sorted[2],maxInferenceMs:sorted.at(-1),rows,note:'Wall-clock inference response includes CPU fallback and transfer/synchronization; GPU input normalization is included in inference when gpuInputPrepared is true. Inputs are composited on white, matching the chapter pipeline. GPU compute only is not measured.'};$('#status').textContent=JSON.stringify(result,null,2);$('#save').disabled=false;
 }catch(e){$('#status').textContent=e.message;}finally{worker?.terminate();$('#run').disabled=false;}
};
$('#save').onclick=()=>{if(!result)return;const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='tflite-benchmark-'+Date.now()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);};
