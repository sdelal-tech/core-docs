/* Сохранённые настройки выбираются до загрузки CSS и первого показа документа. */
window.docsThemeStartup=(()=>{
 const root=document.documentElement,names=['core','nk','ss','nkui'];
 let design='nk',mode='light',warning='',revealed=false;
 try {
  const saved=localStorage.getItem('core-docs-design');if(names.includes(saved))design=saved;
  if(localStorage.getItem('core-docs-theme')==='dark')mode='dark';
 } catch { /* Storage необязателен. */ }
 root.dataset.design=design;root.dataset.theme=mode;
 root.classList.remove('core-theme-light','core-theme-dark');
 root.classList.add(design==='ss'?`core-theme-ss-${mode}`:`core-theme-${mode}`);
 const controller=createDocsThemeController(document,'shell-theme');
 const links=['shell-core','shell-theme'].map(id=>document.getElementById(id));
 const pending=links.map(link=>new Promise(resolve=>{
  if(link.id==='shell-theme'&&design==='core'){link.dataset.state='ok';resolve();return;}
  const finish=state=>{link.dataset.state=state;link.onload=null;link.onerror=null;resolve();};
  link.onload=()=>finish('ok');link.onerror=()=>finish('error');
  link.href=`https://cdn.sdelal.tech/core/latest/${link.id==='shell-core'?'core.css':`theme-${design}.css`}`;
 }));
 function reveal(message='') {
  if(revealed)return;
  revealed=true;clearTimeout(timer);warning=message;
  if(document.body)document.body.hidden=false;
  document.dispatchEvent(new Event('docs-theme-startup-ready'));
 }
 // Remove stalled CSS so it cannot block later scripts or apply after recovery.
 const timer=setTimeout(()=>{
  for(const link of links)if(!link.dataset.state){link.removeAttribute('href');link.dataset.state='error';link.dispatchEvent(new Event('error'));}
  if(links[1].dataset.state==='error')controller.design('core');
  reveal('Оформление или шрифт не загрузились вовремя. Доступно запасное оформление; обновите страницу или выберите тему.');
 },10000);
 return {
  controller,
  get warning(){return warning;},
  clearWarning(){warning='';},
  hide(){if(!revealed)document.body.hidden=true;},
  async ready(){
   await Promise.all(pending);
   if(revealed)return;
   const theme=links[1];
   if(theme.dataset.state==='error') {
    await controller.design('core');
    warning=`Тема ${design.toUpperCase()} не загрузилась. Доступен базовый Core.`;
   }
   // Hidden HTML has no layout-driven font requests. Load actual text faces explicitly.
   const fonts=new Map();
   for(const node of document.body.querySelectorAll('*')) {
    if(node.closest('.chapter.core-hide')||node.matches('script'))continue;
    const text=[...node.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent).join('');
    if(!text.trim())continue;
    const style=getComputedStyle(node),font=`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    fonts.set(font,(fonts.get(font)||'')+text);
   }
   try {
    await Promise.all([...fonts].map(([font,text])=>document.fonts.load(font,text)));
    await document.fonts.ready;
    reveal(warning);
   } catch {reveal('Шрифт не загрузился. Используется запасной шрифт; проверьте доступ к CDN и обновите страницу.');}
  }
 };
})();
