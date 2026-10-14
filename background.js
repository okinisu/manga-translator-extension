importScripts('core.js','text-core.js','collage-core.js','batch-store.js');
const reviewOrigin=chrome.runtime.getURL('');
function internal(s){return s.url?.startsWith(reviewOrigin);}
async function state(){return chrome.storage.session.get(['job','collection','chatAccess','autoState','aiTabs','reviewTab']);}
const providers={chatgpt:'https://chatgpt.com/',gemini:'https://gemini.google.com/app'};
function provider(value){if(!Object.hasOwn(providers,value))throw Error('AIの選択が不正です。');return value;}
function aiURL(url,key='chatgpt'){try{return new URL(url).origin===new URL(providers[provider(key)]).origin;}catch{return false;}}
async function autoStatus(values){await chrome.storage.session.set({autoState:{...values,updated:Date.now()}});}
// Share tab acquisition between preload and first-image activation.
const aiOpening=new Map(),unreadyAITabs=new Map();
async function chatMode(value){
 if(value==='normal'||value==='temporary')return value;
 const saved=await chrome.storage.local.get({chatgptChatMode:'temporary'});
 return saved.chatgptChatMode==='normal'?'normal':'temporary';
}
function aiSlot(key,mode){return key==='chatgpt'&&mode==='temporary'?'chatgpt:temporary':key;}
async function reusableAI(key,explicit,mode){
 const slot=aiSlot(key,mode);
 const saved=await state(),local=await chrome.storage.local.get({aiReuseTabs:{}}),ids=[explicit,unreadyAITabs.get(slot),saved.aiTabs?.[slot],saved.chatAccess?.provider===key&&(key!=='chatgpt'||(saved.chatAccess.chatMode||'normal')===mode)?saved.chatAccess.tabId:undefined,local.aiReuseTabs?.[slot]];
 for(const id of new Set(ids)){if(!Number.isInteger(id)||id<=0)continue;try{
  const tab=await chrome.tabs.get(id);if(aiURL(tab.url,key))return tab;
  if(tab.url||tab.pendingUrl&&!aiURL(tab.pendingUrl,key)){if(unreadyAITabs.get(slot)===id)unreadyAITabs.delete(slot);continue;}
  // Tab URLs can be hidden without host/tabs permissions. Ask only our own
  // existing content script for its provider, without requesting page content.
  if(!tab.url){let timer,info;try{info=await Promise.race([chrome.tabs.sendMessage(id,{type:'AI_PROBE'}).catch(()=>null),new Promise(resolve=>{timer=setTimeout(()=>resolve(null),1500);})]);}finally{clearTimeout(timer);}
   if(info?.ok){if(unreadyAITabs.get(slot)===id)unreadyAITabs.delete(slot);if(info.provider===key)return tab;}
   // A missing listener while our newly created page loads is not evidence
   // that it is another site. Keep this tab until its script can respond.
   else if(unreadyAITabs.get(slot)===id)return tab;
  }
 }catch{if(unreadyAITabs.get(slot)===id)unreadyAITabs.delete(slot);}}
}
async function rememberReuseTab(key,id){const {aiReuseTabs={}}=await chrome.storage.local.get({aiReuseTabs:{}});await chrome.storage.local.set({aiReuseTabs:{...aiReuseTabs,[key]:id}});}
async function ensureAITab(key,sourceTab,explicit,mode){
 mode=key==='chatgpt'?await chatMode(mode):undefined;const slot=aiSlot(key,mode);
 if(aiOpening.has(slot))return aiOpening.get(slot);
 const opening=(async()=>{
  let tab=await reusableAI(key,explicit,mode);
  if(!tab){tab=await chrome.tabs.create({url:key==='chatgpt'&&mode==='temporary'?'https://chatgpt.com/?temporary-chat=true':providers[key],windowId:(await chrome.tabs.get(sourceTab)).windowId,active:false});unreadyAITabs.set(slot,tab.id);}
  const latest=await state();await chrome.storage.session.set({aiTabs:{...latest.aiTabs,[slot]:tab.id}});
  await rememberReuseTab(slot,tab.id);return tab;
 })();
 aiOpening.set(slot,opening);
 try{return await opening;}finally{if(aiOpening.get(slot)===opening)aiOpening.delete(slot);}
}
async function preloadAI(c){
 const key=provider(c.aiProvider||'chatgpt'),mode=key==='chatgpt'?await chatMode(c.chatMode):undefined,tab=await ensureAITab(key,c.sourceTab,c.chatMode===mode?c.chatTab:undefined,mode);
 const latest=await state();if(latest.collection?.id!==c.id)throw Error('画像準備の対象が変わりました。');
 await chrome.storage.session.set({collection:{...latest.collection,chatTab:tab.id,chatMode:mode},chatAccess:{tabId:tab.id,provider:key,chatMode:mode}});
 return tab.id;
}
async function openAI(j,background=false){
 const key=provider(j.aiProvider||'chatgpt');const initial=await state();if(!j.chatTab&&initial.collection&&initial.collection.id===j.batchId)j.chatTab=initial.collection.chatTab;
 const mode=key==='chatgpt'?await chatMode(j.automation?(j.chatMode||'normal'):(j.chatMode||initial.collection?.chatMode)):undefined;
 const boundMode=j.chatMode||initial.collection?.chatMode||'normal';
 const tab=await ensureAITab(key,j.sourceTab,boundMode===mode?j.chatTab:undefined,mode);
 j.chatMode=mode;
 if(!background)await chrome.tabs.update(tab.id,{active:true});
 j.chatTab=tab.id;j.aiProvider=key;if(j.imageRef)delete j.image;const latest=await state();await chrome.storage.session.set({job:j,chatAccess:{tabId:tab.id,provider:key,chatMode:mode},...(latest.collection&&latest.collection.id===j.batchId?{collection:{...latest.collection,chatTab:tab.id,chatMode:mode}}:{})});
 await chrome.tabs.sendMessage(tab.id,{type:'AUTO_WAKE'}).catch(()=>{});return {ok:true};
}
// A single extension review page owns image preparation for all entry points.
let reviewOpening;
async function ensureReviewTab(windowId,active=false,batchId){
 if(!reviewOpening){
  const opening=(async()=>{
   const url=chrome.runtime.getURL('review.html'),saved=await state();let tab;
   for(const id of new Set([saved.collection?.reviewTab,saved.reviewTab])){
    if(!Number.isInteger(id))continue;
    try{const existing=await chrome.tabs.get(id);if(existing.url===url){tab=existing;break;}}catch{}
   }
   if(!tab){const existing=await chrome.tabs.query({url});tab=existing.find(t=>t.url===url);}
   if(!tab)tab=await chrome.tabs.create({url,...(Number.isInteger(windowId)?{windowId}:{}),active:false});
   await chrome.storage.session.set({reviewTab:tab.id});return tab;
  })();
  reviewOpening=opening;
 }
 const opening=reviewOpening;let tab;
 try{tab=await opening;}finally{if(reviewOpening===opening)reviewOpening=undefined;}
 if(active)await chrome.tabs.update(tab.id,{active:true});
 const latest=await state();if(latest.collection&&(!batchId||latest.collection.id===batchId))await chrome.storage.session.set({collection:{...latest.collection,reviewTab:tab.id}});
 return tab;
}
let starting=false,claiming=false;

