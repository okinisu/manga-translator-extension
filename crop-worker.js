importScripts('performance-core.js');
onmessage=async({data:{id,bitmap,records,windowY}})=>{
 try{
  const result=await MangaPerformance.mapLimit(records,2,async r=>{
   const b=r.box,w=Math.ceil(b.width),h=Math.ceil(b.height);
   if(![b.x,b.y,b.width,b.height,windowY].every(Number.isFinite)||w<1||h<1||w*h>5000000||b.x<0||b.y<windowY||b.x+b.width>bitmap.width||b.y+b.height>windowY+bitmap.height)throw Error('切り抜き範囲が不正です。');
   const c=new OffscreenCanvas(w,h);
   try{
    const ctx=c.getContext('2d');if(!ctx)throw Error('Canvasを作成できません。');
    ctx.fillStyle='#ffffff';ctx.fillRect(0,0,w,h);ctx.drawImage(bitmap,b.x,b.y-windowY,b.width,b.height,0,0,b.width,b.height);
    const points=[[1,1],[w-2,1],[1,h-2],[w-2,h-2]].map(([x,y])=>ctx.getImageData(Math.max(0,x),Math.max(0,y),1,1).data);
    const rgb=[0,1,2].map(k=>points.map(p=>p[k]).sort((a,b)=>a-b)[2]);
    const cropBlob=await c.convertToBlob({type:'image/png'});
    return {background:'#'+rgb.map(v=>v.toString(16).padStart(2,'0')).join(''),foreground:rgb.reduce((a,b)=>a+b,0)>384?'#111111':'#ffffff',cropBlob};
   }finally{c.width=1;c.height=1;}
  });
  postMessage({id,records:result});
 }catch(e){postMessage({id,error:e.message});}finally{bitmap.close();}
};
