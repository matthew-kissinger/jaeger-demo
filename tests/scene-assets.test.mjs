import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseGlb, readAccessor, hash } from '../scripts/glb.mjs';
test('extended delivery preserves all native samples and adds nine independently bound Kiln helper clips', async () => {
  const base = parseGlb(await readFile('authoring/jaeger/runtime-input.glb'));
  const demo = parseGlb(await readFile('public/assets/jaeger-pilot.glb'));
  assert.equal(demo.json.animations.length, 25);
  for (const original of base.json.animations) {
    const delivered = demo.json.animations.find(clip=>clip.name===original.name);
    assert.deepEqual(delivered.channels, original.channels);
    for (let i=0;i<original.samplers.length;i++) for (const field of ['input','output']) {
      assert.deepEqual(readAccessor(demo.json,demo.binary,delivered.samplers[i][field]),readAccessor(base.json,base.binary,original.samplers[i][field]));
    }
  }
  for (const clip of demo.json.animations) for (const channel of clip.channels) assert.ok(demo.json.nodes[channel.target.node]?.name.startsWith('Joint_'));
});
test('runtime sidecar pointers survive batching and match exact deployed bytes', async () => {
  for (const filename of ['jaeger-pilot.glb','environment.glb']) {
    const {json} = parseGlb(await readFile(`public/assets/${filename}`));
    const pointer=json.asset.extras.kilnProvenanceV1.metadata;
    assert.equal(`sha256:${hash(await readFile(`public/assets/${pointer.uri}`))}`,pointer.sha256);
  }
});
