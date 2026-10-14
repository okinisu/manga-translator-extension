(() => {
  // Tab-local timings contain durations only; no prompts, images or responses.
  class ResponseTiming {
    constructor(now=()=>performance.now()){this.now=now;this.pending=null;this.samples=[];}
    begin(id){this.pending={id,start:this.now()};}
    cancel(){this.pending=null;}
    finish(id,end,confirmed=this.now()){
      const p=this.pending;this.pending=null;
      if(!p||p.id!==id||![end,confirmed].every(Number.isFinite)||end<p.start||confirmed<end)return false;
      this.samples.push({responseMs:end-p.start,confirmationMs:confirmed-end});
      if(this.samples.length>200)this.samples.shift();
      return true;
    }
    reset(){this.samples=[];}
    snapshot(){
      const count=this.samples.length,last=this.samples.at(-1);
      return {count,meanMs:count?this.samples.reduce((n,s)=>n+s.responseMs,0)/count:null,
        lastMs:last?.responseMs??null,confirmationMs:last?.confirmationMs??null,
        waitingMs:this.pending?Math.max(0,this.now()-this.pending.start):null};
    }
  }
  class Runner {
    constructor(api){this.api=api;this.controller=null;}
    get running(){return !!this.controller;}
    stop(){this.controller?.abort();}
    async start(){
      if(this.running)throw Error('自動翻訳は実行中です。');
      const controller=new AbortController();this.controller=controller;const signal=controller.signal;
      const check=()=>{if(signal.aborted)throw new DOMException('停止しました。','AbortError');};
      try{
        while(true){
          check();const info=await this.api.get();check();const j=info.job;
          if(!j&&info.waiting){this.api.progress?.(info,'次の画像を準備中');await this.api.delay(1000,signal);continue;}
          if(!j&&info.finished){this.api.complete?.();return;}
          if(!j||(j.type!=='text'&&!j.image))throw Error('翻訳待ちの画像がありません。');
          this.api.progress?.(info,'画像を準備');
          if(!['sending','sent'].includes(j.automation?.phase)){
            await this.api.prepare(j,signal);check();
            // クリックより先に状態を保存する。結果が不明なら再送しない。
            const attempt=await this.api.mark(j,'sending');let sendInvoked=false;
            try{
              check();sendInvoked=true;await this.api.send(j,signal);
              await this.api.mark(j,'sent',attempt);check();
            }catch(e){
              if(!sendInvoked||e.notSent===true){
                // Keep uncertain/old attempts intact if recovery cannot be confirmed.
                try{await this.api.recoverUnsent?.(j,attempt);}catch{}
              }
              throw e;
            }
          }
          this.api.progress?.(info,'返答を待機');
          const text=await this.api.reply(j,signal);check();
          this.api.progress?.(info,'日本語を反映');
          const result=await this.api.import(text);check();
          if(!result.hasNext){this.api.complete?.();return;}
          await this.api.nextReady?.(j,signal);check();
        }
      }finally{this.controller=null;}
    }
  }
  if(typeof module!=='undefined')module.exports={Runner,ResponseTiming};else globalThis.MangaAutomation={Runner,ResponseTiming};
})();
