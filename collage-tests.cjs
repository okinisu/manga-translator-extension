const legacyPages=records=>M.pages(records,'compact');
const assert=require('node:assert/strict'),M=require('./collage-core.js');global.MangaCollage=M;const C=require('./core.js');
const candidates=M.detections([0n,1n,1n,2n],[0,0,100,100,10,10,80,50,12,12,79,49,100,100,150,150],[.99,.95,.8,.7],200,200);assert.equal(candidates.length,2);assert.equal(candidates[0].kind,1);
const images=[{src:'one',index:0,top:0,width:690,height:1600},{src:'two',index:1,top:1600,width:690,height:1600}];const a=M.anchor({x:100,y:1550,width:200,height:100},images);assert.equal(a.spanEnd.src,'two');assert.equal(a.spanEnd.y,50/1600);
const records=Array.from({length:101},(_,i)=>({id:String(i+1).padStart(6,'0'),enabled:i!==5,box:{x:10,y:i*200,width:400,height:160},src:'one',relative:{x:.1,y:.2,width:.3,height:.1},background:'#ffffff',foreground:'#111111'}));const pages=legacyPages(records);assert.ok(pages.length>1);assert.equal(pages.flatMap(p=>p.entries).length,100);for(const p of pages){assert.ok(p.height<=4096);assert.ok(p.entries.length<=80);for(const e of p.entries){assert.ok(e.x+e.width<=p.width);assert.ok(e.y+e.height<=p.height);}}
const job={id:'atlas1',type:'collage',records:records.slice(0,3)},answer={jobId:job.id,items:job.records.map(r=>({id:r.id,ko:'안녕하세요.',ja:'こんにちは。'}))};assert.match(C.prompt(job),/000001/);const out=M.parse(JSON.stringify(answer),job);assert.equal(out.length,3);assert.deepEqual(out[0].relative,job.records[0].relative);assert.equal(out[0].original,'안녕하세요.');
for(const v of [{...answer,jobId:'old'},{...answer,items:answer.items.slice(1)},{...answer,items:[answer.items[0],answer.items[0],answer.items[2]]},{...answer,items:[...answer.items.slice(1),{id:'unknown',ja:'x',ko:'x'}]}])assert.throws(()=>M.parse(JSON.stringify(v),job));
assert.equal(M.parse(JSON.stringify({jobId:job.id,items:job.records.map(r=>({id:r.id,skip:true}))}),job).length,0);
console.log('PASS: text-only detection filtering, duplicate suppression, cross-image anchoring, atlas bounds and coverage, exact ID completeness, skip without overlays');

// Compact crops hit the count limit, tall crops hit the height limit, without shrinking normal text.
const compact=legacyPages(Array.from({length:49},(_,i)=>({id:String(i),box:{width:400,height:100}})));
assert.deepEqual(compact.map(p=>p.entries.length),[49]);assert.ok(compact.flatMap(p=>p.entries).every(e=>e.scale===1));
const tall=legacyPages(Array.from({length:9},(_,i)=>({id:String(i),box:{width:400,height:900}})));
assert.deepEqual(tall.map(p=>p.entries.length),[9]);assert.ok(tall.every(p=>p.height<=4096));

const small=legacyPages(Array.from({length:81},(_,i)=>({id:String(i),box:{width:400,height:60}})));assert.deepEqual(small.map(p=>p.entries.length),[80,1]);assert.ok(small.flatMap(p=>p.entries).every(e=>e.scale===1));assert.equal(new Set(small.flatMap(p=>p.entries.map(e=>e.id))).size,81);

assert.deepEqual(compact[0].entries.slice(0,4).map(e=>e.x),[12,436,860,1284]);assert.equal(compact[0].width,2544);const taller=legacyPages(Array.from({length:13},(_,i)=>({id:String(i),box:{width:400,height:900}})));assert.deepEqual(taller.map(p=>p.entries.length),[13]);for(const page of pages)for(let i=0;i<page.entries.length;i++)for(let j=i+1;j<page.entries.length;j++){const a=page.entries[i],b=page.entries[j];assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y,'Crops must not overlap');}

const heightLimited=legacyPages(Array.from({length:25},(_,i)=>({id:String(i),box:{width:400,height:900}})));assert.deepEqual(heightLimited.map(p=>p.entries.length),[24,1]);assert.ok(heightLimited.every(p=>p.height<=4096));

