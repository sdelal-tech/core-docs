import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFileSync as read} from 'node:fs';
import {resolve,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

// Exercise the real bundle, lazy routing and the unavailable-library path.
export async function checkHighlighting(browser,url,check) {
 const context=await browser.newContext({permissions:['clipboard-read','clipboard-write']});
 try {
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url+'#start',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>document.querySelector('#start code[data-highlighted="yes"]'));
  check('only the active chapter is highlighted initially',await page.evaluate(()=>[...document.querySelectorAll('code[data-highlighted]')].every(e=>e.closest('.chapter').id==='start')&&!document.querySelector('#js-field code[data-highlighted]')));
  await page.evaluate(()=>{
   const pre=document.createElement('pre');pre.innerHTML='<code class="language-plaintext"></code><code class="language-plaintext"></code>';
   pre.children[0].textContent='<script>plain & safe</script>';pre.children[1].textContent='unknown <&>';document.getElementById('start').append(pre);
  });
  await page.evaluate(()=>location.hash='start--title');await page.waitForTimeout(100);
  check('plain and unknown language fallback is untouched and readable',await page.evaluate(()=>[...document.querySelectorAll('#start code.language-plaintext')].every(e=>!e.hasAttribute('data-highlighted')&&!e.querySelector('span'))));
  const snippets=await page.locator('#start pre code').allTextContents();
  const expected=JSON.parse(read('content/reference/examples.json','utf8')).examples.find(e=>e.id==='E01').html;
  check('highlighted HTML preserves executable-looking source',await page.locator('[data-example="E01"] code').textContent()===expected);
  await page.locator('[data-example="E01"] .copy-button').click();
  check('copy reads the exact source after highlighting',await page.evaluate(()=>navigator.clipboard.readText())===expected);
  const before=await page.locator('#start pre code').evaluateAll(nodes=>nodes.map(e=>e.innerHTML));
  await page.evaluate(()=>location.hash='js-field');
  await page.waitForFunction(()=>document.querySelector('#js-field code[data-highlighted="yes"]')&&document.querySelector('[data-example="E77"]').dataset.ok==='true');
  const frame=await page.locator('[data-example="E77"] iframe').elementHandle().then(e=>e.contentFrame());
  check('highlighter never enters a live iframe',await frame.locator('script[src*="highlight"],.hljs,[data-highlighted]').count()===0);
  await page.evaluate(()=>location.hash='start');await page.waitForFunction(()=>!document.getElementById('start').classList.contains('core-hide'));
  check('reopening a chapter does not highlight it twice',JSON.stringify(await page.locator('#start pre code').evaluateAll(nodes=>nodes.map(e=>e.innerHTML)))===JSON.stringify(before));
  check('route round trip preserves all snippet source text',JSON.stringify(await page.locator('#start pre code').allTextContents())===JSON.stringify(snippets));
  for(const mode of ['dark','light']){
   if(await page.locator('html').getAttribute('data-theme')!==mode)await page.locator('#theme-toggle').click();
   check(`${mode} mode selects the inverse syntax palette`,await page.evaluate(mode=>document.getElementById(`syntax-${mode==='light'?'dark':'light'}`).media==='all'&&document.getElementById(`syntax-${mode}`).media==='not all',mode));
  }
  check('highlighting has no client errors',errors.length===0);
 } finally {await context.close();}
 const fallback=await browser.newContext({permissions:['clipboard-read','clipboard-write']});
 try {
  await fallback.route('**/assets/highlight*',route=>route.abort());
  const page=await fallback.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url+'#start',{waitUntil:'networkidle'});
  check('unavailable highlighter leaves readable unmodified code',await page.locator('[data-example="E01"] code').textContent()===JSON.parse(read('content/reference/examples.json','utf8')).examples.find(e=>e.id==='E01').html&&await page.locator('code[data-highlighted]').count()===0);
  await page.locator('[data-example="E01"] .copy-button').click();check('copy works without a highlighter',await page.evaluate(()=>navigator.clipboard.readText())===await page.locator('[data-example="E01"] code').textContent());
  await page.evaluate(()=>location.hash='js-field');await page.waitForFunction(()=>document.querySelector('[data-example="E77"]').dataset.ok==='true');
  await page.locator('#theme-toggle').click();
  check('route and theme work without a highlighter',await page.locator('#js-field').isVisible()&&await page.locator('html').getAttribute('data-theme')==='dark'&&errors.length===0);
 } finally {await fallback.close();}
}
if(import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const root=resolve('docs');const server=createServer((req,res)=>{try{const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[extname(path)]||'text/plain');res.end(read(path));}catch{res.writeHead(404).end();}});
 await new Promise(done=>server.listen(0,'127.0.0.1',done));let browser;let passed=0;
 try{browser=await chromium.launch({headless:true});await checkHighlighting(browser,`http://127.0.0.1:${server.address().port}/index.html`,(name,ok)=>{assert.ok(ok,name);passed++;});console.log(JSON.stringify({passed}));}
 finally{await browser?.close();await new Promise(done=>server.close(done));}
}
