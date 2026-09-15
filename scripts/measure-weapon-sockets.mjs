import { loadGlbNode } from './load-glb-node.mjs';
import { writeFile } from 'node:fs/promises';
const { gltf, THREE } = await loadGlbNode('public/assets/jaeger-pilot.glb');
const model = gltf.scene, height = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).y, wrapper = new THREE.Group(); wrapper.scale.setScalar(79.25/height); wrapper.add(model);
const mixer = new THREE.AnimationMixer(model), result = {};
for (const [name, times] of [['CannonAim',[1.2]],['CannonFire',[.4,.67]],['SlashRight',[.8,.9,1,1.1,1.2]],['SlashLeft',[.8,.9,1,1.1,1.2]],['OverheadStrike',[1.35,1.52,1.7]]]) {
  result[name] = [];
  for (const time of times) {
    mixer.stopAllAction(); const action=mixer.clipAction(gltf.animations.find(c=>c.name===name)).reset().play(); action.setLoop(THREE.LoopOnce,1); action.clampWhenFinished=true; mixer.setTime(time); wrapper.updateMatrixWorld(true);
    const sockets = {};
    for(const side of ['R','L']) for(const type of ['MuzzleSocket','BladeSocket','BladeTipSocket']) {
      const node=model.getObjectByName(`Joint_${type}_${side}`); sockets[`${type}_${side}`]={position:node.getWorldPosition(new THREE.Vector3()).toArray(),direction:new THREE.Vector3(1,0,0).applyQuaternion(node.getWorldQuaternion(new THREE.Quaternion())).toArray()};
    }
    result[name].push({time,sockets});
  }
}
await writeFile('evidence/weapon-sockets.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(Object.fromEntries(Object.entries(result).map(([name,poses])=>[name,poses.map(p=>({time:p.time,R:p.sockets[name.startsWith('Cannon')?'MuzzleSocket_R':'BladeTipSocket_R'].position,L:p.sockets[name.startsWith('Cannon')?'MuzzleSocket_L':'BladeTipSocket_L'].position}))])),null,2));
