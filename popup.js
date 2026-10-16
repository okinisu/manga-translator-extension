const $=s=>document.querySelector(s);
// Serialize writes, track initial reads, and keep failed keys blocked until a
// successful save replaces them. Start never races an in-flight preference.
const settingsLoads=new Set(),settingsFailures=new Map();let settingsTail=Promise.resolve();
function loadSettings(defaults){
 const task=Promise.resolve().then(()=>chrome.storage.local.get(defaults));settingsLoads.add(task);
 task.then(()=>settingsLoads.delete(task),e=>{settingsLoads.delete(task);for(const key of Object.keys(defaults))settingsFailures.set(key,e);});
 return task;
}
function saveSettings(values){
 const task=settingsTail.then(()=>chrome.storage.local.set(values));
 settingsTail=task.then(()=>{for(const key of Object.keys(values))settingsFailures.delete(key);},e=>{for(const key of Object.keys(values))settingsFailures.set(key,e);});
 return task;
}
async function waitSettings(){
 while(true){const tail=settingsTail,loads=[...settingsLoads];await Promise.allSettled(loads);await tail;if(tail===settingsTail&&!settingsLoads.size)break;}
 if(settingsFailures.size)throw settingsFailures.values().next().value;
}
async function source(type) {const [t]=await chrome.tabs.query({active:true,currentWindow:true});if(!t?.url?.startsWith('https://comic.naver.com/')) throw Error('NAVERの漫画ページで操作してください。');const r=await chrome.tabs.sendMessage(t.id,{type});if(!r?.ok) throw Error(r?.error||'漫画ページを再読み込みしてください。');return r;}
function action(id,fn){$(id).onclick=async()=>{try{await fn();}catch(e){$('#status').textContent=e.message;}};}
action('#whole',async()=>{await chatModePending;await batchReady;await waitSettings();await source('WHOLE');window.close();});
action('#review',async()=>{await autoCall('OPEN_REVIEW');});
action('#clear',()=>source('CLEAR'));
$('#visible').onchange=async()=>{try{await source('TOGGLE');}catch(e){$('#status').textContent=e.message;}};
(async()=>{try{const r=await source('STATUS');$('#visible').checked=r.visible;}catch{}})();

let parallelReady;
$('#parallel').disabled=true;
parallelReady=(async()=>{try{const saved=await loadSettings({detectorParallel:1});const value=String(saved.detectorParallel);$('#parallel').value=value==='auto'||/^[1-8]$/.test(value)?value:'1';}catch(e){$('#status').textContent=e.message;}finally{$('#parallel').disabled=false;}})();
$('#parallel').onchange=async()=>{try{const value=$('#parallel').value;if(value!=='auto'&&!/^[1-8]$/.test(value))throw Error('並列数が不正です。');await saveSettings({detectorParallel:value==='auto'?'auto':Number(value)});$('#status').textContent='並列数を保存しました。次の文字検出開始・再開時に適用します。';}catch(e){$('#status').textContent=e.message;}};

$('#backend').disabled=true;
(async()=>{try{const saved=await loadSettings({detectorBackend:'auto'});const backend=saved.detectorBackend==='wasm'?'wasm':'auto';$('#backend').value=backend;if(saved.detectorBackend!==backend)await saveSettings({detectorBackend:backend});}finally{$('#backend').disabled=false;}})();
$('#backend').onchange=async()=>{try{const value=$('#backend').value;if(!['auto','wasm'].includes(value))throw Error('検出方式が不正です。');await saveSettings({detectorBackend:value});$('#status').textContent='検出方式を保存しました。次の検出から適用します。';}catch(e){$('#status').textContent=e.message;}};

$('#debug').disabled=true;
(async()=>{try{const saved=await loadSettings({detectorDebug:false});$('#debug').checked=!!saved.detectorDebug;}catch(e){$('#status').textContent=e.message;}finally{$('#debug').disabled=false;}})();
$('#debug').onchange=async()=>{try{await saveSettings({detectorDebug:$('#debug').checked});$('#status').textContent='デバッグ設定を保存しました。次の検出から適用します。';}catch(e){$('#status').textContent=e.message;}};

