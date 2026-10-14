(()=>{
 function select(scores,boxes,width,height){
  if(!(scores instanceof Float32Array)||scores.length!==900||!(boxes instanceof Float32Array)||boxes.length!==1200||!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw Error('推論出力の形状が不正です。');
  for(const s of scores)if(!Number.isFinite(s)||s<0||s>1)throw Error('推論スコアが不正です。');
  for(const b of boxes)if(!Number.isFinite(b))throw Error('推論座標が不正です。');
  const order=Array.from({length:900},(_,i)=>i).sort((a,b)=>scores[b]-scores[a]||a-b).slice(0,300),labels=new Int32Array(300),selected=new Float32Array(300),xyxy=new Float32Array(1200);
  for(let i=0;i<300;i++){const index=order[i],query=Math.floor(index/3);labels[i]=index%3;selected[i]=scores[index];for(let k=0;k<4;k++)xyxy[i*4+k]=Math.fround(boxes[query*4+k]*(k%2?height:width));}
  return {labels,boxes:xyxy,scores:selected};
 }
 const api={select};if(typeof module!=='undefined')module.exports=api;else globalThis.MangaPostprocess=api;
})();