const mixed=legacyPages([{id:"a",box:{width:50,height:50}},{id:"b",box:{width:300,height:100}}]);assert.equal(mixed[0].width,488);assert.deepEqual(mixed[0].entries.map(e=>e.x),[12,176]);assert.ok(mixed[0].entries.every(e=>e.scale===1));for(const p of legacyPages(Array.from({length:100},(_,i)=>({id:String(i),box:{width:50+(i*137)%800,height:30+(i*71)%1000}})))){assert.ok(p.width<=2880&&p.height<=4096);for(let i=0;i<p.entries.length;i++)for(let j=i+1;j<p.entries.length;j++){const a=p.entries[i],b=p.entries[j];assert.ok(a.x+a.cellWidth<=b.x||b.x+b.cellWidth<=a.x||a.y+a.height+8<=b.y-40||b.y+b.height+8<=a.y-40);}}

const multilingual={...job,sourceLanguage:'en',targetLanguage:'fr'};assert.match(M.prompt(multilingual),/翻訳元：英語/);assert.match(M.prompt(multilingual),/翻訳先：フランス語/);assert.ok(!M.prompt(multilingual).includes('自然な日本語'));const generic={jobId:job.id,items:job.records.map(r=>({id:r.id,original:'Hello',translated:'Bonjour'}))};assert.equal(M.parse(JSON.stringify(generic),multilingual)[0].ja,'Bonjour');assert.equal(M.parse(JSON.stringify(generic),multilingual)[0].original,'Hello');assert.match(M.prompt({...job,sourceLanguage:'auto',targetLanguage:'en'}),/画像から(?:原文の)?言語を特定/);assert.equal(M.languages({targetLanguage:'auto'}).target,'日本語');assert.equal(M.languages().source,'韓国語');assert.equal(M.languages().target,'日本語');

assert.match(M.persona({sourceLanguage:'ko',targetLanguage:'ja'}),/パッチム/);assert.match(M.persona({sourceLanguage:'ja',targetLanguage:'en'}),/濁点/);assert.ok(!M.persona({sourceLanguage:'en',targetLanguage:'fr'}).includes('パッチム'));assert.match(M.persona({sourceLanguage:'en',targetLanguage:'fr'}),/tu\/vous/);assert.match(M.persona({sourceLanguage:'auto',targetLanguage:'zh-TW'}),/まず画像から原文の言語を特定/);assert.match(M.persona({targetLanguage:'zh-TW'}),/繁体字を使い/);for(const sourceLanguage of ['auto','ko','ja','en','zh','zh-TW','es','fr','de','ru','pt','th','vi'])for(const targetLanguage of ['ko','ja','en','zh','zh-TW','es','fr','de','ru','pt','th','vi'])assert.ok(!M.persona({sourceLanguage,targetLanguage}).includes('undefined'));

// Per-class thresholds include boundary values and preserve explicit overrides.
const thresholdLabels=[1,1,2,2,2],thresholdBoxes=thresholdLabels.flatMap((_,i)=>[i*100,0,i*100+50,50]),thresholdScores=[.479,.48,.479,.48,.49];
assert.deepEqual(M.detections(thresholdLabels,thresholdBoxes,thresholdScores,600,100).map(r=>[r.kind,r.score]),[[1,.48],[2,.48],[2,.49]]);
assert.deepEqual(M.detections(thresholdLabels,thresholdBoxes,thresholdScores,600,100,.5).map(r=>[r.kind,r.score]),[]);
assert.deepEqual(M.detections(thresholdLabels,thresholdBoxes,thresholdScores,600,100,{1:.5,2:.48}).map(r=>[r.kind,r.score]),[[2,.48],[2,.49]]);

const incomplete={jobId:job.id,items:[answer.items[0]]};
const partial=M.parsePartial(JSON.stringify(incomplete),job);
assert.deepEqual(partial.missing,job.records.slice(1).map(r=>r.id));assert.equal(partial.blocks.length,1);
assert.throws(()=>M.parse(JSON.stringify(incomplete),job),/不足/);
assert.throws(()=>M.parsePartial(JSON.stringify({...incomplete,items:[answer.items[0],answer.items[0]]}),job),/重複/);
assert.throws(()=>M.parsePartial(JSON.stringify({...incomplete,items:[{id:'unknown',skip:true}]}),job),/不一致/);
assert.throws(()=>M.parsePartial(JSON.stringify({...incomplete,items:[{id:job.records[0].id,original:'only original'}]}),job),/形式/);
assert.equal(M.parsePartial(JSON.stringify({jobId:job.id,items:[{id:job.records[0].id,skip:true}]}),job).blocks.length,0);

