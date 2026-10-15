const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
(async()=>{
 const {createBridge,piLaunch}=await import('./scripts/pi-bridge.mjs');
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'pi bridge '));
 try{
  const dir=path.join(temp,'node_modules','@earendil-works','pi-coding-agent');fs.mkdirSync(dir,{recursive:true});
  const entry=path.join(dir,'cli.js');fs.writeFileSync(entry,'');fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({bin:{pi:'cli.js'}}));fs.writeFileSync(path.join(temp,'pi.cmd'),'npm shim');
  const args=['--system-prompt','Literal & | %PATH% "quote"'];
  assert.deepEqual(piLaunch('pi',args,{platform:'win32',env:{Path:temp},node:'node.exe'}),{command:'node.exe',args:[entry,...args]});
  assert.deepEqual(piLaunch(path.join(temp,'pi.cmd'),args,{platform:'win32',env:{},node:'node.exe'}),{command:'node.exe',args:[entry,...args]});
  assert.deepEqual(piLaunch(entry,args,{platform:'win32',env:{},node:'node.exe'}),{command:'node.exe',args:[entry,...args]});
  assert.throws(()=>piLaunch('missing-pi',[],{platform:'win32',env:{}}),/Cannot locate Pi/);
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
 const token='test-key-'.repeat(5);
 const fake=String.raw`let buffer='';process.stdin.setEncoding('utf8');process.stdin.on('data',c=>{buffer+=c;if(!buffer.includes('\n'))return;const p=JSON.parse(buffer.split('\n')[0]);buffer='';const out=e=>process.stdout.write(JSON.stringify(e)+'\n');if(p.type==='get_available_models'){process.stdin.on('end',()=>process.exit(0));setTimeout(()=>out({type:'response',id:'models',success:true,data:{models:[{id:'vision',name:'Vision',provider:'test',type:'chat',input:['text','image']},{id:'text',provider:'test',type:'chat',input:['text']}]}}),30);return;}if(p.images[0].mimeType!=='image/png'||!process.argv.includes('--thinking')||process.argv[process.argv.indexOf('--thinking')+1]!=='high')process.exit(3);if(p.message==='fail'){out({type:'response',success:false,error:'fixture failure'});return;}if(p.message==='wait')return;out({type:'message_start',message:{role:'assistant'}});out({type:'message_update',assistantMessageEvent:{type:'text_delta',delta:'old\u2028text'}});out({type:'agent_end',willRetry:true});setTimeout(()=>{out({type:'message_start',message:{role:'assistant'}});out({type:'message_update',assistantMessageEvent:{type:'text_delta',delta:'final'}});out({type:'message_end',message:{role:'assistant',stopReason:'stop',content:[{type:'text',text:'final'}]}});out({type:'agent_settled',aborted:false});},30);});`;
 const server=createBridge({token,command:process.execPath,args:['-e',fake,'--'],timeoutMs:1500});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
 const body=(prompt,extra={})=>JSON.stringify({prompt,image:'data:image/png;base64,aGVsbG8=',...extra});
 try{
  assert.equal((await fetch(base+'/health')).status,401);
  assert.equal((await fetch(base+'/health',{headers:{...headers,Origin:'https://evil.test'}})).status,403);
  const health=await fetch(base+'/health',{headers});
  assert.equal(health.status,200);
  assert.deepEqual(await health.json(),{ok:true,protocol:2,bridgeVersion:2,capabilities:['models','translate']});
  const models=await fetch(base+'/models',{headers});assert.equal(models.status,200);assert.deepEqual(await models.json(),{models:[{id:'vision',provider:'test',name:'Vision'}]});
  assert.equal((await fetch(base+'/translate',{method:'POST',headers,body:JSON.stringify({prompt:'x',image:'file:///tmp/x'})})).status,400);
  assert.equal((await fetch(base+'/translate',{method:'POST',headers,body:body('invalid',{thinkingLevel:'impossible'})})).status,400);
  const response=await fetch(base+'/translate',{method:'POST',headers,body:body('ok',{thinkingLevel:'high'})});
  const rows=(await response.text()).trim().split('\n').map(JSON.parse);
  assert.ok(rows.some(r=>r.text==='old\u2028text'));
  assert.deepEqual(rows.at(-1),{type:'done',text:'final'});
  assert.equal(rows.filter(r=>r.type==='done').length,1);
  const fail=await fetch(base+'/translate',{method:'POST',headers,body:body('fail',{thinkingLevel:'high'})});
  assert.match(await fail.text(),/fixture failure/);
  const timeout=await fetch(base+'/translate',{method:'POST',headers,body:body('wait',{thinkingLevel:'high'})});
  assert.match(await timeout.text(),/timed out/);
  console.log('PASS: Pi RPC image framing, retry settlement, auth/origin, validation, failure and timeout');
 }finally{await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
