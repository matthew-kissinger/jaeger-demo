import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const backend=process.argv[2]??'webgpu';await mkdir(`evidence/combat-${backend}`,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-webgpu','--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[],report={backend,errors};
page.on('pageerror',error=>errors.push(String(error)));page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
// Only choose test starting positions and hold frames; use real keys, callbacks,
// geometry, shader materials, collision and the normal simulation thereafter.
await page.route('**/src/demo.ts*',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text())+`\nwindow.combatPlace=(position)=>{paused=false;player.paused=false;player.reset();player.wrapper.position.fromArray(position);input.yaw=0;input.pitch=-.15;input.zoom=126;canvas.focus();};window.combatFreeze=()=>{paused=true;};`});});
try{
  await page.goto(`http://127.0.0.1:5186/jaeger-demo/?backend=${backend}`,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.jaegerQA?.ready,{timeout:30000});
  await page.getByRole('button',{name:'Skip to controls',exact:true}).click();
  await page.evaluate(()=>window.combatPlace([13,0,-82]));await page.waitForTimeout(900);
  await page.keyboard.press('KeyJ');await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>window.jaegerQA.snapshot().state),'idle');
  await page.keyboard.press('KeyQ');await page.waitForFunction(()=>window.jaegerQA.combat().hits.length===1,{timeout:4000});await page.evaluate(()=>window.combatFreeze());
  await page.screenshot({path:`evidence/combat-${backend}/slash.png`});report.slash=await page.evaluate(()=>({snapshot:window.jaegerQA.snapshot(),...window.jaegerQA.combat()}));
  await page.evaluate(()=>window.combatPlace([0,0,84]));await page.waitForTimeout(900);
  await page.keyboard.press('KeyK');await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>window.jaegerQA.snapshot().state),'idle');
  await page.keyboard.press('KeyE');await page.waitForFunction(()=>window.jaegerQA.snapshot().state==='fire',{timeout:4000});
  await page.screenshot({path:`evidence/combat-${backend}/aim.png`});
  await page.waitForFunction(()=>window.jaegerQA.combat().shots.length===1,{timeout:3000});await page.evaluate(()=>window.combatFreeze());
  await page.screenshot({path:`evidence/combat-${backend}/cannon.png`});report.cannon=await page.evaluate(()=>({snapshot:window.jaegerQA.snapshot(),...window.jaegerQA.combat(),stats:window.jaegerQA.stats()}));
  assert.equal(report.slash.snapshot.clip,'SlashRight');assert.equal(report.cannon.shots[0].targetId,'Target02');assert.deepEqual(errors,[]);
  await writeFile(`evidence/combat-${backend}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
