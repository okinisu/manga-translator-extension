const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
(async()=>{
 const elements=new Map(),node=id=>{if(!elements.has(id))elements.set(id,{value:'balanced',disabled:false,options:[{value:'ko'},{value:'ja'},{value:'en'}]});return elements.get(id);};
 let stored={},delayKey,release,failKey,starts=0,wholes=0,config;
 const chrome={storage:{local:{get:async defaults=>({...defaults,...stored}),set:async values=>{if(delayKey&&Object.hasOwn(values,delayKey))await new Promise(r=>release=r);if(failKey&&Object.hasOwn(values,failKey))throw Error('save failed');Object.assign(stored,values);}},onChanged:{addListener(){}}},tabs:{query:async()=>[{id:1,url:'https://comic.naver.com/webtoon/detail'}],sendMessage:async(id,m)=>{if(m.type==='WHOLE')wholes++;return {ok:true,visible:true};}},runtime:{sendMessage:async m=>{if(m.type==='AUTO_START'){starts++;config={...stored};}return {ok:true};}}};
 vm.runInNewContext(fs.readFileSync(__dirname+'/popup.js','utf8'),{document:{querySelector:node},chrome,window:{close(){}},MangaUI:{ready:Promise.resolve(),language:'ja'},Error});
 const tick=()=>new Promise(setImmediate);await tick();
 for(const [id,key,value]of [['gpuCapture','detectorGpuCapture','on'],['gpuPrecision','detectorGpuPrecision','fp16'],['gpuPower','detectorGpuPower','low-power'],['gpuParallel','detectorGpuParallel','4'],['parallel','detectorParallel','3'],['threads','detectorThreads','4'],['backend','detectorBackend','wasm'],['sourceLanguage','sourceLanguage','en']]){
  delayKey=key;release=null;node('#'+id).value=value;const saving=node('#'+id).onchange();await tick();const before=starts,begin=node('#automatic').onclick();await tick();assert.equal(starts,before,'Start must wait for '+key);delayKey=null;release();await Promise.all([saving,begin]);assert.equal(starts,before+1);assert.equal(String(config[key]),value);
 }
 delayKey='customInstructions';node('#customInstructions').value='人名はビヨルン';const memoSave=node('#customInstructions').oninput();await tick();
 const beforeMemo=starts,memoStart=node('#automatic').onclick();await tick();assert.equal(starts,beforeMemo);
 delayKey=null;release();await Promise.all([memoSave,memoStart]);assert.equal(config.customInstructions,'人名はビヨルン');
 node('#customInstructions').value='';await node('#customInstructions').oninput();assert.equal(stored.customInstructions,'');
 node('#customInstructions').value='x'.repeat(4001);await node('#customInstructions').oninput();const invalidMemoStart=starts;await node('#automatic').onclick();assert.equal(starts,invalidMemoStart);
 node('#customInstructions').value='有効なメモ';await node('#customInstructions').oninput();await node('#automatic').onclick();assert.equal(starts,invalidMemoStart+1);
 delayKey='targetLanguage';node('#targetLanguage').value='en';const saving=node('#targetLanguage').onchange();await tick();const beforeWhole=wholes,whole=node('#whole').onclick();await tick();assert.equal(wholes,beforeWhole);delayKey=null;release();await Promise.all([saving,whole]);assert.equal(wholes,beforeWhole+1);
 failKey='detectorGpuPrecision';node('#gpuPrecision').value='fp32';await node('#gpuPrecision').onchange();const before=starts;await node('#automatic').onclick();assert.equal(starts,before);assert.match(node('#status').textContent,/save failed/);
 failKey=null;node('#gpuPrecision').value='fp16';await node('#gpuPrecision').onchange();await node('#automatic').onclick();assert.equal(starts,before+1);
 delayKey='detectorGpuCapture';node('#gpuCapture').value='on';const first=node('#gpuCapture').onchange();await tick();node('#gpuCapture').value='off';const second=node('#gpuCapture').onchange();const begin=node('#automatic').onclick();await tick();delayKey=null;release();await Promise.all([first,second,begin]);assert.equal(config.detectorGpuCapture,'off','Rapid changes preserve final selection');
 console.log('PASS: delayed settings block auto/manual start, failures block start until corrected, rapid changes retain order');
})().catch(e=>{console.error(e);process.exitCode=1;});
