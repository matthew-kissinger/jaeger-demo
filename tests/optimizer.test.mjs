import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { optimizeGlb, RUNTIME_DRIVEN_JOINTS } from '../scripts/optimize-jaeger.mjs';
import { parseGlb } from '../scripts/glb.mjs';

test('runtime batching keeps rig, animations and embedded PNG bytes intact', async () => {
  const bytes = await readFile(new URL('../authoring/jaeger/runtime-input.glb', import.meta.url));
  const { bytes: output, report, json } = optimizeGlb(bytes);
  assert.equal(report.inputInstances, 470);
  assert.ok(report.outputInstances <= 160, `batch count ${report.outputInstances}`);
  assert.equal(report.triangles, 71620);
  assert.equal(json.animations.length, 16);
  assert.equal(json.images.length, 8);
  assert.equal(report.originalNodesPreserved, true);
  assert.equal(report.textureBytesPreserved, true);
  // Batching expands instanced geometry; bound its measured contribution to the 15 MB scene budget.
  assert.ok(output.byteLength < 8 * 1024 * 1024);
  assert.ok(gzipSync(output).byteLength < 2 * 1024 * 1024);
});

test('every independently controlled joint stays a batching boundary', async () => {
  const bytes = await readFile(new URL('../authoring/jaeger/runtime-input.glb', import.meta.url));
  const { report } = optimizeGlb(bytes);
  const json = parseGlb(bytes).json;
  const names = new Set(report.protectedNodes.map(index => json.nodes[index].name));
  for (const name of RUNTIME_DRIVEN_JOINTS) assert.ok(names.has(name));
  for (const clip of json.animations) for (const channel of clip.channels) assert.ok(report.protectedNodes.includes(channel.target.node));
  for (const group of report.groups) {
    for (const member of group.members) {
      assert.equal(member.crossedProtectedNodes.length, 0);
    }
  }
});

test('newly controlled static joints create a new optimization boundary', async () => {
  const bytes = await readFile(new URL('../authoring/jaeger/runtime-input.glb', import.meta.url));
  const node = parseGlb(bytes).json.nodes.findIndex(node => node.name === 'Joint_Thumb_R');
  const { report } = optimizeGlb(bytes, ['Joint_Thumb_R']);
  assert.ok(report.protectedNodes.includes(node));
  assert.ok(report.groups.some(group => group.anchor === node));
});
