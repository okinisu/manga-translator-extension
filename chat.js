(() => {
  const ai=typeof MangaAIDOM==='undefined'?null:MangaAIDOM,aiName=ai?.name||'ChatGPT';
  let current,info,attachedJob,manualController,queueFinished=false,syncPending=false,syncing=false;const host=document.createElement('div');host.style.cssText='position:fixed;right:16px;top:90px;z-index:2147483647';const root=host.attachShadow({mode:'closed'});
  root.innerHTML=`<style>:host{all:initial}.panel{font:14px/1.5 system-ui;background:#fff;color:#14253b;border:1px solid #91a5c5;border-radius:12px;padding:14px;width:285px;max-height:calc(100vh - 110px);overflow:auto;box-shadow:0 5px 25px #0003}button{display:block;width:100%;padding:9px;border:0;border-radius:6px;background:#225cbe;color:white;margin-top:8px;cursor:pointer}button:disabled{opacity:.5;cursor:wait}button.secondary{background:#e5eaf3;color:#263b56}p{margin:8px 0;font-size:12px}textarea{box-sizing:border-box;width:100%;height:70px}summary{cursor:pointer}</style><details class="panel" open><summary>漫画翻訳 <small>v1.0.0</small></summary><p id="progress"></p><div style="display:flex;gap:6px"><button id="previous" class="secondary">前へ</button><button id="next" class="secondary">次へ</button></div><label style="font-size:12px">画像番号 <input id="position" type="number" min="1" step="1" value="1" style="width:65px"></label><button id="jump" class="secondary">指定番号へ切り替え</button><button id="refresh" class="secondary">進捗を再取得</button><img id="jobPreview" alt="選択中の番号付き原文画像" hidden style="width:100%;max-height:160px;object-fit:contain"><p>切り替え後は入力欄の古い依頼文と添付を消し、「画像＋依頼文を準備」を押してください。</p><button id="prepare">画像＋依頼文を準備</button><p>画像の添付完了を確認してから「準備完了」と表示します。その後、ChatGPTの送信ボタンを押してください。</p><button id="auto">全自動で翻訳を開始 / 再開</button><button id="stop" class="secondary" disabled>処理を停止</button><p>番号付き画像を送信 → 読み取り・翻訳 → 訳文の反映を順番に実行します。このChatGPTタブを開いたままにしてください。</p><details><summary>手動操作・送信状態の修復</summary><button id="prompt">依頼文だけを入力（画像は別途添付）</button><button id="copy">画像をコピー</button><button id="apply">返答を漫画に反映</button><button id="reset" class="secondary">未送信としてやり直す</button><textarea id="fallback" readonly></textarea><button id="copyPrompt">依頼文をコピー</button></details><details><summary>AI応答時間</summary><p id="responseTiming"></p><p>このタブの自動送信・直近200件。送信クリックから翻訳JSONの生成完了検知まで（アップロードを除く）。中断・失敗・送信済み依頼の再開は平均に含めません。モデル別の集計ではありません。</p><button id="resetTiming" class="secondary">応答時間の計測をリセット</button></details><p id="status" role="status"></p></details>`.replaceAll('ChatGPT',aiName);
  if(typeof MangaUI!=='undefined')MangaUI.attach(root);
  const $=s=>root.querySelector(s);
  async function call(type,extra={}){const r=await chrome.runtime.sendMessage({type,...extra});if(!r?.ok)throw Error(r?.error||'接続できません。');return r;}
  const responseTiming=new MangaAutomation.ResponseTiming();
  function paintResponseTiming(){
    const t=responseTiming.snapshot(),seconds=ms=>(ms/1000).toFixed(1)+'秒';
    $('#responseTiming').textContent=(t.count?'平均 '+seconds(t.meanMs)+' ／ 直近 '+seconds(t.lastMs)+' ／ '+t.count+'件\n返答確定待ち（直近） '+seconds(t.confirmationMs):'まだ計測結果はありません。')+(t.waitingMs===null?'':'\n現在の応答待ち '+seconds(t.waitingMs));
    $('#responseTiming').style.whiteSpace='pre-line';
  }
  paintResponseTiming();
  let imageBlobEntry;
  function imageBlob(j){
    if(imageBlobEntry?.id===j.id&&imageBlobEntry.image===j.image)return imageBlobEntry.promise;
    const entry={id:j.id,image:j.image};imageBlobEntry=entry;
    entry.promise=fetch(j.image).then(r=>r.blob()).catch(e=>{if(imageBlobEntry===entry)imageBlobEntry=null;throw e;});return entry.promise;
  }
  async function get(){const cached=current;info=await call('GET',cached?.type==='collage'&&cached.image?{knownImageId:cached.id}:{});if(info.imageUnchanged&&info.job?.id===cached?.id&&cached.image)info.job={...info.job,image:cached.image};if(info.pipelineError)throw Error(info.pipelineError);const j=info.job;if(!j&&info.finished){finishQueue();return null;}if(!j&&info.waiting){$('#progress').textContent='次の画像を準備中';return null;}if(!j||(j.type!=='text'&&!j.image))throw Error('確認画面で番号付き画像を準備してください。');current=j;queueFinished=false;$('#position').value=info.progress.position;$('#position').max=info.progress.total;$('#jobPreview').hidden=j.type==='text';if(j.image&&$('#jobPreview').src!==j.image)$('#jobPreview').src=j.image;if(j.type!=='text'&&!j.automation)void imageBlob(j).catch(()=>{});$('#copy').hidden=j.type==='text';$('#fallback').value=MangaCore.prompt(j);if(!runner.running)$('#progress').textContent=`翻訳 ${info.progress.position} / ${info.progress.total}`;return j;}
  function abort(signal){if(signal?.aborted)throw new DOMException('停止しました。','AbortError');}
  function delay(ms,signal){return new Promise((resolve,reject)=>{abort(signal);const cancel=()=>{clearTimeout(timer);reject(new DOMException('停止しました。','AbortError'));};const timer=setTimeout(()=>{signal?.removeEventListener('abort',cancel);resolve();},ms);signal?.addEventListener('abort',cancel,{once:true});});}
  function visible(el){return el&&el.getClientRects().length>0&&!el.closest('[hidden]');}
  function editor(){if(ai)return ai.editor();return Array.from(document.querySelectorAll('[data-composer-markdown][contenteditable="true"],#prompt-textarea,[contenteditable="true"][role="textbox"],textarea[data-id="root"]')).find(visible);}
  function scope(){if(ai)return ai.scope();const input=editor();if(!input)throw Error(aiName+'の入力欄が見つかりません。ログイン状態とChatモードを確認してください。');let ancestor=input;while(ancestor&&ancestor!==document.body){if(ancestor.querySelector('input[type="file"]'))return ancestor;ancestor=ancestor.parentElement;}return input.closest('form')||input.parentElement.parentElement;}
  function composer(){if(ai)return ai.scope();return editor()?.closest('[data-composer-body]')||scope();}
  function normalizePrompt(text){return text.replace(/\r\n?/g,'\n').replace(/\u00a0/g,' ').split(/\n+/).map(line=>line.trim()).filter(Boolean).join('\n');}
  function content(input){return (input.tagName==='TEXTAREA'?input.value:input.innerText).trim();}
  function putPrompt(j){const input=editor();if(!input)throw Error(aiName+'の入力欄が見つかりません。');const expected=MangaCore.prompt(j),existing=content(input);if(existing&&normalizePrompt(existing)!==normalizePrompt(expected))throw Error('入力欄に別の文章があります。空にしてから再開してください。');if(normalizePrompt(existing)===normalizePrompt(expected))return;input.focus();if(input.tagName==='TEXTAREA'){Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,expected);input.dispatchEvent(new Event('input',{bubbles:true}));}else{if(!document.execCommand('insertText',false,expected))throw Error('依頼文を入力できませんでした。');}if(normalizePrompt(content(input))!==normalizePrompt(expected))throw Error('入力欄への反映を確認できませんでした。');}
  function buttons(){return Array.from(document.querySelectorAll('button')).filter(visible);}
  function sendButton(){if(ai)return ai.sendButton();return Array.from(composer().querySelectorAll('button')).filter(visible).find(b=>b.getAttribute('data-testid')==='send-button'||/^(送信|Send|Send message|Send prompt|メッセージを送信|プロンプトを送信)$/i.test(b.getAttribute('aria-label')||''));}
  function streaming(){if(ai)return ai.streaming();return buttons().some(b=>b.getAttribute('data-testid')==='stop-button'||/^(生成を停止|停止|Stop generating|Stop streaming)$/i.test(b.getAttribute('aria-label')||''));}
  function attachments(){
    if(ai)return ai.attachments();
    return Array.from(composer().querySelectorAll('[data-composer-attachments], [data-testid*="attachment"], [data-testid*="file-preview"], .composer-attachment-surface[role="button"]')).filter(e=>visible(e)&&(e.childElementCount>0||e.tagName==='IMG'&&e.getAttribute('src')));
  }
  function previewReady(){const images=attachments().flatMap(e=>e.tagName==='IMG'?[e]:Array.from(e.querySelectorAll('img')));return images.length>0&&images.every(img=>img.complete&&img.naturalWidth>0);}
  function uploadState(){
    let completedProgress=false;
    for(const e of Array.from(composer().querySelectorAll('[role="progressbar"],[aria-busy="true"]')).filter(visible)){
      if(e.getAttribute('aria-busy')==='true')return {busy:true,completedProgress};
      const now=e.getAttribute('aria-valuenow'),max=e.getAttribute('aria-valuemax'),min=e.getAttribute('aria-valuemin')||'0';
      if(now!==null&&max!==null&&Number.isFinite(Number(now))&&Number.isFinite(Number(max))&&Number(max)>Number(min)&&Number(now)>=Number(max))completedProgress=true;
      else return {busy:true,completedProgress};
    }
    return {busy:false,completedProgress};
  }
  async function waitUntilReady(j,signal){
    let readySince=null,completedSince=null;const pollMs=ai?200:100;
    await wait(()=>{const input=editor(),b=sendButton(),upload=uploadState();
      if(input&&normalizePrompt(content(input))===normalizePrompt(MangaCore.prompt(j))&&(j.type==='text'?!attachments().length:previewReady())&&b&&!b.disabled&&b.getAttribute('aria-disabled')!=='true'&&!upload.busy){
        if(!ai)return true;
        if(readySince===null)readySince=Date.now();if(upload.completedProgress){if(completedSince===null)completedSince=Date.now();}else completedSince=null;
        return Date.now()-readySince>=500&&(!ai||!upload.completedProgress||Date.now()-completedSince>=1000);
      }
      readySince=null;completedSince=null;return false;
    },j.type==='text'?20000:90000,signal,j.type==='text'?'テキストの送信準備を確認できませんでした。':'画像の添付完了を確認できませんでした。送信していません。画像プレビューと送信ボタンを確認してください。',pollMs);
  }
  function blocking(){
    const warnings=Array.from(document.querySelectorAll('[role="alert"],[role="alertdialog"]')).filter(visible).map(e=>e.innerText).join('\n');
    if(/limit|too many|try again later|upgrade|quota|上限|制限|後でもう一度|アップロード.*失敗|添付.*失敗|upload.*fail|network.*error|エラー/i.test(warnings))throw Error(aiName+'の利用制限またはエラーで停止しました。'+warnings.slice(0,240));
    if(Array.from(document.querySelectorAll('iframe')).some(e=>visible(e)&&/captcha|challenge/i.test(e.src)))throw Error('認証画面が表示されています。手動で確認してください。');
    const mode=buttons().find(b=>b.getAttribute('aria-pressed')==='true'&&b.textContent.trim()==='Work');if(mode)throw Error('Chatモードに切り替えてください。');
  }
  async function wait(test,timeout,signal,label,pollMs=500){const start=Date.now();while(Date.now()-start<timeout){abort(signal);blocking();const result=await test();if(result)return result;await delay(pollMs,signal);}throw Error(label);}
  function messages(role){if(ai)return ai.messages(role);const old=Array.from(document.querySelectorAll('[data-message-author-role="'+role+'"]')),modern=Array.from(document.querySelectorAll(role==='user'?'[data-user-message-bubble="true"]':'[data-content-search-unit-key$=":assistant"]'));return [...new Set([...old,...modern])].filter(e=>!old.some(p=>p!==e&&p.contains?.(e)));}
  function extractReply(j){const replies=messages('assistant');for(const last of replies.reverse())for(const text of [...Array.from(last.querySelectorAll('pre'),e=>e.innerText),last.innerText]){try{if(j.type==='collage')MangaCollage.parsePartial(text,j);else if(j.type==='text')MangaText.parseTranslations(text,j);else MangaCore.parse(text,j.id);return text;}catch{}}return null;}
  function extractManualReply(j){if(j.type!=='collage')return extractReply(j);const replies=messages('assistant');for(const last of replies.reverse())for(const text of [...Array.from(last.querySelectorAll('pre'),e=>e.innerText),last.innerText]){const values=MangaCollage.responses(text);if(values.length)return values[values.length-1].text;}return null;}
  function userEcho(j){return messages('user').some(e=>(e.textContent||e.innerText||'').includes(j.id));}
  async function prepare(j,signal){
    abort(signal);blocking();if(streaming())throw Error('別の返答が生成中です。完了してから再開してください。');
    showPhase('依頼文を入力中');putPrompt(j);abort(signal);showPhase(j.type==='text'?'送信準備を確認中':'画像を添付中');
    if(j.type==='text'){
      if(attachments().length)throw Error('テキスト翻訳では画像を送信しません。添付を削除してください。');
      await waitUntilReady(j,signal);
      const latest=(await call('GET_STATUS')).job;abort(signal);if(latest?.id!==j.id)throw Error('翻訳対象が変わりました。');return;
    }
    if(attachments().length){if(attachedJob!==j.id)throw Error('既に添付された画像があります。削除してから自動処理を再開してください。');}
    else{
      const inputs=Array.from(scope().querySelectorAll('input[type="file"]')).filter(e=>!e.disabled&&!e.hasAttribute('capture'));
      const fileInput=inputs.find(e=>/^(ファイルを添付|Attach files?|Upload files?)$/i.test(e.getAttribute('aria-label')||''))||inputs.find(e=>!(e.accept||'').trim())||inputs.find(e=>(e.accept||'').includes('image/')&&!(e.accept||'').includes('video/'))||inputs.find(e=>(e.accept||'').includes('image/'));
      const blob=await imageBlob(j);abort(signal);if(!blob.size||!blob.type.startsWith('image/'))throw Error('送信用画像の形式が不正です。確認画面で画像を作り直してください。');const file=new File([blob],'manga-'+j.id.replace(/[^a-zA-Z0-9-]/g,'_')+'.png',{type:'image/png'});const transfer=new DataTransfer();transfer.items.add(file);
      const pasteImage=()=>{if(typeof ClipboardEvent!=='function')throw Error('画像を自動添付できません。「画像をコピー」から手動で貼り付けてください。');const input=editor();input.focus();input.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:transfer}));};
      if(fileInput){fileInput.files=transfer.files;fileInput.dispatchEvent(new Event('change',{bubbles:true}));}else pasteImage();
      attachedJob=j.id;
      if(fileInput&&typeof ClipboardEvent==='function'){
        try{await wait(()=>attachments().length||uploadState().busy,8000,signal,'添付プレビューがまだありません。');}
        catch(e){if(e.name==='AbortError')throw e;blocking();if(!attachments().length&&!uploadState().busy)pasteImage();else throw e;}
      }
    }
    showPhase('画像のアップロードを確認中');await waitUntilReady(j,signal);
    const latest=(await call('GET_STATUS')).job;abort(signal);if(latest?.id!==j.id)throw Error('翻訳対象が変わりました。');
  }
  function send(j,signal){
    let b;
    try{
      abort(signal);blocking();const input=editor();
      if(!input||normalizePrompt(content(input))!==normalizePrompt(MangaCore.prompt(j))||(j.type==='text'?attachments().length>0:!previewReady()))throw Error('依頼文または画像の準備状態が変わりました。送信を停止しました。');
      if(uploadState().busy)throw Error('画像のアップロード中です。送信せずに停止しました。');
      b=sendButton();if(!b||b.disabled||b.getAttribute('aria-disabled')==='true')throw Error('送信ボタンを押せません。');
      if(userEcho(j))throw Error('今回の依頼は既に送信されています。返答を確認してください。');
    }catch(e){e.notSent=true;throw e;}
    // A thrown click or failed reply confirmation has an uncertain outcome.
    // Only failures above this boundary are definitely before a click.
    responseTiming.begin(j.id);paintResponseTiming();
    try{b.click();}catch(e){responseTiming.cancel();paintResponseTiming();throw e;}
  }
  async function recoverUnsent(j,attempt){if(userEcho(j))return;await call('AUTOMATION_UNSENT',{jobId:j.id,attemptId:attempt?.attemptId});}
  async function reply(j,signal){
    let completed=false;
    try{
      await wait(()=>userEcho(j),20000,signal,'送信できたか確認できません。重複を避けるため再送せずに停止しました。チャットの送信状況を確認してください。');
      let detectedAt,lastPreview='';
      const result=await wait(async()=>{
        if(streaming()){
          if(j.type==='collage'){
            const last=messages('assistant').at(-1);
            if(last){
              const candidates=[...Array.from(last.querySelectorAll('pre'),e=>e.innerText),last.innerText];
              const preview=candidates.map(t=>MangaCollage.streamResponse(t,j)).find(Boolean);
              if(preview&&preview!==lastPreview){abort(signal);const shown=await call('IMPORT_PREVIEW',{jobId:j.id,text:preview});abort(signal);lastPreview=preview;$('#status').textContent='生成中の訳文を仮表示：'+shown.count+'件（完了後に確定）';}
            }
          }
          return false;
        }
        const text=extractReply(j);if(!text)return false;
        detectedAt=performance.now();return text;
      },600000,signal,'今回の画像に対応するJSON返答を確認できませんでした。送信は繰り返さず停止しました。手動で返答を取り込めます。',500);
      abort(signal);responseTiming.finish(j.id,detectedAt,detectedAt);completed=true;paintResponseTiming();return result;
    }finally{if(!completed){responseTiming.cancel();paintResponseTiming();}}
  }
  async function nextReady(j,signal){
    await wait(()=>{const input=editor();return !streaming()&&input&&normalizePrompt(content(input))!==normalizePrompt(MangaCore.prompt(j))&&(attachedJob!==j.id||attachments().length===0);},20000,signal,'前の依頼の入力欄・添付が残っています。送信せずに停止しました。',100);
  }
  const runner=new MangaAutomation.Runner({get:async()=>{await get();return info;},prepare,send,reply,nextReady,mark:(j,phase,attempt)=>call('AUTOMATION_MARK',{jobId:j.id,phase,attemptId:attempt?.attemptId}),recoverUnsent,import:text=>call('IMPORT',{text,automatic:true}),delay,progress:(state,phase)=>{if(info?.backgroundAutomatic)void report(phase);$('#progress').textContent=`翻訳 ${state.progress.position} / ${state.progress.total} — ${phase}`;},complete:()=>{$('#progress').textContent='漫画全体の翻訳が完了しました。';$('#status').textContent='漫画上の翻訳表示を確認してください。';}});
  function controls(){const running=runner.running||!!manualController;$('#prepare').disabled=running||queueFinished;$('#auto').disabled=running||queueFinished;$('#stop').disabled=!running;for(const id of ['prompt','copy','apply','reset','copyPrompt','jump','refresh','position'])$('#'+id).disabled=running||queueFinished;$('#previous').disabled=running||queueFinished||!info||info.progress.position<=1;$('#next').disabled=running||queueFinished||!info||info.progress.position>=info.progress.total;}
  function button(id,fn){$(id).onclick=async()=>{if(id!=='#stop'&&(runner.running||manualController))return;try{await fn();}catch(e){responseTiming.cancel();paintResponseTiming();showPhase(e.name==='AbortError'?'停止':'エラーで停止');void report(e.message,e.name!=='AbortError');$('#status').textContent=e.name==='AbortError'?'処理を停止しました。送信済みの場合は再送せず、返答の取り込みから再開してください。':e.message;}finally{controls();if(syncPending&&!runner.running&&!manualController){syncPending=false;await refreshProgress();}}};}
  async function selectPosition(position){
    const j=await get();if(!Number.isInteger(position)||position<1||position>info.progress.total)throw Error('画像番号が範囲外です。');
    const controller=new AbortController();manualController=controller;controls();
    try{await call('SELECT_QUEUE',{jobId:j.id,position});attachedJob=null;await get();$('#status').textContent=`画像 ${position} / ${info.progress.total} に切り替えました。古い依頼文と添付を削除してから「画像＋依頼文を準備」を押してください。`;}
    finally{manualController=null;}
  }
  button('#resetTiming',async()=>{responseTiming.reset();paintResponseTiming();});
  button('#previous',async()=>{await get();await selectPosition(info.progress.position-1);});
  button('#next',async()=>{await get();await selectPosition(info.progress.position+1);});
  button('#jump',async()=>{const position=Number($('#position').value);await selectPosition(position);});
  button('#refresh',async()=>{await get();controls();$('#status').textContent='現在の進捗を再取得しました。';});
  button('#prepare',async()=>{
    const controller=new AbortController();manualController=controller;controls();$('#status').textContent='依頼文と画像を準備しています。画像の添付が完了するまで送信しないでください。';
    try{const j=await get();abort(controller.signal);if(j.automation||userEcho(j))throw Error('今回の依頼は送信済み、または送信状態が不明です。返答を確認して取り込んでください。');await prepare(j,controller.signal);abort(controller.signal);showPhase('準備完了・送信待ち');$('#status').textContent=j.type==='text'?'準備完了：依頼文を入力しました。ChatGPTの送信ボタンを押してください。':'準備完了：画像の添付と依頼文の入力を確認しました。画像プレビューを確認して、ChatGPTの送信ボタンを押してください。';}
    finally{manualController=null;}
  });
  button('#auto',()=>runAutomatic(true));
  button('#stop',async()=>{wakeController?.abort();runner.stop();manualController?.abort();if(info?.backgroundAutomatic)await call('AUTO_STOP');});
  button('#prompt',async()=>{const j=await get();putPrompt(j);$('#status').textContent='依頼文を入力しました。';});
  button('#copy',async()=>{const j=await get();const blob=await imageBlob(j);await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);$('#status').textContent='画像をコピーしました。入力欄に貼り付けてください。';});
  button('#copyPrompt',async()=>{const j=await get();await navigator.clipboard.writeText(MangaCore.prompt(j));$('#status').textContent='依頼文をコピーしました。';});
  button('#reset',async()=>{const j=await get();if(!confirm((typeof MangaUI==='undefined'?s=>s:MangaUI.text)('今回の原文がまだ送信されていないことをチャットで確認してください。送信済みなら重複送信になります。未送信として状態をリセットしますか？')))return;await call('AUTOMATION_RESET',{jobId:j.id});$('#status').textContent='送信状態をリセットしました。入力欄と添付画像を空にしてから再開してください。';});
  button('#apply',async()=>{const j=await get();if(streaming())throw Error('返答が完了するまでお待ちください。');const text=extractManualReply(j);if(!text)throw Error('JSON返答がありません。確認画面へJSON全体を貼り付けてください。');const r=await call('IMPORT',{text});$('#status').textContent=`画像 ${r.appliedPosition} の${r.count}件を反映しました。`;if(r.hasNext){await get();$('#progress').textContent=r.retry?`欠落${r.missingIds.length}件のうち${r.retryCount}件を再依頼`:`次の画像：${r.position} / ${r.total}`;}else{$('#progress').textContent='翻訳が完了しました。';}});
  function showPhase(phase){if(info?.backgroundAutomatic)void report(phase);if(info?.progress)$('#progress').textContent=`翻訳 ${info.progress.position} / ${info.progress.total} — ${phase}`;}
  function finishQueue(){imageBlobEntry=null;current=null;attachedJob=null;queueFinished=true;$('#fallback').value='';$('#jobPreview').hidden=true;$('#jobPreview').src='';$('#progress').textContent='翻訳待ちの画像はありません（完了または破棄）。';controls();}
  async function refreshProgress(){
    if(runner.running||manualController||syncing){syncPending=true;return;}syncing=true;
    try{const status=await call('GET_STATUS');if(!status.job){if(status.waiting){$('#progress').textContent='次の画像を準備中';return;}finishQueue();return;}const changed=status.job.id!==current?.id||status.progress.position!==info?.progress.position||status.progress.total!==info?.progress.total;
      if(changed){await get();attachedJob=null;$('#status').textContent='翻訳対象を更新しました。入力欄と添付画像を確認してください。';}controls();
    }catch(e){if(/context invalidated|Extension context|拡張.*無効/i.test(e.message)){queueFinished=true;$('#status').textContent='拡張機能が更新されました。このChatGPTページを再読み込みしてください。';controls();}}
    finally{syncing=false;if(syncPending&&!runner.running&&!manualController){syncPending=false;void refreshProgress();}}
  }
  async function syncProgress(changes,area){
    if(area!=='session'||(!changes.job&&!changes.collection))return;
    if(runner.running||manualController){syncPending=true;return;}
    if(changes.job&&changes.job.oldValue?.id===current?.id&&!changes.job.newValue){finishQueue();return;}
    await refreshProgress();
  }
  chrome.storage.onChanged.addListener(syncProgress);
  chrome.runtime.onMessage.addListener((m,s,respond)=>{if(s.id!==chrome.runtime.id)return;if(m.type==='AI_PROBE'){respond({ok:true,provider:aiName==='Gemini'?'gemini':'chatgpt'});return;}if(m.type==='AUTO_WAKE'){void autoWake();return;}if(m.type==='AUTO_STOP'){wakeController?.abort();runner.stop();manualController?.abort();return;}if(m.type==='QUEUE_CHANGED')return syncProgress({job:{oldValue:current,newValue:m.finished?undefined:{}}},'session');});
  const progressTimer=setInterval(()=>{paintResponseTiming();if(!document.hidden)void refreshProgress();void autoWake();},3000);
  addEventListener('focus',()=>void refreshProgress());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshProgress();});
  addEventListener('pagehide',()=>{imageBlobEntry=null;wakeController?.abort();runner.stop();manualController?.abort();clearInterval(progressTimer);});
  let wakeController,autoChecking=false;const autoInstance=typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():String(Date.now());
  async function report(message,error=false){if(!current)return;try{await call('AUTO_REPORT',{jobId:current.id,message,error});}catch{}}
  async function runAutomatic(manual=false){
    if(manual){const controller=new AbortController();manualController=controller;controls();
      try{const j=await get();abort(controller.signal);if(!j)throw Error('次の画像を準備中です。画像が完成してから再開してください。');if(info.backgroundAutomatic)await call('AUTO_RESUME_AI',{jobId:j.id,instance:autoInstance});abort(controller.signal);}
      finally{manualController=null;}
    }
    const task=runner.start();controls();$('#status').textContent='自動翻訳を実行中です。';await task;
  }
  async function autoWake(){
    if(autoChecking||runner.running||manualController)return;autoChecking=true;
    try{
      const r=await call('AI_READY',{instance:autoInstance});if(!r.start)return;
      await get();if(!host.isConnected)document.documentElement.append(host);controls();
      try{wakeController=new AbortController();await wait(()=>editor(),30000,wakeController.signal,aiName+'にログインしてから、メニューで再開してください。');abort(wakeController.signal);await runAutomatic();}
      catch(e){responseTiming.cancel();paintResponseTiming();showPhase(e.name==='AbortError'?'停止':'エラーで停止');$('#status').textContent=e.message;await report(e.message,e.name!=='AbortError');}
      finally{wakeController=null;controls();}
    }catch(e){await report(e.message,true);}finally{autoChecking=false;}
  }
  let tries=0;async function init(){try{await get();document.documentElement.append(host);controls();void autoWake();}catch{if(++tries<8)setTimeout(init,700);}}init();
})();
