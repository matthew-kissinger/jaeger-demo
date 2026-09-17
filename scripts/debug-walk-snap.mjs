import { loadGlbNode } from './load-glb-node.mjs';
import { readFile } from 'node:fs/promises';
import { JaegerPlayer } from '../src/player.ts';
import * as THREE from 'three';

const loaded = await loadGlbNode('public/assets/jaeger-pilot.glb');
const site = JSON.parse(await readFile('public/assets/site.json', 'utf8'));

async function testConfig(name, setupPlayer) {
  let forward = 1;
  const input = { yaw: 0, pitch: 0, boost: false, keys: new Set(), forward: 1, right: 0, movement: () => ({ forward: 1, right: 0 }), clear: () => {} };
  const player = new JaegerPlayer(loaded.gltf.scene.clone(true), loaded.gltf.animations, input, site);
  player.reset();
  setupPlayer(player);

  for (let i = 0; i < 60; i++) player.update(1/60);

  const ankleR = player.model.getObjectByName('Joint_Ankle_R');
  let maxDelta = 0;
  let snapAtPhase = null;

  for (let i = 0; i < 150; i++) {
    const time = player.action.time;
    const phase = (time / 2.4) % 1;
    const before = ankleR.getWorldPosition(new THREE.Vector3());
    player.update(1/60);
    const after = ankleR.getWorldPosition(new THREE.Vector3());
    const delta = after.distanceTo(before);
    if (phase >= 0.55 && phase <= 0.65 && delta > maxDelta) {
      maxDelta = delta;
      snapAtPhase = phase;
    }
  }

  console.log(`${name.padEnd(35)}: max transition delta around 0.6 = ${maxDelta.toFixed(3)}m (phase: ${snapAtPhase?.toFixed(3)}), maxReachError: ${player.ik.maxReachError.toFixed(2)}m`);
}

// Test straight walk, turning walk, and acceleration from idle
await testConfig('Straight walk (synchronized)', p => {});
await testConfig('Turn walk (synchronized + blend)', p => {
  p.input.yaw = Math.PI / 4;
});
