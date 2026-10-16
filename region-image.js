(function(root){
'use strict';
// Draw a region from its original sources, including regions spanning images.
async function draw(ctx,record,images,batchId,target,cache){
 if(record.cropBlob instanceof Blob){const im=await createImageBitmap(record.cropBlob);try{ctx.drawImage(im,target.x,target.y,target.width,target.height);}finally{im.close();}return;}
 const box=record.box;if(!box||!images?.length)throw Error('切り抜き元の情報がありません。');
 const sx=target.width/Math.ceil(box.width),sy=target.height/Math.ceil(box.height);let covered=0;
 ctx.fillStyle='#fff';ctx.fillRect(target.x,target.y,target.width,target.height);
 for(const source of images){const top=Math.max(source.top,box.y),bottom=Math.min(source.top+source.height,box.y+box.height);if(bottom<=top)continue;
  const key=batchId+':source:'+source.index;
  const load=async()=>{const value=await BatchStore.get(key);if(!value?.blob)throw Error('元画像がありません。');return createImageBitmap(value.blob);};
  const paint=bitmap=>ctx.drawImage(bitmap,box.x,top-source.top,box.width,bottom-top,target.x,target.y+(top-box.y)*sy,box.width*sx,(bottom-top)*sy);
  if(cache)await cache.use(key,load,paint);else{const bitmap=await load();try{paint(bitmap);}finally{bitmap.close();}}
  covered+=bottom-top;
 }
 if(covered<box.height-0.001)throw Error('切り抜き範囲の元画像が不足しています。');
}
const api={draw};if(typeof module==='object')module.exports=api;else root.MangaRegionImage=api;
})(globalThis);
