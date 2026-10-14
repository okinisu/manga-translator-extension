// Runs in the review page, which remains alive while detection/translation run.
(()=>{
 let running=false,controller;
 const call=async(type,extra={})=>{const r=await chrome.runtime.sendMessage({type,...extra});if(!r?.ok)throw Error(r?.error||'Pi連携に失敗しました。');return r;};
 async function run(){
  if(running)return;running=true;
  try{
   while(true){
    const snapshot=await chrome.storage.session.get(['job','collection','autoState']);
    const j=snapshot.job,c=snapshot.collection;
    if(!j||c?.waiting||j.aiProvider!=='pi'||!c?.autoMode||c.stopRequested||snapshot.autoState?.state!=='running')break;
    const settings=await chrome.storage.local.get({piBridgeToken:'',piModel:'',piThinkingLevel:'default'});
    if(!settings.piBridgeToken)throw Error('Pi接続キーを拡張機能メニューに設定してください。');
    controller=new AbortController();
    const acquired=await call('PI_CLAIM',{jobId:j.id});
    if(acquired.start===false)break;
    const image=(await call('GET')).job;
    if(image?.id!==j.id)throw Error('翻訳対象が変わりました。');
    const response=await fetch('http://127.0.0.1:43129/translate',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+settings.piBridgeToken},body:JSON.stringify({prompt:MangaCore.prompt(j),image:image.image,model:settings.piModel.trim()||undefined,thinkingLevel:settings.piThinkingLevel||'default'}),signal:controller.signal});
    if(!response.ok)throw Error('Pi接続エラー HTTP '+response.status);
    const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',done=false,lastPreview='',lastPreviewAt=0;
    while(true){
     const part=await reader.read();buffer+=decoder.decode(part.value||new Uint8Array(),{stream:!part.done});
     let n;while((n=buffer.indexOf('\n'))>=0){
      const line=buffer.slice(0,n);buffer=buffer.slice(n+1);if(!line.trim())continue;const event=JSON.parse(line);
      if(event.type==='error')throw Error(event.error);
      if(event.type==='text'&&Date.now()-lastPreviewAt>=500){
       const preview=MangaCollage.streamResponse(event.text,j);
       if(preview&&preview!==lastPreview){await call('IMPORT_PREVIEW',{jobId:j.id,text:preview,piAttempt:acquired.attemptId});lastPreview=preview;lastPreviewAt=Date.now();}
      }
      if(event.type==='done'){await call('IMPORT',{text:event.text,automatic:true,piAttempt:acquired.attemptId});done=true;}
     }
     if(part.done)break;
    }
    if(!done)throw Error('Piの応答が完了前に切断されました。再開すると再依頼します。');
   }
  }catch(e){
   controller?.abort();
   const {collection:c}=await chrome.storage.session.get('collection');
   if(e.name!=='AbortError'&&c?.aiProvider==='pi')await call('AUTO_REPORT',{batchId:c.id,error:true,message:e.message}).catch(()=>{});
  }finally{running=false;controller=null;}
 }
 chrome.storage.onChanged.addListener((changes,area)=>{
  if(area!=='session')return;
  if(changes.autoState||changes.collection||changes.job){
   const a=changes.autoState?.newValue,c=changes.collection;
   if(a&&['paused','error','complete'].includes(a.state)||c&&!c.newValue||c?.newValue?.stopRequested)controller?.abort();
   void run();
  }
 });
 // Polling also recovers a wake-up that arrived during the final stream read.
 setInterval(()=>void run(),1000);
 void run();
})();