// Batch profiles trade image count for fewer regions without changing crop scale.
const batchRecords=Array.from({length:240},(_,i)=>({id:String(i),box:{width:400,height:100}}));
const counts={accuracy:8,balanced:5,compact:3};
for(const mode of Object.keys(counts)){
 const limits=M.batchProfile(mode),packed=M.pages(batchRecords,mode);
 assert.equal(packed.length,counts[mode]);assert.deepEqual(packed.flatMap(p=>p.entries.map(e=>e.id)),batchRecords.map(r=>r.id));
 assert.ok(packed.every(p=>p.width<=limits.width&&p.height<=limits.height&&p.entries.length<=limits.maxEntries));
 assert.ok(packed.flatMap(p=>p.entries).every(e=>e.scale===1));
 const varied=batchRecords.map((r,i)=>({...r,box:{width:50+(i*137)%800,height:30+(i*71)%1000}}));
 const variedPages=M.pages(varied,mode);assert.equal(variedPages.flatMap(p=>p.entries).length,varied.length);
 assert.ok(variedPages.every(p=>p.width<=limits.width&&p.height<=limits.height&&p.entries.length<=limits.maxEntries));
 for(const p of variedPages)for(let i=0;i<p.entries.length;i++)for(let j=i+1;j<p.entries.length;j++){const a=p.entries[i],b=p.entries[j];assert.ok(a.x+a.cellWidth<=b.x||b.x+b.cellWidth<=a.x||a.y+a.height+8<=b.y-40||b.y+b.height+8<=a.y-40);}
}
assert.equal(M.batchProfile('toString').name,'balanced');assert.equal(M.batchProfile('unknown').name,'balanced');
assert.deepEqual(M.pages(batchRecords),M.pages(batchRecords,'balanced'));

assert.equal(M.detections([1,2],[0,0,50,50,100,0,150,50],new Float32Array([.48,.48]),200,100).length,2,"FP32 boundary scores at 48% must be retained");

// Translation-only replies keep strict IDs, partial retry and legacy input compatibility.
const translatedOnly={jobId:job.id,items:job.records.map(r=>({id:r.id,translated:'訳文'}))};
const compactOutput=M.parse(JSON.stringify(translatedOnly),job);
assert.equal(compactOutput.length,3);assert.equal(compactOutput[0].ja,'訳文');assert.equal(compactOutput[0].original,'');
assert.deepEqual(compactOutput[0].relative,job.records[0].relative);
assert.equal(M.parse(JSON.stringify(answer),job)[0].original,'안녕하세요.');
const translatedPartial=M.parsePartial(JSON.stringify({...translatedOnly,items:translatedOnly.items.slice(0,1)}),job);
assert.deepEqual(translatedPartial.missing,job.records.slice(1).map(r=>r.id));
assert.equal(translatedPartial.blocks[0].ja,'訳文');
for(const translated of ['',123,null,'x'.repeat(3001)])assert.throws(()=>M.parsePartial(JSON.stringify({jobId:job.id,items:[{id:job.records[0].id,translated}]}),job),/形式/);
for(const original of ['',123,'x'.repeat(3001)])assert.throws(()=>M.parsePartial(JSON.stringify({jobId:job.id,items:[{id:job.records[0].id,original,translated:'訳文'}]}),job),/形式/);
assert.throws(()=>M.parse(JSON.stringify({...translatedOnly,items:[translatedOnly.items[0],translatedOnly.items[0]]}),job),/重複/);
const compactPrompt=M.prompt({...job,context:[{original:'',translated:'前の訳'}],recoveryRoot:'root'});
assert.match(compactPrompt,/idとtranslatedだけ/);
assert.ok(!compactPrompt.includes('"original":"原文"'));
assert.match(compactPrompt,/初回のoriginalを正解と仮定せず/);
assert.match(compactPrompt,/欠落IDだけ/);
assert.ok(!compactPrompt.includes('undefined'));
console.log('PASS: translation-only output, legacy original input, strict/partial validation and retry prompt');
