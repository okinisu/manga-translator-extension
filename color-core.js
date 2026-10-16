(function(root){
'use strict';
let samples,context;
function colors(canvas){
 if(!samples){samples=typeof OffscreenCanvas==='function'?new OffscreenCanvas(2,2):document.createElement('canvas');samples.width=2;samples.height=2;context=samples.getContext('2d',{willReadFrequently:true});if(!context)throw Error('背景色を取得できません。');context.imageSmoothingEnabled=false;}
 const w=canvas.width,h=canvas.height,points=[[1,1],[w-2,1],[1,h-2],[w-2,h-2]];
 context.clearRect(0,0,2,2);
 for(let i=0;i<4;i++){const [x,y]=points[i];context.drawImage(canvas,Math.max(0,x),Math.max(0,y),1,1,i%2,Math.floor(i/2),1,1);}
 // One 16-byte readback instead of four synchronous getImageData calls.
 const pixels=context.getImageData(0,0,2,2).data;
 const rgb=[0,1,2].map(k=>[pixels[k],pixels[4+k],pixels[8+k],pixels[12+k]].sort((a,b)=>a-b)[2]);
 return {background:'#'+rgb.map(v=>v.toString(16).padStart(2,'0')).join(''),foreground:rgb.reduce((a,b)=>a+b,0)>384?'#111111':'#ffffff'};
}
const api={colors};if(typeof module==='object')module.exports=api;else root.MangaColors=api;
})(globalThis);
