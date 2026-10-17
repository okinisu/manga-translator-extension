const Debug=typeof MangaDebug!=='undefined'?MangaDebug:null;
const $=s=>document.querySelector(s);let current,chapter,collection,loading=false,refreshing=false,dirty=false,atlasURL,atlasImage,atlasBlob;const previewURLs=[];const sourceBitmaps=new MangaPerformance.BitmapCache();let cropPool,editorDebug=false,renderEpoch=0;
function setEditor(value){const changed=editorDebug!==!!value;editorDebug=!!value;$('#editorTools').hidden=!editorDebug;if(changed)renderRecords();}
function formatGPUStatus(value){return String(value||'GPU情報：未記録').replace(/ ／ /g,'\n');}
function paintDebug(){if(!Debug)return;if(typeof MangaDebugUI!=='undefined')MangaDebugUI.render($('#debugStatus'),Debug.view());else $('#debugStatus').textContent=Debug.summary();}
async function call(type,extra={}){const cached=current;const r=await chrome.runtime.sendMessage({type,...(type==='GET'&&cached?.type==='collage'&&cached.image?{knownImageId:cached.id}:{}),...extra});if(r?.imageUnchanged&&r.job?.id===cached?.id&&cached.image)r.job={...r.job,image:cached.image};if(!r?.ok)throw Error(r?.error||'拡張に接続できません。');if(type==='GET'&&loading&&r.collection?.stopRequested)throw Error('処理を停止しました。');return r;}
function enable(value){for(const id of ['open','apply','copy','download','copyImage','saveEdits','showSource','add'])$('#'+id).disabled=!value;}
function button(id,fn){$('#'+id).onclick=async()=>{try{await fn();}catch(e){$('#status').textContent=e.message;}};}
button('exportDebug',async()=>{const data=Debug?.snapshot();if(!data)throw Error('診断データはありません。');const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='manga-debug-'+Date.now()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);});
button('open',async()=>{if(dirty)throw Error('選択・位置修正を保存してから翻訳してください。');await call('OPEN_CHAT');});
button('copy',async()=>{if(dirty)throw Error('先に選択・位置修正を保存してください。');await navigator.clipboard.writeText($('#prompt').value);$('#status').textContent='依頼文をコピーしました。';});
button('apply',async()=>{if(dirty)throw Error('先に選択・位置修正を保存してください。');const r=await call('IMPORT',{text:$('#result').value});$('#result').value='';$('#status').textContent=`画像 ${r.appliedPosition} の${r.count}件を訳文に置き換えました。`+(r.retry?`欠落${r.missingIds.length}件のうち${r.retryCount}件を再依頼します。`:r.hasNext?'次の画像を準備しました。':'1話分が完了しました。');await refresh();});
button('discard',async()=>{await call('DISCARD');window.close();});button('retry',()=>refresh());
button('clearCache',async()=>{await EpisodeCache.clear();$('#cacheStatus').textContent='保存済みキャッシュを削除しました。処理中の翻訳データは維持しています。';});
button('copyImage',async()=>{if(dirty)throw Error('先に修正を保存してください。');const blob=atlasImage===current.image&&atlasBlob?atlasBlob:await(await fetch(current.image)).blob();await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);$('#status').textContent='画像をコピーしました。ChatGPT入力欄に貼り付けてください。';});
button('download',async()=>{if(dirty)throw Error('先に修正を保存してください。');const a=document.createElement('a');a.href=current.image;a.download='manga-text-'+current.id.replace(/[^a-zA-Z0-9-]/g,'_')+'.png';a.click();});
function note(){dirty=true;$('#status').textContent='選択・位置修正を保存してから翻訳してください。';}
async function canvasFor(box,images,timing){const c=document.createElement('canvas');c.width=Math.ceil(box.width);c.height=Math.ceil(box.height);if(c.width*c.height>5000000)throw Error('切り抜きが大きすぎます。');const ctx=c.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,c.width,c.height);
 for(const im of images){const top=Math.max(im.top,box.y),bottom=Math.min(im.top+im.height,box.y+box.height);if(bottom<=top)continue;await sourceBitmaps.use(collection.id+':source:'+im.index,async()=>{const cached=await BatchStore.get(collection.id+':source:'+im.index);if(!cached)throw Error('元画像がありません。');return createImageBitmap(cached.blob);},bitmap=>ctx.drawImage(bitmap,box.x,top-im.top,box.width,bottom-top,0,top-box.y,box.width,bottom-top),timing?data=>{timing.bitmapQueueMs=(timing.bitmapQueueMs||0)+data.queueMs;timing.bitmapWorkMs=(timing.bitmapWorkMs||0)+data.workMs;}:undefined);}

 return c;
}
function blobFor(c){return new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('画像を作成できません。')),'image/png'));}
function colors(c){return MangaColors.colors(c);}
async function recrop(r,windowCanvas,windowY=0,encode=editorDebug){let c;const b=r.box;if(windowCanvas&&b.x>=0&&b.y>=windowY&&b.x+b.width<=windowCanvas.width&&b.y+b.height<=windowY+windowCanvas.height){c=document.createElement('canvas');c.width=Math.ceil(b.width);c.height=Math.ceil(b.height);const ctx=c.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(windowCanvas,b.x,b.y-windowY,b.width,b.height,0,0,b.width,b.height);}else c=await canvasFor(b,chapter.images);return {...r,...MangaCollage.anchor(r.box,chapter.images),...colors(c),cropBox:{...r.box},cropBlob:encode?await blobFor(c):undefined};}
async function cropRegions(records,canvas,windowY){
 const inside=records.filter(({box:b})=>b.x>=0&&b.y>=windowY&&b.x+b.width<=canvas.width&&b.y+b.height<=windowY+canvas.height);
 const encoded=inside.length?await cropPool.run(canvas,inside,windowY,editorDebug):[];
 const ready=new Map(encoded?inside.map((r,i)=>[r,{...r,...MangaCollage.anchor(r.box,chapter.images),...encoded[i],cropBox:{...r.box}}]):[]);
 return MangaPerformance.mapLimit(records,2,r=>ready.get(r)||recrop(r,canvas,windowY));
}
async function showSource(){const n=Number($('#addImage').value)-1,im=chapter.images[n];if(!im)throw Error('画像番号が不正です。');const c=$('#preview');c.hidden=false;c.width=im.width;c.height=im.height;await sourceBitmaps.use(collection.id+':source:'+n,async()=>{const cached=await BatchStore.get(collection.id+':source:'+n);if(!cached)throw Error('元画像がありません。');return createImageBitmap(cached.blob);},bitmap=>c.getContext('2d').drawImage(bitmap,0,0));c.scrollIntoView({block:'nearest'});}
button('showSource',showSource);
button('add',async()=>{const im=chapter.images[Number($('#addImage').value)-1];if(!im)throw Error('画像番号が不正です。');const box={x:Number($('#addX').value),y:Number($('#addY').value)+im.top,width:Number($('#addW').value),height:Number($('#addH').value)};validateBox(box);chapter.records.push(await recrop({id:String(chapter.records.length+1).padStart(6,'0'),box,kind:1,score:1,enabled:true}));note();renderRecords();});
function validateBox(b){if(!Object.values(b).every(Number.isFinite)||b.x<0||b.y<0||b.width<10||b.height<8||b.x+b.width>chapter.images[0].width||b.y+b.height>chapter.images.at(-1).top+chapter.images.at(-1).height||b.width*b.height>5000000)throw Error('切り抜きの位置・サイズが不正です。');}
function renderRecords(){for(const u of previewURLs)URL.revokeObjectURL(u);previewURLs.length=0;const list=$('#ocrList');list.replaceChildren();const epoch=++renderEpoch;if(!chapter||!editorDebug)return;
 for(const r of chapter.records){if(!r.cropBox)r.cropBox={...r.box};const box=document.createElement('div');box.dataset.record=r.id;box.style.cssText='padding:8px;border-bottom:1px solid #ddd';const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=r.enabled!==false;check.onchange=()=>{r.enabled=check.checked;note();};label.append(check,document.createTextNode(`ID ${r.id} — 画像${r.imageIndex+1} ${({0:'クラス0：吹き出し (bubble)',1:'クラス1：吹き出し内の文字 (text_bubble)',2:'クラス2：吹き出し外の文字 (text_free)・要確認'})[r.kind]||'クラス不明'} 検出${Math.round(r.score*100)}%`));const image=document.createElement('img');const attach=blob=>{if(epoch!==renderEpoch||!editorDebug)return;const u=URL.createObjectURL(blob);previewURLs.push(u);image.src=u;};if(r.cropBlob instanceof Blob)attach(r.cropBlob);else recrop(r,undefined,0,true).then(value=>{if(epoch===renderEpoch&&editorDebug){Object.assign(r,value);attach(value.cropBlob);}}).catch(e=>{if(epoch===renderEpoch)$('#status').textContent=e.message;});image.loading='lazy';image.alt='ID '+r.id;image.style.cssText='max-width:100%;max-height:240px;display:block';const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='位置を修正（元画像ピクセル）';details.append(summary);
 for(const [key,name] of [['x','左'],['y','上（話全体）'],['width','幅'],['height','高さ']]){const lab=document.createElement('label'),input=document.createElement('input');input.type='number';input.value=Math.round(r.box[key]);input.dataset.coord=key;lab.append(name+' ',input);details.append(lab);input.onchange=()=>{r.box[key]=Number(input.value);note();};}
 const preview=document.createElement('button');preview.className='secondary';preview.textContent='元画像を見る';preview.onclick=()=>{$('#addImage').value=r.imageIndex+1;showSource().catch(e=>$('#status').textContent=e.message);};box.append(label,image,details,preview);list.append(box);}
}
async function savePages(pages,revision,start=0,onSaved){const ids=[];
 for(let i=0;i<pages.length;i++){const p=pages[i],c=document.createElement('canvas');c.width=p.width;c.height=p.height;const ctx=c.getContext('2d');ctx.fillStyle='#e5e7eb';ctx.fillRect(0,0,c.width,c.height);ctx.font='bold 22px sans-serif';
  const records=await MangaPerformance.mapLimit(p.entries,1,async e=>{ctx.fillStyle='#fff';ctx.fillRect(e.x-4,e.y-34,e.cellWidth-16,e.height+42);ctx.fillStyle='#111';ctx.fillText('ID '+e.id,e.x+4,e.y-9);await MangaRegionImage.draw(ctx,e.record,chapter.images,collection.id,e,sourceBitmaps);const {cropBlob,cropBox,...r}=e.record;return r;});
  const blob=await blobFor(c);if(blob.size>20*1024*1024){if(p.entries.length===1)throw Error('1領域の翻訳画像が20MBを超えています。切り抜き範囲を小さくしてください。');const entries=p.entries.map(e=>e.record),middle=Math.ceil(entries.length/2);pages.splice(i,1,...MangaCollage.pages(entries.slice(0,middle),chapter.batchMode),...MangaCollage.pages(entries.slice(middle),chapter.batchMode));i--;continue;}const id=revision+':collage:'+(start+i);const existing=onSaved?await BatchStore.get(id):null;if(existing&&JSON.stringify(existing.records)!==JSON.stringify(records))throw Error('送信済み画像の領域が変わりました。');if(!existing)await BatchStore.put({id,batchId:collection.id,type:'collage',sourceTab:collection.sourceTab,url:collection.url,blob,records,sourceLanguage:chapter.sourceLanguage,targetLanguage:chapter.targetLanguage,customInstructions:chapter.customInstructions||'',batchMode:chapter.batchMode,context:[]});ids.push(id);if(onSaved)await onSaved(id);
 }
 return ids;
}
async function pack(){const info=await call('GET');if(info.collection?.id!==collection.id)throw Error('処理対象が変わりました。');if((info.job?.automation||info.collection.index>0||info.collection.completed?.length)&&!(collection.autoMode&&info.collection.producing))throw Error('翻訳開始後は切り抜きの修正・追加はできません。');for(const r of chapter.records)validateBox(r.box);
 const pages=MangaCollage.pages(chapter.records,chapter.batchMode),revision=collection.autoMode?(info.collection.streamRevision||collection.id):crypto.randomUUID(),ids=[];
 await BatchStore.put(chapter);const saved=await savePages(pages,revision,0,collection.autoMode?async id=>call('COLLAGE_APPEND',{batchId:collection.id,id,revision}):undefined);ids.push(...saved);
 const r=collection.autoMode?await call('COLLAGE_APPEND',{batchId:collection.id,revision,final:true}):await call('COLLAGE_READY',{batchId:collection.id,ids});for(const oldId of info.collection.ids||[])if(!ids.includes(oldId))await BatchStore.remove(oldId).catch(()=>{});dirty=false;$('#status').textContent=`${chapter.records.filter(r=>r.enabled!==false).length}領域を${r.batches}枚の画像にまとめました。`;return r;
}
button('saveEdits',async()=>{enable(false);try{for(const r of chapter.records)validateBox(r.box);for(let i=0;i<chapter.records.length;i++){const r=chapter.records[i];if(!r.cropBlob||!MangaPerformance.sameBox(r.cropBox,r.box))chapter.records[i]=await recrop(r,undefined,0,true);}await pack();await refresh();}finally{enable(!!current);}});
async function prepare(input){if(loading)return;loading=true;cropPool=new MangaPerformance.CropPool(2);collection=input;enable(false);$('#retry').hidden=true;
 try{await navigator.locks.request('manga-collage-loader',input.autoMode?{}:{ifAvailable:true},async lock=>{if(!lock)throw Error('別の確認画面で処理中です。');const fresh=await call('COLLECTION_CHECK',{batchId:input.id});if(fresh.collection?.id!==input.id)throw Error('処理を中止しました。');if(input.autoMode&&fresh.collection.status==='ready'&&!fresh.collection.producing)return;
  const cacheSettings=await chrome.storage.local.get({editorDebug:false,customInstructions:'',sourceLanguage:'ko',targetLanguage:'ja',detectorBackend:'auto',detectorDebug:false,detectorParallel:1,detectorThreads:2,detectorGpuPower:'high-performance',detectorGpuPrecision:'auto',detectorGpuCapture:'auto',detectorGpuParallel:2,batchMode:'balanced'});setEditor(cacheSettings.editorDebug);cacheSettings.customInstructions=MangaCollage.normalizeMemory(input.customInstructions??cacheSettings.customInstructions);cacheSettings.batchMode=MangaCollage.batchProfile(input.batchMode??(input.streamRevision?'compact':cacheSettings.batchMode)).name;cacheSettings.detectorBackend=cacheSettings.detectorBackend==='wasm'?'wasm':'auto';const cacheInput={...input,detectorGpuCapture:['on','off'].includes(cacheSettings.detectorGpuCapture)?cacheSettings.detectorGpuCapture:'auto',detectorBackend:cacheSettings.detectorBackend,detectorGpuPower:cacheSettings.detectorGpuPower,detectorGpuPrecision:['fp32','fp16','fp16-full','tensor-fp16','tensor-int8'].includes(cacheSettings.detectorGpuPrecision)?cacheSettings.detectorGpuPrecision:'auto'};Debug?.begin(!!cacheSettings.detectorDebug,{backend:cacheSettings.detectorBackend,parallel:cacheSettings.detectorParallel});if(Debug){$('#debugStatus').hidden=$('#exportDebug').hidden=!cacheSettings.detectorDebug;paintDebug();}const initialRecords=records=>input.streamRevision?records:records.map(r=>r.kind===2?{...r,enabled:true}:r);const acquisitionAt=performance.now();let saved;try{saved=await EpisodeCache.get(cacheInput);}catch(e){$('#cacheStatus').textContent='キャッシュを読めないため通常処理します：'+e.message;}
  if(saved){Debug?.event('cache-hit');$('#gpuStatus').textContent='保存時の'+(saved.chapter.detectionGPU||'GPU情報：未記録')+'（今回は推論なし）';$('#backendStatus').textContent='保存済み検出結果：'+(saved.chapter.detectionBackend||'CPU（WASM）');$('#cacheStatus').textContent=`保存済みキャッシュを再利用：元画像${saved.sources.length}枚・文字領域${saved.chapter.records.length}件（画像取得・モデル検出を省略）`;for(let i=0;i<saved.sources.length;i+=8){if((await call('COLLECTION_CHECK',{batchId:input.id})).collection?.id!==input.id)throw Error('処理を中止しました。');await BatchStore.putMany(saved.sources.slice(i,i+8).map((source,n)=>({...source,id:input.id+':source:'+(i+n),batchId:input.id})));}chapter={...saved.chapter,records:initialRecords(saved.chapter.records),batchMode:cacheSettings.batchMode,sourceLanguage:cacheSettings.sourceLanguage,targetLanguage:cacheSettings.targetLanguage,customInstructions:cacheSettings.customInstructions,id:input.id+':chapter',batchId:input.id};await BatchStore.put(chapter);renderRecords();await pack();return;}
  $('#cacheStatus').textContent='この話の保存済みキャッシュはありません。画像取得・文字検出を実行します。';const images=[];let top=0,bytes=0,completed=0;
  const parts=[],regions=[],todo=[];let detected=0,active=0,parallel=0,resumedBackend,resumedGPU,sourceIndex=0,phase='waiting',lastProgress;
  const progress=()=>{
   const total=downloadsDone&&sourceIndex===input.urls.length?MangaCore.slices(top,1800,400).length:'…';
   const detail=phase==='starting'?'モデル起動中':phase==='running'?`${ComicDetector.backend||'CPU'}・${parallel}並列・実行中${active}`:'検出待ち';
   const message=`画像取得：${completed}/${input.urls.length} ｜ 文字検出：${detected}/${total} ｜ ${detail}`;
   if(lastProgress===message)return;lastProgress=message;$('#progress').textContent=message;
   if(input.autoMode)void chrome.runtime.sendMessage({type:'AUTO_REPORT',batchId:input.id,message}).catch(()=>{});
  };
  let downloadError,downloadsDone=false,sourceWake=()=>{};const available=new Array(input.urls.length);
  progress();
  const downloads=MangaPerformance.mapLimit(input.urls,3,async(src,i)=>{if((await call('COLLECTION_CHECK',{batchId:input.id})).collection?.id!==input.id)throw Error('処理を中止しました。');const id=input.id+':source:'+i;let cached=await BatchStore.get(id);
   if(!cached){if(!MangaCore.episodeImage(src,input.url))throw Error('別の話の画像は読み込めません。');const response=await fetch(src,{credentials:'omit',redirect:'error',signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error(`画像${i+1}を取得できません（${response.status}）。`);const blob=await response.blob();if(!blob.type.startsWith('image/')||blob.size>20*1024*1024)throw Error('元画像の形式・容量が不正です。');const im=await createImageBitmap(blob);try{if(im.width<100||im.width>4096||im.height>60000||im.width*im.height>40000000)throw Error('画像サイズが不正です。');cached={id,batchId:input.id,blob,width:im.width,height:im.height};if((await call('COLLECTION_CHECK',{batchId:input.id})).collection?.id!==input.id)throw Error('処理を中止しました。');await BatchStore.put(cached);}finally{im.close();}}
   bytes+=cached.blob.size;if(bytes>256*1024*1024)throw Error('元画像合計が256MBを超えています。');completed++;progress();available[i]={src,index:i,width:cached.width,height:cached.height};sourceWake();return available[i];
  });
  downloads.then(()=>{downloadsDone=true;progress();Debug?.event('source-acquisition',{ms:performance.now()-acquisitionAt});sourceWake();},e=>{downloadError=e;sourceWake();});
  try{
  chapter={batchMode:cacheSettings.batchMode,sourceLanguage:cacheSettings.sourceLanguage,targetLanguage:cacheSettings.targetLanguage,customInstructions:cacheSettings.customInstructions,id:input.id+':chapter',batchId:input.id,images,records:[]};
  async function* readyWindows(){
   let emitted=0;
   while(true){
    if(downloadError)throw downloadError;
    while(available[sourceIndex]){const im=available[sourceIndex++];if(images.length&&im.width!==images[0].width)throw Error('本文画像の幅が異なるため、連結処理できません。');images.push({...im,top});top+=im.height;}progress();
    const final=downloadsDone&&sourceIndex===input.urls.length;
    const planned=top?MangaCore.slices(top,1800,400):[];
    while(emitted<planned.length&&(final||planned[emitted].y+planned[emitted].height+12<top)){
     const n=emitted++,part=planned[n];parts[n]=part;regions.length=parts.length;
     const cached=await BatchStore.get(input.id+':detection:'+n);
     if(EpisodeCache.validWindow(cached,cacheInput,part,images[0].width)){regions[n]=initialRecords(cached.records);resumedBackend=cached.detectionBackend;resumedGPU=cached.detectionGPU;detected++;progress();await publish();}
     else {todo.push({part,n});yield {part,n};}
    }
    if(final)break;
    await new Promise(resolve=>{sourceWake=resolve;if(downloadError||downloadsDone||available[sourceIndex])resolve();});
   }
  }

  // Only the contiguous prefix can be numbered. Keep boundary-overlapping boxes
  // provisional until later windows can no longer change deduplication.
  let publishTail=Promise.resolve(),publishedLayouts=0,publishedPages=0,publishedPrefix=-1;
  const initial=await call('COLLECTION_CHECK',{batchId:input.id});const revision=initial.collection.streamRevision||input.id;
  const publish=(final=false)=>{const queuedAt=performance.now();const task=publishTail.then(async()=>{
   const began=performance.now();if(!input.autoMode)return {publishQueueMs:0,publishWorkMs:0};
   let end=0;while(end<regions.length&&regions[end])end++;
   if(!final&&end===publishedPrefix)return {publishQueueMs:began-queuedAt,publishWorkMs:performance.now()-began};publishedPrefix=end;
   const sorted=MangaCollage.dedupe(regions.slice(0,end).flat());
   const cutoff=final?Infinity:(parts[end]?.y??(parts.at(-1)?parts.at(-1).y+1400:0))-12;
   let safe=0;while(safe<sorted.length&&sorted[safe].box.y+sorted[safe].box.height<cutoff)safe++;
   if(final)safe=sorted.length;
   chapter.records=sorted.slice(0,safe).map((r,i)=>({...r,id:String(i+1).padStart(6,'0')}));
   chapter.detectionBackend=ComicDetector.backend||resumedBackend;chapter.detectionGPU=ComicDetector.gpuLabel||resumedGPU;
   const pages=chapter.records.some(r=>r.enabled!==false)?MangaCollage.pages(chapter.records,chapter.batchMode):[];
   const count=final?pages.length:Math.max(0,pages.length-(pages.at(-1)?.entries.length===MangaCollage.batchProfile(chapter.batchMode).maxEntries?0:1));
   if(count<publishedLayouts)throw Error('確定済み画像の順序が変わりました。');
   if(!final&&count===publishedLayouts)return {publishQueueMs:began-queuedAt,publishWorkMs:performance.now()-began};
   await BatchStore.put(chapter);
   for(let i=publishedLayouts;i<count;i++){
    const ids=await savePages([pages[i]],revision,publishedPages,async id=>{await call('COLLAGE_APPEND',{batchId:input.id,id,revision});});
    // Oversized PNGs may split one layout page into several immutable images.
    publishedPages+=ids.length;publishedLayouts=i+1;
   }
   if(final)await call('COLLAGE_APPEND',{batchId:input.id,revision,final:true});
   return {publishQueueMs:began-queuedAt,publishWorkMs:performance.now()-began};
  });publishTail=task;return task;};
  const pendingWindows=readyWindows();const first=await pendingWindows.next();
  if(!first.done){if((await call('COLLECTION_CHECK',{batchId:input.id})).collection?.id!==input.id)throw Error('処理を中止しました。');const settings=cacheSettings;const requested=MangaPerformance.parallelism(settings.detectorParallel,navigator,Infinity);phase='starting';progress();parallel=await ComicDetector.start(requested,settings.detectorBackend,!!cacheSettings.detectorDebug,{threads:settings.detectorThreads,gpuRuntime:'jsep',powerPreference:settings.detectorGpuPower,precision:settings.detectorGpuPrecision,graphCapture:settings.detectorGpuCapture,gpuParallel:settings.detectorGpuParallel,remaining:Infinity});Debug?.event('detector-start',{backend:ComicDetector.backend,parallel,gpuInfo:ComicDetector.gpuInfo});for(const item of ComicDetector.startupDebug||[])Debug?.event('worker-start',{backend:item.backend,ms:item.startupMs,runtime:item.runtime});$('#gpuStatus').textContent=formatGPUStatus(ComicDetector.gpuLabel);$('#backendStatus').textContent=`検出方式：${ComicDetector.backend}`+(ComicDetector.reason?` — ${ComicDetector.reason}`:'');
   phase='running';progress();
   const stream=(async function*(){yield first.value;yield* pendingWindows;})();
   await MangaPerformance.pipeline(stream,parallel,Math.min(2,parallel),async({part,n})=>{
    const windowAt=performance.now();if((await call('COLLECTION_CHECK',{batchId:input.id})).collection?.id!==input.id)throw Error('処理を中止しました。');active++;progress();
    let canvas;try{const canvasAt=performance.now(),bitmapTiming=cacheSettings.detectorDebug?{}:undefined;let diagnostic;
     canvas=await canvasFor({x:0,y:part.y,width:images[0].width,height:part.height},images,bitmapTiming);const canvasEndAt=performance.now(),found=await ComicDetector.detect(canvas,undefined,d=>{diagnostic=d;},{opaque:true});
     return {part,n,windowAt,canvasAt,canvas,canvasMs:canvasEndAt-canvasAt,bitmapTiming,diagnostic,found,inferredAt:performance.now()};
    }catch(e){if(canvas){canvas.width=1;canvas.height=1;}throw e;}finally{active--;progress();}
   },async({part,n,windowAt,canvasAt,canvas,canvasMs,bitmapTiming,diagnostic,found,inferredAt})=>{
    const cropAt=performance.now(),postQueueMs=cropAt-inferredAt,candidates=[];
    try{
     for(const d of found){const b=d.box,center=part.y+b.y+b.height/2;if(center<part.ownTop||center>=part.ownBottom)continue;const pad=12,x=Math.max(0,Math.floor(b.x-pad)),y=Math.max(0,Math.floor(part.y+b.y-pad)),right=Math.min(images[0].width,Math.ceil(b.x+b.width+pad)),bottom=Math.min(top,Math.ceil(part.y+b.y+b.height+pad));const box={x,y,width:right-x,height:bottom-y};candidates.push({box,kind:d.kind,score:d.score,enabled:true});}
     const region=await cropRegions(candidates,canvas,part.y);const cropMs=performance.now()-cropAt,checkAt=performance.now();
     if((await call('COLLECTION_CHECK',{batchId:input.id})).collection?.id!==input.id)throw Error('処理を中止しました。');const storeAt=performance.now(),storeControlMs=storeAt-checkAt;
     await BatchStore.put({id:input.id+':detection:'+n,batchId:input.id,cacheKey:EpisodeCache.windowKey(cacheInput,part,images[0].width),detectionBackend:ComicDetector.backend||'CPU（WASM）',detectionGPU:ComicDetector.gpuLabel||'GPU情報：未記録',records:region});const storedAt=performance.now();regions[n]=region;detected++;const publishTiming=await publish();
     Debug?.window({index:n+1,regions:region.length,backend:diagnostic?.backend||ComicDetector.backend,canvasMs,cropMs,storeMs:storedAt-storeAt,storeControlMs,postQueueMs,controlMs:canvasAt-windowAt,windowMs:performance.now()-windowAt,...bitmapTiming,...publishTiming,...diagnostic,workerIndex:diagnostic?.workerIndex,requestStartMs:diagnostic?.requestStartedAt===undefined?undefined:Debug.elapsed(diagnostic.requestStartedAt),requestEndMs:diagnostic?.requestEndedAt===undefined?undefined:Debug.elapsed(diagnostic.requestEndedAt)});
     if(Debug&&cacheSettings.detectorDebug)paintDebug();$('#gpuStatus').textContent=formatGPUStatus(ComicDetector.gpuLabel);$('#backendStatus').textContent=`検出方式：${ComicDetector.backend} — 直近の推論・1並列換算（概算） ${Math.round(ComicDetector.normalizedInferenceMs||0)}ms`+(ComicDetector.reason?`（${ComicDetector.reason}）`:'');progress();
    }finally{canvas.width=1;canvas.height=1;}
   },{capacity:parallel+Math.min(2,parallel),dispose:({canvas})=>{canvas.width=1;canvas.height=1;}});Debug?.event('detection-complete');
  }
  await downloads;const records=regions.flat();
  chapter.records=MangaCollage.dedupe(records).map((r,i)=>({...r,id:String(i+1).padStart(6,'0')}));chapter.detectionBackend=todo.length?(ComicDetector.backend||'CPU（WASM）'):resumedBackend;chapter.detectionGPU=todo.length?(ComicDetector.gpuLabel||'GPU情報：未記録'):resumedGPU;if(!todo.length){$('#backendStatus').textContent='保存済み検出結果：'+chapter.detectionBackend;$('#gpuStatus').textContent='保存時の'+chapter.detectionGPU+'（今回は推論なし）';}await BatchStore.put(chapter);try{const kept=await EpisodeCache.put(cacheInput,chapter);$('#cacheStatus').textContent=kept?'元画像・検出結果を保存しました（最大3話・256MB・7日間）。':'容量上限を超えたため、この話のキャッシュは保存しませんでした。';}catch(e){$('#cacheStatus').textContent='キャッシュ保存に失敗しました：'+e.message;}renderRecords();if(input.autoMode)await publish(true);else await pack();
  }finally{await downloads.catch(()=>{});}
 });Debug?.event('complete');if(Debug?.snapshot())paintDebug();}catch(e){if(input.autoMode&&!/処理を停止/.test(e.message))await chrome.runtime.sendMessage({type:'AUTO_REPORT',batchId:input.id,error:true,message:e.message}).catch(()=>{});Debug?.event('error',{message:e.message});paintDebug();$('#status').textContent=e.message+' 再開ボタンで再試行できます。';$('#retry').hidden=false;}finally{cropPool?.close();cropPool=null;await ComicDetector.close();await sourceBitmaps.clear();loading=false;}
}
async function refresh(){if(refreshing)return;refreshing=true;try{const preferences=await chrome.storage.local.get({editorDebug:false});setEditor(preferences.editorDebug);let info=await call('GET');if(collection?.id!==info.collection?.id&&!loading)await sourceBitmaps.clear();collection=info.collection;if(collection?.status==='loading'||collection?.producing){await prepare(collection);info=await call('GET');collection=info.collection;}current=info.job;if(!current){enable(false);$('#progress').textContent=collection?'画像の準備は未完了です。':'翻訳待ちの画像はありません。';if(collection){if(!dirty||chapter?.batchId!==collection.id){chapter=await BatchStore.get(collection.id+':chapter');dirty=false;}if(chapter?.images?.length){renderRecords();for(const id of ['saveEdits','showSource','add'])$('#'+id).disabled=false;}}return;}if(current.type!=='collage')throw Error('旧版の処理が残っています。破棄してから開始してください。');if(!dirty||chapter?.batchId!==collection.id){chapter=await BatchStore.get(collection.id+':chapter');dirty=false;}if(!dirty)renderRecords();if(chapter.detectionGPU&&!$('#gpuStatus').textContent)$('#gpuStatus').textContent='前回の'+chapter.detectionGPU;$('#progress').textContent=`1話の検出${chapter.records.length}領域 — 翻訳画像 ${info.progress.position}/${info.progress.total}`;$('#prompt').value=MangaCore.prompt(current);if(atlasImage!==current.image||!atlasURL){const blob=await(await fetch(current.image)).blob();if(atlasURL)URL.revokeObjectURL(atlasURL);atlasBlob=blob;atlasImage=current.image;atlasURL=URL.createObjectURL(blob);$('#atlas').src=atlasURL;}enable(true);if(current.automation||collection.index>0||collection.completed?.length)for(const id of ['saveEdits','add'])$('#'+id).disabled=true;}catch(e){$('#status').textContent=e.message;}finally{refreshing=false;}}
chrome.storage.onChanged.addListener((c,area)=>{if(area==='local'&&c.editorDebug){setEditor(c.editorDebug.newValue);return;}if(area==='session'&&(c.job||c.collection)&&!loading&&!refreshing)refresh();});refresh();
