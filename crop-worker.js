importScripts('performance-core.js','color-core.js');
onmessage=async({data:{id,bitmap,records,windowY,encode=true}})=>{
 try{
  const result=await MangaPerformance.mapLimit(records,2,async r=>{
   const b=r.box,w=Math.ceil(b.width),h=Math.ceil(b.height);
   if(![b.x,b.y,b.width,b.height,windowY].every(Number.isFinite)||w<1||h<1||w*h>5000000||b.x<0||b.y<windowY||b.x+b.width>bitmap.width||b.y+b.height>windowY+bitmap.height)throw Error('切り抜き範囲が不正です。');
   const c=new OffscreenCanvas(w,h);
   try{
    const ctx=c.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('Canvasを作成できません。');
    ctx.fillStyle='#ffffff';ctx.fillRect(0,0,w,h);ctx.drawImage(bitmap,b.x,b.y-windowY,b.width,b.height,0,0,b.width,b.height);
    const palette=MangaColors.colors(c);
    const cropBlob=encode?await c.convertToBlob({type:'image/png'}):undefined;
    return {...palette,cropBlob};
   }finally{c.width=1;c.height=1;}
  });
  postMessage({id,records:result});
 }catch(e){postMessage({id,error:e.message});}finally{bitmap.close();}
};
