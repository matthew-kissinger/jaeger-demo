import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { parseGlb, encodeGlb, hash } from './glb.mjs';
import { optimizeGlb } from './optimize-jaeger.mjs';
import { gzipSync } from 'node:zlib';
import { runInNewContext } from 'node:vm';
const baseBytes = await readFile('authoring/jaeger/runtime-input.glb');
const base = parseGlb(baseBytes), doc = structuredClone(base.json), chunks = [base.binary];
let offset = base.binary.length;
const byName = new Map(doc.nodes.map((node, i) => [node.name, i]));
const provenance = [];
for (const [batch, ref] of [['ground','p_f393b2223363'], ['flight','p_7c7ac1c82a55']]) {
  const bytes = await readFile(`authoring/jaeger/pilot-${batch}-runtime.glb`), { json, binary } = parseGlb(bytes);
  const accessors = new Map(), views = new Map();
  function accessor(index) {
    if (accessors.has(index)) return accessors.get(index);
    const source = json.accessors[index];
    if (source.sparse) throw new Error('Sparse helper animation accessor unsupported');
    if (!views.has(source.bufferView)) {
      const view = json.bufferViews[source.bufferView], padding = (4 - offset % 4) % 4;
      if (padding) { chunks.push(Buffer.alloc(padding)); offset += padding; }
      views.set(source.bufferView, doc.bufferViews.length);
      doc.bufferViews.push({ ...view, buffer: 0, byteOffset: offset });
      const chunk = binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
      chunks.push(chunk); offset += chunk.length;
    }
    accessors.set(index, doc.accessors.length);
    doc.accessors.push({ ...source, bufferView: views.get(source.bufferView) });
    return accessors.get(index);
  }
  for (const clip of json.animations) {
    if (doc.animations.some(other => other.name === clip.name)) throw new Error(`Duplicate animation ${clip.name}`);
    const result = structuredClone(clip);
    for (const channel of result.channels) {
      const node = json.nodes[channel.target.node], dest = byName.get(node.name);
      if (dest === undefined) throw new Error(`Missing helper target ${node.name}`);
      for (const property of ['translation','rotation','scale','matrix']) if (JSON.stringify(node[property]) !== JSON.stringify(doc.nodes[dest][property])) throw new Error(`Bind transform changed: ${node.name}.${property}`);
      channel.target.node = dest;
    }
    for (const sampler of result.samplers) { sampler.input = accessor(sampler.input); sampler.output = accessor(sampler.output); }
    doc.animations.push(result);
  }
  const saved = JSON.parse(JSON.parse(await readFile(`output/saved-pilot-${batch}.json`, 'utf8')).content.find(block => block.type === 'text').text).asset;
  const metadataName = json.asset.extras.kilnProvenanceV1.metadata.uri;
  await copyFile(`authoring/jaeger/${metadataName}`, `public/assets/${metadataName}`);
  provenance.push({ batch, programRef: ref, assetId: saved.assetId, revisionId: saved.revisionId, profile: 'runtime', sourceGlbSha256: hash(bytes), metadata: json.asset.extras.kilnProvenanceV1.metadata, clips: json.animations.map(clip => clip.name) });
}
doc.buffers[0].byteLength = offset;
doc.asset.extras.jaegerDemoV1 = { version: 1, baseRuntimeSha256: hash(baseBytes), helperSources: provenance, author: 'gpt-6-astra', harness: 'codex' };
const extended = encodeGlb(doc, Buffer.concat(chunks));
const hero = optimizeGlb(extended);
await writeFile('authoring/jaeger/extended-runtime.glb', extended);
await writeFile('public/assets/jaeger-pilot.glb', hero.bytes);
await writeFile('evidence/jaeger-pilot-optimization.json', JSON.stringify(hero.report, null, 2));
const siteBytes = await readFile('authoring/environment/coastal-supported-runtime.glb');
const metadataBytes = await readFile('authoring/environment/coastal-supported-runtime.kiln-metadata.json');
await writeFile('public/assets/coastal-supported-runtime.kiln-metadata.json', metadataBytes);
// The established converter omits arbitrary userData. Export the authored SITE
// contract explicitly, independently of geometry batching or mesh-name guessing.
const siteSource = await readFile('authoring/environment/coastal-proving-ground-v4.kiln.js', 'utf8');
const site = JSON.parse(JSON.stringify(runInNewContext(siteSource + '\nSITE;', {}, { timeout: 1000 })));
if (!site?.familyRoots) throw new Error('Authored site manifest missing');
const parsedSite = parseGlb(siteBytes);
parsedSite.json.asset = parsedSite.json.asset ?? { version: '2.0' };
parsedSite.json.asset.extras = {
  ...parsedSite.json.asset.extras,
  kilnProvenanceV1: {
    version: 1,
    profile: 'runtime',
    metadata: {
      uri: 'coastal-supported-runtime.kiln-metadata.json',
      sha256: `sha256:${hash(metadataBytes)}`
    }
  }
};
const siteGlbWithExtras = encodeGlb(parsedSite.json, parsedSite.binary);
const environment = optimizeGlb(siteGlbWithExtras, site.familyRoots);
await writeFile('public/assets/environment.glb', environment.bytes);
await writeFile('public/assets/site.json', JSON.stringify(site, null, 2));
await copyFile('authoring/interaction.json', 'public/assets/interaction.json');
await writeFile('evidence/environment-optimization.json', JSON.stringify(environment.report, null, 2));
const manifest = {
  version: 1, targetHeight: 79.25, author: 'gpt-6-astra', harness: 'codex',
  hero: { path: 'assets/jaeger-pilot.glb', sha256: hash(hero.bytes), bytes: hero.bytes.length, gzipBytes: gzipSync(hero.bytes).length, triangles: hero.report.triangles, drawBatches: hero.report.outputInstances, nativeClips: base.json.animations.map(clip=>clip.name), helperSources: provenance },
  environment: { path: 'assets/environment.glb', programRef: 'p_6f8a05f2f517', assetId: 'a_e348aa8d82c14985805662d29868fd5b', revisionId: 'r_867a905770e14aacaab8c55866a67d45', profile: 'runtime', sourceSha256: hash(siteBytes), sha256: hash(environment.bytes), bytes: environment.bytes.length, gzipBytes: gzipSync(environment.bytes).length, triangles: environment.report.triangles, drawBatches: environment.report.outputInstances, sourceBundle: 'downloads/coastal-proving-ground-supported-source.zip' },
  note: 'Kiln-authored geometry and mechanical clips, with traceable static mesh batching at build time. Original download is unchanged. Full scene acceptance remains pending.'
};
await writeFile('public/assets/manifest.json', JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest, null, 2));
