const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {Runner,ResponseTiming}=require('./automation.js');
function setup(options={}){
 let clock=0,attached=false,uploads=0,fetches=0,pastes=0,wrongUploads=0,sends=0,calls=0,resumes=0,previews=[],imports=[],context,storageListener,messageListener;
 const nodes=new Map(),ui=id=>{if(!nodes.has(id))nodes.set(id,{disabled:false,value:'',textContent:'',style:{}});return nodes.get(id);};
 const visible={getClientRects:()=>[{}],closest:()=>null};
 class Textarea{constructor(){this._value=options.draft||'';this.tagName=options.rich?'DIV':'TEXTAREA';this.innerText=options.draft||'';}get value(){return this._value;}set value(v){this._value=v;}focus(){}dispatchEvent(e){if(e.type==='paste'){pastes++;if(!options.failUpload)attached=true;}}}
 const input=Object.assign(new Textarea(),visible,{querySelector:()=>null});
 const file={accept:'',getAttribute:n=>n==='aria-label'?'ファイルを添付':null,hasAttribute:()=>false,dispatchEvent(){uploads++;options.onUpload?.();if(!options.failUpload&&!options.failFile)attached=true;if(options.stopOnUpload)ui('#stop').onclick();}};
 const photo={accept:'image/*,video/*',getAttribute:()=> '写真または動画を添付',hasAttribute:()=>false,dispatchEvent(){wrongUploads++;}};
 const send={...visible,get disabled(){return !!options.disabledSend;},getAttribute:n=>n==='data-testid'?'send-button':null,click(){sends++;if(options.replyAfterSend)options.echo=true;if(options.streamAfterSend)options.streaming=true;if(options.clickThrows)throw Error('click outcome unknown');}};
 const image={...visible,tagName:'IMG',get complete(){return !options.imageLoading;},get naturalWidth(){return options.imageLoading?0:1800;},getAttribute:n=>n==='src'?'blob:fixture':null};
 const preview=options.leafPreview?image:{...visible,childElementCount:1,querySelectorAll:s=>s==='img'&&!options.emptyPreview?[image]:[]};
 const progress={...visible,getAttribute:n=>n==='aria-busy'?options.ariaBusy?'true':null:n==='aria-valuenow'?options.progressValue===undefined?null:String(options.progressValue):n==='aria-valuemax'?options.progressValue===undefined?null:'100':n==='aria-valuemin'?'0':null};
 const hiddenProgress={...progress,getClientRects:()=>[]};
 const busySelector=s=>s.includes('progressbar');
 const scope={parentElement:null,querySelector:s=>busySelector(s)?(options.busy?progress:null):(s==='input[type="file"]'&&!options.noInput?file:null),querySelectorAll:s=>s==='input[type="file"]'?(!options.noInput?[photo,file]:[]):s==='button'?(options.noSend?[]:[send]):busySelector(s)?[...(options.busy||options.progressValue!==undefined||options.ariaBusy?[progress]:[]),...(options.hiddenBusy?[hiddenProgress]:[])]:attached&&!options.clearedAttachments?[preview]:[]};
 const body={};scope.parentElement=body;input.parentElement=scope;input.closest=s=>s==='form'||s==='[data-composer-body]'&&options.modernComposer?scope:null;
 const root={querySelector:ui};
 const host={style:{},attachShadow:()=>root};
 const job={id:'atlas-job',type:'collage',image:'data:image/png;base64,aQ==',...(options.job||{}),...(options.sent?{automation:{phase:'sent'}}:{})};
 let response={ok:true,job,backgroundAutomatic:!!options.backgroundAutomatic,progress:{position:1,total:18}};
 class Transfer{constructor(){this.files=[];this.items={add:f=>this.files.push(f)};}}
 context=vm.createContext({
  document:{body,addEventListener(){},execCommand:(command,unused,text)=>{input.innerText=text.replace(/\n/g,'\n\n');return true;},createElement:()=>host,documentElement:{append(){}},querySelectorAll:s=>s.includes('contenteditable')?(options.editorMissing?[]:[input]):s==='button'?[send,...(options.streaming?[{...visible,getAttribute:n=>n==='data-testid'?'stop-button':null}]:[])]:(s==='[data-message-author-role="assistant"]'&&!options.modern||s==='[data-content-search-unit-key$=":assistant"]'&&options.modern)?(options.replies||[]).map(innerText=>({innerText,querySelectorAll:()=>[]})):(s==='[data-message-author-role="user"]'&&!options.modern||s==='[data-user-message-bubble="true"]'&&options.modern)?(options.echo?[{innerText:options.collapsed?'展開':job.id,textContent:job.id}]:[]):[]},
  ...(options.gemini?{MangaAIDOM:{name:'Gemini',editor:()=>input,scope:()=>scope,sendButton:()=>send,streaming:()=>!!options.streaming,attachments:()=>attached?[preview]:[],messages:role=>(role==='user'?options.echo?[job.id]:[]:options.replies||[]).map(innerText=>({innerText,querySelectorAll:()=>[]}))}}:{}),
  chrome:{runtime:{id:'extension-test',onMessage:{addListener:fn=>messageListener=fn},sendMessage:async m=>{calls++;
   if(m.type==='AUTO_RESUME_AI'){resumes++;if(options.stopDuringResume)void ui('#stop').onclick();return {ok:true};}
   if(['AUTO_STOP','AUTO_REPORT'].includes(m.type))return {ok:true};
   if(m.type==='AUTOMATION_MARK'){if(options.afterMark)options.afterMark(m);const attemptId=m.attemptId||'test-attempt';response={...response,job:{...response.job,automation:{phase:m.phase,attemptId}}};return {ok:true,attemptId};}
   if(m.type==='AUTOMATION_UNSENT'){assert.equal(m.attemptId,response.job.automation.attemptId);const recovered={...response.job};delete recovered.automation;response={...response,job:recovered};return {ok:true};}
   if(m.type==='IMPORT_PREVIEW'){previews.push({text:m.text,at:clock});return {ok:true,count:JSON.parse(m.text).items.length};}
   if(m.type==='IMPORT'){imports.push({text:m.text,at:clock});response={ok:true,job:null,finished:true};return {ok:true,hasNext:false};}
   if(m.type==='SELECT_QUEUE'){assert.equal(m.jobId,response.job.id);response={...response,job:{...response.job,id:'selected-'+m.position},progress:{position:m.position,total:18}};return {ok:true};}assert.ok(['GET','GET_STATUS'].includes(m.type));if(options.omitKnownImage&&m.type==='GET'&&m.knownImageId===response.job?.id){const {image,...job}=response.job;return {...response,job,imageUnchanged:true};}return response;}},storage:{onChanged:{addListener:fn=>storageListener=fn}}},
  MangaCollage:require('./collage-core.js'),MangaCore:{prompt:()=> options.prompt||'translate this image'},MangaAutomation:{Runner,ResponseTiming:class extends ResponseTiming{constructor(){super(()=>clock);}}},
  Blob,File:class extends Blob{constructor(parts,name,options){super(parts,options);this.name=name;}},DataTransfer:Transfer,Event:class{},...(options.clipboard?{ClipboardEvent:class{constructor(type,init){this.type=type;Object.assign(this,init);}}}:{}),HTMLTextAreaElement:Textarea,
  DOMException,AbortController,performance:{now:()=>clock},Date:{now:()=>clock},
  setInterval:()=>1,clearInterval(){},setTimeout:(fn,ms)=>{const token={};Promise.resolve().then(()=>{if(!token.cancelled){clock+=ms;options.onTick?.(clock);fn();}});return token;},clearTimeout:token=>token.cancelled=true,
  fetch:async()=>{fetches++;return {blob:async()=>new Blob(['image'],{type:options.badImage?'text/plain':'image/png'})};},
  addEventListener(){},console
 });
 let source=fs.readFileSync(__dirname+'/chat.js','utf8');
 const init=source.indexOf('  let tries=0;');assert.ok(init>0);
 source=source.slice(0,init)+'  globalThis.chatTest={prepare,send,nextReady,refreshProgress,extractManualReply,extractReply,userEcho,runner};\n})();';
 vm.runInContext(source,context);
 return {previews:()=>previews,imports:()=>imports,fetches:()=>fetches,nextReady:signal=>context.chatTest.nextReady(job,signal),resumes:()=>resumes,automatic:()=>context.chatTest.runner.start(),automationState:()=>response.job?.automation,probe:(sender='extension-test')=>{let reply;messageListener({type:'AI_PROBE'},{id:sender},r=>reply=r);return reply;},ui,input,job,userEcho:()=>context.chatTest.userEcho(job),manualReply:j=>context.chatTest.extractManualReply(j),strictReply:j=>context.chatTest.extractReply(j),prepare:()=>ui('#prepare').onclick(),send:()=>context.chatTest.send(job),elapsed:()=>clock,uploads:()=>uploads,pastes:()=>pastes,wrongUploads:()=>wrongUploads,sends:()=>sends,calls:()=>calls,attached:()=>attached,duringUpload:fn=>options.onUpload=fn,poll:async next=>{response=next;await context.chatTest.refreshProgress();},change:async(next,changes,area='session')=>{response=next;await storageListener(changes,area);},notify:async(next,finished=false,sender='extension-test')=>{response=next;await messageListener({type:'QUEUE_CHANGED',finished},{id:sender});await Promise.resolve();await Promise.resolve();}};
}
(async()=>{
 const timed=setup({replyAfterSend:true,job:{records:[{id:'001'}]},replies:[JSON.stringify({jobId:'atlas-job',items:[{id:'001',translated:'訳'}]})]});
 await timed.automatic();assert.equal(timed.elapsed(),0,'A valid completed JSON is imported immediately, without stabilization delay');assert.match(timed.ui('#responseTiming').textContent,/1件/);assert.match(timed.ui('#responseTiming').textContent,/返答確定待ち（直近） 0.0秒/);
 await timed.ui('#resetTiming').onclick();assert.match(timed.ui('#responseTiming').textContent,/まだ計測結果/);
 const resumed=setup({sent:true,echo:true,job:{records:[{id:'001'}]},replies:[JSON.stringify({jobId:'atlas-job',items:[{id:'001',translated:'訳'}]})]});
 await resumed.automatic();assert.match(resumed.ui('#responseTiming').textContent,/まだ計測結果/);
 const replyJSON=JSON.stringify({jobId:'atlas-job',items:[{id:'001',translated:'訳'}]});
 const streamingOptions={replyAfterSend:true,streamAfterSend:true,job:{records:[{id:'001'}]},replies:[replyJSON],onTick:ms=>{if(ms>=1500)streamingOptions.streaming=false;}};
 const streamingReply=setup(streamingOptions);await streamingReply.automatic();assert.equal(streamingReply.previews().length,1,'Unchanged preview must not be sent twice');assert.equal(streamingReply.previews()[0].at,0);assert.equal(streamingReply.imports()[0].at,1500);assert.equal(streamingReply.elapsed(),1500,'A parseable JSON must not import while streaming; import at first completed poll');
 const delayedOptions={replyAfterSend:true,job:{records:[{id:'001'}]},replies:['{"jobId":"atlas-job","items":['],onTick:ms=>{if(ms>=1000)delayedOptions.replies=[replyJSON];}};
 const delayedReply=setup(delayedOptions);await delayedReply.automatic();assert.equal(delayedReply.elapsed(),1000,'Malformed JSON is not imported; valid JSON imports at next 500ms poll');
 const wrongOptions={replyAfterSend:true,job:{records:[{id:'001'}]},replies:[replyJSON.replace('atlas-job','other-job')],onTick:ms=>{if(ms>=500)wrongOptions.replies=[replyJSON];}};
 const wrongReply=setup(wrongOptions);await wrongReply.automatic();assert.equal(wrongReply.elapsed(),500,'Wrong job JSON is ignored');
 const flowingOptions={replyAfterSend:true,streamAfterSend:true,job:{records:[{id:'001'},{id:'002'}]},replies:['{"jobId":"atlas-job","items":[{"id":"001","translated":"初稿"},{"id":"002","translated":"未完'],onTick:ms=>{
   if(ms===500)flowingOptions.replies=['{"jobId":"atlas-job","items":[{"id":"001","translated":"修正版"},{"id":"002","translated":"未完'];
   if(ms>=1000){flowingOptions.streaming=false;flowingOptions.replies=['{"jobId":"atlas-job","items":[{"id":"001","skip":true},{"id":"002","translated":"確定"}]}'];}
 }};
 const flowing=setup(flowingOptions);await flowing.automatic();
 assert.equal(flowing.previews().length,2);assert.equal(JSON.parse(flowing.previews()[1].text).items[0].translated,'修正版');assert.equal(flowing.imports().length,1);assert.equal(flowing.imports()[0].at,1000);assert.equal(JSON.parse(flowing.imports()[0].text).items[0].skip,true);
 const probeChat=setup(),probeGemini=setup({gemini:true});assert.deepEqual(JSON.parse(JSON.stringify(probeChat.probe())),{ok:true,provider:'chatgpt'});assert.deepEqual(JSON.parse(JSON.stringify(probeGemini.probe())),{ok:true,provider:'gemini'});assert.equal(probeChat.probe('other-extension'),undefined);assert.equal(probeChat.sends(),0);assert.equal(probeChat.uploads(),0);
 const firstJSON=JSON.stringify({jobId:'first',items:[{id:'001',ko:'하나',ja:'一'}]}),secondJSON=JSON.stringify({jobId:'second',items:[{id:'002',ko:'둘',ja:'二'}]});
 const manual=setup({replies:[firstJSON,secondJSON]}),firstJob={id:'first',type:'collage',records:[{id:'001'}]};
 assert.equal(manual.manualReply(firstJob),secondJSON,'Manual import reads latest reply independent of selection');
 assert.equal(manual.strictReply(firstJob),firstJSON,'Automatic import continues to require the current job');
 const modern=setup({modern:true,collapsed:true,echo:true,replies:[firstJSON,secondJSON]});
 assert.equal(modern.userEcho(),true,'New ChatGPT user bubble confirms send even when prompt is collapsed');
 assert.equal(modern.strictReply(firstJob),firstJSON,'New ChatGPT assistant container is parsed with strict IDs');
 assert.equal(modern.manualReply(firstJob),secondJSON);
 const emptyModern=setup({modern:true});assert.equal(emptyModern.userEcho(),false);assert.equal(emptyModern.strictReply(firstJob),null);


 // The live composer keeps a 100% progressbar after enabling Send.
 const completed=setup({progressValue:100,modernComposer:true,leafPreview:true});await completed.prepare();assert.match(completed.ui('#status').textContent,/準備完了/);assert.equal(completed.elapsed(),0,'An enabled Send and ready image require no fixed delay, even with a completed progressbar');completed.send();assert.equal(completed.sends(),1);
 for(const options of [{progressValue:99},{progressValue:100,ariaBusy:true},{imageLoading:true},{emptyPreview:true}]){const t=setup(options);await t.prepare();assert.doesNotMatch(t.ui('#status').textContent,/準備完了/);assert.equal(t.sends(),0);}
 const hidden=setup({hiddenBusy:true});await hidden.prepare();assert.match(hidden.ui('#status').textContent,/準備完了/);
 const loadedOptions={imageLoading:true,onTick:ms=>{if(ms>=800)loadedOptions.imageLoading=false;}};const loaded=setup(loadedOptions);await loaded.prepare();assert.match(loaded.ui('#status').textContent,/準備完了/);assert.equal(loaded.elapsed(),800);
 const disappearedOptions={};const disappeared=setup(disappearedOptions);await disappeared.prepare();disappearedOptions.editorMissing=true;assert.throws(()=>disappeared.send(),e=>e.notSent===true&&/準備状態/.test(e.message));assert.equal(disappeared.sends(),0);
 const unsentOptions={afterMark:m=>{if(m.phase==='sending')unsentOptions.disabledSend=true;}};const unsent=setup(unsentOptions);await assert.rejects(unsent.automatic(),e=>e.notSent===true);assert.equal(unsent.sends(),0);assert.equal(unsent.automationState(),undefined,'A pre-click failure restores unsent state');
 const uncertain=setup({clickThrows:true});await assert.rejects(uncertain.automatic(),/click outcome unknown/);assert.equal(uncertain.sends(),1);assert.equal(uncertain.automationState().phase,'sending','A thrown click must retain ambiguous state');
 const echoedOptions={afterMark:m=>{if(m.phase==='sending')echoedOptions.echo=true;}};const echoed=setup(echoedOptions);await assert.rejects(echoed.automatic(),/既に送信/);assert.equal(echoed.sends(),0);assert.equal(echoed.automationState().phase,'sending','A visible user message prevents unsent recovery');
 const manualAuto=setup({backgroundAutomatic:true,clickThrows:true});const manualStart=manualAuto.ui('#auto').onclick();await manualAuto.ui('#auto').onclick();await manualStart;assert.equal(manualAuto.resumes(),1,'Double click must not duplicate background resume');assert.equal(manualAuto.sends(),1);
 const stopResume=setup({backgroundAutomatic:true,stopDuringResume:true});await stopResume.ui('#auto').onclick();assert.equal(stopResume.sends(),0);assert.equal(stopResume.uploads(),0);assert.match(stopResume.ui('#status').textContent,/処理を停止/);
 const fastReady=setup();await fastReady.prepare();assert.equal(fastReady.elapsed(),0,'Ready attachment proceeds immediately');assert.equal(fastReady.sends(),0,'Manual preparation does not implicitly send');
 const transientOptions={busy:true,onTick:ms=>{transientOptions.busy=ms>=100&&ms<800;}};const transient=setup(transientOptions);await transient.prepare();assert.equal(transient.elapsed(),800,'Proceed as soon as an active upload becomes ready');assert.equal(transient.uploads(),1);transient.send();assert.equal(transient.sends(),1);
 const buttonOptions={disabledSend:true,onTick:ms=>{if(ms>=700)buttonOptions.disabledSend=false;}};const buttonReady=setup(buttonOptions);await buttonReady.prepare();assert.equal(buttonReady.elapsed(),700);buttonReady.send();assert.equal(buttonReady.sends(),1);
 const regressedOptions={};const regressed=setup(regressedOptions);await regressed.prepare();regressedOptions.busy=true;assert.throws(()=>regressed.send(),e=>e.notSent===true&&/アップロード中/.test(e.message));assert.equal(regressed.sends(),0);
 const geminiProgress=setup({gemini:true,progressValue:100});await geminiProgress.prepare();assert.ok(geminiProgress.elapsed()>=1000,'Gemini retains its existing readiness policy');
 const cachedImage=setup({omitKnownImage:true});await cachedImage.prepare();await cachedImage.prepare();assert.equal(cachedImage.fetches(),1,'Repeated GET/prepare must reuse the same image Blob');assert.equal(cachedImage.uploads(),1);
 const clearedOptions={};const cleared=setup(clearedOptions);await cleared.prepare();cleared.input.value='';clearedOptions.clearedAttachments=true;await cleared.nextReady();assert.equal(cleared.elapsed(),0,'Cleared composer advances without a fixed delay');
 const clearingOptions={onTick:ms=>{if(ms>=300){clearing.input.value='';clearingOptions.clearedAttachments=true;}}};const clearing=setup(clearingOptions);await clearing.prepare();await clearing.nextReady();assert.equal(clearing.elapsed(),300,'Wait only until the old prompt clears');
 const stopAdvance=setup();await stopAdvance.prepare();const stopController=new AbortController();stopController.abort();await assert.rejects(stopAdvance.nextReady(stopController.signal),e=>e.name==='AbortError');assert.equal(stopAdvance.sends(),0);
 const good=setup();const pending=good.prepare();await good.prepare();await pending;
 assert.equal(good.uploads(),1);assert.equal(good.sends(),0);assert.equal(good.input.value,'translate this image');assert.match(good.ui('#status').textContent,/準備完了/);assert.equal(good.ui('#prepare').disabled,false);
 await good.prepare();assert.equal(good.uploads(),1,'Do not attach the same image twice');good.send();assert.equal(good.sends(),1);
 for(const options of [{noInput:true},{failUpload:true},{badImage:true},{busy:true},{draft:'my unsent message'},{sent:true},{echo:true}]){
  const t=setup(options);await t.prepare();assert.doesNotMatch(t.ui('#status').textContent,/準備完了/);assert.equal(t.sends(),0);assert.equal(t.ui('#prepare').disabled,false);
  if(options.draft||options.sent||options.echo)assert.equal(t.uploads(),0);
 }
 assert.equal(good.wrongUploads(),0,'Prefer regular file attachment over photo/video input');
 const gemini=setup({gemini:true,rich:true,clipboard:true,noInput:true});await gemini.prepare();assert.match(gemini.ui('#status').textContent,/準備完了/);assert.equal(gemini.pastes(),1);assert.equal(gemini.sends(),0);gemini.send();assert.equal(gemini.sends(),1);
 const pasteOnly=setup({clipboard:true,noInput:true});await pasteOnly.prepare();assert.match(pasteOnly.ui('#status').textContent,/準備完了/);assert.equal(pasteOnly.pastes(),1);assert.equal(pasteOnly.uploads(),0);assert.equal(pasteOnly.sends(),0);
 const fallback=setup({clipboard:true,failFile:true});await fallback.prepare();assert.match(fallback.ui('#status').textContent,/準備完了/);assert.equal(fallback.uploads(),1);assert.equal(fallback.pastes(),1);assert.equal(fallback.sends(),0);
 const fileSuccess=setup({clipboard:true});await fileSuccess.prepare();assert.equal(fileSuccess.uploads(),1);assert.equal(fileSuccess.pastes(),0,'Do not paste again after attachment appears');
 const bothFail=setup({clipboard:true,failUpload:true});await bothFail.prepare();assert.doesNotMatch(bothFail.ui('#status').textContent,/準備完了/);assert.equal(bothFail.sends(),0);
 const progress=setup();await progress.prepare();assert.equal(progress.ui('#progress').textContent,'翻訳 1 / 18 — 準備完了・送信待ち');
 const second={...progress.job,id:'atlas-job-2'};
 await progress.change({ok:true,job:second,progress:{position:2,total:18}},{job:{oldValue:progress.job,newValue:second}});
 assert.equal(progress.ui('#progress').textContent,'翻訳 2 / 18');assert.equal(progress.sends(),0);assert.equal(progress.uploads(),1);
 await progress.notify({ok:true,job:second,progress:{position:3,total:18}});
 assert.equal(progress.ui('#progress').textContent,'翻訳 3 / 18');
 // Other storage areas must not change the translation progress.
 await progress.change({ok:true,job:second,progress:{position:9,total:18}},{job:{newValue:second}},'local');
 assert.equal(progress.ui('#progress').textContent,'翻訳 3 / 18');
 await progress.notify({ok:false},true);
 assert.match(progress.ui('#progress').textContent,/完了または破棄/);assert.equal(progress.ui('#prepare').disabled,true);assert.equal(progress.ui('#auto').disabled,true);
 // Real ProseMirror inserts double newlines between paragraphs: attachment must still run.
 const prompt=require('./collage-core.js').prompt({id:'atlas-job',records:[]});
 const rich=setup({rich:true,prompt});await rich.prepare();assert.equal(rich.uploads(),1);assert.match(rich.ui('#status').textContent,/準備完了/);assert.notEqual(rich.input.innerText,prompt);rich.send();assert.equal(rich.sends(),1);
 const richOther=setup({rich:true,prompt,draft:'別の依頼です'});await richOther.prepare();assert.equal(richOther.uploads(),0);assert.equal(richOther.input.innerText,'別の依頼です');
 // Recover a missed notification with a lightweight periodic status check.
 const missed=setup();await missed.prepare();await missed.poll({ok:true,job:{...missed.job,id:'new-job'},progress:{position:7,total:18}});
 assert.equal(missed.ui('#progress').textContent,'翻訳 7 / 18');assert.equal(missed.uploads(),1);assert.equal(missed.sends(),0);
 await missed.poll({ok:true,job:null,progress:{position:0,total:0}});assert.equal(missed.ui('#prepare').disabled,true);
 // Do not drop queue changes arriving while a manual preparation is running.
 const deferred=setup();const next={...deferred.job,id:'next-job'};
 deferred.duringUpload(()=>void deferred.change({ok:true,job:next,progress:{position:2,total:18}},{job:{oldValue:deferred.job,newValue:next}}));
 await deferred.prepare();assert.equal(deferred.ui('#progress').textContent,'翻訳 2 / 18');assert.equal(deferred.sends(),0);
 // Manual navigation changes the actual queue without preparing or sending a new attachment.
 const nav=setup();await nav.prepare();const originalDraft=nav.input.value;
 await nav.ui('#next').onclick();assert.equal(nav.ui('#progress').textContent,'翻訳 2 / 18');assert.equal(nav.ui('#position').value,2);assert.equal(nav.uploads(),1);assert.equal(nav.sends(),0);assert.equal(nav.input.value,originalDraft);
 await nav.ui('#previous').onclick();assert.equal(nav.ui('#progress').textContent,'翻訳 1 / 18');assert.equal(nav.ui('#previous').disabled,true);
 nav.ui('#position').value='12';await nav.ui('#jump').onclick();assert.equal(nav.ui('#progress').textContent,'翻訳 12 / 18');assert.equal(nav.ui('#position').value,12);assert.match(nav.ui('#status').textContent,/古い依頼文/);assert.equal(nav.ui('#jobPreview').hidden,false);
 nav.ui('#position').value='19';await nav.ui('#jump').onclick();assert.match(nav.ui('#status').textContent,/範囲外/);assert.equal(nav.sends(),0);
 await nav.ui('#refresh').onclick();assert.equal(nav.ui('#progress').textContent,'翻訳 12 / 18');
 const stop=setup({stopOnUpload:true});await stop.prepare();assert.match(stop.ui('#status').textContent,/処理を停止/);assert.equal(stop.sends(),0);
 const busy=setup({busy:true});await busy.prepare();assert.throws(()=>busy.send(),/アップロード中/);
 console.log('PASS: manual previous/next/direct jump, preview/queue synchronization without sending; ProseMirror paragraph normalization, phase display, missed/deferred progress updates and completion recovery; one-click image and prompt preparation, no implicit send, no duplicate attachment/concurrent preparation, missing/rejected/invalid image and upload-busy stop, preserve unrelated draft, sent-job protection, cancellation, external queue advance updates progress without sending, queue completion disables controls');
})().catch(e=>{console.error(e);process.exitCode=1;});
