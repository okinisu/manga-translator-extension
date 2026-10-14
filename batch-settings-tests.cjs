const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
(async()=>{
 const elements=new Map(),node=id=>{if(!elements.has(id))elements.set(id,{value:'balanced',disabled:false,options:[{value:'ko'},{value:'ja'}]});return elements.get(id);};
 let stored={batchMode:'compact'},changes=[],begun;
 const chrome={storage:{local:{get:async d=>({...d,...stored}),set:async d=>{changes.push(d);stored={...stored,...d};}},onChanged:{addListener(){}}},tabs:{query:async()=>[{id:1,url:'https://comic.naver.com/webtoon/detail'}],sendMessage:async()=>({ok:true,visible:true})},runtime:{getURL:x=>x,sendMessage:async m=>{if(m.type==='AUTO_START')begun=stored.batchMode;return {ok:true};}}};
 vm.runInNewContext(fs.readFileSync(__dirname+'/popup.js','utf8'),{document:{querySelector:node},chrome,window:{close(){}},MangaUI:{ready:Promise.resolve(),language:'ja',setLanguage(){}},Error});
 for(let i=0;i<12;i++)await Promise.resolve();
 assert.equal(node('#gpuCapture').value,'auto');node('#gpuCapture').value='on';await node('#gpuCapture').onchange();assert.equal(stored.detectorGpuCapture,'on');node('#gpuCapture').value='off';await node('#gpuCapture').onchange();assert.equal(stored.detectorGpuCapture,'off');node('#gpuCapture').value='bogus';await node('#gpuCapture').onchange();assert.equal(stored.detectorGpuCapture,'off');
 assert.equal(node('#batchMode').value,'compact');assert.equal(node('#batchMode').disabled,false);
 node('#batchMode').value='accuracy';const save=node('#batchMode').onchange();await node('#automatic').onclick();await save;
 assert.equal(stored.batchMode,'accuracy');assert.equal(begun,'accuracy','Start waits for the batch setting to be saved');
 node('#batchMode').value='invalid';await node('#batchMode').onchange();assert.equal(stored.batchMode,'accuracy');assert.match(node('#status').textContent,/不正/);
 const html=fs.readFileSync(__dirname+'/popup.html','utf8');for(const mode of ['accuracy','balanced','compact'])assert.ok(html.includes('value="'+mode+'"'));
 console.log('PASS: saved batch selector, changes persisted before start, invalid selection rejected, three visible profiles');
})().catch(e=>{console.error(e);process.exitCode=1;});
