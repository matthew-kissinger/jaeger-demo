import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.argv[2]??'http://127.0.0.1:4186/jaeger-demo/';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-webgpu','--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
page.on('pageerror',error=>errors.push(String(error)));
try{
  await page.goto(base,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.jaegerQA?.ready,{timeout:30000});
  await page.getByRole('button',{name:'Skip to controls',exact:true}).click();await page.keyboard.press('KeyQ');await page.waitForFunction(()=>window.jaegerQA.snapshot().state==='attack');
  const input=await page.evaluate(()=>window.jaegerQA.snapshot());assert.equal(input.clip,'SlashRight');
  const manifest=await fetch(new URL('assets/manifest.json',base)).then(r=>r.json()),files=[];
  for(const item of [manifest.hero,manifest.environment]){
    const response=await fetch(new URL(item.path,base));assert.equal(response.status,200);
    const bytes=Buffer.from(await response.arrayBuffer()),sha256=createHash('sha256').update(bytes).digest('hex');assert.equal(sha256,item.sha256);files.push({path:item.path,bytes:bytes.length,sha256});
  }
  for(const path of ['assets/interaction.json','audio/manifest.json','downloads/jaeger-complete-v4.glb','downloads/coastal-proving-ground-supported-source.zip']){
    const response=await fetch(new URL(path,base));assert.equal(response.status,200);assert.ok(!response.headers.get('content-type')?.includes('text/html'));files.push({path,status:response.status});
  }
  assert.deepEqual(errors,[]);const report={base,readiness:'interim local playtest; full spec acceptance unfinished',input,files,errors};await writeFile('evidence/interim-production-preview.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
