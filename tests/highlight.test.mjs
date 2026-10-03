import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync as read} from 'node:fs';
import vm from 'node:vm';
import {escapeCode,codeLanguage} from '../tools/highlight.mjs';
const plain=html=>html.replace(/<[^>]+>/g,'').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&quot;','"').replaceAll('&#x27;',"'").replaceAll('&amp;','&');
test('build escapes source without syntax spans and declares supported languages',()=>{
 for(const [lang,expected,code] of [['HTML','xml','<script>alert("<&")</script>\n<button disabled>A & B</button>'],['JavaScript','javascript','const name = "<b>"; // comment\nconsole.log(name);'],['css','css','.core { --size: 12px; color: red; }'],['md','markdown','# Header\n**bold** and `code`'],['json','json','{"x": "<&"}']]) {
  const html=escapeCode(code,lang);
  assert.equal(plain(html),code);assert.doesNotMatch(html,/<span/);assert.equal(codeLanguage(lang),expected);
  assert.doesNotMatch(html,/<span|<script|<button|hljs-/);
 }
});
test('plain and unknown languages remain escaped without guessing',()=>{
 for(const lang of ['text','unknown','текст']){assert.equal(escapeCode('<tag>&'),'&lt;tag&gt;&amp;');assert.equal(codeLanguage(lang),'plaintext');}
});
test('pinned browser bundle preserves raw code and registers only supported grammars',()=>{
 const context=vm.createContext({});context.window=context;vm.runInContext(read('docs/assets/highlight.js','utf8'),context);
 assert.equal(context.hljs.versionString,'11.11.1');
 assert.deepEqual([...context.hljs.listLanguages()].sort(),['css','javascript','json','markdown','xml']);
 for(const [lang,code] of [['xml','<script>alert("<&")</script>'],['javascript','const value = "<b>&";'],['css','.a { color:red }'],['json','{"value":false}'],['markdown','# Heading']]){
  const html=context.hljs.highlight(code,{language:lang}).value;assert.equal(plain(html),code);assert.match(html,/hljs-/);
 }
 for(const mode of ['light','dark'])assert.equal(read(`docs/assets/highlight-${mode}.css`,'utf8'),read(`node_modules/highlight.js/styles/a11y-${mode}.css`,'utf8'));
});
test('generated snippets are raw escaped code with explicit languages; native shell owns typography',()=>{
 const html=read('docs/index.html','utf8').split('<script id="manual-data"')[0];
 for(const [,attrs,code] of html.matchAll(/<pre[^>]*><code([^>]*)>([\s\S]*?)<\/code>/g)){assert.match(attrs,/language-(xml|javascript|css|json|markdown|plaintext)/);assert.doesNotMatch(code,/<span|<[^>]+style=/);}
 assert.doesNotMatch(html,/<[^>]+style="[^"]*(?:--theme-btn|--font-primary|--f-s|--l-h)[^>]*>/);
 for(const [,attrs] of html.matchAll(/<a([^>]*(?:nav-link|nav-sublink)[^>]*)>/g))assert.match(attrs,/core-button-transparent/);
});
