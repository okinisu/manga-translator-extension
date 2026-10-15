import http from 'node:http';
import {spawn} from 'node:child_process';
import {randomBytes, timingSafeEqual} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {existsSync,readFileSync} from 'node:fs';
import path from 'node:path';
// npm's Windows .cmd launcher cannot be spawned without a shell. Resolve its
// package entry point and invoke Node directly, keeping prompt arguments literal.
export function piLaunch(command,args,{platform=process.platform,env=process.env,node=process.execPath}={}){
 if(platform!=='win32')return {command,args};
 if(/\.[cm]?js$/i.test(command))return {command:node,args:[command,...args]};
 const folders=(env.Path||env.PATH||'').split(';').filter(Boolean);
 const roots=path.isAbsolute(command)||/[\\/]/.test(command)?[command]:folders.map(folder=>path.join(folder.replace(/^"|"$/g,''),command));
 for(const root of roots){
  for(const candidate of path.extname(root)?[root]:[root+'.exe',root+'.com',root+'.cmd',root+'.bat',root]){
   if(!existsSync(candidate))continue;
   if(/\.(cmd|bat|ps1)$/i.test(candidate)){
    for(const scope of ['@earendil-works','@mariozechner']){
     const dir=path.join(path.dirname(candidate),'node_modules',scope,'pi-coding-agent');
     try{const pkg=JSON.parse(readFileSync(path.join(dir,'package.json'),'utf8'));const bin=typeof pkg.bin==='string'?pkg.bin:pkg.bin?.pi;if(bin){const entry=path.resolve(dir,bin);if(existsSync(entry))return {command:node,args:[entry,...args]};}}catch{}
    }
    continue;
   }
   return {command:candidate,args};
  }
 }
 const error=Error('Cannot locate Pi executable. Install Pi with npm or set PI_BIN to the full path of Pi cli.js / pi.exe, then restart the bridge.');error.code='PI_NOT_FOUND';throw error;
}
function spawnPi(command,args){const launch=piLaunch(command,args);return spawn(launch.command,launch.args,{stdio:['pipe','pipe','pipe'],windowsHide:true});}
function startupError(e){return 'Cannot start Pi ('+(e.code||'startup failed')+'). Check pi --version in the same terminal and PI_BIN; on Windows reinstall Pi with npm and restart the bridge.';}
export function createBridge({token, command='pi', args=[], timeoutMs=300000}){
 if(!token||token.length<24)throw Error('Use a connection key of at least 24 characters');
 let busy=false;
 const allowed=o=>!o||/^chrome-extension:\/\/[a-p]{32}$/.test(o);
 return http.createServer(async(req,res)=>{
  const origin=req.headers.origin;
  if(!allowed(origin)){res.writeHead(403).end();return;}
  if(origin)res.setHeader('Access-Control-Allow-Origin',origin);
  res.setHeader('Vary','Origin');
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Methods':'POST, GET, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Private-Network':'true'}).end();return;}
  const supplied=Buffer.from(req.headers.authorization||''),expected=Buffer.from('Bearer '+token);
  if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected)){res.writeHead(401).end();return;}
  if(req.method==='GET'&&req.url==='/health'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify({ok:true,protocol:2,bridgeVersion:2,capabilities:['models','translate']}));return;}
  if(req.method==='GET'&&req.url==='/models'){
   if(busy){res.writeHead(409).end(JSON.stringify({error:'Pi is busy'}));return;}
   busy=true;let child,timer,settled=false,buffer='';
   const finish=(status,payload)=>{if(settled)return;settled=true;clearTimeout(timer);if(!res.destroyed)res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify(payload));child?.stdin.destroy();child?.kill('SIGTERM');busy=false;};
   timer=setTimeout(()=>finish(504,{error:'Pi model list timed out'}),30000);
   try{
    child=spawnPi(command,[...args,'--mode','rpc','--no-session','--no-tools','--no-extensions','--no-mcp','--no-skills','--no-prompt-templates','--no-context-files']);
    child.stderr.resume();child.on('error',e=>finish(502,{error:startupError(e)}));child.stdin.on('error',e=>finish(502,{error:startupError(e)}));child.stdout.setEncoding('utf8');
    child.stdout.on('data',chunk=>{buffer+=chunk;if(buffer.length>8*1024*1024){finish(502,{error:'Pi model list response too large'});return;}let i;while(!settled&&(i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i).replace(/\r$/,'');buffer=buffer.slice(i+1);if(!line)continue;let event;try{event=JSON.parse(line);}catch{finish(502,{error:'Invalid Pi RPC output'});return;}if(event.type==='response'&&event.id==='models'){if(!event.success){finish(502,{error:String(event.error||'Could not list models')});return;}const models=(event.data?.models||[]).filter(m=>m&&m.type==='chat'&&Array.isArray(m.input)&&m.input.includes('image')&&typeof m.id==='string'&&typeof m.provider==='string').map(m=>({id:m.id,provider:m.provider,name:typeof m.name==='string'?m.name:m.id})).slice(0,2000);finish(200,{models});return;}}});
    child.on('close',code=>{if(!settled)finish(502,{error:'Pi exited before returning models (exit '+code+'). Check pi --version and provider configuration.'});});
    child.stdin.write(JSON.stringify({id:'models',type:'get_available_models'})+'\n');
   }catch(e){finish(502,{error:startupError(e)});}
   return;
  }
  if(req.method!=='POST'||req.url!=='/translate'){res.writeHead(404).end();return;}
  if(busy){res.writeHead(409).end('Pi is busy');return;}
  busy=true;let child,timer,ended=false,buffer='',text='',lastMessage;
  const finish=(event)=>{
   if(ended)return;ended=true;clearTimeout(timer);
   if(event&&!res.destroyed)res.end(JSON.stringify(event)+'\n');
   child?.stdin.destroy();child?.kill('SIGTERM');
   if(child){const killer=setTimeout(()=>child.kill('SIGKILL'),2000);killer.unref();child.once('close',()=>clearTimeout(killer));}
   busy=false;
  };
  res.once('close',()=>finish());
  timer=setTimeout(()=>finish({type:'error',error:'Pi timed out'}),timeoutMs);
  try{
   let size=0;const chunks=[];
   for await(const chunk of req){size+=chunk.length;if(size>30*1024*1024)throw Error('Request exceeds 30MB');chunks.push(chunk);}
   if(ended)return;
   const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   if(typeof input.prompt!=='string'||!input.prompt.trim()||input.prompt.length>100000)throw Error('Invalid prompt');
   if(typeof input.image!=='string'||!/^data:image\/png;base64,[A-Za-z0-9+/=\r\n]+$/.test(input.image))throw Error('Expected a PNG image');
   if(input.model!==undefined&&(typeof input.model!=='string'||input.model.length>200||input.model.startsWith('-')))throw Error('Invalid model');
   const thinkingLevels=['default','off','minimal','low','medium','high','xhigh','max'];
   if(input.thinkingLevel!==undefined&&!thinkingLevels.includes(input.thinkingLevel))throw Error('Invalid thinking level');
   const thinkingArgs=input.thinkingLevel&&input.thinkingLevel!=='default'?['--thinking',input.thinkingLevel]:[];
   res.writeHead(200,{'Content-Type':'application/x-ndjson','Cache-Control':'no-store'});
   child=spawnPi(command,[...args,'--mode','rpc','--no-session','--no-tools','--no-extensions','--no-mcp','--no-skills','--no-prompt-templates','--no-context-files','--system-prompt','You transcribe and translate comic images. Follow the user response schema. Do not call tools.',...(input.model?['--model',input.model]:[]),...thinkingArgs]);
   child.stderr.resume(); // Never expose credentials or prompts in diagnostics.
   child.on('error',e=>finish({type:'error',error:startupError(e)}));
   child.stdin.on('error',()=>finish({type:'error',error:'Pi input closed unexpectedly'}));
   child.stdout.setEncoding('utf8');
   child.stdout.on('data',chunk=>{
    buffer+=chunk;if(buffer.length>8*1024*1024){finish({type:'error',error:'Pi output exceeded limit'});return;}
    let i;while(!ended&&(i=buffer.indexOf('\n'))>=0){
     const line=buffer.slice(0,i).replace(/\r$/,'');buffer=buffer.slice(i+1);if(!line)continue;
     let e;try{e=JSON.parse(line);}catch{finish({type:'error',error:'Invalid Pi RPC output'});break;}
     if(e.type==='response'&&e.success===false){finish({type:'error',error:String(e.error||'Pi command failed')});break;}
     if(e.type==='message_start'&&e.message?.role==='assistant'){text='';lastMessage=null;res.write(JSON.stringify({type:'text',text})+'\n');}
     if(e.type==='message_update'&&e.assistantMessageEvent?.type==='text_delta'){text+=e.assistantMessageEvent.delta;res.write(JSON.stringify({type:'text',text})+'\n');}
     if(e.type==='message_end'&&e.message?.role==='assistant'){lastMessage=e.message;text=(e.message.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('');}
     if(e.type==='agent_settled'){
      if(e.aborted||!lastMessage||['error','aborted','toolUse'].includes(lastMessage.stopReason)||!text.trim())finish({type:'error',error:lastMessage?.errorMessage||'Pi did not finish a valid response'});
      else finish({type:'done',text});
     }
    }
   });
   child.on('close',()=>{if(!ended)finish({type:'error',error:'Pi exited before agent_settled'});});
   const data=input.image.slice(input.image.indexOf(',')+1);
   child.stdin.write(JSON.stringify({id:'translate',type:'prompt',message:input.prompt,images:[{type:'image',data,mimeType:'image/png'}]})+'\n');
  }catch(e){if(!res.headersSent)res.writeHead(400,{'Content-Type':'application/x-ndjson'});finish({type:'error',error:e.message});}
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const token=process.env.PI_BRIDGE_TOKEN||randomBytes(32).toString('hex');
 const server=createBridge({token,command:process.env.PI_BIN||'pi'});
 server.listen(43129,'127.0.0.1',()=>{console.log('Pi bridge: http://127.0.0.1:43129\nConnection key: '+token);});
}