for(const [id,key,initial,values] of [['gpuCapture','detectorGpuCapture','auto',['auto','off','on']],['gpuPrecision','detectorGpuPrecision','auto',['auto','fp32','fp16']],['gpuParallel','detectorGpuParallel',2,['1','2','4']],['threads','detectorThreads',2,['1','2','4']],['gpuPower','detectorGpuPower','high-performance',['high-performance','low-power']]]){const control=$('#'+id);control.disabled=true;(async()=>{try{const saved=await loadSettings({[key]:initial});control.value=values.includes(String(saved[key]))?String(saved[key]):String(initial);}catch(e){$('#status').textContent=e.message;}finally{control.disabled=false;}})();control.onchange=async()=>{try{if(!values.includes(control.value))throw Error('設定値が不正です。');await saveSettings({[key]:['detectorThreads','detectorGpuParallel'].includes(key)?Number(control.value):control.value});$('#status').textContent='保存しました。次の検出から適用します。';}catch(e){$('#status').textContent=e.message;}};}

for(const [id,initial] of [['sourceLanguage','ko'],['targetLanguage','ja']]){const control=$('#'+id);control.disabled=true;(async()=>{try{const saved=await loadSettings({[id]:initial});control.value=Array.from(control.options).some(o=>o.value===saved[id])?saved[id]:initial;}catch(e){$('#status').textContent=e.message;}finally{control.disabled=false;}})();control.onchange=async()=>{try{await saveSettings({[id]:control.value});$('#status').textContent='翻訳言語を保存しました。次の話の準備から適用します。';}catch(e){$('#status').textContent=e.message;}};}


let batchReady;
$('#batchMode').disabled=true;
batchReady=(async()=>{try{const saved=await loadSettings({batchMode:'balanced'});$('#batchMode').value=['accuracy','balanced','compact'].includes(saved.batchMode)?saved.batchMode:'balanced';}catch(e){$('#status').textContent=e.message;}finally{$('#batchMode').disabled=false;}})();
$('#batchMode').onchange=()=>{const value=$('#batchMode').value;batchReady=(async()=>{try{if(!['accuracy','balanced','compact'].includes(value))throw Error('バッチ設定が不正です。');await saveSettings({batchMode:value});$('#status').textContent='バッチ設定を保存しました。次の話から適用します。';}catch(e){$('#status').textContent=e.message;}})();return batchReady;};

