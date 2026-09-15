import { loadGlbNode } from './load-glb-node.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { JaegerPlayer } from '../src/player.ts';
import { Combat } from '../src/combat.ts';
const {gltf,sha256}=await loadGlbNode('public/assets/jaeger-pilot.glb');
const site=JSON.parse(await readFile('public/assets/site.json','utf8')),config=JSON.parse(await readFile('public/assets/interaction.json','utf8')),results=[];
for(const [frameMode,frameDeltas] of [['30Hz',[1/30]],['60Hz',[1/60]],['variable-stall',[.007,.021,.041,.013,.18,.011,.029]]]) {
  for(const [name,command,position,expected] of [['right','slash',[13,0,-82],1],['combo','combo',[13,0,-82],2],['overhead','overhead',[10,0,-72],1],['cannon','cannon',[0,0,84],2],['miss','slash',[-50,0,-82],0]]) {
    const input={yaw:0,pitch:0,boost:false,keys:new Set(),forward:0,right:0,movement:()=>({forward:0,right:0}),clear:()=>{}};
    const player=new JaegerPlayer(gltf.scene.clone(true),gltf.animations,input,site),combat=new Combat(player.model,site,config);
    player.onPose=(frame,dt)=>combat.update(frame,dt);player.onEvent=name=>{if(name==='reset')combat.reset();};
    player.reset();player.wrapper.position.fromArray(position);for(let i=0;i<30;i++)player.update(1/60);player.command(command);
    let accumulated=0;
    for(let frame=0,simulation=0;simulation<6;frame++) {
      accumulated+=Math.min(frameDeltas[frame%frameDeltas.length],4/60);
      for(let step=0;step<4 && accumulated>=1/60;step++){player.update(1/60);simulation+=1/60;accumulated-=1/60;}
    }
    const result={frameMode,name,position,clip:player.currentClip,state:player.state,hits:[...combat.hits],shots:[...combat.shots],maxFootContactError:player.ik.maxContactError};results.push(result);
    assert.equal(combat.hits.length,expected,`${frameMode} ${name} hits`);
    assert.equal(combat.shots.length,command==='cannon'?2:0,`${frameMode} ${name} shot count`);
    assert.ok(combat.hits.every(hit=>hit.targetId===(command==='cannon'?'Target02':'Target01')));
    if(command==='cannon') assert.ok(combat.shots.every((shot,i)=>Math.abs(shot.clipTime-config.weapons.cannonEvents[i].time)<1/60+.00001));
    if(command==='cannon') assert.ok(Math.abs(combat.shots[0].clipTime-.4)<1e-7,'first shot must not drift a tick late through floating point accumulation');
    player.reset();assert.equal(combat.hits.length,0);assert.equal(combat.shots.length,0);
    player.command('hop');player.command('slash');assert.equal(player.pending,'');assert.equal(player.state,'prepare');
  }
}
await writeFile('evidence/combat-check.json',JSON.stringify({heroSha256:sha256,results},null,2));
console.log(JSON.stringify(results.map(({frameMode,name,hits,shots,maxFootContactError})=>({frameMode,name,hits:hits.length,shots:shots.length,maxFootContactError})),null,2));
