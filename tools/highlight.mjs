import {readFileSync as read,writeFileSync as write,mkdirSync,copyFileSync as copy} from 'node:fs';
const languages=['xml','javascript','css','json','markdown'];
export const escapeCode=text=>text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function codeLanguage(value='text') {
 const name=value.toLowerCase().split(/\s+/)[0];
 return ({html:'xml',xml:'xml',js:'javascript',javascript:'javascript',css:'css',json:'json',md:'markdown',markdown:'markdown'})[name]||'plaintext';
}
// The pinned package has self-contained CommonJS modules. Isolate their exports
// in a classic browser bundle so the same artifact also works from file://.
export function buildHighlightAssets() {
 const root='node_modules/highlight.js';
 const version=JSON.parse(read(`${root}/package.json`,'utf8')).version;
 if(version!=='11.11.1')throw new Error(`Unexpected Highlight.js version: ${version}`);
 const module=path=>`(()=>{const module={exports:{}};\n${read(`${root}/lib/${path}.js`,'utf8')}\nreturn module.exports;})()`;
 mkdirSync('docs/assets',{recursive:true});
 write('docs/assets/highlight.js',`/*! Highlight.js ${version}; BSD-3-Clause; see highlight-LICENSE */\n(()=>{const hljs=${module('core')};\n${languages.map(name=>`hljs.registerLanguage('${name}',${module('languages/'+name)});`).join('\n')}\nwindow.hljs=hljs;})();\n`);
 for(const mode of ['light','dark'])copy(`${root}/styles/a11y-${mode}.css`,`docs/assets/highlight-${mode}.css`);
 copy(`${root}/LICENSE`,'docs/assets/highlight-LICENSE');
}