const aiReady=(async()=>{const saved=await loadSettings({aiProvider:'chatgpt'});$('#aiProvider').value=['chatgpt','gemini','pi'].includes(saved.aiProvider)?saved.aiProvider:'chatgpt';})();
function showChatMode(){const visible=$('#aiProvider').value==='chatgpt';$('#chatModeSetting').hidden=!visible;$('#chatModeHint').hidden=!visible;}
const chatModeReady=(async()=>{try{const saved=await loadSettings({chatgptChatMode:'temporary'});$('#chatgptChatMode').value=saved.chatgptChatMode==='normal'?'normal':'temporary';}catch(e){$('#status').textContent=e.message;}finally{$('#chatgptChatMode').disabled=false;}})();
$('#chatgptChatMode').onchange=()=>{const value=$('#chatgptChatMode').value;chatModePending=(async()=>{try{if(!['temporary','normal'].includes(value))throw Error('設定値が不正です。');await saveSettings({chatgptChatMode:value});$('#status').textContent='チャット設定を保存しました。次の話から適用します。';}catch(e){$('#status').textContent=e.message;throw e;}})();return chatModePending;};
let chatModePending=chatModeReady;
aiReady.then(showChatMode).catch(()=>{});
$('#aiProvider').onchange=()=>{showChatMode();return saveSettings({aiProvider:$('#aiProvider').value});};
async function autoCall(type,extra={}){const r=await chrome.runtime.sendMessage({type,...extra});if(!r?.ok)throw Error(r?.error||'処理を開始できません。');return r;}
action('#automatic',async()=>{if($('#aiProvider').value==='pi'&&!await chrome.permissions.request({origins:['http://127.0.0.1/*']}))throw Error('Piへのローカル接続を許可してください。');await aiReady;await chatModePending;await parallelReady;await batchReady;await waitSettings();const [t]=await chrome.tabs.query({active:true,currentWindow:true});await saveSettings({aiProvider:$('#aiProvider').value});await waitSettings();await autoCall('AUTO_START',{sourceTab:t?.id,provider:$('#aiProvider').value});await autoProgress();});
action('#autoStop',async()=>{await autoCall('AUTO_STOP');await autoProgress();});
async function autoProgress(){const r=await autoCall('GET_STATUS'),a=r.autoState;const running=a&&['preparing','running'].includes(a.state);$('#automatic').disabled=!!running;$('#aiProvider').disabled=!!running;$('#chatgptChatMode').disabled=!!running;$('#autoStop').hidden=!running;$('#autoProgress').textContent=a?`${a.provider==='pi'?'Pi':a.provider==='gemini'?'Gemini':'ChatGPT'}：${a.message||''}${a.total?'（'+a.position+' / '+a.total+'）':''}`:'';}
chrome.storage.onChanged.addListener((c,area)=>{if(area==='session'&&c.autoState)void autoProgress().catch(()=>{});});
void autoProgress().catch(()=>{});

$('#uiLanguage').disabled=true;
MangaUI.ready.then(()=>{ $('#uiLanguage').value=MangaUI.language;$('#uiLanguage').disabled=false; });
$('#uiLanguage').onchange=async()=>{try{await saveSettings({uiLanguage:$('#uiLanguage').value});MangaUI.setLanguage($('#uiLanguage').value);}catch(e){$('#status').textContent=e.message;}};

// Persist on input so closing the popup does not discard a typed memo. The
// shared settings barrier makes Start wait for the latest write.
$('#customInstructions').disabled=true;
(async()=>{try{const saved=await loadSettings({customInstructions:''});$('#customInstructions').value=typeof saved.customInstructions==='string'?saved.customInstructions:'';}catch(e){$('#status').textContent=e.message;}finally{$('#customInstructions').disabled=false;}})();
$('#customInstructions').oninput=async()=>{
 try{
  const value=$('#customInstructions').value;
  if(typeof value!=='string'||value.length>4000){const e=Error('カスタム指示は4000文字以内で入力してください。');settingsFailures.set('customInstructions',e);throw e;}
  await saveSettings({customInstructions:value.trim()});$('#status').textContent='翻訳メモを保存しました。次の話の準備から適用します。';
 }catch(e){$('#status').textContent=e.message;}
};

