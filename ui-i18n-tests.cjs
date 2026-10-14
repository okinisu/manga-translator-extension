const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/ui-i18n.js','utf8');
class E {
 constructor(tag,attrs={},children=[]){this.nodeType=1;this.tagName=tag.toUpperCase();this.attrs=attrs;this.childNodes=children;children.forEach(n=>n.parentElement=this);this.value='';}
 matches(s){return s.split(',').some(v=>v==='[data-no-localize]'?this.hasAttribute('data-no-localize'):v.toUpperCase()===this.tagName);}
 closest(s){return this.matches(s)?this:this.parentElement?.closest(s)||null;}
 hasAttribute(k){return Object.hasOwn(this.attrs,k);}getAttribute(k){return this.attrs[k]??null;}setAttribute(k,v){this.attrs[k]=v;}
 querySelector(s){if(s==='#'+this.attrs.id)return this;for(const c of this.childNodes){const v=c.querySelector?.(s);if(v)return v;}return null;}
}
const T=value=>({nodeType:3,nodeValue:value});
let changed;const callbacks=[];
const ctx=vm.createContext({console,queueMicrotask,MutationObserver:class{constructor(fn){callbacks.push(fn);}observe(){}},chrome:{storage:{local:{get:async()=>({uiLanguage:'en'})},onChanged:{addListener:f=>changed=f}}}});
vm.runInContext(source,ctx);const U=ctx.MangaUI;
(async()=>{
 assert.equal(U.translate('画像取得：2/3 ｜ 文字検出：1/… ｜ モデル起動中'),'Images: 2/3 | Text detection: 1/… | Loading model');
 assert.equal(U.translate('画像取得：3/3 ｜ 文字検出：2/4 ｜ WebGPU＋CPU補助・2並列・実行中1'),'Images: 3/3 | Text detection: 2/4 | WebGPU + CPU fallback · 2 workers · 1 active');
 assert.equal(U.translate('直近の推論応答待ち 35ms'),'Last inference response wait: 35ms');assert.equal(U.translate('工程別の平均'),'Average per window');
 const label=T('LANGUAGE'),heading=T('漫画翻訳'),status=T('翻訳 1 / 3 — 返答を待機'),option=T('日本語');
 const selector=new E('select',{id:'uiLanguage','data-no-localize':''},[option]);
 const prompt=new E('textarea',{id:'prompt'});prompt.value='韓国語の原文を正確に読み取ってください。';
 const result=new E('textarea',{id:'result',placeholder:'番号付き画像の翻訳JSON'});result.value='{"original":"일곱","translated":"七つ"}';
 const overlayText=T('入口広場');const overlay=new E('div',{'data-no-localize':''},[overlayText]);
 const root=new E('section',{},[label,selector,heading,status,prompt,result,overlay]);
 U.attach(root);await U.ready;
 assert.equal(label.nodeValue,'LANGUAGE');assert.equal(selector.value,'en');assert.equal(option.nodeValue,'日本語');assert.equal(heading.nodeValue,'Manga Translator');assert.equal(status.nodeValue,'Translation 1 / 3 — Waiting for response');
 assert.equal(prompt.value,'韓国語の原文を正確に読み取ってください。');assert.equal(result.value,'{"original":"일곱","translated":"七つ"}');assert.equal(overlayText.nodeValue,'入口広場');assert.equal(result.getAttribute('placeholder'),'Translation JSON for the numbered image');
 status.nodeValue='文字領域を検出：2/135';callbacks.forEach(f=>f());await Promise.resolve();assert.equal(status.nodeValue,'Detecting text: 2/135');
 changed({uiLanguage:{newValue:'ja'}},'local');assert.equal(heading.nodeValue,'漫画翻訳');assert.equal(status.nodeValue,'文字領域を検出：2/135');assert.equal(result.getAttribute('placeholder'),'番号付き画像の翻訳JSON');assert.equal(label.nodeValue,'LANGUAGE');
 changed({uiLanguage:{newValue:'en'}},'session');assert.equal(U.language,'ja');
 U.setLanguage('invalid');assert.equal(U.language,'ja');
 U.setLanguage('en');callbacks.forEach(f=>f());await Promise.resolve();callbacks.forEach(f=>f());await Promise.resolve();assert.equal(status.nodeValue,'Detecting text: 2/135');
 const menu=fs.readFileSync(__dirname+'/popup.html','utf8');assert.match(menu,/>LANGUAGE<select id="uiLanguage"/);assert.doesNotMatch(menu,/LAMGUAGE/);
 console.log('PASS: saved UI locale, invariant LANGUAGE label/native options, live progress, reversible switching, namespace isolation, unchanged prompts/JSON/translations, stable observer and settings validation');
})().catch(e=>{console.error(e);process.exitCode=1;});
