import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { loadGlbNode } from './load-glb-node.mjs';

const { gltf, THREE, sha256 } = await loadGlbNode('authoring/environment/coastal-supported-runtime.glb');
const rails = [], carriers = [];
gltf.scene.traverse(node => { if (node.name.startsWith('Mesh_CarriageRail')) rails.push(node); if (node.name.startsWith('Mesh_BraceCarrier')) carriers.push(node); });
assert.equal(rails.length, 2); assert.equal(carriers.length, 2);
const mixer = new THREE.AnimationMixer(gltf.scene), action = mixer.clipAction(gltf.animations[0]); action.play(); action.paused = true;
let maxGap = 0, minOverlap = Infinity;
for (let frame = 0; frame <= 720; frame++) {
  action.enabled = true; action.time = frame / 60; mixer.update(0); gltf.scene.updateMatrixWorld(true);
  for (const carrier of carriers) {
    const bounds = new THREE.Box3().setFromObject(carrier);
    const rail = rails.find(node => Math.sign(node.getWorldPosition(new THREE.Vector3()).z) === Math.sign(bounds.getCenter(new THREE.Vector3()).z));
    assert.equal(rail.parent.name, 'Joint_Cradle', 'Guide must remain on the fixed cradle');
    const support = new THREE.Box3().setFromObject(rail);
    maxGap = Math.max(maxGap, Math.abs(bounds.min.y - support.max.y));
    minOverlap = Math.min(minOverlap, Math.min(bounds.max.x, support.max.x) - Math.max(bounds.min.x, support.min.x), Math.min(bounds.max.z, support.max.z) - Math.max(bounds.min.z, support.min.z));
  }
}
assert.ok(maxGap < .05, `Carriage floats above rail by ${maxGap}m`);
assert.ok(minOverlap > 1, 'Carriage leaves the support surface during release');
await mkdir('evidence/cradle', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-webgpu','--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 1050 } });
const errors = []; page.on('pageerror', error => errors.push(String(error)));
// A capture-only hook controls existing timeline/camera. It changes no scene assets,
// materials, lighting or production source, and is injected only into this test page.
await page.route('**/src/demo.ts*', async route => {
  const response = await route.fetch();
  const hook = `\nwindow.cradleCapture = (seconds, side) => {
    paused = true; started = true; player.reset(true);
    for (let i = 0; i < Math.round(seconds * 60); i++) player.update(1/60);
    cradleAction.enabled = true; cradleAction.paused = true; cradleAction.time = seconds; cradleMixer.update(0);
    scene.updateMatrixWorld(true);
    camera.position.set(-99, 56, side * 80); camera.lookAt(-166, 49, side * 20);
    weather.update(seconds); renderer.render(scene, camera);
  };`;
  await route.fulfill({ response, body: (await response.text()) + hook });
});
try {
  await page.goto('http://127.0.0.1:5186/jaeger-demo/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.jaegerQA?.ready, { timeout: 30000 });
  await page.addStyleTag({ content: '#app > :not(canvas) { visibility: hidden !important; }' });
  for (const [name, seconds, side] of [['docked',0,1],['retracting',4.25,1],['released',6,1],['released-other-side',6,-1]]) {
    await page.evaluate(([seconds,side]) => window.cradleCapture(seconds,side), [seconds,side]);
    await page.waitForTimeout(100);
    await page.screenshot({ path: `evidence/cradle/${name}.png` });
  }
  const stats = await page.evaluate(() => window.jaegerQA.stats());
  const report = { sourceSha256: sha256, posesChecked: 721, maxRailGapMetres: maxGap, minimumSupportOverlapMetres: minOverlap, errors, stats, note: 'Actual served scene assets and lighting; camera and timeline held only for inspection.' };
  await writeFile('evidence/cradle/verification.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report,null,2));
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
