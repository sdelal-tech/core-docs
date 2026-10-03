import test from 'node:test';
import AdmZip from 'adm-zip';
import ZipUtils from 'adm-zip/util/index.js';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync as read, writeFileSync as write, mkdtempSync, cpSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, posix} from 'node:path';

// getData checks the local CRC for our no-descriptor ZIP. Also check the central
// CRC using the pinned library's exported utility, matching the previous testzip guard.
const unpack=path=>Object.fromEntries(new AdmZip(path).getEntries().map(entry=>{
 const bytes=entry.getData();
 assert.equal(ZipUtils.crc32(bytes),entry.header.crc,`${entry.entryName}: central CRC mismatch`);
 return [entry.entryName,bytes.toString('utf8')];
}));

test('agent download is a complete portable Markdown and JSON package without runtime files',()=>{
 assert.ok(existsSync('docs/core-agent.zip'),'build must produce the agent ZIP');
 const files=unpack('docs/core-agent.zip'),names=Object.keys(files);
 assert.deepEqual(names,[...names].sort(),'ZIP entries have stable lexical order');
 const chapters=JSON.parse(read('docs/chapters.json','utf8'));
 assert.equal(names.length,51);
 assert.ok(names.every(name=>/^core\/(?:[\w-]+\.(?:md|json)|(?:chapters|reference)\/[\w-]+\.(?:md|json))$/.test(name)));
 for(const name of ['AGENTS.md','README.md','chapters.json',...chapters.map(c=>`chapters/${c.id}.md`),...['classes','tokens','examples','javascript','cdn','source-manifest'].map(n=>`reference/${n}.json`)])assert.ok(files[`core/${name}`],name);
 assert.deepEqual(JSON.parse(files['core/reference/examples.json']),JSON.parse(read('docs/reference/examples.json','utf8')));
 assert.deepEqual(JSON.parse(files['core/reference/source-manifest.json']),JSON.parse(read('docs/reference/source-manifest.json','utf8')));
 for(const [name,body] of Object.entries(files)) {
  assert.doesNotMatch(body,/https:\/\/github\.sdelal\.tech\/core-docs\/[^\s)]+\.(?:md|json)/,`${name}: documentation should resolve locally`);
  if(!name.endsWith('.md'))continue;
  for(const [,href] of body.replace(/```[\s\S]*?```/g,'').matchAll(/\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
   if(/^(https?:|#|mailto:)/.test(href))continue;
   const target=posix.normalize(posix.join(posix.dirname(name),href.split('#')[0]));
   assert.ok(files[target],`${name}: broken archive link ${href}`);
  }
 }
});

test('repackaging picks up current chapter bytes and is reproducible',()=>{
 assert.ok(existsSync('docs/core-agent.zip'),'build must produce the agent ZIP');
 const dir=mkdtempSync(join(tmpdir(),'core-agent-test-'));
 try {
  cpSync('docs',dir,{recursive:true});
  const path=join(dir,'chapters/architecture.md'),updated=read(path,'utf8')+'\nНовый текст для проверки обновления комплекта.\n';
  write(path,updated);
  const pack=()=>execFileSync(process.execPath,['tools/package-agent.mjs',dir],{timeout:30000});
  pack();
  assert.equal(unpack(join(dir,'core-agent.zip'))['core/chapters/architecture.md'],updated);
  const first=read(join(dir,'core-agent.zip'));pack();
  assert.deepEqual(read(join(dir,'core-agent.zip')),first);
 } finally {rmSync(dir,{recursive:true,force:true});}
});

test('archive metadata is fixed and CRC corruption is rejected',()=>{
 const bytes=read('docs/core-agent.zip'),archive=new AdmZip(bytes);
 for(const entry of archive.getEntries()){assert.equal(entry.header.time.getFullYear(),1980);assert.equal(entry.header.time.getMonth(),0);assert.equal(entry.header.time.getDate(),1);assert.equal(entry.attr>>>16,0o100644);assert.equal(entry.header.made,0x0314);assert.equal(entry.header.version,20);}
 const damaged=Buffer.from(bytes);damaged.writeUInt32LE((damaged.readUInt32LE(14)^1)>>>0,14);
 assert.throws(()=>new AdmZip(damaged).getEntries()[0].getData());
});

test('unpacking rejects corrupted central-directory CRC even when local CRC is valid',()=>{
 const damaged=Buffer.from(read('docs/core-agent.zip'));
 const central=damaged.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));assert.ok(central>0);
 damaged.writeUInt32LE((damaged.readUInt32LE(central+16)^1)>>>0,central+16);
 assert.throws(()=>unpack(damaged),/CRC/);
});

test('packaging preserves Unix creator metadata when ZIP dependency sees Windows',()=>{
 const dir=mkdtempSync(join(tmpdir(),'core-agent-platform-'));
 try {
  cpSync('docs',dir,{recursive:true});
  execFileSync(process.execPath,['--input-type=module','-e',"Object.defineProperty(process,'platform',{value:'win32'});const {packageAgent}=await import('./tools/package-agent.mjs');packageAgent(process.argv[1]);",dir],{timeout:30000});
  for(const entry of new AdmZip(join(dir,'core-agent.zip')).getEntries()){assert.equal(entry.header.made,0x0314);assert.equal(entry.attr>>>16,0o100644);}
 }finally{rmSync(dir,{recursive:true,force:true});}
});
