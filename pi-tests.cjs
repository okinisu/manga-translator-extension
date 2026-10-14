const assert=require('node:assert/strict');
(async()=>{
 const {createBridge}=await import('./scripts/pi-bridge.mjs');
 const token='test-key-'.repeat(5);
 const fake=String.raw`let buffer='';process.stdin.setEncoding('utf8');process.stdin.on('data',c=>{buffer+=c;if(!buffer.includes('\n'))return;const p=JSON.parse(buffer.split('\n')[0]);buffer='';const out=e=>process.stdout.write(JSON.stringify(e)+'\n');if(p.images[0].mimeType!=='image/png'||!process.argv.includes('--thinking')||process.argv[process.argv.indexOf('--thinking')+1]!=='high')process.exit(3);if(p.message==='fail'){out({type:'response',success:false,error:'fixture failure'});return;}if(p.message==='wait')return;out({type:'message_start',message:{role:'assistant'}});out({type:'message_update',assistantMessageEvent:{type:'text_delta',delta:'old\u2028text'}});out({type:'agent_end',willRetry:true});setTimeout(()=>{out({type:'message_start',message:{role:'assistant'}});out({type:'message_update',assistantMessageEvent:{type:'text_delta',delta:'final'}});out({type:'message_end',message:{role:'assistant',stopReason:'stop',content:[{type:'text',text:'final'}]}});out({type:'agent_settled',aborted:false});},30);});`;
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
