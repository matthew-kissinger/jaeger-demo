import { loadGlbNode } from './load-glb-node.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { JaegerPlayer } from '../src/player.ts';
import assert from 'node:assert/strict';
const loaded = await loadGlbNode('public/assets/jaeger-pilot.glb'), site = JSON.parse(await readFile('public/assets/site.json', 'utf8'));
const reports = [];
for (const [name,yaw,duration] of [['straight',0,4],['turn-90',Math.PI/2,4],['turn-180',Math.PI,5],['handoff-heading',-1,2],['short-step',0,.3]]) {
  let forward = 0;
  const input = { yaw, pitch:0, boost:false, keys:new Set(), forward:0,right:0, movement:()=>({forward,right:0}), clear:()=>{forward=0;} };
  const player = new JaegerPlayer(loaded.gltf.scene.clone(true),loaded.gltf.animations,input,site); player.reset();
  for(let i=0;i<30;i++) player.update(1/60);
  forward=1; for(let i=0;i<duration*60;i++) player.update(1/60);
  forward=0; for(let i=0;i<60;i++) player.update(1/60);
  reports.push({name,state:player.state,position:player.wrapper.position.toArray(),maxReachError:player.ik.maxReachError,worstReach:player.ik.worstReach,maxCorrection:player.ik.maxCorrection,maxContactError:player.ik.maxContactError});
}
await writeFile('evidence/contact-check.json',JSON.stringify(reports,null,2)); console.log(JSON.stringify(reports,null,2));
for (const report of reports) { assert.ok(report.maxReachError < 0.01, `${report.name}: unreachable planted foot`); assert.ok(report.maxContactError < 0.01, `${report.name}: solved contact drift exceeds 1 cm`); assert.equal(report.state,'idle'); }
