import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { loadGlbNode } from './load-glb-node.mjs';

const [source, target, map] = await Promise.all([
  loadGlbNode('authoring/jaeger/runtime-input.glb'),
  loadGlbNode('public/assets/jaeger.glb'),
  readFile('evidence/jaeger-optimization.json', 'utf8').then(JSON.parse),
]);
const { THREE } = source;
const indexNodes = loaded => {
  const nodes = new Map();
  loaded.gltf.scene.traverse(object => {
    const index = loaded.gltf.parser.associations.get(object)?.nodes;
    if (index !== undefined) nodes.set(index, object);
  });
  return nodes;
};
const sourceNodes = indexNodes(source), targetNodes = indexNodes(target);
assert.equal(source.gltf.animations.length, 16);
assert.equal(target.gltf.animations.length, 16);
assert.deepEqual(source.json.materials, target.json.materials);
assert.deepEqual(source.images.map(image => image.encodedSha256), target.images.map(image => image.encodedSha256));
assert.deepEqual(source.json.asset.extras, target.json.asset.extras);
for (let i = 0; i < 16; i++) {
  const a = source.gltf.animations[i], b = target.gltf.animations[i];
  assert.equal(a.name, b.name); assert.equal(a.duration, b.duration); assert.equal(a.tracks.length, b.tracks.length);
  a.tracks.forEach((track, index) => {
    assert.equal(track.name, b.tracks[index].name);
    assert.deepEqual(track.times, b.tracks[index].times);
    assert.deepEqual(track.values, b.tracks[index].values);
  });
}
const mixerA = new THREE.AnimationMixer(source.gltf.scene), mixerB = new THREE.AnimationMixer(target.gltf.scene);
let maxVertexError = 0, maxNormalError = 0, maxJointError = 0, vertexComparisons = 0;
const a = new THREE.Vector3(), b = new THREE.Vector3(), normalA = new THREE.Matrix3(), normalB = new THREE.Matrix3();
const poses = [];
for (let clipIndex = 0; clipIndex < 16; clipIndex++) {
  for (const phase of [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1]) {
    mixerA.stopAllAction(); mixerB.stopAllAction();
    const clipA = source.gltf.animations[clipIndex], clipB = target.gltf.animations[clipIndex];
    const actionA = mixerA.clipAction(clipA), actionB = mixerB.clipAction(clipB);
    for (const action of [actionA, actionB]) {
      action.reset(); action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; action.play();
    }
    mixerA.setTime(phase * clipA.duration); mixerB.setTime(phase * clipB.duration);
    source.gltf.scene.updateMatrixWorld(true); target.gltf.scene.updateMatrixWorld(true);
    for (const [index, node] of sourceNodes) {
      const counterpart = targetNodes.get(index);
      assert.ok(counterpart, `missing original node ${index}`);
      node.matrixWorld.elements.forEach((value, i) => { maxJointError = Math.max(maxJointError, Math.abs(value - counterpart.matrixWorld.elements[i])); });
    }
    for (const group of map.groups) {
      const merged = targetNodes.get(group.node);
      assert.ok(merged?.isMesh);
      const positionsB = merged.geometry.getAttribute('position'), normalsB = merged.geometry.getAttribute('normal');
      normalB.getNormalMatrix(merged.matrixWorld);
      for (const member of group.members) {
        const original = sourceNodes.get(member.node);
        assert.ok(original?.isMesh);
        const positionsA = original.geometry.getAttribute('position'), normalsA = original.geometry.getAttribute('normal');
        assert.equal(positionsA.count, member.vertexCount);
        normalA.getNormalMatrix(original.matrixWorld);
        for (let i = 0; i < member.vertexCount; i++) {
          a.fromBufferAttribute(positionsA, i).applyMatrix4(original.matrixWorld);
          b.fromBufferAttribute(positionsB, i + member.vertexStart).applyMatrix4(merged.matrixWorld);
          maxVertexError = Math.max(maxVertexError, a.distanceTo(b));
          if (normalsA && normalsB) {
            a.fromBufferAttribute(normalsA, i).applyNormalMatrix(normalA);
            b.fromBufferAttribute(normalsB, i + member.vertexStart).applyNormalMatrix(normalB);
            maxNormalError = Math.max(maxNormalError, a.distanceTo(b));
          }
          vertexComparisons++;
        }
      }
    }
    poses.push({ clip: clipA.name, phase });
  }
}
assert.ok(maxVertexError < 1e-5, `vertex error ${maxVertexError}`);
assert.ok(maxNormalError < 1e-5, `normal error ${maxNormalError}`);
assert.ok(maxJointError < 1e-9, `joint/socket transform error ${maxJointError}`);
const sourceBytes = await readFile('authoring/jaeger/runtime-input.glb'), outputBytes = await readFile('public/assets/jaeger.glb');
const report = {
  status: 'pass', sourceSha256: source.sha256, outputSha256: target.sha256,
  clips: 16, poses: poses.length, vertexComparisons, maxVertexError, maxNormalError, maxJointError,
  originalNodes: sourceNodes.size, images: source.images.length,
  inputBytes: sourceBytes.length, outputBytes: outputBytes.length,
  inputGzipBytes: gzipSync(sourceBytes).length, outputGzipBytes: gzipSync(outputBytes).length,
  note: 'Real GLTFLoader, decoded PNG textures, all vertices/normals in 144 sampled poses. No sidecar loaded. Renderer/performance and continuous collision acceptance remain separate.',
};
await writeFile('evidence/jaeger-equivalence.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
