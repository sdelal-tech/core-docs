import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {createDocsServer} from '../tools/serve.mjs';

// A late theme/font change must not paint the default design or move the first frame.
export async function checkStartup(browser,url,check,out='test-results',onlyRed=false) {
 mkdirSync(out,{recursive:true});
 const cases=onlyRed?[{design:'nkui',mode:'dark',anchor:onlyRed==='anchor',demo:onlyRed==='demo'}]:[
  ...['core','nk','ss','nkui'].flatMap(design=>['light','dark'].map(mode=>({design,mode}))),
  {design:'nkui',mode:'dark',anchor:true},{design:'nkui',mode:'dark',demo:true},
  {design:'nk',mode:'light',storage:'empty'},{design:'nk',mode:'light',storage:'invalid'},
  {design:'nk',mode:'light',storage:'denied'},
  {design:'nkui',mode:'dark',failure:'theme'},{design:'nkui',mode:'dark',failure:'theme-timeout'},
  {design:'nkui',mode:'dark',failure:'font'},{design:'nkui',mode:'dark',failure:'font-timeout'}
 ];
 const reports=[];
 for(const config of cases) {
  const {design,mode,storage,failure}=config,label=`${design}/${mode}${storage?'/'+storage:''}${failure?'/'+failure:''}${config.anchor?'/anchor':''}${config.demo?'/demo':''}`;
  console.log('Startup',label);
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  let releaseCss,releaseFonts,cssSeen=false,fontSeen=false,recovering=false;
  const cssGate=new Promise(done=>releaseCss=done),fontGate=new Promise(done=>releaseFonts=done),requests=[];
  try {
   await context.addInitScript(({design,mode,storage})=>{
    if(window!==window.top)return;
    if(storage==='denied')Object.defineProperty(window,'localStorage',{get(){throw new DOMException('denied','SecurityError');}});
    else if(storage!=='empty'){localStorage.setItem('core-docs-design',storage==='invalid'?'invalid':design);localStorage.setItem('core-docs-theme',storage==='invalid'?'invalid':mode);}
    window.startupFrames=[];
    const observe=()=>{
     const heading=document.querySelector('.chapter:not(.core-hide) h1'),nav=document.getElementById('chapter-nav'),body=document.body,root=document.documentElement;
     if(heading&&nav&&body){
      const visible=getComputedStyle(body).display!=='none'&&getComputedStyle(body).visibility!=='hidden'&&Number(getComputedStyle(body).opacity)!==0&&heading.getBoundingClientRect().height>0;
      if(visible){const style=getComputedStyle(heading);window.startupFrames.push({at:performance.now(),design:root.dataset.design,mode:root.dataset.theme,classes:root.className,font:style.fontFamily,fonts:document.fonts.status,heading:heading.getBoundingClientRect().toJSON(),nav:nav.getBoundingClientRect().toJSON(),anchor:document.getElementById('accessibility--s4')?.getBoundingClientRect().toJSON(),header:document.querySelector('.topbar')?.getBoundingClientRect().height,scroll:scrollY});}
     }
     window.startupRaf=requestAnimationFrame(observe);
    };requestAnimationFrame(observe);
   },config);
   await context.route('**/*',async route=>{
    const request=route.request(),name=new URL(request.url()).pathname.split('/').pop();
    if(request.frame().parentFrame())return route.continue();
    requests.push({name,type:request.resourceType()});
    if(name===`theme-${design}.css`){
     cssSeen=true;
     if(failure==='theme'&&!recovering)return route.abort();
     const response=await route.fetch();await cssGate;
     return route.fulfill({response});
    }
    if(request.resourceType()==='font') {
     fontSeen=true;
     if(failure==='font')return route.abort();
     const response=await route.fetch();await fontGate;
     return route.fulfill({response});
    }
    return route.continue();
   });
   const page=await context.newPage(),runtimeErrors=[];page.on('pageerror',e=>runtimeErrors.push(e.message));
   const navigation=page.goto(url+(config.anchor?'#accessibility--s4':config.demo?'#start':'#accessibility'),{waitUntil:'domcontentloaded',timeout:25000});
   // Consume immediately so navigation errors remain owned even on a failed assertion.
   const loaded=navigation.then(()=>null,error=>error);
   if(design!=='core') {
    await page.waitForFunction(()=>document.querySelector('.chapter:not(.core-hide) h1'));
    for(let attempt=0;!cssSeen&&attempt<100;attempt++)await page.waitForTimeout(20);
    assert.ok(cssSeen,label+': selected CSS was requested');
   }
   await page.waitForTimeout(150);
   const beforeCss=await page.evaluate(()=>({frames:window.startupFrames.slice(),design:document.documentElement.dataset.design,mode:document.documentElement.dataset.theme,href:document.getElementById('shell-theme').getAttribute('href')}));
   if(design!=='core'&&!failure)check(label+' does not paint before selected CSS',beforeCss.frames.length===0);
   if(failure!=='theme-timeout')releaseCss();
   if(design!=='core'&&(!failure||failure.startsWith('font'))) {
    for(let attempt=0;!fontSeen&&attempt<200;attempt++)await page.waitForTimeout(20);
    assert.ok(fontSeen,label+': actual font requests were exercised');
    await page.waitForTimeout(150);
   }
   const beforeFonts=await page.evaluate(()=>window.startupFrames.slice());
   if(!failure&&design!=='core')check(label+' does not paint before selected fonts',beforeFonts.length===0);
   if(failure!=='font-timeout')releaseFonts();
   const navigationError=await loaded;if(navigationError&& !failure?.endsWith('timeout'))throw navigationError;
   await page.waitForFunction(()=>window.startupFrames.length>0,null,{timeout:15000});
   await page.waitForTimeout(250);
   const state=await page.evaluate(()=>{
    cancelAnimationFrame(window.startupRaf);
    const heading=document.querySelector('.chapter:not(.core-hide) h1'),style=getComputedStyle(heading);
    return {frames:window.startupFrames,design:document.documentElement.dataset.design,mode:document.documentElement.dataset.theme,href:document.getElementById('shell-theme').getAttribute('href'),fonts:[...document.fonts].map(face=>({family:face.family,status:face.status})),fontReady:document.fonts.check(`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`,heading.textContent),warning:document.getElementById('shell-status').textContent,warningVisible:getComputedStyle(document.getElementById('shell-status')).display!=='none',selectEnabled:!document.getElementById('theme-select').disabled};
   });
   const first=state.frames[0],last=state.frames.at(-1);
   if(config.demo){
    let idle=true;try{await page.waitForLoadState('networkidle',{timeout:5000});}catch{idle=false;}
    check(label+' initial demo reaches idle after first document reveal',idle);
    await page.waitForFunction(()=>document.querySelector('[data-example="E01"]').dataset.ok==='true');
    const demo=await page.locator('[data-example="E01"] iframe').elementHandle().then(e=>e.contentFrame());
    check(label+' initial demo starts with selected theme and mode',await demo.evaluate(({design,mode})=>document.documentElement.dataset.design===design&&document.documentElement.dataset.theme===mode&&document.getElementById('nk-css').href.endsWith(`theme-${design}.css`),{design,mode}));
   }
   if(!failure) {
    if(config.anchor)check(label+' first visible frame lands on deep link',Math.abs(first.anchor.top-first.header-20)<=.5&&first.scroll>0);
    check(label+' selects saved design and mode in head',beforeCss.design===design&&beforeCss.mode===mode);
    check(label+' every visible frame uses saved design/mode',state.frames.every(f=>f.design===design&&f.mode===mode));
    check(label+' first visible frame uses loaded font faces',first.fonts==='loaded'&&state.fontReady&&(design==='core'||state.fonts.some(f=>f.status==='loaded')));
    check(label+' first heading/nav geometry stays stable',state.frames.every(f=>['heading','nav'].every(node=>['x','y','width','height'].every(key=>Math.abs(f[node][key]-last[node][key])<=.5))));
    check(label+' only selected shell stylesheet is active',design==='core'?state.href===null:state.href.endsWith(`theme-${design}.css`));
    check(label+' no unrelated theme is requested',requests.filter(r=>/^theme-/.test(r.name)).every(r=>r.name===`theme-${design}.css`||(design==='nkui'&&r.name==='theme-nk.css')));
    check(label+' controls remain usable without warnings',state.selectEnabled&&!state.warningVisible&&runtimeErrors.length===0);
   } else {
    check(label+' bounded recovery reveals document with warning',state.warningVisible&&state.selectEnabled&&runtimeErrors.length===0);
    check(label+' recovery preserves chosen mode',state.mode===mode);
    if(failure.startsWith('theme')) {
     recovering=true;releaseCss();
     await page.locator('#theme-select').selectOption(design);
     await page.waitForFunction(design=>document.documentElement.dataset.design===design&&!document.getElementById('theme-select').disabled,design);
     check(label+' manual retry restores selected theme and clears warning',await page.locator('#shell-status').isHidden()&&await page.evaluate(design=>localStorage.getItem('core-docs-design')===design,design));
    }
   }
   if(design==='nkui'&&!storage&&!failure)await page.screenshot({path:resolve(out,`startup-${mode}.png`)});
   reports.push({label,config,beforeCss,beforeFonts,requests,runtimeErrors,state,first,last});
  } finally {releaseCss();releaseFonts();await context.unrouteAll({behavior:'ignoreErrors'});await context.close();}
 }
 writeFileSync(resolve(out,'startup.json'),JSON.stringify(reports,null,2)+'\n');
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
 const server=createDocsServer();let browser;
 await new Promise(done=>server.listen(0,'127.0.0.1',done));
 const checks=[],failures=[];
 try {
  browser=await chromium.launch({headless:true});
  await checkStartup(browser,process.env.CORE_STARTUP_URL||`http://127.0.0.1:${server.address().port}/index.html`,(name,ok)=>{checks.push(name);if(!ok)failures.push(name);},process.env.CORE_STARTUP_OUT||'test-results',process.argv.includes('--anchor')?'anchor':process.argv.includes('--demo')?'demo':process.argv.includes('--red'));
  console.log(JSON.stringify({passed:checks.length-failures.length,total:checks.length,failures},null,2));
  assert.equal(failures.length,0,failures.join('\n'));
 } finally {await browser?.close();server.closeAllConnections();await new Promise(done=>server.close(done));}
}
