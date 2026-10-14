// Provider-specific DOM only. The queue, validation and send guards are shared.
(() => {
 const visible=e=>e&&e.getClientRects().length>0&&!e.closest('[hidden]');
 const editor=()=>Array.from(document.querySelectorAll('.ql-editor[contenteditable="true"][role="textbox"]')).find(visible);
 const scope=()=>{const e=editor();if(!e)throw Error('Geminiの入力欄が見つかりません。ログイン状態を確認してください。');return e.closest('.input-area-fieldset')||e.closest('.text-input-field')||e.closest('form')||e.parentElement.parentElement;};
 const buttons=()=>Array.from(document.querySelectorAll('button')).filter(visible);
 globalThis.MangaAIDOM={
  name:'Gemini',editor,scope,
  sendButton:()=>Array.from(scope().querySelectorAll('button')).filter(visible).find(b=>/^(送信|送信する|プロンプトを送信|メッセージを送信|Send|Send message|Send prompt|Submit)$/i.test(b.getAttribute('aria-label')||'')||b.classList.contains('send-button')),
  streaming:()=>buttons().some(b=>/^(生成を停止|回答を停止|回答の生成を停止|停止|Stop|Stop response|Stop generating)$/i.test(b.getAttribute('aria-label')||'')),
  // Scope excludes images in past turns and includes the pending upload preview.
  attachments:()=>Array.from(scope().querySelectorAll('img')).filter(e=>visible(e)&&!!e.getAttribute('src')),
  messages:role=>Array.from(document.querySelectorAll(role==='user'?'user-query':'model-response')),
 };
})();
