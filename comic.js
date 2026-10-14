(() => {
  const pageURL=location.href,key='manga:'+pageURL;let blocks=[],visible=true,adjust=false,selecting=false;
  const host=document.createElement('div');host.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:2147483645';const root=host.attachShadow({mode:'closed'});document.documentElement.append(host);
  const style=document.createElement('style');style.textContent=`.box{position:absolute;display:flex;align-items:center;justify-content:center;box-sizing:border-box;padding:3px;overflow:hidden;white-space:pre-wrap;overflow-wrap:anywhere;text-align:center;font-family:"Noto Sans JP",Meiryo,sans-serif;line-height:1.2;border-radius:2px;pointer-events:none}.box.edit{pointer-events:auto;resize:both;cursor:move;outline:2px dashed #1678dd}.bar{position:absolute;bottom:18px;right:18px;background:#fff;border:1px solid #aac0d7;border-radius:10px;padding:9px;font:13px system-ui;color:#17283f;pointer-events:auto;box-shadow:0 3px 15px #0002}.bar button{margin:3px;padding:6px;cursor:pointer}.select{position:fixed;inset:0;pointer-events:auto;cursor:crosshair;background:#0001}.rect{position:absolute;border:2px solid #1686ff;background:#1686ff22}.hint{position:absolute;top:16px;left:50%;transform:translateX(-50%);padding:12px;background:#fff;color:#17283f;font:14px system-ui;border-radius:8px}`;root.append(style);
  const layer=document.createElement('div');root.append(layer);const bar=document.createElement('div');bar.className='bar';bar.hidden=true;root.append(bar);
  const status=document.createElement('span');bar.append(status);if(typeof MangaUI!=='undefined')MangaUI.attach(bar);
  function control(text,fn){const b=document.createElement('button');b.textContent=text;b.onclick=fn;bar.append(b);return b;}
  const toggle=control('原文を見る',()=>{visible=!visible;save();render();});const edit=control('位置調整',()=>{adjust=!adjust;render();});
  control('削除',()=>{if(confirm((typeof MangaUI==='undefined'?s=>s:MangaUI.text)('この話の翻訳表示を削除しますか？'))){blocks=[];save();render();}});
  function save(){return chrome.storage.local.set({[key]:{blocks:blocks.filter(b=>!b.provisional),visible,updated:Date.now()}});}
  function imageFor(b){return Array.from(document.images).find(i=>i.currentSrc===b.src);}
  function fit(el){let f=Math.min(22,Math.max(10,el.clientHeight/3));el.style.fontSize=f+'px';while(f>7&&(el.scrollHeight>el.clientHeight||el.scrollWidth>el.clientWidth)){f-=.5;el.style.fontSize=f+'px';}}
  function render(){
    layer.replaceChildren();bar.hidden=!blocks.length||selecting;toggle.textContent=visible?'原文を見る':'日本語に戻す';edit.textContent=adjust?'調整を終える':'位置調整';status.textContent=`日本語 ${blocks.length}件`+(blocks.some(b=>b.provisional)?'（生成中の仮表示あり）':'');
    if(!visible||selecting)return;
    for(const b of blocks){const img=imageFor(b);if(!img)continue;const r=img.getBoundingClientRect(),q=b.relative;if(r.width===0)continue;const startY=r.y+q.y*r.height,endImg=b.spanEnd?Array.from(document.images).find(i=>i.currentSrc===b.spanEnd.src):null,endRect=endImg?.getBoundingClientRect();const boxHeight=endRect?endRect.y+b.spanEnd.y*endRect.height-startY:q.height*r.height;if(startY+boxHeight<0||startY>innerHeight||boxHeight<=0)continue;
      const el=document.createElement('div');el.className='box'+(adjust&&!b.provisional?' edit':'');el.textContent=b.ja;el.title=b.original;el.style.cssText=`left:${r.x+q.x*r.width}px;top:${r.y+q.y*r.height}px;width:${q.width*r.width}px;height:${boxHeight}px;background:${b.background};color:${b.foreground};`;layer.append(el);fit(el);
      if(adjust&&!b.provisional){
        el.addEventListener('dblclick',()=>{const value=prompt((typeof MangaUI==='undefined'?s=>s:MangaUI.text)('日本語訳を修正'),b.ja);if(value?.trim()){b.ja=value.trim().slice(0,1500);save();render();}});
        el.addEventListener('pointerdown',e=>{if(e.button!==0)return;const er=el.getBoundingClientRect();if(e.clientX>er.right-18&&e.clientY>er.bottom-18)return;e.preventDefault();if(b.spanEnd){q.height=boxHeight/r.height;delete b.spanEnd;}const start={x:e.clientX,y:e.clientY,qx:q.x,qy:q.y};el.setPointerCapture(e.pointerId);el.onpointermove=ev=>{q.x=start.qx+(ev.clientX-start.x)/r.width;q.y=start.qy+(ev.clientY-start.y)/r.height;el.style.left=(r.x+q.x*r.width)+'px';el.style.top=(r.y+q.y*r.height)+'px';};el.onpointerup=()=>{el.onpointermove=null;save();};});
        el.addEventListener('pointerup',()=>{q.width=el.offsetWidth/r.width;q.height=el.offsetHeight/r.height;delete b.spanEnd;save();fit(el);});
      }
    }
  }
  let pending=false;function schedule(){if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;if(!adjust)render();});}
  addEventListener('scroll',schedule,{passive:true});addEventListener('resize',()=>{adjust=false;schedule();});document.addEventListener('load',schedule,true);
  new ResizeObserver(schedule).observe(document.documentElement);
  async function select(){
    if(selecting)return;selecting=true;adjust=false;render();const panel=document.createElement('div');panel.className='select';const hint=document.createElement('div');hint.className='hint';hint.textContent='翻訳したい漫画部分をドラッグして選択（Escで取消）';const rect=document.createElement('div');rect.className='rect';panel.append(hint,rect);root.append(panel);let start;
    const cleanup=()=>{panel.remove();removeEventListener('keydown',escape);selecting=false;render();};const escape=e=>{if(e.key==='Escape')cleanup();};addEventListener('keydown',escape);
    panel.onpointerdown=e=>{if(e.button!==0)return;start={x:e.clientX,y:e.clientY};panel.setPointerCapture(e.pointerId);};
    function bounds(e){const x=Math.min(start.x,Math.max(0,Math.min(innerWidth,e.clientX))),y=Math.min(start.y,Math.max(0,Math.min(innerHeight,e.clientY)));return{x,y,width:Math.abs(start.x-Math.max(0,Math.min(innerWidth,e.clientX))),height:Math.abs(start.y-Math.max(0,Math.min(innerHeight,e.clientY)))};}
    panel.onpointermove=e=>{if(!start)return;const r=bounds(e);rect.style.cssText=`left:${r.x}px;top:${r.y}px;width:${r.width}px;height:${r.height}px`;};
    panel.onpointerup=async e=>{if(!start)return;const r=bounds(e);start=null;if(r.width<20||r.height<20){cleanup();return;}const images=Array.from(document.images).filter(i=>i.naturalWidth>=300).map(i=>{const b=i.getBoundingClientRect();return{src:i.currentSrc,x:b.x,y:b.y,width:b.width,height:b.height};}).filter(i=>i.width>0&&i.x<r.x+r.width&&i.x+i.width>r.x&&i.y<r.y+r.height&&i.y+i.height>r.y);
      panel.remove();removeEventListener('keydown',escape);host.style.visibility='hidden';await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      try{const result=await chrome.runtime.sendMessage({type:'CAPTURE',rect:r,images,viewport:{width:innerWidth,height:innerHeight}});if(!result?.ok)throw Error(result?.error||'画像取得に失敗しました。');}catch(err){alert(err.message);}finally{host.style.visibility='';selecting=false;render();}
    };
  }
  chrome.runtime.onMessage.addListener((m,s,reply)=>{if(s.id!==chrome.runtime.id)return;try{
    if(m.type==='WHOLE'){
      const urls=Array.from(document.querySelectorAll('img[id^="content_image_"],img[alt="comic content"]')).map(i=>i.getAttribute('data-src')||i.currentSrc||i.src).filter(src=>MangaCore.episodeImage(src,location.href));
      chrome.runtime.sendMessage({type:'BATCH_START',urls,automatic:!!m.automatic,provider:m.provider}).then(reply,e=>reply({ok:false,error:e.message}));return true;
    }
    else if(m.type==='SELECT'){select();reply({ok:true});}
    else if(m.type==='APPLY'){if(location.href!==m.url||pageURL!==m.url)throw Error('ページが変わりました。');if(m.clearJobIds){const cleared=new Set(m.clearJobIds);blocks=blocks.filter(b=>!cleared.has(b.jobId));}if(m.incremental){const ids=new Set(m.blocks.map(b=>b.blockId));blocks=blocks.filter(b=>!ids.has(b.blockId));}else blocks=blocks.filter(b=>b.jobId!==m.jobId);blocks.push(...m.blocks);if(m.provisional){render();reply({ok:true});return true;}save().then(()=>{render();reply({ok:true});},e=>reply({ok:false,error:e.message}));return true;}
    else if(m.type==='STATUS')reply({ok:true,visible});
    else if(m.type==='TOGGLE'){visible=!visible;save();render();reply({ok:true});}
    else if(m.type==='CLEAR'){blocks=[];save();render();reply({ok:true});}
  }catch(e){reply({ok:false,error:e.message});}});
  chrome.storage.local.get(key).then(data=>{if(data[key]){blocks=data[key].blocks||[];visible=data[key].visible!==false;}render();});
})();
