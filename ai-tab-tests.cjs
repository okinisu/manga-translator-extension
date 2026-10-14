const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context={URL,Map,Set,Date,Error,setTimeout,clearTimeout,importScripts(){}};
let stored={collection:{id:'episode',sourceTab:1,aiProvider:'chatgpt'}},local={},serial=1,hidden=true,ready=false,failCreate=false;
const created=[],tabs=new Map([[1,{id:1,windowId:9,url:'https://comic.naver.com/'}]]);
context.chrome={runtime:{getURL:()=> 'chrome-extension://test/',onMessage:{addListener(){}},onStartup:{addListener(){}}},storage:{session:{get:async()=>structuredClone(stored),set:async d=>{stored={...stored,...structuredClone(d)};}},local:{get:async d=>({...d,...structuredClone(local)}),set:async d=>{local={...local,...structuredClone(d)};}}},tabs:{
 get:async id=>{if(!tabs.has(id))throw Error('closed');const t=tabs.get(id);if(hidden&&id!==1){const {url,...result}=t;return result;}return {...t};},
 create:async opts=>{await new Promise(r=>setTimeout(r,15));if(failCreate)throw Error('create failed');const t={...opts,id:++serial,status:'loading'};created.push(t);tabs.set(t.id,t);return {...t};},
 update:async(id,opts)=>Object.assign(tabs.get(id),opts),
 sendMessage:async(id,m)=>{if(m.type!=='AI_PROBE')return {ok:true};if(!ready)throw Error('listener not loaded');return {ok:true,provider:tabs.get(id).url.startsWith('https://chatgpt.com/')?'chatgpt':'gemini'};}
}};
vm.createContext(context);vm.runInContext(fs.readFileSync(__dirname+'/background.js','utf8'),context);
(async()=>{
 const job={id:'page',batchId:'episode',sourceTab:1,aiProvider:'chatgpt'};
 await Promise.all([context.preloadAI(stored.collection),context.openAI(job,true)]);
 assert.equal(created[0].url,'https://chatgpt.com/?temporary-chat=true');
 assert.equal(created.length,1,'Simultaneous preload and first image must share tab creation');
 assert.equal(stored.collection.chatTab,stored.job.chatTab);
 await context.openAI({...job},true);assert.equal(created.length,1,'Hidden URL and unavailable content script must reuse our loading tab');
 ready=true;await context.openAI({...job},false);assert.equal(created.length,1);assert.equal(tabs.get(job.chatTab).active,true,'Manual opening still activates existing tab');
 tabs.delete(job.chatTab);await context.openAI({...job},true);assert.equal(created.length,2,'Closed tab must be replaced');
 hidden=false;tabs.get(stored.job.chatTab).url='https://example.com/';await context.openAI({...stored.job},true);assert.equal(created.length,3,'Confirmed foreign origin must not be reused');
 await context.ensureAITab('gemini',1);assert.equal(created.length,4,'Providers retain separate tabs');
 tabs.delete(stored.aiTabs.gemini);failCreate=true;await assert.rejects(context.ensureAITab('gemini',1),/create failed/);failCreate=false;
 await context.ensureAITab('gemini',1);assert.equal(created.length,5,'Failed acquisition must release single-flight state');
 const temporary=stored.job.chatTab;
 local.chatgptChatMode='normal';
 await context.openAI({...stored.job},true);
 assert.equal(stored.job.chatTab,temporary,'A running episode retains its temporary mode after preference changes');
 const regular=await context.ensureAITab('chatgpt',1,undefined,'normal');
 assert.notEqual(regular.id,temporary);assert.equal(regular.url,'https://chatgpt.com/');
 assert.equal((await context.ensureAITab('chatgpt',1,undefined,'temporary')).id,temporary);
 stored.collection=undefined;
 await context.openAI({id:'legacy',sourceTab:1,chatTab:regular.id,aiProvider:'chatgpt',automation:{phase:'sent'}},true);
 assert.equal(stored.job.chatTab,regular.id,'Legacy sent requests stay in the regular chat');
 local.chatgptChatMode='temporary';
 await context.openAI({id:'new',sourceTab:1,aiProvider:'chatgpt'},true);
 assert.equal(stored.job.chatTab,temporary,'New jobs use the temporary default and reuse its own tab');
 console.log('PASS: temporary default, normal/temporary isolation, preference pinning, legacy sent resume; AI preload/open race, loading hidden-URL reuse, activation, closed/foreign tabs, provider isolation and creation-error recovery');
})().catch(e=>{console.error(e);process.exitCode=1;});
