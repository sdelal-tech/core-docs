import AdmZip from 'adm-zip';
import {readFileSync as read,readdirSync,writeFileSync as write} from 'node:fs';
import {join,posix,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export function packageAgent(root='docs') {
 const names=['AGENTS.md','README.md','chapters.json',...readdirSync(join(root,'chapters')).filter(n=>n.endsWith('.md')).map(n=>'chapters/'+n),...readdirSync(join(root,'reference')).filter(n=>n.endsWith('.json')).map(n=>'reference/'+n)].sort();
 const archive=new AdmZip({noSort:true});
 for(const name of names) {
  let text=read(join(root,name),'utf8');
  if(name.endsWith('.md'))text=text.replace(/https:\/\/github\.sdelal\.tech\/core-docs\/([^\s)"<>?#]+\.(?:md|json))/g,(_match,target)=>posix.relative(posix.dirname(name),target));
  archive.addFile('core/'+name,Buffer.from(text,'utf8'));
  const entry=archive.getEntry('core/'+name);
  entry.header.time=new Date(1980,0,1,0,0,0);
  entry.header.made=0x0314; // Unix creator, ZIP2.0, independent of build host.
  entry.attr=(0o100644<<16)>>>0;
 }
 write(join(root,'core-agent.zip'),archive.toBuffer());
 console.log(`Packaged ${names.length} agent files: ${join(root,'core-agent.zip')}`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)packageAgent(process.argv[2]);