const piToken=$('#piBridgeToken'),piModel=$('#piModel'),piThinkingLevel=$('#piThinkingLevel');
let savedPiModel='';
piToken.disabled=true;piModel.disabled=true;piThinkingLevel.disabled=true;
(async()=>{try{const saved=await loadSettings({piBridgeToken:'',piModel:'',piModelsCache:[],piThinkingLevel:'default'});piToken.value=saved.piBridgeToken||'';savedPiModel=saved.piModel||'';fillPiModels(saved.piModelsCache||[]);piThinkingLevel.value=['default','off','minimal','low','medium','high','xhigh','max'].includes(saved.piThinkingLevel)?saved.piThinkingLevel:'default';}catch(e){$('#status').textContent=e.message;}finally{piToken.disabled=false;piModel.disabled=false;piThinkingLevel.disabled=false;}})();
piToken.oninput=()=>saveSettings({piBridgeToken:piToken.value.trim()}).catch(e=>{$('#status').textContent=e.message;});
function fillPiModels(models){
 const current=savedPiModel||piModel.value;piModel.replaceChildren(new Option('Piの既定モデル / Pi default',''));
 for(const model of models){if(!model||typeof model.id!=='string'||typeof model.provider!=='string')continue;const value=model.provider+'/'+model.id,label=(model.name||model.id)+' — '+model.provider;piModel.add(new Option(label,value));}
 if(current&&![...piModel.options].some(o=>o.value===current))piModel.add(new Option(current+'（一覧にありません）',current));
 piModel.value=current;
}
piModel.onchange=()=>{savedPiModel=piModel.value;return saveSettings({piModel:savedPiModel});};
piThinkingLevel.onchange=()=>{if(!['default','off','minimal','low','medium','high','xhigh','max'].includes(piThinkingLevel.value))return Promise.reject(Error('Pi推論レベルが不正です。'));return saveSettings({piThinkingLevel:piThinkingLevel.value});};
action('#piConnect',async()=>{
 $('#piConnect').disabled=true;$('#status').textContent='Pi接続サーバーを確認中…';
 try{
 if(!await chrome.permissions.request({origins:['http://127.0.0.1/*']}))throw Error('ローカル接続が許可されませんでした。');
 await waitSettings();const headers={Authorization:'Bearer '+piToken.value.trim()};
 let health;try{health=await fetch('http://127.0.0.1:43129/health',{headers,signal:AbortSignal.timeout(5000)});}catch(e){throw Error('Pi接続サーバーに到達できません。node scripts/pi-bridge.mjs が起動中か確認してください。 ('+e.message+')');}
 if(health.status===401)throw Error('Pi接続サーバーには到達しましたが、接続キーが一致しません。ターミナルに表示された最新のConnection keyを貼り直してください。');
 if(!health.ok)throw Error('Pi接続サーバーの確認に失敗しました（HTTP '+health.status+'）。');
 let healthInfo;try{healthInfo=await health.json();}catch{throw Error('Pi接続サーバーには到達しましたが、応答形式が不正です。');}
 if(healthInfo.bridgeVersion!==2||!Array.isArray(healthInfo.capabilities)||!healthInfo.capabilities.includes('models'))throw Error('Pi接続OK。ただし起動中のブリッジは古く、モデル一覧APIに未対応です。古いnode scripts/pi-bridge.mjsを終了し、更新版フォルダから再起動してください。');
 $('#status').textContent='Pi接続OK（ブリッジ v2）。画像対応モデルを取得中…';
 const response=await fetch('http://127.0.0.1:43129/models',{headers,signal:AbortSignal.timeout(35000)});
 if(response.status===404)throw Error('Pi接続OKですが、/models が見つかりません（HTTP 404）。43129番ポートで古いPiブリッジが動いています。古いNodeプロセスを終了し、更新版フォルダの scripts/pi-bridge.mjs を起動してください。');
 if(response.status===409)throw Error('Pi接続OKですが、Piブリッジは別の処理中です。処理完了後に再試行してください。');
 if(!response.ok){let detail='';try{detail=(await response.json()).error||'';}catch{}throw Error('Piモデル一覧の取得に失敗しました（HTTP '+response.status+'）'+(detail?'：'+detail:'')+'。');}
 const result=await response.json();if(!Array.isArray(result.models))throw Error('Piのモデル一覧の形式が不正です。');
 savedPiModel=piModel.value;fillPiModels(result.models);await saveSettings({piModelsCache:result.models,piModel:piModel.value});
 $('#status').textContent='Pi接続OK / 画像対応モデル '+result.models.length+' 件を取得しました。';
 }finally{$('#piConnect').disabled=false;}
});

$('#editorDebug').disabled=true;
(async()=>{try{const saved=await loadSettings({editorDebug:false});$('#editorDebug').checked=!!saved.editorDebug;}catch(e){$('#status').textContent=e.message;}finally{$('#editorDebug').disabled=false;}})();
$('#editorDebug').onchange=async()=>{try{await saveSettings({editorDebug:$('#editorDebug').checked});$('#status').textContent='編集用デバッグ設定を保存しました。';}catch(e){$('#status').textContent=e.message;}};
