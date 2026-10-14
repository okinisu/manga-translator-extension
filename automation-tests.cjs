const assert=require('node:assert/strict');const {Runner}=require('./automation.js');
const job=id=>({id,image:'data:image/png;base64,test'});
(async()=>{
 let list=[job('first'),job('second')],index=0,events=[];
 const api={get:async()=>({job:list[index]}),prepare:async j=>events.push('prepare:'+j.id),mark:async(j,phase)=>{j.automation={phase};events.push('mark:'+phase+':'+j.id);},send:j=>events.push('send:'+j.id),reply:async j=>{events.push('reply:'+j.id);return j.id;},nextReady:async()=>events.push('next-ready'),import:async text=>{events.push('import:'+text);return{hasNext:++index<list.length};},delay:async()=>events.push('delay'),complete:()=>events.push('complete')};
 const runner=new Runner(api);await runner.start();assert.equal(runner.running,false);assert.deepEqual(events,['prepare:first','mark:sending:first','send:first','mark:sent:first','reply:first','import:first','next-ready','prepare:second','mark:sending:second','send:second','mark:sent:second','reply:second','import:second','complete']);
 // 送信済みで再開した場合、添付・送信を繰り返さず返答を取り込む。
 events=[];index=0;list=[{...job('sent-before-pause'),automation:{phase:'sent'}}];await runner.start();assert.deepEqual(events,['reply:sent-before-pause','import:sent-before-pause','complete']);
 // 送信できたか不明な状態でも再送しない。
 events=[];index=0;list=[{...job('ambiguous'),automation:{phase:'sending'}}];await runner.start();assert.deepEqual(events,['reply:ambiguous','import:ambiguous','complete']);
 // 添付に失敗すると一度も送信しない。
 let sent=0;const failed=new Runner({...api,get:async()=>({job:job('failure')}),prepare:async()=>{throw Error('upload blocked');},send:()=>sent++});await assert.rejects(failed.start(),/upload blocked/);assert.equal(sent,0);assert.equal(failed.running,false);
 // 制限エラーで止まり、次の画像・自動再送へ進まない。
 sent=0;let imports=0;const limited=new Runner({...api,get:async()=>({job:job('limit')}),prepare:async()=>{},mark:async()=>{},send:()=>sent++,reply:async()=>{throw Error('usage limit');},import:async()=>{imports++;return {hasNext:true};}});await assert.rejects(limited.start(),/usage limit/);assert.equal(sent,1);assert.equal(imports,0);assert.equal(limited.running,false);
 // 停止が状態保存中に来ても、送信クリックはしない。
 sent=0;let paused;paused=new Runner({...api,get:async()=>({job:job('pause')}),prepare:async()=>{},mark:async()=>paused.stop(),send:()=>sent++});await assert.rejects(paused.start(),e=>e.name==='AbortError');assert.equal(sent,0);
 // Pre-click failures may be recovered; an uncertain click must never be reset.
 let recovered=0,attemptState,checks=[];
 const recoveryAPI={...api,get:async()=>({job:job('recover')}),prepare:async()=>{},mark:async(j,phase,attempt)=>{attemptState=phase;checks.push(phase);return {attemptId:'attempt-1'};},recoverUnsent:async(j,attempt)=>{assert.equal(attempt.attemptId,'attempt-1');recovered++;attemptState=undefined;}};
 const beforeClick=new Runner({...recoveryAPI,send:async()=>{const error=Error('button disabled');error.notSent=true;throw error;}});await assert.rejects(beforeClick.start(),/button disabled/);assert.equal(recovered,1);assert.equal(attemptState,undefined);
 const afterClick=new Runner({...recoveryAPI,send:async()=>{throw Error('uncertain click');}});await assert.rejects(afterClick.start(),/uncertain click/);assert.equal(recovered,1);assert.equal(attemptState,'sending');
 let aborting;aborting=new Runner({...recoveryAPI,mark:async()=>{aborting.stop();return {attemptId:'attempt-1'};},send:()=>assert.fail('must not click')});await assert.rejects(aborting.start(),e=>e.name==='AbortError');assert.equal(recovered,2);
 // Do not mark sent or read the reply until an asynchronous send completes.
 checks=[];const asyncSend=new Runner({...recoveryAPI,send:async()=>{await Promise.resolve();checks.push('click');},reply:async()=>{checks.push('reply');return 'ok';},import:async()=>({hasNext:false})});await asyncSend.start();assert.deepEqual(checks,['sending','click','sent','reply']);
 // A failure to persist the sent marker occurs after the click and remains ambiguous.
 const markFailure=new Runner({...recoveryAPI,send:async()=>{},mark:async(j,phase)=>{if(phase==='sent')throw Error('storage offline');return {attemptId:'attempt-1'};}});await assert.rejects(markFailure.start(),/storage offline/);assert.equal(recovered,2);
 // 2重開始を拒否し、停止で待機を抜ける。
 let waiting;const concurrent=new Runner({...api,get:async()=>({job:job('concurrent')}),prepare:async(j,signal)=>new Promise((resolve,reject)=>{waiting=true;signal.addEventListener('abort',()=>reject(new DOMException('stopped','AbortError')),{once:true});})});const pending=concurrent.start();while(!waiting)await Promise.resolve();await assert.rejects(concurrent.start(),/実行中/);concurrent.stop();await assert.rejects(pending,e=>e.name==='AbortError');assert.equal(concurrent.running,false);
 events=[];index=0;list=[{id:'episode-text',type:'text'}];await runner.start();assert.equal(events.filter(e=>e.startsWith('send:')).length,1);assert.equal(events.at(-1),'complete');

 // Translation can finish before the producer publishes the next image.
 let poll=0,waits=0,completed=0;
 const pipeline=new Runner({...api,get:async()=>poll++<2?{job:null,waiting:true,progress:{position:1,total:1}}:{job:null,finished:true},delay:async()=>{waits++;},complete:()=>completed++});
 await pipeline.start();assert.equal(waits,2);assert.equal(completed,1);
 console.log('PASS: automatic sequence, sent/ambiguous resume without duplicate send, upload failure, usage limit, pause before send, concurrent start rejection');
})().catch(e=>{console.error(e);process.exitCode=1;});
