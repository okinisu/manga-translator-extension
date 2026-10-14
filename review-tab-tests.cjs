const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const url='chrome-extension://test/review.html';
let stored={collection:{id:'episode',reviewTab:undefined}},serial=1,listener,fail=false;
const tabs=new Map(),created=[],updates=[];
const chrome={runtime:{getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener:f=>listener=f},onStartup:{addListener(){}}},storage:{session:{get:async()=>structuredClone(stored),set:async values=>{stored={...stored,...structuredClone(values)};}}},tabs:{
 get:async id=>{if(!tabs.has(id))throw Error('closed');return {...tabs.get(id)};},
 query:async q=>Array.from(tabs.values()).filter(t=>t.url===q.url).map(t=>({...t})),
 create:async opts=>{await new Promise(r=>setTimeout(r,10));if(fail)throw Error('create failed');const tab={...opts,id:++serial};tabs.set(tab.id,tab);created.push(tab);return {...tab};},
 update:async(id,opts)=>{updates.push({id,...opts});return Object.assign(tabs.get(id),opts);}
}};
function load(){const context={chrome,URL,Map,Set,Date,Error,setTimeout,clearTimeout,importScripts(){}};vm.createContext(context);vm.runInContext(fs.readFileSync(__dirname+'/background.js','utf8'),context);return context;}
const send=(m,s={url:'chrome-extension://test/popup.html'})=>new Promise(r=>listener(m,s,r));
(async()=>{
 let context=load();
 const opened=await Promise.all([context.ensureReviewTab(9,false,'episode'),context.ensureReviewTab(9,true,'episode'),send({type:'OPEN_REVIEW'})]);
 assert.equal(created.length,1);assert.ok(opened.every(r=>r.id===created[0].id||r.ok));assert.equal(stored.collection.reviewTab,created[0].id);
 assert.equal(updates.length,2,'Only manual opening activates the review');
 const kept=created[0].id;await context.ensureReviewTab(9,false,'episode');assert.equal(created.length,1);assert.equal(updates.length,2);
 stored={};context=load();await send({type:'OPEN_REVIEW'});assert.equal(created.length,1,'Worker/extension reload finds the already open review by exact URL');
 assert.equal(stored.reviewTab,kept);
 assert.equal((await send({type:'OPEN_REVIEW'},{url:'https://example.com/'})).ok,false,'External pages cannot request review opening');
 tabs.get(kept).url='https://example.com/';await send({type:'OPEN_REVIEW'});assert.equal(created.length,2);assert.equal(tabs.get(kept).url,'https://example.com/','Do not navigate an unrelated tab');
 tabs.delete(stored.reviewTab);fail=true;await assert.rejects(context.ensureReviewTab(9),/create failed/);fail=false;await context.ensureReviewTab(9);assert.equal(created.length,3,'Closed tab is recreated and failed acquisition releases lock');
 // Existing producer wins over another identical review page.
 const producer=stored.reviewTab;tabs.set(999,{id:999,url});stored.collection={id:'episode',reviewTab:producer};stored.reviewTab=999;
 assert.equal((await context.ensureReviewTab(9,false,'episode')).id,producer);
 assert.ok(!/tabs\.create/.test(fs.readFileSync(__dirname+'/popup.js','utf8')),'Popup must delegate tab creation to the shared background handler');
 console.log('PASS: single review tab across concurrent starts/menu, background focus, reload recovery, closed/foreign tabs, origin guard and producer preference');
})().catch(e=>{console.error(e);process.exitCode=1;});
