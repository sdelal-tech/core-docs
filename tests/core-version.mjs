import {readFileSync as read,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';

export async function checkCoreVersion(browser,url,check) {
 const manifest=JSON.parse(read('content/reference/source-manifest.json','utf8'));
 // Independent Core-only contexts make missing tokens and natural flex sizes observable.
 for(const base of [manifest.version_base,manifest.runtime_base]) {
  const context=await browser.newContext({viewport:{width:998,height:800}});
  try {
   const page=await context.newPage(),errors=[];
   page.on('requestfailed',request=>errors.push(request.url()));
   await page.setContent(`<link rel="stylesheet" href="${base}core.css"><link rel="stylesheet" href="${base}theme-ss.css">
<div class="core-row core-g-6x" id="shares"><div id="tablet" class="core-j core-j-3c t-core-j-auto">Tablet</div><div id="mobile" class="core-j core-j-3c m-core-j-auto">Mobile</div><div id="fixed" class="core-j core-j-auto core-j-3c">Fixed</div></div>
<div style="--c: 3"><div id="inherited" class="core-j core-j-auto">Inherited</div></div>
<div class="core-row core-j-ch core-j-ch-3c core-g-6x"><div id="parent" class="core-j-auto">Parent</div></div>
<div class="core-row core-j-ch core-j-ch-3c core-g-6x"><div id="tablet-child" class="t-core-j-auto">Tablet</div><div id="mobile-child" class="m-core-j-auto">Mobile</div></div>
<div class="core-row core-j-ch core-j-ch-3c t-core-j-ch-2c core-g-6x"><div id="tablet-fixed" class="t-core-j-auto">Tablet fixed</div></div>
<div class="core-row core-j-ch core-j-ch-3c m-core-j-ch-1c core-g-6x"><div id="mobile-fixed" class="m-core-j-auto">Mobile fixed</div></div>
<div class="core-row core-j-ch core-j-ch-3c core-g-6x" style="--c:6"><div id="inherited-child" class="t-core-j-auto">Inherited count</div></div>
<div class="core-row-reverse core-nowrap core-x-start core-y-center core-h-80x" id="row"><span class="core-w-16x core-h-16x">One</span><span class="core-w-16x core-h-16x">Two</span></div>
<div class="core-col-reverse core-nowrap core-x-center core-y-start core-h-80x" id="col"><span class="core-w-16x core-h-16x">One</span><span class="core-w-16x core-h-16x">Two</span></div>
<div class="core-row t-core-row-reverse m-core-col-reverse core-nowrap core-x-center core-y-center core-h-80x" id="responsive"><span class="core-w-16x core-h-16x">One</span><span class="core-w-16x core-h-16x">Two</span></div>
<div class="core-col t-core-col-reverse m-core-row-reverse core-x-center core-y-center core-h-80x" id="counterpart"><span class="core-w-16x core-h-16x">One</span><span class="core-w-16x core-h-16x">Two</span></div>
<div class="core-theme-ss-light"><span class="core-text" id="ss">SS</span></div>
<div class="core-text-bold"><span class="core-text core-text-thin" id="thin">Inherited</span><span class="core-text core-text-thin" id="explicit" style="--f-w-thin:300">Explicit</span></div>`,{waitUntil:'networkidle'});
   check(`${base} styles loaded`,errors.length===0&&await page.locator('#row').evaluate(e=>getComputedStyle(e).display)==='flex');
   for(const width of [998,997,721,720]) {
    await page.setViewportSize({width,height:800});
    const values=await page.evaluate(()=>{
     const style=id=>getComputedStyle(document.getElementById(id)),box=id=>document.getElementById(id).getBoundingClientRect();
     const item=id=>({c:style(id).getPropertyValue('--c').trim(),basis:style(id).flexBasis,width:box(id).width});
     const flow=id=>{const e=document.getElementById(id),s=style(id),b=e.getBoundingClientRect(),children=[...e.children].map(n=>n.getBoundingClientRect());return {direction:s.flexDirection,justify:s.justifyContent,align:s.alignItems,first:children[0].toJSON(),last:children[1].toJSON(),box:b.toJSON()};};
     return {tablet:item('tablet'),mobile:item('mobile'),tabletChild:item('tablet-child'),mobileChild:item('mobile-child'),tabletFixed:item('tablet-fixed'),mobileFixed:item('mobile-fixed'),inheritedChild:item('inherited-child'),fixed:item('fixed'),parent:item('parent'),inherited:item('inherited'),shareWidth:box('shares').width,row:flow('row'),col:flow('col'),responsive:flow('responsive'),counterpart:flow('counterpart'),ss:style('ss').fontWeight,thin:style('thin').fontWeight,explicit:style('explicit').fontWeight,thinToken:getComputedStyle(document.documentElement).getPropertyValue('--f-w-thin').trim()};
    });
    const tag=`${base} ${width}`;
    for(const [id,limit] of [['tablet',997],['mobile',720]])check(`${tag} ${id} reset changes actual flex width`,width<=limit?values[id].c===''&&values[id].basis==='auto'&&values[id].width<values.shareWidth/5:values[id].c==='3'&&Math.abs(values[id].width-(values.shareWidth-24)/3)<1);
    check(`${tag} fixed and parent selectors win; revert inherits`,['fixed','parent','inherited'].every(id=>values[id].c==='3'));
    for(const [id,limit] of [['tabletChild',997],['mobileChild',720]])check(`${tag} child adaptive auto resets base parent counter`,width<=limit?values[id].c===''&&values[id].basis==='auto'&&values[id].width<values.shareWidth/5:values[id].c==='3'&&Math.abs(values[id].width-(values.shareWidth-24)/3)<1);
    for(const [id,limit,count] of [['tabletFixed',997,2],['mobileFixed',720,1]]){const expected=width<=limit?count:3;check(`${tag} same-breakpoint parent fixed counter wins`,values[id].c===String(expected)&&Math.abs(values[id].width-(values.shareWidth-(expected-1)*12)/expected)<1);}
    const inheritedCount=width<=997?6:3;check(`${tag} child reset preserves a true inherited parent counter`,values.inheritedChild.c===String(inheritedCount)&&Math.abs(values.inheritedChild.width-(values.shareWidth-(inheritedCount-1)*12)/inheritedCount)<1);
    check(`${tag} reverse row keeps physical start and cross-axis center`,values.row.justify==='start'&&values.row.align==='center'&&values.row.first.x>values.row.last.x&&Math.abs(values.row.last.x-values.row.box.x)<1&&Math.abs(values.row.first.bottom+values.row.first.y-values.row.box.bottom-values.row.box.y)<1);
    check(`${tag} reverse column keeps physical start and cross-axis center`,values.col.align==='center'&&values.col.justify==='start'&&values.col.first.y>values.col.last.y&&Math.abs(values.col.last.y-values.col.box.y)<1&&Math.abs(values.col.first.right+values.col.first.x-values.col.box.right-values.col.box.x)<1);
    check(`${tag} adaptive reverse remains centered`,values.responsive.direction===(width<=720?'column-reverse':width<=997?'row-reverse':'row')&&values.responsive.align==='center'&&values.responsive.justify==='center');
    check(`${tag} adaptive column/row counterpart remains centered`,values.counterpart.direction===(width<=720?'row-reverse':width<=997?'column-reverse':'column')&&values.counterpart.align==='center'&&values.counterpart.justify==='center');
    check(`${tag} SS weight boundary`,values.ss===(width<=720?'480':'460'));
    check(`${tag} thin token is absent, inherited and explicit weights work`,values.thinToken===''&&values.thin==='600'&&values.explicit==='300');
   }
  } finally {await context.close();}
 }
 // Capture the actual edited manual examples on desktop and mobile.
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 try {
  const page=await context.newPage();await page.goto(url,{waitUntil:'networkidle'});
  mkdirSync('test-results/T-000024',{recursive:true});
  for(const [chapter,id] of [['layout','E08'],['dimensions','E13'],['themes','E22']]) {
   await page.evaluate(chapter=>location.hash=chapter,chapter);await page.waitForFunction(id=>document.querySelector(`[data-example="${id}"]`).dataset.ok==='true',id);
   for(const width of [1440,390]) {
    await page.setViewportSize({width,height:1000});const card=page.locator(`[data-example="${id}"]`);
    await card.locator('.demo-width[data-width="auto"]').click();await card.locator('iframe').evaluate(e=>e.scrollIntoView({block:'start',behavior:'instant'}));
    const frame=await card.locator('iframe').elementHandle().then(e=>e.contentFrame());await frame.waitForFunction(()=>document.getElementById('demo-root').getBoundingClientRect().width>0);
    await page.screenshot({path:resolve(`test-results/T-000024/${id}-${width}.png`)});
    check(`${id} manual visible at ${width}`,await card.locator('iframe').isVisible());
   }
  }
 } finally {await context.close();}
}
if(import.meta.url===pathToFileURL(process.argv[1]).href) {
 const browser=await chromium.launch({headless:true});let passed=0;
 try {await checkCoreVersion(browser,pathToFileURL(resolve('docs/index.html')).href,(name,condition)=>{assert.ok(condition,name);passed++;});console.log(JSON.stringify({passed,errors:[]}));}finally{await browser.close();}
}
