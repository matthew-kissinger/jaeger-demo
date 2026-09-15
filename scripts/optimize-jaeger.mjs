import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Matrix4, Matrix3, Quaternion, Vector3 } from 'three';
import { parseGlb, encodeGlb, readAccessor, hash } from './glb.mjs';

export const RUNTIME_DRIVEN_JOINTS = ['Joint_MotionRoot', 'Joint_Pelvis', 'Joint_Torso', 'Joint_Head', ...['L', 'R'].flatMap(side => ['Hip', 'Knee', 'Ankle', 'Toe', 'CannonYaw', 'CannonPitch'].map(joint => `Joint_${joint}_${side}`))];

/** Bake static transforms below actual motion boundaries. The complete named rig remains in the graph. */
export function optimizeGlb(input, additionalControlledNames = []) {
  const original = parseGlb(input);
  const json = structuredClone(original.json), originalNodes = structuredClone(json.nodes);
  if (json.skins?.length || json.meshes.some(m => m.primitives.some(p => p.targets || p.extensions))) throw new Error('This rigid optimizer requires uncompressed, non-skinned primitives');
  const protectedNodes = new Set();
  const controlledNames = new Set([...RUNTIME_DRIVEN_JOINTS, ...additionalControlledNames]);
  json.nodes.forEach((node, index) => { if (controlledNames.has(node.name)) protectedNodes.add(index); });
  for (const clip of json.animations ?? []) for (const channel of clip.channels) protectedNodes.add(channel.target.node);
  const parents = new Map();
  json.nodes.forEach((node, index) => node.children?.forEach(child => parents.set(child, index)));
  for (const scene of json.scenes) for (const root of scene.nodes) protectedNodes.add(root);
  const local = node => node.matrix ? new Matrix4().fromArray(node.matrix) : new Matrix4().compose(
    new Vector3().fromArray(node.translation ?? [0, 0, 0]),
    new Quaternion().fromArray(node.rotation ?? [0, 0, 0, 1]),
    new Vector3().fromArray(node.scale ?? [1, 1, 1]),
  );
  const worlds = new Map();
  function world(index) {
    if (!worlds.has(index)) {
      const parent = parents.get(index);
      worlds.set(index, (parent === undefined ? new Matrix4() : world(parent).clone()).multiply(local(json.nodes[index])));
    }
    return worlds.get(index);
  }
  const groups = new Map();
  let inputInstances = 0, triangles = 0;
  for (let index = 0; index < originalNodes.length; index++) {
    const node = json.nodes[index];
    if (node.mesh === undefined) continue;
    inputInstances++;
    let anchor = index;
    while (!protectedNodes.has(anchor) && parents.has(anchor)) anchor = parents.get(anchor);
    const matrix = world(anchor).clone().invert().multiply(world(index));
    for (const [primitiveIndex, primitive] of json.meshes[node.mesh].primitives.entries()) {
      if ((primitive.mode ?? 4) !== 4) throw new Error('Only triangle primitives are supported');
      const semantics = Object.keys(primitive.attributes).sort();
      if (semantics.some(s => !['POSITION', 'NORMAL', 'TEXCOORD_0', 'TANGENT'].includes(s))) throw new Error('Unexpected attribute layout');
      const key = `${anchor}:${primitive.material}:${semantics.join(',')}`;
      if (!groups.has(key)) groups.set(key, { anchor, material: primitive.material, semantics, members: [], attrs: {}, indices: [], vertexCount: 0 });
      const group = groups.get(key);
      const start = group.vertexCount;
      const normalMatrix = new Matrix3().getNormalMatrix(matrix);
      const vector = new Vector3();
      let count = 0;
      for (const semantic of semantics) {
        const data = readAccessor(original.json, original.binary, primitive.attributes[semantic]);
        count = data.count;
        const transformed = Array.from(data.values);
        if (['POSITION', 'NORMAL', 'TANGENT'].includes(semantic)) {
          for (let i = 0; i < count; i++) {
            vector.fromArray(transformed, i * data.width);
            if (semantic === 'POSITION') vector.applyMatrix4(matrix);
            else if (semantic === 'NORMAL') vector.applyMatrix3(normalMatrix).normalize();
            else vector.transformDirection(matrix);
            vector.toArray(transformed, i * data.width);
            if (semantic === 'TANGENT' && matrix.determinant() < 0) transformed[i * data.width + 3] *= -1;
          }
        }
        if (!group.attrs[semantic]) group.attrs[semantic] = { width: data.width, type: data.type, values: [] };
        for (const value of transformed) group.attrs[semantic].values.push(value);
      }
      const indices = primitive.indices === undefined ? Array.from({ length: count }, (_, i) => i) : Array.from(readAccessor(original.json, original.binary, primitive.indices).values);
      if (matrix.determinant() < 0) for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
      for (const value of indices) group.indices.push(value + start);
      group.vertexCount += count; triangles += indices.length / 3;
      group.members.push({ node: index, name: node.name, sourceMesh: node.mesh, primitive: primitiveIndex, vertexStart: start, vertexCount: count, crossedProtectedNodes: [] });
    }
    delete node.mesh;
  }

  const buffers = [original.binary]; let byteLength = original.binary.length;
  function append(values, width, type, indices = false) {
    const padding = (4 - byteLength % 4) % 4;
    if (padding) { buffers.push(Buffer.alloc(padding)); byteLength += padding; }
    const array = indices ? new Uint32Array(values) : new Float32Array(values);
    const bytes = Buffer.from(array.buffer);
    const viewIndex = json.bufferViews.length;
    json.bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: bytes.length, target: indices ? 34963 : 34962 });
    buffers.push(bytes); byteLength += bytes.length;
    const accessor = { bufferView: viewIndex, componentType: indices ? 5125 : 5126, count: values.length / width, type };
    if (type === 'VEC3') {
      accessor.min = [Infinity, Infinity, Infinity]; accessor.max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < array.length; i++) {
        accessor.min[i % 3] = Math.min(accessor.min[i % 3], array[i]);
        accessor.max[i % 3] = Math.max(accessor.max[i % 3], array[i]);
      }
    }
    return json.accessors.push(accessor) - 1;
  }
  json.meshes = [];
  const groupReports = [];
  for (const group of groups.values()) {
    const attributes = {};
    for (const semantic of group.semantics) {
      const attr = group.attrs[semantic];
      attributes[semantic] = append(attr.values, attr.width, attr.type);
    }
    const meshIndex = json.meshes.length;
    const name = `Batch_${json.nodes[group.anchor].name ?? group.anchor}_${group.material}_${meshIndex}`;
    json.meshes.push({ name, primitives: [{ attributes, indices: append(group.indices, 1, 'SCALAR', true), material: group.material, mode: 4 }] });
    const nodeIndex = json.nodes.push({ name, mesh: meshIndex }) - 1;
    (json.nodes[group.anchor].children ??= []).push(nodeIndex);
    groupReports.push({ anchor: group.anchor, anchorName: json.nodes[group.anchor].name, node: nodeIndex, name, mesh: meshIndex, material: group.material, members: group.members });
  }

  // Compact to reachable geometry, animation, and image data. Original PNG payloads remain exact.
  const allBinary = Buffer.concat(buffers);
  const needed = new Set();
  for (const mesh of json.meshes) for (const primitive of mesh.primitives) {
    needed.add(primitive.indices); Object.values(primitive.attributes).forEach(index => needed.add(index));
  }
  for (const clip of json.animations ?? []) for (const sampler of clip.samplers) { needed.add(sampler.input); needed.add(sampler.output); }
  const accessorMap = new Map([...needed].sort((a, b) => a - b).map((old, index) => [old, index]));
  const accessors = [...accessorMap.keys()].map(index => json.accessors[index]);
  const viewSet = new Set(accessors.map(accessor => accessor.bufferView));
  for (const image of json.images ?? []) if (image.bufferView !== undefined) viewSet.add(image.bufferView);
  const viewMap = new Map([...viewSet].sort((a, b) => a - b).map((old, index) => [old, index]));
  const finalViews = [], finalChunks = []; let offset = 0;
  for (const old of viewMap.keys()) {
    const view = json.bufferViews[old], padding = (4 - offset % 4) % 4;
    if (padding) { finalChunks.push(Buffer.alloc(padding)); offset += padding; }
    const chunk = allBinary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    finalChunks.push(chunk); finalViews.push({ ...view, buffer: 0, byteOffset: offset }); offset += chunk.length;
  }
  for (const accessor of accessors) accessor.bufferView = viewMap.get(accessor.bufferView);
  for (const image of json.images ?? []) if (image.bufferView !== undefined) image.bufferView = viewMap.get(image.bufferView);
  for (const mesh of json.meshes) for (const primitive of mesh.primitives) {
    primitive.indices = accessorMap.get(primitive.indices);
    for (const key of Object.keys(primitive.attributes)) primitive.attributes[key] = accessorMap.get(primitive.attributes[key]);
  }
  for (const clip of json.animations ?? []) for (const sampler of clip.samplers) {
    sampler.input = accessorMap.get(sampler.input); sampler.output = accessorMap.get(sampler.output);
  }
  json.accessors = accessors; json.bufferViews = finalViews; json.buffers = [{ byteLength: offset }];
  const binary = Buffer.concat(finalChunks);
  const preservedNodes = originalNodes.every((node, index) => {
    const actual = { ...json.nodes[index] }, expected = { ...node };
    delete expected.mesh; delete actual.mesh;
    if (expected.children) actual.children = actual.children?.slice(0, expected.children.length);
    else delete actual.children;
    return JSON.stringify(expected) === JSON.stringify(actual);
  });
  const textureBytes = (doc, bin, image) => image.uri ? Buffer.from(image.uri.split(',')[1], 'base64') : bin.subarray(doc.bufferViews[image.bufferView].byteOffset ?? 0, (doc.bufferViews[image.bufferView].byteOffset ?? 0) + doc.bufferViews[image.bufferView].byteLength);
  const texturesPreserved = (json.images ?? []).every((image, i) => textureBytes(json, binary, image).equals(textureBytes(original.json, original.binary, original.json.images[i])));
  const bytes = encodeGlb(json, binary);
  const report = {
    version: 1, sourceSha256: hash(input), outputSha256: hash(bytes), inputBytes: input.length, outputBytes: bytes.length,
    inputInstances, outputInstances: groups.size, triangles, protectedNodes: [...protectedNodes],
    originalNodesPreserved: preservedNodes, textureBytesPreserved: texturesPreserved, groups: groupReports,
    method: 'Static transforms baked below animation targets and declared runtime/IK-controlled joints; all original nodes and PNG bytes retained. Unanimated static joints require rebatching before new motion can affect their previously merged geometry.',
    runtimeDrivenJoints: [...controlledNames],
  };
  return { bytes, json, report };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const input = await readFile(resolve('authoring/jaeger/runtime-input.glb'));
  const result = optimizeGlb(input);
  await mkdir('public/assets', { recursive: true }); await mkdir('evidence', { recursive: true });
  await writeFile('public/assets/jaeger.glb.tmp', result.bytes);
  await rename('public/assets/jaeger.glb.tmp', 'public/assets/jaeger.glb');
  await writeFile('evidence/jaeger-optimization.json', JSON.stringify(result.report, null, 2));
  console.log(JSON.stringify({ ...result.report, groups: result.report.groups.length, protectedNodes: result.report.protectedNodes.length }, null, 2));
}
