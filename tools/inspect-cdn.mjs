import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

// Read official sources in memory; fetching/hashing is not an API or runtime audit.
export const BASE='https://cdn.sdelal.tech/core/latest/';
const MAX_BYTES=4*1024*1024;
const EXPECTED_JS=['importmap.js','collapse.js','event.js','field.js','form.js','motion.js','navigation.js','popup.js','resource.js','slider.js','state.js'];
const hash=raw=>createHash('sha256').update(raw).digest('hex');
function allowed(url) {
 if(typeof url!=='string'||!url.startsWith(BASE)||/[?#%\\]/.test(url))return false;
 const tail=url.slice(BASE.length);return !tail.split('/').some(part=>part==='.'||part==='..')&&!/[\s]/.test(url);
}
export async function fetchText(url,timeout=20,request=fetch) {
 if(!allowed(url))throw new Error('Only the official Core latest directory is allowed');
 const signal=AbortSignal.timeout(Math.ceil(timeout*1000));
 for(let redirects=0;redirects<=10;redirects++) {
  const response=await request(url,{redirect:'manual',signal,headers:{'User-Agent':'CoreDocs-SourceInspector/1.0','Accept-Encoding':'identity'}});
  if([301,302,303,307,308].includes(response.status)) {
   await response.body?.cancel();
   const location=response.headers.get('location');
   // Check raw dot/escaped segments before URL normalization as well as the resolved destination.
   if(!location||/[?#%\\]/.test(location)||location.split('/').some(p=>p==='.'||p==='..'))throw new Error('Unsafe redirect refused');
   const target=new URL(location,url).href;
   if(!allowed(target))throw new Error('Redirect outside the official latest directory refused: '+target);
   url=target;continue;
  }
  if(!response.ok){await response.body?.cancel();throw new Error(`CDN HTTP ${response.status}`);}
  const reader=response.body?.getReader();if(!reader)throw new Error('Empty response');
  const chunks=[];let size=0;
  try {while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BYTES)throw new Error('Source exceeds the 4 MiB inspection limit');chunks.push(value);}}
  catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
  const raw=Buffer.concat(chunks,size),text=new TextDecoder('utf-8',{fatal:true}).decode(raw);
  if(!text.trim())throw new Error('Empty response');
  return {text,raw};
 }
 throw new Error('Too many redirects');
}
export function discover(html) {
 const names=new Set();
 for(const match of html.matchAll(/<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi)) {
  const href=match[1]??match[2]??match[3];if(/[?#%\\]/.test(href)||href.split('/').some(p=>p==='.'||p==='..'))continue;
  let url;try{url=new URL(href,BASE).href;}catch{continue;}
  const name=url.slice(BASE.length);
  if(allowed(url)&&/^[A-Za-z0-9_-]+(?:\.min)?\.(?:js|css|html)$/.test(name))names.add(name);
 }
 if(!names.size)throw new Error('No source links found in the CDN index; inspection is incomplete');
 return [...names].sort();
}
function rejectHTML(text) {if(/^\s*<(?:!doctype|html|head|body)\b/i.test(text))throw new Error('Received HTML instead of the requested source');}
export async function inspectOne(name,timeout,request=fetch) {
 const result={file:name,url:BASE+name,source_reviewed:false,runtime_tested:false};
 try {const {text,raw}=await fetchText(result.url,timeout,request);rejectHTML(text);Object.assign(result,{ok:true,bytes:raw.length,lines:text.split(/\r\n|[\n\r\u0085\u2028\u2029]/).length-( /[\n\r\u0085\u2028\u2029]$/.test(text)?1:0),sha256:hash(raw)});}
 catch(error){Object.assign(result,{ok:false,error:error.message});}return result;
}
export async function audit(index,timeout,request=fetch) {
 const names=discover(index).filter(name=>name.endsWith('.js'));
 if(!names.length)throw new Error('The index contains no JavaScript; audit is incomplete');
 const files=new Array(names.length);let next=0;
 await Promise.all(Array.from({length:Math.min(4,names.length)},async()=>{while(next<names.length){const i=next++;files[i]=await inspectOne(names[i],timeout,request);}}));
 const missing=EXPECTED_JS.filter(name=>!names.includes(name)).sort(),all=files.every(file=>file.ok);
 return {checked_at:new Date().toISOString(),source:BASE,all_listed_js_fetched:all,missing_expected_entries:missing,ok:all&&!missing.length,api_audit_complete:false,note:'Read sources and test API before use. HTTP/hash checks are not API documentation.',files};
}
export async function run(args,{fetch:request=fetch,stdout=text=>process.stdout.write(text),stderr=text=>process.stderr.write(text)}={}) {
 if(args.includes('--help')||args.includes('-h')){stdout('Usage: node tools/inspect-cdn.mjs (--audit | --show FILENAME) [--timeout seconds (1..120)]\n');return 0;}
 args=args.flatMap(arg=>/^--(?:timeout|show)=/.test(arg)?[arg.slice(0,arg.indexOf('=')),arg.slice(arg.indexOf('=')+1)]:[arg]);
 let mode,name,timeout=20;
 try {
  for(let i=0;i<args.length;i++) {const arg=args[i];if(arg==='--timeout'){timeout=Number(args[++i]);if(!Number.isFinite(timeout)||timeout<1||timeout>120)throw new Error('--timeout must be between 1 and 120');}else if(arg==='--audit'||arg==='--show'){if(mode)throw new Error('Choose --audit or --show');mode=arg;if(arg==='--show'){name=args[++i];if(!name||name.startsWith('--'))throw new Error('--show requires FILENAME');}}else throw new Error('Unknown argument: '+arg);}
  if(!mode)throw new Error('Choose --audit or --show');
 }catch(error){stderr(error.message+'\n');return 2;}
 try {
  const {text:index}=await fetchText(BASE,timeout,request);
  if(mode==='--show') {
   if(!discover(index).includes(name))throw new Error('File is not present in the current official index: '+name);
   const {text,raw}=await fetchText(BASE+name,timeout,request);if(/\.(js|css)$/.test(name))rejectHTML(text);
   stderr('Source: '+BASE+name+'\nSHA-256: '+hash(raw)+'\n');stdout(text+(text.endsWith('\n')?'':'\n'));return 0;
  }
  const report=await audit(index,timeout,request);stdout(JSON.stringify(report,null,2)+'\n');return report.ok?0:1;
 }catch(error){stderr(JSON.stringify({ok:false,source:BASE,error:error.message})+'\n');return 1;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)process.exitCode=await run(process.argv.slice(2));
