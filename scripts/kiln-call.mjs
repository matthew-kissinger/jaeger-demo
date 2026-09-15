import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(resolve(root, '.kiln/workspace.json'), 'utf8'));
const sdk = `${manifest.runtime}/node_modules/@modelcontextprotocol/sdk/dist/esm/client/`;
const { Client } = await import(pathToFileURL(`${sdk}index.js`).href);
const { StdioClientTransport } = await import(pathToFileURL(`${sdk}stdio.js`).href);
const client = new Client({ name: 'kiln_workspace', version: '1.0.0' });
const transport = new StdioClientTransport({ command: manifest.node, args: [resolve(manifest.runtime, 'dist/mcp-server.mjs')], cwd: root, env: { ...process.env, KILN_PROGRAM_STORE: resolve(root,'.kiln/programs'), KILN_RENDER: 'auto', KILN_GEOMETRY_POLICY: 'strict' }, stderr: 'pipe' });
try {
  await client.connect(transport);
  const [name, inputPath, stem = 'last'] = process.argv.slice(2);
  const args = inputPath ? JSON.parse(await readFile(resolve(root,inputPath),'utf8')) : {};
  const requests=name==='batch'?args:[{name,arguments:args,stem}];
  for(const request of requests){
  const stem=request.stem??'last';
  const result = request.name === 'list-tools' ? await client.listTools() : await client.callTool({name:request.name,arguments:request.arguments},undefined,{timeout:180000});
  await mkdir(resolve(root,'output'),{recursive:true});
  let i = 0;
  const saved = { ...result, content: [] };
  for (const block of result.content ?? []) {
    if (block.type === 'image') {
      const path = resolve(root,`output/${stem}-${i++}.png`);
      await writeFile(path,Buffer.from(block.data,'base64'));
      saved.content.push({type:'image',path,mimeType:block.mimeType});
      console.log(JSON.stringify({image:path}));
    } else {
      saved.content.push(block);
      if (block.type === 'text') {
        let report;
        try { const v=JSON.parse(block.text); const f=v.viewFidelity; report=(v.cameraShots || v.parts) ? {ok:v.ok,programRef:v.programRef,metrics:v.metrics,frames:v.frames,clip:v.clip,viewFidelity:f?{delivered:f.delivered,materialFaithful:f.materialFaithful,degraded:f.degraded,rendererId:f.rendererId}:undefined,error:v.error,unresolvedTracks:v.unresolvedTracks} : v; } catch { report=block.text; }
        const out=typeof report==='string'?report:JSON.stringify(report,null,2);
        console.log(out.length>10000?out.slice(0,10000)+' [full result saved]':out);
      }
    }
  }
  await writeFile(resolve(root,`output/${stem}.json`),JSON.stringify(saved,null,2));
  if (request.name === 'list-tools') console.log(result.tools.map(t=>t.name).join('\n'));
  }
} finally { await client.close(); }
