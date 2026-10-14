const assert=require('node:assert/strict');
const {ResponseTiming}=require('./automation.js');
let now=100;const t=new ResponseTiming(()=>now);
assert.equal(t.snapshot().meanMs,null);
t.begin('a');now=1100;assert.equal(t.snapshot().waitingMs,1000);
now=5100;assert.equal(t.finish('a',3100),true);
assert.deepEqual(t.snapshot(),{count:1,meanMs:3000,lastMs:3000,confirmationMs:2000,waitingMs:null});
t.begin('b');now=12100;t.finish('b',10100);assert.equal(t.snapshot().meanMs,4000);
t.begin('c');t.cancel();assert.equal(t.finish('c',now),false);
assert.equal(t.finish('resumed',now),false);
t.begin('wrong');assert.equal(t.finish('other',now),false);
t.begin('invalid');assert.equal(t.finish('invalid',NaN),false);
t.begin('negative');assert.equal(t.finish('negative',now-1),false);
t.reset();assert.equal(t.snapshot().count,0);
for(let i=0;i<205;i++){t.begin('x');now+=100;t.finish('x',now);}
assert.equal(t.snapshot().count,200);assert.equal(t.snapshot().meanMs,100);
console.log('Response timing: monotonic durations, confirmation separated, failures/resumes excluded, bounded average/reset PASS');
