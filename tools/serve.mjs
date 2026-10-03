import {createServer} from 'node:http';
import {readFile,realpath,stat} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {pathToFileURL} from 'node:url';

// Resolve both lexical and filesystem paths so symlinks cannot expose files outside docs.
export function createDocsServer(directory='docs') {
 const root=resolve(directory),inside=path=>path===root||path.startsWith(root+sep);
 return createServer(async(req,res)=>{
  try {
   if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
   const pathname=decodeURIComponent(req.url.split('?')[0]);
   if(pathname.includes('\0')||pathname.includes('\\')||pathname.split('/').includes('..'))throw new Error('outside docs');
   const path=resolve(root,'.'+pathname+(pathname.endsWith('/')?'index.html':''));
   const canonicalRoot=await realpath(root),canonicalPath=await realpath(path);
   if(!inside(path)||!canonicalPath.startsWith(canonicalRoot+sep)||!(await stat(canonicalPath)).isFile())throw new Error('outside docs');
   const bytes=await readFile(canonicalPath);
   const type={'.html':'text/html; charset=utf-8','.md':'text/plain; charset=utf-8','.json':'application/json; charset=utf-8','.zip':'application/zip','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'}[extname(path)]||'application/octet-stream';
   res.writeHead(200,{'Content-Type':type,'Content-Length':bytes.length});res.end(req.method==='HEAD'?undefined:bytes);
  }catch{res.writeHead(404).end();}
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
 const server=createDocsServer();server.listen(4173,'127.0.0.1',()=>console.log('Serving docs at http://127.0.0.1:4173/'));
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{server.close();server.closeAllConnections();});
 server.on('error',error=>{console.error(error.message);process.exitCode=1;});
}
