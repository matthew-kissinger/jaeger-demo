import { readFile, writeFile } from 'node:fs/promises';
import { parseGlb, encodeGlb, hash } from './glb.mjs';

const oldBaseBytes = await readFile('authoring/jaeger/runtime-input.glb');
const oldBase = parseGlb(oldBaseBytes);

const groundBytes = await readFile('authoring/jaeger/pilot-ground.glb');
const ground = parseGlb(groundBytes);

const flightBytes = await readFile('authoring/jaeger/pilot-flight.glb');
const flight = parseGlb(flightBytes);

// 1. Update pilot-ground-runtime.glb and pilot-flight-runtime.glb with provenance
for (const [batch, glb] of [['ground', ground], ['flight', flight]]) {
  const metaName = `pilot-${batch}-runtime.kiln-metadata.json`;
  const metaBytes = await readFile(`authoring/jaeger/${metaName}`);
  glb.json.asset = glb.json.asset ?? { version: '2.0' };
  glb.json.asset.extras = {
    ...glb.json.asset.extras,
    kilnProvenanceV1: {
      version: 'kiln.provenance.v1',
      profile: 'runtime',
      metadata: {
        uri: metaName,
        sha256: `sha256:${hash(metaBytes)}`
      }
    }
  };
  const runtimeBytes = encodeGlb(glb.json, glb.binary);
  await writeFile(`authoring/jaeger/pilot-${batch}-runtime.glb`, runtimeBytes);
  console.log(`Updated authoring/jaeger/pilot-${batch}-runtime.glb`);
}

// 2. Build new runtime-input.glb using ground geometry + oldBase's 16 native animations
const doc = structuredClone(ground.json);
const chunks = [ground.binary];
let offset = ground.binary.length;

// Map bufferViews and accessors from oldBase for animations
const viewMap = new Map();
const accessorMap = new Map();

for (const anim of oldBase.json.animations) {
  for (const sampler of anim.samplers) {
    for (const key of ['input', 'output']) {
      const oldAccIdx = sampler[key];
      if (accessorMap.has(oldAccIdx)) continue;
      const oldAcc = oldBase.json.accessors[oldAccIdx];
      const oldViewIdx = oldAcc.bufferView;
      
      let newViewIdx = viewMap.get(oldViewIdx);
      if (newViewIdx === undefined) {
        const oldView = oldBase.json.bufferViews[oldViewIdx];
        const padding = (4 - (offset % 4)) % 4;
        if (padding) {
          chunks.push(Buffer.alloc(padding));
          offset += padding;
        }
        newViewIdx = doc.bufferViews.length;
        doc.bufferViews.push({ ...oldView, buffer: 0, byteOffset: offset });
        const slice = oldBase.binary.subarray(oldView.byteOffset ?? 0, (oldView.byteOffset ?? 0) + oldView.byteLength);
        chunks.push(slice);
        offset += slice.length;
        viewMap.set(oldViewIdx, newViewIdx);
      }
      
      const newAccIdx = doc.accessors.length;
      doc.accessors.push({ ...oldAcc, bufferView: newViewIdx });
      accessorMap.set(oldAccIdx, newAccIdx);
    }
  }
}

// Copy 16 native animations remapping sampler accessors
doc.animations = oldBase.json.animations.map(anim => {
  const a = structuredClone(anim);
  for (const s of a.samplers) {
    s.input = accessorMap.get(s.input);
    s.output = accessorMap.get(s.output);
  }
  return a;
});

doc.buffers[0].byteLength = offset;
doc.asset = oldBase.json.asset;

const newRuntimeInput = encodeGlb(doc, Buffer.concat(chunks));
await writeFile('authoring/jaeger/runtime-input.glb', newRuntimeInput);
console.log('Updated authoring/jaeger/runtime-input.glb with corrected hand geometry!');