// Session storage retains only metadata. Image bytes stay in IndexedDB and are
// materialized only for authorized GET responses, never persisted as Base64.
let imageTransferCache;
async function makeJob(id,chatTab){
 const stored=await BatchStore.get(id),{collection}=await state();
 if(!stored)throw Error('準備した画像がありません。全体読み込みをやり直してください。');
 if(stored.type==='text')return {...stored,chatTab,chatMode:collection?.chatMode||stored.chatMode,aiProvider:collection?.aiProvider||stored.aiProvider||'chatgpt'};
 const active=stored.retry?{...stored,...stored.retry,recoveryRoot:stored.id}:stored;
 const {blob,retry,receivedItems,retryAttempts,image,imageRef,...j}=active;
 if(!blob)throw Error('準備した画像がありません。全体読み込みをやり直してください。');
 return {...j,imageRef:{storeId:stored.id,imageId:active.id},chatTab,chatMode:collection?.chatMode||j.chatMode,aiProvider:collection?.aiProvider||j.aiProvider||'chatgpt'};
}
async function jobImage(j){
 if(typeof j.image==='string')return j.image; // Resume an older inline job.
 const ref=j.imageRef;if(!ref||ref.imageId!==j.id)throw Error('送信用画像の参照が不正です。');
 if(imageTransferCache?.id===j.id&&imageTransferCache.storeId===ref.storeId)return imageTransferCache.promise;
 const entry={id:j.id,storeId:ref.storeId};imageTransferCache=entry;
 entry.promise=(async()=>{
  const stored=await BatchStore.get(ref.storeId);
  if(!stored||stored.batchId!==j.batchId)throw Error('準備した画像がありません。全体読み込みをやり直してください。');
  const source=stored.id===j.id?stored:stored.retry?.id===j.id?stored.retry:null;
  if(!source?.blob)throw Error('送信用画像が更新されています。最新の画像を取得してください。');
  return BatchStore.dataURL(source.blob);
 })().catch(e=>{if(imageTransferCache===entry)imageTransferCache=null;throw e;});
 return entry.promise;
}

