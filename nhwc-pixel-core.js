(()=>{
 const N=640*640,LUT=Float32Array.from({length:256},(_,i)=>i/255);
 function fill(rgba,values){if(rgba.length!==N*4||values.length!==N*3)throw Error('NHWC入力画素数が不正です。');for(let i=0,j=0,k=0;i<N;i++,j+=4,k+=3){values[k]=LUT[rgba[j]];values[k+1]=LUT[rgba[j+1]];values[k+2]=LUT[rgba[j+2]];}return values;}
 const api={fill};if(typeof module!=='undefined')module.exports=api;else globalThis.MangaNHWCPixels=api;
})();