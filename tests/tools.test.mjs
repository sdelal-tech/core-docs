import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {request} from 'node:http';

// These checks catch serving outside docs, unsafe network redirects and accepting corrupt sources.
test('local server serves artifacts with MIME and confines paths including symlinks',async()=>{
 const {createDocsServer}=await import('../tools/serve.mjs');
 const root=mkdtempSync(join(tmpdir(),'core-serve-'));let server;
 const get=path=>new Promise((resolve,reject)=>{request({host:'127.0.0.1',port:server.address().port,path},response=>{const chunks=[];response.on('data',c=>chunks.push(c));response.on('end',()=>resolve({status:response.statusCode,type:response.headers['content-type'],body:Buffer.concat(chunks)}));}).on('error',reject).end();});
 try {
  for(const [name,body] of [['index.html','<h1>test</h1>'],['a.md','Текст'],['a.json','{}'],['a.js','let a=1;'],['a.css','body{}'],['a.zip',Buffer.from([80,75,0,255])]])writeFileSync(join(root,name),body);
  symlinkSync('/etc/hosts',join(root,'outside.md'));
  server=createDocsServer(root);await new Promise(r=>server.listen(0,'127.0.0.1',r));
  for(const [path,type] of [['/','text/html'],['/a.md','text/plain'],['/a.json','application/json'],['/a.js','text/javascript'],['/a.css','text/css'],['/a.zip','application/zip']]){const response=await get(path);assert.equal(response.status,200);assert.ok(response.type.startsWith(type));}
  assert.deepEqual((await get('/a.zip')).body,Buffer.from([80,75,0,255]));
  for(const path of ['/missing','/../etc/hosts','/%2e%2e/etc/hosts','/outside.md','/%ZZ'])assert.equal((await get(path)).status,404,path);
 } finally {if(server)await new Promise(r=>{server.close(r);server.closeAllConnections();});rmSync(root,{recursive:true,force:true});}
});

test('inspector refuses unsafe URLs before fetching and unsafe redirects before following',async()=>{
 const {fetchText,BASE}=await import('../tools/inspect-cdn.mjs');
 for(const url of ['http://cdn.sdelal.tech/core/latest/a.js',BASE+'../a.js',BASE+'%61.js',BASE+'a.js?q=1',BASE+'a.js#x','https://cdn.sdelal.tech.evil/core/latest/a.js',BASE+'./a.js'])await assert.rejects(fetchText(url,1,()=>{assert.fail('unsafe request sent');}));
 let calls=0;await assert.rejects(fetchText(BASE+'a.js',1,async()=>{calls++;return new Response(null,{status:302,headers:{location:'https://example.org/private'}});}));assert.equal(calls,1);
 const source=await fetchText(BASE+'a.js',1,async(url)=>url.endsWith('a.js')?new Response(null,{status:302,headers:{location:'b.js'}}):new Response('\ufeffconst ok=1;'));
 assert.equal(source.text,'const ok=1;');
});

test('inspector limits streams and rejects empty, malformed UTF-8, HTML and network failure',async()=>{
 const {fetchText,inspectOne,BASE}=await import('../tools/inspect-cdn.mjs');
 for(const body of ['',new Uint8Array([0xc3,0x28])])await assert.rejects(fetchText(BASE+'a.js',1,async()=>new Response(body)));
 let cancelled=false;
 await assert.rejects(fetchText(BASE+'a.js',1,async()=>new Response(new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(1024*1024));},cancel(){cancelled=true;}}))));assert.ok(cancelled);
 assert.equal((await inspectOne('a.js',1,async()=>new Response('<!DOCTYPE html><html>wrong</html>'))).ok,false);
 assert.equal((await inspectOne('a.js',1,async()=>{throw new Error('offline');})).ok,false);
 await assert.rejects(fetchText(BASE+'a.js',1,async(_url,{signal})=>new Promise((_r,reject)=>{const timer=setTimeout(()=>reject(new Error('fixture did not abort')),3000);signal.addEventListener('abort',()=>{clearTimeout(timer);reject(signal.reason);},{once:true});})));
});

test('audit fetches all listed JS including minified and reports missing expected entries',async()=>{
 const {audit,discover,BASE}=await import('../tools/inspect-cdn.mjs');
 const names=['importmap.js','collapse.js','event.js','field.js','form.js','motion.js','navigation.js','popup.js','resource.js','slider.js','state.js','extra.min.js'];
 const index=names.map(n=>`<a href="${n}">${n}</a>`).join('')+'<a href="../escape.js">bad</a>';
 assert.deepEqual(discover(index),[...names].sort());
 let active=0,max=0;
 const report=await audit(index,1,async()=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,5));active--;return new Response('const x=1;\n');});
 assert.equal(report.ok,true);assert.equal(report.api_audit_complete,false);assert.equal(report.files.length,12);assert.ok(max<=4&&max>1);
 for(const file of report.files){assert.equal(file.bytes,11);assert.equal(file.lines,1);assert.match(file.sha256,/^[a-f0-9]{64}$/);assert.equal(file.source_reviewed,false);assert.equal(file.runtime_tested,false);}
 assert.deepEqual((await audit('<a href="extra.min.js">x</a>',1,async()=>new Response('x'))).missing_expected_entries,[...names.slice(0,11)].sort());
});

test('inspector CLI validates modes and timeout; show prints full source with stderr metadata',async()=>{
 const {run,BASE}=await import('../tools/inspect-cdn.mjs');
 for(const args of [[],['--audit','--show','a.js'],['--audit','--timeout','0'],['--audit','--timeout','121'],['--audit','--timeout','NaN'],['--unknown']])assert.equal(await run(args,{stdout:()=>{},stderr:()=>{}}),2);
 assert.equal(await run(['--help'],{stdout:()=>{},stderr:()=>{}}),0);
 let output='',error='';assert.equal(await run(['--show=a.js','--timeout=1.0001'],{fetch:async url=>new Response(url===BASE?'<a href="a.js">x</a>':'let x=1;'),stdout:text=>output+=text,stderr:text=>error+=text}),0);
 assert.equal(output,'let x=1;\n');assert.match(error,/Source: https:\/\/cdn.sdelal.tech\/core\/latest\/a.js/);assert.match(error,/SHA-256: [a-f0-9]{64}/);
});