// Rebuild only missing crops. Original queue IDs and region IDs remain stable.
async function retryImage(root,records){
 const chapter=await BatchStore.get(root.batchId+':chapter');
 const crops=new Map((chapter?.records||[]).map(r=>[r.id,r]));
 let chosen=records.slice(0,12);
 while(chosen.length){
  const selected=chosen.map(r=>{const crop=crops.get(r.id);if(!crop?.cropBlob)throw Error('再依頼用の切り抜き画像がありません。確認画面でこの話を準備し直してください。');return {...crop,enabled:true};});
  const page=MangaCollage.pages(selected)[0];chosen=chosen.slice(0,page.entries.length);
  const canvas=new OffscreenCanvas(page.width,page.height),ctx=canvas.getContext('2d');
  try{ctx.fillStyle='#e5e7eb';ctx.fillRect(0,0,page.width,page.height);ctx.font='bold 22px sans-serif';
   for(const e of page.entries){const im=await createImageBitmap(e.record.cropBlob);try{ctx.fillStyle='#fff';ctx.fillRect(e.x-4,e.y-34,e.cellWidth-16,e.height+42);ctx.fillStyle='#111';ctx.fillText('ID '+e.id,e.x+4,e.y-9);ctx.drawImage(im,e.x,e.y,e.width,e.height);}finally{im.close();}}
   const blob=await canvas.convertToBlob({type:'image/png'});if(blob.size<=20*1024*1024)return {blob,records:chosen};
  }finally{canvas.width=1;canvas.height=1;}
  if(chosen.length===1)throw Error('再依頼画像が20MBを超えています。');chosen=chosen.slice(0,Math.ceil(chosen.length/2));
 }
 throw Error('再依頼する領域がありません。');
}
async function importCollage(text,target,automatic,selectedId){
 const result=MangaCollage.parsePartial(text,target),rootId=target.recoveryRoot||target.id;
 if(!target.recoveryRoot&&!result.missing.length)return apply(text,target,automatic,selectedId);
 const root=await BatchStore.get(rootId);if(!root||root.batchId!==target.batchId)throw Error('再依頼の元画像がありません。');
 const accepted=new Map((root.receivedItems||[]).map(r=>[r.id,r]));
 for(const row of result.items)accepted.set(row.id,row);
 const pending=root.records.filter(r=>!accepted.has(r.id)),newBlocks=result.blocks.map(b=>({...b,jobId:rootId,blockId:rootId+':'+root.records.findIndex(r=>r.id===b.id)}));
 const tab=await chrome.tabs.get(target.sourceTab);if(tab.url!==target.url)throw Error('漫画ページが変わりました。元のページに戻してください。');
 const fresh=await state();if(fresh.job?.id!==selectedId||fresh.collection?.id!==root.batchId)throw Error('翻訳対象が変わりました。');
 if(result.items.length){const applied=await chrome.tabs.sendMessage(target.sourceTab,{type:'APPLY',blocks:newBlocks,url:target.url,jobId:rootId,incremental:true,clearJobIds:[target.id+':preview']});if(!applied?.ok)throw Error(applied?.error||'漫画ページへの反映に失敗しました。');}
 root.receivedItems=[...accepted.values()];await BatchStore.put(root);
 if(!pending.length){
  const full={...target,id:rootId,records:root.records};delete full.recoveryRoot;
  const done=await apply(JSON.stringify({jobId:rootId,items:root.receivedItems}),full,automatic,selectedId,true);done.count=newBlocks.length;
  const retained=await BatchStore.get(rootId);if(retained){delete retained.retry;await BatchStore.put(retained);}return done;
 }
 const attempts=root.retryAttempts||{};
 if(pending.some(r=>(attempts[r.id]||0)>=3))throw Error('欠落IDの再依頼が3回でも完了しませんでした：'+pending.filter(r=>(attempts[r.id]||0)>=3).map(r=>r.id).join(', ')+'。反映済みの訳文は保持しています。');
 const small=await retryImage(root,pending);
 if(!result.items.length){const cleared=await chrome.tabs.sendMessage(target.sourceTab,{type:'APPLY',blocks:[],url:target.url,jobId:rootId,incremental:true,clearJobIds:[target.id+':preview']});if(!cleared?.ok)throw Error(cleared?.error||'漫画ページへの反映に失敗しました。');}

 for(const r of small.records)attempts[r.id]=(attempts[r.id]||0)+1;
 const retry={id:rootId+':retry:'+crypto.randomUUID(),blob:small.blob,records:small.records,context:[...(target.context||[]),...newBlocks.map(b=>({ko:b.original,ja:b.ja}))].slice(-6),automation:undefined};
 root.retry=retry;root.retryAttempts=attempts;await BatchStore.put(root);
 if(selectedId!==target.id){const selected=fresh.job,stored=await BatchStore.get(selected.recoveryRoot||selected.id);if(stored){if(selected.recoveryRoot)stored.retry={...stored.retry,context:selected.context||[],automation:selected.automation};else{stored.context=selected.context||[];stored.automation=selected.automation;}await BatchStore.put(stored);}}
 const next=await makeJob(rootId,target.chatTab);const queue=(await state()).collection;queue.index=queue.ids.indexOf(rootId);queue.waiting=false;await chrome.storage.session.set({job:next,collection:queue});await notifyQueue(next);
 const {collection,autoState}=await state();if(collection?.autoMode)await autoStatus({...autoState,message:`${newBlocks.length}件を反映。欠落${pending.length}件のうち${small.records.length}件を再依頼`,position:collection.index+1,total:collection.ids.length});
 return {ok:true,count:newBlocks.length,hasNext:true,retry:true,missingIds:pending.map(r=>r.id),retryCount:small.records.length,position:collection.index+1,total:collection.ids.length};
}
async function notifyQueue(j,finished=false){if(j?.chatTab)await chrome.tabs.sendMessage(j.chatTab,{type:'QUEUE_CHANGED',finished}).catch(()=>{});}
let importing=false;let queueTail=Promise.resolve();
async function apply(text,j,automatic=false,selectedId=j.id,alreadyApplied=false){
  let blocks=j.type==='collage'?MangaCollage.parse(text,j):j.type==='text'?MangaText.parseTranslations(text,j):MangaCore.parse(text,j.id).map(b=>MangaCore.anchor(b,j));
  if(j.ownership)blocks=blocks.filter(b=>{const center=(b.relative.y+b.relative.height/2)*j.images[0].height;return center>=j.ownership.top&&center<j.ownership.bottom;});
  blocks=blocks.map((b,i)=>({...b,jobId:j.id,blockId:j.id+':'+i}));
  const tab=await chrome.tabs.get(j.sourceTab);if(tab.url!==j.url)throw Error('漫画ページが変わりました。元のページに戻してください。');
  const {job:latest,collection}=await state();if(latest?.id!==selectedId)throw Error('翻訳対象が変わりました。最新の画像で再実行してください。');
  const completed=new Set(collection?.completed??collection?.ids.slice(0,collection.index)??[]);completed.add(j.id);let next,nextIndex;
  if(collection){const remaining=collection.ids.map((id,index)=>({id,index})).filter(v=>!completed.has(v.id));const candidate=(selectedId!==j.id&&remaining.find(v=>v.id===selectedId))||remaining.find(v=>v.index>collection.index)||remaining[0];if(candidate){nextIndex=candidate.index;next=await makeJob(candidate.id,j.chatTab);if(next.type==='collage'&&nextIndex===collection.ids.indexOf(j.id)+1)next.context=[...(j.context||[]),...blocks.map(b=>({ko:b.original,ja:b.ja}))].slice(-6);}}

  const reply=alreadyApplied?{ok:true}:await chrome.tabs.sendMessage(j.sourceTab,{type:'APPLY',blocks,url:j.url,jobId:j.id,clearJobIds:[j.id+':preview']});
  if(!reply?.ok)throw Error(reply?.error||'漫画ページを再読み込みしてやり直してください。');
  if(next){if(selectedId!==j.id){const selected=await BatchStore.get(selectedId);if(selected)await BatchStore.put({...selected,context:latest.context||[],automation:latest.automation});if(next.id===selectedId)next={...next,context:latest.context||[],automation:latest.automation};}const saved=await BatchStore.get(j.id);if(saved)await BatchStore.put({...saved,context:j.context||[],automation:j.automation||{phase:'sent',at:Date.now()}});collection.completed=[...completed];collection.index=nextIndex;collection.waiting=false;await chrome.storage.session.set({collection,job:next});}

  else if(collection?.producing){collection.completed=[...completed];collection.waiting=true;collection.context=[...(j.context||[]),...blocks.map(b=>({ko:b.original,ja:b.ja}))].slice(-6);await chrome.storage.session.set({collection});}
  else {await chrome.storage.session.remove(['job','collection']);imageTransferCache=null;if(collection)await BatchStore.clear();}
  await notifyQueue(j,!next&&!collection?.producing);
  if(collection?.autoMode){const {autoState}=await state();await autoStatus({...autoState,state:next||collection.producing?autoState?.state||'running':'complete',message:next?'翻訳を続行中':collection.producing?'次の画像を準備中':'この話の翻訳が完了しました。',position:next?nextIndex+1:collection.ids.length,total:collection.ids.length});}
  if(!collection?.autoMode&&(!automatic||!next))await chrome.tabs.update(j.sourceTab,{active:true});
  return {ok:true,count:blocks.length,hasNext:!!next||!!collection?.producing,position:collection?collection.index+1:1,total:collection?.ids.length||1};
}
chrome.tabs.onRemoved?.addListener(async id=>{const {job,collection,autoState}=await state();if(collection?.autoMode&&(((collection.status==='loading'||collection.producing)&&collection.reviewTab===id)||((job?.chatTab===id||collection.chatTab===id)&&['preparing','running'].includes(autoState?.state))))await autoStatus({...autoState,state:'error',message:'処理用タブが閉じられました。メニューから再開してください。'});});
chrome.runtime.onStartup.addListener(()=>{BatchStore.clear().catch(()=>{});chrome.storage.local.remove?.('aiReuseTabs')?.catch(()=>{});});
chrome.runtime.onMessage.addListener((m,s,respond)=>{
  let release;const queued=['COLLAGE_APPEND','IMPORT','IMPORT_PREVIEW','SELECT_QUEUE','AUTO_STOP','DISCARD','AUTOMATION_MARK','AUTOMATION_UNSENT','AUTOMATION_RESET','AUTO_RESUME_AI','AUTO_REPORT'].includes(m.type),previous=queueTail;if(queued)queueTail=new Promise(r=>{release=r;});
  (async()=>{if(queued)await previous;
    // Detection checks must not load or serialize the image-bearing job.
    if(m.type==='COLLECTION_CHECK'){
      if(!internal(s))throw Error('この画面からは操作できません。');
      const {collection:c}=await chrome.storage.session.get(['collection']);
      if(!c||c.id!==m.batchId)throw Error('処理対象が変わりました。');
      if(c.stopRequested)throw Error('処理を停止しました。');
      return {ok:true,collection:{id:c.id,status:c.status,producing:!!c.producing,streamRevision:c.streamRevision,autoMode:!!c.autoMode}};
    }
    // Review progress reports also avoid loading image-bearing jobs, including
    // reports ignored after translation has already started.
    if(m.type==='AUTO_REPORT'&&internal(s)){
      const {collection:c,autoState:a}=await chrome.storage.session.get(['collection','autoState']);
      if(!c?.autoMode||a?.batchId!==c.id||['complete','paused','error'].includes(a?.state)||m.batchId!==c.id||!m.error&&a.state!=='preparing')return {ok:true};
      await autoStatus({...a,state:m.error?'error':a.state,message:String(m.message||'').slice(0,400),position:c.index+1,total:c.ids.length});return {ok:true};
    }
    if(m.type==='OPEN_REVIEW'&&internal(s)){await ensureReviewTab(undefined,true);return {ok:true};}
    if(m.type==='AUTO_START'&&internal(s)){
      if(starting)throw Error('開始処理中です。');starting=true;let ownedRun=false;
      try{
        const key=provider(m.provider),tab=await chrome.tabs.get(m.sourceTab);if(!tab.url?.startsWith('https://comic.naver.com/webtoon/detail'))throw Error('漫画の本文ページで開始してください。');
        const old=await state();if(old.autoState?.state==='running'||old.autoState?.state==='preparing')throw Error('全自動処理は実行中です。');ownedRun=true;
        if(old.collection||old.job){
          if(old.collection?.url!==tab.url||old.collection?.sourceTab!==tab.id)throw Error('別の話の翻訳が残っています。確認画面で完了または破棄してください。');
          if(old.job?.automation&&(old.job.aiProvider||'chatgpt')!==key)throw Error('送信済みの画像は同じAIで再開してください。');
          const c={...old.collection,batchMode:old.collection?.batchMode||'compact',autoMode:true,aiProvider:key,stopRequested:false};await chrome.storage.session.set({collection:c});
          await autoStatus({batchId:c.id,provider:key,runId:crypto.randomUUID(),state:old.job?'running':'preparing',message:old.job?'翻訳を再開中':'画像を準備中'});
          if(old.job){old.job.aiProvider=key;if(old.job.aiProvider!==old.chatAccess?.provider)delete old.job.chatTab;await openAI(old.job,true);if(c.producing){await ensureReviewTab(tab.windowId,false,c.id);}}
          else {await preloadAI(c);await ensureReviewTab(tab.windowId,false,c.id);}
        }else{
          const result=await chrome.tabs.sendMessage(tab.id,{type:'WHOLE',automatic:true,provider:key});if(!result?.ok)throw Error(result?.error||'漫画ページを再読み込みしてください。');
        }
        return {ok:true};
      }catch(e){const {autoState:a}=await state();if(ownedRun&&a&&['preparing','running'].includes(a.state)&&!/^全自動処理は実行中/.test(e.message))await autoStatus({...a,state:'error',message:e.message});throw e;}finally{starting=false;}
    }
    if(m.type==='CAPTURE'||m.type==='BATCH_START'){
      if(!s.tab||!s.url?.startsWith('https://comic.naver.com/'))throw Error('NAVERの漫画ページから実行してください。');
      const old=await state();if(old.job||old.collection)throw Error('前の翻訳が残っています。確認画面で完了または破棄してください。');
      const tab=s.tab;
      if(m.type==='BATCH_START'){
        if(!Array.isArray(m.urls)||!m.urls.length||m.urls.length>500||m.urls.some(u=>!MangaCore.episodeImage(u,tab.url)))throw Error('この話の漫画画像を取得できませんでした。');
        const settings=await chrome.storage.local.get({batchMode:'balanced',chatgptChatMode:'temporary',customInstructions:''});
        const collection={customInstructions:MangaCollage.normalizeMemory(settings.customInstructions),chatMode:settings.chatgptChatMode==='normal'?'normal':'temporary',batchMode:MangaCollage.batchProfile(settings.batchMode).name,id:crypto.randomUUID(),sourceTab:tab.id,url:tab.url,urls:[...new Set(m.urls)],ids:[],index:0,status:'loading',created:Date.now(),autoMode:!!m.automatic,aiProvider:provider(m.provider||'chatgpt')};
        if(collection.autoMode)await autoStatus({batchId:collection.id,provider:collection.aiProvider,runId:crypto.randomUUID(),state:'preparing',message:'画像を準備中'});
        imageTransferCache=null;await BatchStore.clear();await chrome.storage.session.set({collection});if(collection.autoMode)await preloadAI(collection);
      }else{
        const [active]=await chrome.tabs.query({active:true,windowId:tab.windowId});if(active?.id!==tab.id)throw Error('漫画タブを表示したまま範囲を選択してください。');
        const r=m.rect;if(!r||![r.x,r.y,r.width,r.height,m.viewport.width,m.viewport.height].every(Number.isFinite)||r.width<20||r.height<20||r.x<0||r.y<0||r.x+r.width>m.viewport.width+1||r.y+r.height>m.viewport.height+1)throw Error('選択範囲が不正です。');
        const screenshot=await chrome.tabs.captureVisibleTab(tab.windowId,{format:'png'});
        await chrome.storage.session.set({job:{id:crypto.randomUUID(),sourceTab:tab.id,url:tab.url,rect:r,images:m.images,viewport:m.viewport,screenshot,created:Date.now()}});
      }
      await ensureReviewTab(tab.windowId,!m.automatic);return {ok:true};
    }
    const {job:j,collection,chatAccess,autoState}=await state();
    const chatAllowed=!!j&&s.tab?.id===j.chatTab&&aiURL(s.url,j.aiProvider||'chatgpt');
    if(m.type==='AUTO_STOP'&&(internal(s)||chatAllowed)){
      if(collection){collection.stopRequested=true;await chrome.storage.session.set({collection});}
      await autoStatus({...autoState,state:'paused',message:'停止しました。送信済みの返答は再開時に取り込みます。'});
      if(j?.chatTab)await chrome.tabs.sendMessage(j.chatTab,{type:'AUTO_STOP'}).catch(()=>{});return {ok:true};
    }
    if(m.type==='AUTO_REPORT'&&(internal(s)||chatAllowed)){
      if(!collection?.autoMode||autoState?.batchId!==collection.id||['complete','paused','error'].includes(autoState?.state))return {ok:true};
      if(internal(s)&&m.batchId!==collection.id||chatAllowed&&m.jobId!==j.id)return {ok:true};
      if(internal(s)&&!m.error&&autoState.state!=='preparing')return {ok:true};
      await autoStatus({...autoState,state:m.error?'error':autoState.state,message:String(m.message||'').slice(0,400),position:collection.index+1,total:collection.ids.length});return {ok:true};
    }
    if(m.type==='AUTO_RESUME_AI'&&chatAllowed){
      if(importing||j.id!==m.jobId||!collection?.autoMode)throw Error('自動翻訳の対象が変わりました。');
      const holder=s.documentId||m.instance;if(!holder)throw Error('実行画面を確認できません。');
      if(autoState?.state==='running'&&autoState.holder&&autoState.holder!==holder)throw Error('別の画面で自動翻訳を実行中です。');
      if(collection.producing&&collection.stopRequested)throw Error('画像準備の途中で停止しています。拡張機能メニューから再開してください。');
      if(!['running','paused','error'].includes(autoState?.state))throw Error('自動翻訳を再開できる状態ではありません。');
      collection.stopRequested=false;await chrome.storage.session.set({collection});
      await autoStatus({...autoState,holder,state:'running',message:'翻訳を再開中'});return {ok:true};
    }
    if(m.type==='AI_READY'&&chatAllowed){
      if(claiming)return {ok:true,start:false};claiming=true;
      try{const fresh=await state(),autoState=fresh.autoState,collection=fresh.collection;
      if(!collection?.autoMode||collection.stopRequested||autoState?.state!=='running')return {ok:true,start:false};
      const holder=s.documentId||m.instance;if(!holder)return {ok:true,start:false};
      if(autoState.holder===holder)return {ok:true,start:false};
      await autoStatus({...autoState,holder});return {ok:true,start:true};
      }finally{claiming=false;}
    }
    if(m.type==='GET_STATUS'){
      const bound=chatAccess?.tabId===s.tab?.id&&aiURL(s.url,chatAccess.provider||'chatgpt');
      if(!internal(s)&&!chatAllowed&&!bound)throw Error('この画面からは操作できません。');
      const own=internal(s)||chatAllowed;
      return {ok:true,autoState:own?autoState||null:null,job:own&&j&&!collection?.waiting?{id:j.id,type:j.type}:null,waiting:own&&!!collection?.waiting,progress:own&&collection?.status==='ready'?{position:collection.index+1,total:collection.ids.length}:{position:0,total:0}};
    }
    if(!internal(s)&&!chatAllowed&&!(m.type==='GET'&&!j&&!collection&&autoState?.state==='complete'&&chatAccess?.tabId===s.tab?.id&&aiURL(s.url,chatAccess.provider)))throw Error('この画面からは操作できません。');
    if(m.type==='GET'){const imageUnchanged=!!j&&!collection?.waiting&&j.type==='collage'&&!!(j.imageRef||j.image)&&m.knownImageId===j.id;const metadata=j?(({image,...rest})=>rest)(j):null;const job=collection?.waiting?null:imageUnchanged?metadata:j&&(j.imageRef||j.image)?{...j,image:await jobImage(j)}:j;return {ok:true,imageUnchanged,job:collection?.waiting?null:job||null,waiting:!!collection?.waiting,finished:autoState?.state==='complete',pipelineError:collection?.waiting&&autoState?.state==='error'?autoState.message:null,collection:internal(s)?collection||null:null,backgroundAutomatic:!!collection?.autoMode,progress:collection?.status==='ready'?{position:collection.index+1,total:collection.ids.length}:{position:1,total:1}};}
    if(m.type==='SELECT_QUEUE'){
      if(importing)throw Error('反映または切り替え処理中です。少しお待ちください。');importing=true;
      try{
        if(!j||!collection||collection.status!=='ready')throw Error('切り替えられる画像がありません。');
        if(m.jobId!==j.id)throw Error('翻訳対象が変わりました。最新の番号を確認してください。');
        if(!Number.isInteger(m.position)||m.position<1||m.position>collection.ids.length)throw Error('画像番号が範囲外です。');
        const index=m.position-1;if(index===collection.index)return {ok:true,position:m.position,total:collection.ids.length};
        const next=await makeJob(collection.ids[index],j.chatTab);if(next.batchId!==collection.id)throw Error('別の話の画像には切り替えられません。');
        const latest=await state();if(latest.job?.id!==j.id)throw Error('翻訳対象が変わりました。');
        const saved=await BatchStore.get(j.recoveryRoot||j.id);if(saved){if(j.recoveryRoot)saved.retry={...saved.retry,context:j.context||[],automation:j.automation};else{saved.context=j.context||[];saved.automation=j.automation;}await BatchStore.put(saved);}
        collection.completed??=collection.ids.slice(0,collection.index);collection.index=index;await chrome.storage.session.set({collection,job:next});await notifyQueue(next);
        return {ok:true,position:m.position,total:collection.ids.length};
      }finally{importing=false;}
    }
    if(m.type==='COLLAGE_APPEND'&&internal(s)){
      if(!collection?.autoMode||collection.id!==m.batchId||collection.stopRequested)throw Error('画像準備を停止しました。');
      if(collection.streamRevision&&collection.streamRevision!==m.revision)throw Error('画像準備の版が変わりました。');
      collection.streamRevision=m.revision;collection.producing=!m.final;
      if(m.id){const item=await BatchStore.get(m.id);if(item?.batchId!==collection.id||item.type!=='collage'||!item.blob||!item.records?.length)throw Error('番号付き画像が未保存です。');
        if(!collection.ids.includes(m.id))collection.ids.push(m.id);
      }
      const completed=new Set(collection.completed||[]),pending=collection.ids.findIndex(id=>!completed.has(id));
      if(pending<0&&m.final){if(!collection.ids.length)throw Error('翻訳対象の文字領域がありません。');await chrome.storage.session.remove(['job','collection']);imageTransferCache=null;await BatchStore.clear();await notifyQueue(j,true);await autoStatus({...autoState,state:'complete',message:'この話の翻訳が完了しました。',position:collection.ids.length,total:collection.ids.length});return {ok:true,batches:collection.ids.length};}
      let next=j;
      if(pending>=0&&(!j||collection.waiting)){next=await makeJob(collection.ids[pending],j?.chatTab);next.context=collection.context||[];collection.index=pending;collection.waiting=false;}
      collection.status='ready';await chrome.storage.session.set({collection,...(next?{job:next}:{})});
      if(next&&!j){await autoStatus({...autoState,state:'running',message:'最初の画像の翻訳を開始中',position:1,total:collection.ids.length});await openAI(next,true);}
      else if(next){const latest=await state();await autoStatus({...latest.autoState,position:collection.index+1,total:collection.ids.length});await notifyQueue(next);}
      return {ok:true,batches:collection.ids.length};
    }
    if(m.type==='GET_CHAPTER'&&internal(s))return {ok:true,chapter:collection?await BatchStore.get(collection.id+':chapter'):null};
    if(m.type==='COLLAGE_READY'&&internal(s)){
      if(!collection||collection.id!==m.batchId)throw Error('画像準備の対象が変わりました。');
      if(j?.automation||collection.index>0||collection.completed?.length)throw Error('翻訳開始後は画像を作り直せません。');
      if(!Array.isArray(m.ids)||!m.ids.length||m.ids.length>1000||new Set(m.ids).size!==m.ids.length)throw Error('画像一覧が不正です。');
      for(const id of m.ids){const item=await BatchStore.get(id);if(item?.batchId!==collection.id||item.type!=='collage'||!item.blob||!item.records?.length)throw Error('番号付き画像が未保存です。');}
      const freshCollection=(await state()).collection;if(freshCollection?.id!==collection.id)throw Error('画像準備の対象が変わりました。');collection.stopRequested=freshCollection.stopRequested;
      const first=await makeJob(m.ids[0],j?.chatTab);collection.ids=m.ids;collection.status='ready';collection.index=0;await chrome.storage.session.set({collection,job:first});await notifyQueue(first);if(collection.autoMode&&!collection.stopRequested){const {autoState}=await state();await autoStatus({...autoState,state:'running',message:'AIを開いて翻訳を開始中',position:1,total:m.ids.length});try{await openAI(first,true);}catch(e){await autoStatus({...autoState,state:'error',message:e.message});throw e;}}return {ok:true,batches:m.ids.length};
    }
    if(m.type==='GET_OCR'&&internal(s))return {ok:true,chapter:collection?await BatchStore.get(collection.id+':chapter'):null};
    if((m.type==='TEXT_READY'||m.type==='UPDATE_OCR')&&internal(s)){
      if(!collection||collection.id!==m.batchId)throw Error('OCR対象の話が変わりました。');
      if(j?.automation)throw Error('送信後のOCR結果は編集できません。先に翻訳を完了または破棄してください。');
      const chapter=await BatchStore.get(collection.id+':chapter');if(!chapter?.records)throw Error('OCR結果がありません。');
      if(m.type==='UPDATE_OCR'){
        if(!Array.isArray(m.edits)||m.edits.length!==chapter.records.length)throw Error('OCR編集の件数が不正です。');
        const edits=new Map(m.edits.map(e=>[e.id,e]));if(edits.size!==chapter.records.length)throw Error('OCRのIDが重複しています。');
        chapter.records=chapter.records.map(r=>{const e=edits.get(r.id);if(!e||typeof e.original!=='string'||e.original.length>1500||typeof e.enabled!=='boolean')throw Error('OCR編集の形式が不正です。');return {...r,original:e.original.trim(),enabled:e.enabled};});await BatchStore.put(chapter);
      }
      const jobs=MangaText.buildJobs(chapter.records,collection,crypto.randomUUID());for(const item of jobs)await BatchStore.put(item);
      const first=await makeJob(jobs[0].id,j?.chatTab);collection.ids=jobs.map(j=>j.id);collection.index=0;collection.status='ready';await chrome.storage.session.set({collection,job:first});return {ok:true,batches:jobs.length,count:chapter.records.filter(r=>r.enabled!==false&&r.original.trim()).length};
    }
    if(m.type==='DISCARD' &&internal(s)){if(collection?.autoMode)await autoStatus({...autoState,state:'paused',message:'翻訳を破棄しました。'});await chrome.storage.session.remove(['job','collection']);imageTransferCache=null;await BatchStore.clear();await notifyQueue(j,true);return {ok:true};}
    if(m.type==='BATCH_READY'&&internal(s)){
      if(!collection||collection.id!==m.batchId||collection.status!=='loading')throw Error('読み込み対象が変わりました。');
      if(!Array.isArray(m.ids)||!m.ids.length||m.ids.length>1000)throw Error('分割画像の一覧が不正です。');
      for(const id of m.ids){const item=await BatchStore.get(id);if(item?.batchId!==collection.id)throw Error('一部の画像が保存されていません。');}
      collection.ids=m.ids;collection.status='ready';collection.index=0;
      const first=await makeJob(m.ids[0]);await chrome.storage.session.set({collection,job:first});return {ok:true};
    }
    if(!j)throw Error(collection?'漫画全体を読み込み中です。':'翻訳待ちの画像がありません。');
    if(m.type==='READY'&&internal(s)){if(m.jobId!==j.id)throw Error('翻訳対象が変わりました。');j.image=m.image;delete j.screenshot;await chrome.storage.session.set({job:j});return {ok:true};}
    if(m.type==='OPEN_CHAT'&&internal(s)){
      if(j.type!=='text'&&!j.image&&!j.imageRef)throw Error('OCRの準備をお待ちください。');
      const selected=await chrome.storage.local.get({aiProvider:'chatgpt'});const key=provider(selected.aiProvider);if(j.automation&&key!==(j.aiProvider||'chatgpt'))throw Error('送信済みの画像は同じAIで開いてください。');if(key!==(j.aiProvider||'chatgpt'))delete j.chatTab;j.aiProvider=key;if(collection){collection.aiProvider=key;await chrome.storage.session.set({collection});}return openAI(j);
    }
    if(m.type==='AUTOMATION_MARK'&&chatAllowed){
      if(importing)throw Error('反映または切り替え処理中です。');
      if(collection?.autoMode&&(collection.stopRequested||autoState?.state!=='running'))throw Error('全自動処理は停止しています。');
      if(j.id!==m.jobId||!['sending','sent'].includes(m.phase))throw Error('自動翻訳の対象が変わりました。');
      if(m.phase==='sending'&&j.automation)throw Error('既に送信済み、または送信状態が不明です。');
      if(m.attemptId&&j.automation?.attemptId!==m.attemptId)throw Error('送信状態が変わりました。');
      const attemptId=m.phase==='sending'?crypto.randomUUID():j.automation?.attemptId;
      j.automation={phase:m.phase,at:Date.now(),...(attemptId?{attemptId}:{})};await chrome.storage.session.set({job:j});return {ok:true,attemptId};
    }
    if(m.type==='AUTOMATION_UNSENT'&&chatAllowed){
      if(importing||j.id!==m.jobId||j.automation?.phase!=='sending'||typeof m.attemptId!=='string'||!m.attemptId||j.automation.attemptId!==m.attemptId)throw Error('未送信の状態を確認できません。');
      delete j.automation;await chrome.storage.session.set({job:j});return {ok:true};
    }
    if(m.type==='AUTOMATION_RESET'&&chatAllowed){
      if(importing)throw Error('反映または切り替え処理中です。');
      if(j.id!==m.jobId)throw Error('自動翻訳の対象が変わりました。');delete j.automation;await chrome.storage.session.set({job:j});return {ok:true};
    }
    if(m.type==='IMPORT_PREVIEW'){
      if(!chatAllowed||j.type!=='collage'||j.id!==m.jobId||collection?.waiting||!['sending','sent'].includes(j.automation?.phase))throw Error('自動送信の対象を確認できません。');
      if(collection?.autoMode&&(collection.stopRequested||autoState?.state!=='running'))throw Error('全自動処理は停止しています。');
      const parsed=MangaCollage.parsePartial(m.text,j),previewId=j.id+':preview';
      const tab=await chrome.tabs.get(j.sourceTab);if(tab.url!==j.url)throw Error('漫画ページが変わりました。');
      const blocks=parsed.blocks.map(b=>({...b,jobId:previewId,blockId:previewId+':'+b.id,provisional:true}));
      const applied=await chrome.tabs.sendMessage(j.sourceTab,{type:'APPLY',blocks,url:j.url,jobId:previewId,provisional:true});
      if(!applied?.ok)throw Error(applied?.error||'漫画ページへの反映に失敗しました。');
      return {ok:true,count:blocks.length};
    }
    if(m.type==='IMPORT'){
      if(collection?.waiting)throw Error('次の画像を準備中です。反映済みの返答は再取り込みできません。');
      if(importing)throw Error('反映処理中です。少しお待ちください。');importing=true;
      try{
        if(m.automatic&&collection?.autoMode&&(collection.stopRequested||autoState?.state!=='running'))throw Error('全自動処理は停止しています。');
        if(m.automatic&&(!chatAllowed||!['sending','sent'].includes(j.automation?.phase)))throw Error('自動送信の状態を確認できません。');
        let target=j;
        if(!m.automatic&&j.type==='collage'&&collection?.status==='ready'){
          const replies=MangaCollage.responses(m.text),ids=[...new Set(replies.map(r=>r.jobId))];
          if(ids.length!==1)throw Error('取り込む画像1枚分のJSON全体を指定してください。');
          const id=ids[0];if(!collection.ids.includes(id)&&id!==j.id)throw Error('この話に対応する番号付き画像のJSONではありません。');
          if(id!==j.id){target=await makeJob(id,j.chatTab);if(target.type!=='collage'||target.batchId!==collection.id||target.sourceTab!==j.sourceTab||target.url!==j.url)throw Error('返答の対象がこの話と一致しません。');}
        }
        const result=target.type==='collage'?await importCollage(m.text,target,!!m.automatic,j.id):await apply(m.text,target,!!m.automatic,j.id);return {...result,appliedJobId:target.id,appliedPosition:collection?collection.ids.indexOf(target.recoveryRoot||target.id)+1:1};
      }finally{importing=false;}
    }
    throw Error('不明な操作です。');
  })().then(respond,e=>respond({ok:false,error:e.message})).finally(()=>release?.());return true;
});
