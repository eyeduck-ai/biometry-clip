// Task-local research recorder. Run from this workspace; localhost only.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const directory=path.join(root,'artifacts','escrs-constants-039');
const allowed=new Set(['early-normal-checkpoint.json','late-normal-checkpoint.json','toric-checkpoint.json','root-normal-checkpoint.json']);
const master=JSON.parse(await fs.readFile(path.join(root,'artifacts','lens-catalog-038','escrs-master.json'),'utf8'));
const branches=new Map(master.captures.map(b=>[b.mode+'|'+b.manufacturer,b.options]));
const port=5176, origin='http://127.0.0.1:'+port;
const queues=new Map();
function validate(row){
  if(!row||typeof row!=='object'||!Number.isInteger(row.optionIndex)||row.optionIndex<0||!['non-toric','toric'].includes(row.mode)||typeof row.manufacturer!=='string'||typeof row.label!=='string'||!Array.isArray(row.values)||row.values.length!==7||row.values.some(v=>v!==null&&typeof v!=='string')||row.verifiedAfterClear!==true||!Number.isFinite(Date.parse(row.capturedAt)))throw Error('Invalid capture record');
  if(branches.get(row.mode+'|'+row.manufacturer)?.[row.optionIndex]!==row.label)throw Error('Record differs from original ESCRS option index');
}
const html=`<!doctype html><meta charset="utf-8"><title>ESCRS local checkpoint recorder</title><style>body{font:16px sans-serif;max-width:900px;margin:32px auto;padding:0 20px;background:#f4f1ec;color:#302c28}textarea{display:block;width:100%;height:330px;margin:16px 0;font:13px monospace}select,button{padding:10px;margin-right:12px}button{background:#5b493b;color:white;border:0;border-radius:5px}[role=status]{white-space:pre-wrap}</style><h1>ESCRS local checkpoint recorder</h1><p>Save verified research records to this project's local artifact folder.</p><label>Checkpoint file <select aria-label="Checkpoint file">${[...allowed].map(f=>`<option>${f}</option>`).join('')}</select></label><textarea aria-label="Captured JSON" spellcheck="false"></textarea><button type="button">Save checkpoint</button><p role="status">Ready</p><script>const input=document.querySelector('textarea'),status=document.querySelector('[role=status]'),button=document.querySelector('button');button.onclick=async()=>{button.disabled=true;status.textContent='Saving';try{const rows=JSON.parse(input.value);const response=await fetch('/save',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({file:document.querySelector('select').value,rows:Array.isArray(rows)?rows:[rows]})});const result=await response.json();if(!response.ok)throw Error(result.error);status.textContent='Saved '+result.rows+' rows · '+result.savedAt;}catch(error){status.textContent='Error: '+error.message;}finally{button.disabled=false;}};</script>`;
async function save(payload){
  if(!allowed.has(payload.file)||!Array.isArray(payload.rows)||!payload.rows.length||payload.rows.length>1000)throw Error('Unexpected destination or row count');
  payload.rows.forEach(validate);
  const file=path.join(directory,payload.file);
  let old=[];try{old=JSON.parse(await fs.readFile(file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  const key=r=>JSON.stringify([r.mode,r.manufacturer,r.optionIndex]);
  const merged=new Map(old.map(r=>[key(r),r]));
  for(const row of payload.rows)merged.set(key(row),row);
  await fs.mkdir(directory,{recursive:true});
  const temporary=file+'.pending';
  await fs.writeFile(temporary,JSON.stringify([...merged.values()],null,2),'utf8');
  await fs.rename(temporary,file);
  return {rows:merged.size,savedAt:new Date().toISOString()};
}
http.createServer(async(req,res)=>{
  res.setHeader('cache-control','no-store');res.setHeader('x-content-type-options','nosniff');
  if(req.method==='GET'&&req.url==='/'){res.writeHead(200,{'content-type':'text/html;charset=utf-8'});res.end(html);return;}
  if(req.method!=='POST'||req.url!=='/save'){res.writeHead(404);res.end();return;}
  res.setHeader('content-type','application/json;charset=utf-8');
  if(req.headers.origin!==origin||req.headers['content-type']!=='application/json'){res.writeHead(403);res.end(JSON.stringify({error:'Same-origin JSON required'}));return;}
  try{
    let body='';for await(const chunk of req){body+=chunk;if(body.length>2000000)throw Error('Payload too large');}
    const payload=JSON.parse(body), previous=queues.get(payload.file)||Promise.resolve();
    const current=previous.catch(()=>{}).then(()=>save(payload));queues.set(payload.file,current);
    const result=await current;res.writeHead(200);res.end(JSON.stringify(result));
  }catch(error){res.writeHead(400);res.end(JSON.stringify({error:error.message}));}
}).listen(port,'127.0.0.1',()=>console.log('ESCRS checkpoint recorder: '+origin));
