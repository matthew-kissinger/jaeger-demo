/** Load an embedded-PNG GLB offline using real decoded pixels and public Three.js APIs. */
import { access, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORKSPACE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_IMAGE_PIXELS = 16777216;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };

export async function resolveThreeDependency(options = {}) {
  const isUsable = async root => {
    try { await Promise.all([access(join(root, 'examples/jsm/loaders/GLTFLoader.js')), access(join(root, 'build/three.module.js'))]); return true; }
    catch { return false; }
  };
  const override = options.threeRoot ?? process.env.THREE_ROOT;
  if (override) {
    const root = String(override).startsWith('file:') ? fileURLToPath(override) : resolve(override);
    requireValue(await isUsable(root), `Three.js override is not a usable installation: ${root}`);
    return { root, resolvedFrom: options.threeRoot ? 'threeRoot option' : 'THREE_ROOT environment variable' };
  }
  const workspaces = [...new Set([options.workspaceRoot ? resolve(options.workspaceRoot) : WORKSPACE_ROOT, process.cwd()])];
  const attempted = [];
  for (const workspace of workspaces) {
    const root = join(workspace, 'node_modules', 'three'); attempted.push(root);
    if (await isUsable(root)) return { root, resolvedFrom: 'local node_modules/three' };
  }
  for (const workspace of workspaces) {
    const path = join(workspace, '.kiln', 'workspace.json');
    let manifest;
    try { manifest = JSON.parse(await readFile(path, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') continue; throw new Error(`Could not read ${path}: ${error.message}`); }
    if (typeof manifest.runtime !== 'string') continue;
    const runtime = manifest.runtime.startsWith('file:') ? fileURLToPath(manifest.runtime) : resolve(workspace, manifest.runtime);
    const root = join(runtime, 'node_modules', 'three'); attempted.push(root);
    if (await isUsable(root)) return { root, resolvedFrom: path };
  }
  throw new Error(`Three.js was not found. Set THREE_ROOT, install it locally, or configure .kiln/workspace.json. Searched: ${attempted.join(', ')}`);
}

function parseEmbeddedGlb(bytes) {
  requireValue(bytes.length >= 20 && bytes.readUInt32LE(0) === 0x46546c67 && bytes.readUInt32LE(4) === 2, 'Expected a GLB 2.0 file');
  requireValue(bytes.readUInt32LE(8) === bytes.length, 'GLB length mismatch');
  let json, binary;
  for (let offset = 12; offset < bytes.length;) {
    requireValue(offset + 8 <= bytes.length, 'Truncated GLB chunk header');
    const length = bytes.readUInt32LE(offset), type = bytes.readUInt32LE(offset + 4);
    requireValue(length % 4 === 0 && offset + 8 + length <= bytes.length, 'Invalid GLB chunk range');
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (offset === 12) requireValue(type === 0x4e4f534a, 'First GLB chunk must be JSON');
    if (type === 0x4e4f534a) { requireValue(!json, 'Multiple GLB JSON chunks'); json = JSON.parse(data.toString('utf8').replace(/[\u0000 ]+$/u, '')); }
    if (type === 0x004e4942) { requireValue(!binary, 'Multiple GLB BIN chunks'); binary = data; }
    offset += 8 + length;
  }
  requireValue(json?.asset?.version === '2.0', 'Expected glTF asset version 2.0');
  requireValue((json.buffers ?? []).length <= 1 && (json.buffers ?? []).every(buffer => !buffer.uri), 'Only embedded GLB buffers are allowed; no network or external file loading');
  if (json.buffers?.[0]) requireValue(binary && binary.length >= json.buffers[0].byteLength && binary.length - json.buffers[0].byteLength <= 3, 'Invalid embedded buffer length');
  return { json, binary: binary ?? Buffer.alloc(0) };
}

function getPngBytes(image, json, binary) {
  if (image.uri !== undefined) {
    requireValue(typeof image.uri === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/]*={0,2}$/u.test(image.uri), 'Only embedded PNG bufferViews or PNG data URIs are allowed');
    requireValue(image.bufferView === undefined, 'Image cannot contain both URI and bufferView');
    return Buffer.from(image.uri.slice(image.uri.indexOf(',') + 1), 'base64');
  }
  requireValue(image.mimeType === 'image/png' && Number.isInteger(image.bufferView), 'Only actual embedded PNG images are supported');
  const view = json.bufferViews?.[image.bufferView], offset = view?.byteOffset ?? 0;
  requireValue(view && (view.buffer ?? 0) === 0 && Number.isInteger(offset) && offset >= 0 && Number.isInteger(view.byteLength) && view.byteLength > 0 && offset + view.byteLength <= (json.buffers?.[0]?.byteLength ?? 0), 'Image bufferView is invalid');
  return binary.subarray(offset, offset + view.byteLength);
}

async function findSharp(threeDependency, options) {
  const bases = [...new Set([options.workspaceRoot ? resolve(options.workspaceRoot) : WORKSPACE_ROOT, process.cwd(), threeDependency.root])];
  for (const base of bases) {
    const require = createRequire(join(base, 'package.json'));
    let path;
    try { path = require.resolve('sharp'); } catch (error) { if (error.code === 'MODULE_NOT_FOUND') continue; throw error; }
    const module = await import(pathToFileURL(path).href);
    return { sharp: module.default, dependency: { name: 'sharp', path, versions: module.default.versions } };
  }
  throw new Error('Actual PNG decoding requires sharp in the workspace or alongside Three.js. No placeholder textures are used.');
}

async function decodeImage(encoded, index, definition, sharp) {
  requireValue(encoded.length >= 33 && encoded.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `Image ${index} has invalid PNG signature`);
  requireValue(encoded.readUInt32BE(8) === 13 && encoded.toString('ascii', 12, 16) === 'IHDR', `Image ${index} has invalid PNG IHDR`);
  const width = encoded.readUInt32BE(16), height = encoded.readUInt32BE(20), bitDepth = encoded[24];
  requireValue(width > 0 && height > 0 && width * height <= MAX_IMAGE_PIXELS, `Image ${index} has invalid or excessive dimensions`);
  requireValue(bitDepth <= 8, `Image ${index} needs a 16-bit texture path; refusing a lossy 8-bit conversion`);
  const { data, info } = await sharp(encoded, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: 'warning' }).ensureAlpha().raw({ depth: 'uchar' }).toBuffer({ resolveWithObject: true });
  requireValue(info.width === width && info.height === height && info.channels === 4 && data.length === width * height * 4, `Image ${index} decoded dimensions/channels do not match the PNG`);
  const channels = Array.from({ length: 4 }, () => ({ min: 255, max: 0, sum: 0, sumSquares: 0 }));
  for (let offset = 0; offset < data.length; offset++) {
    const value = data[offset], channel = channels[offset % 4];
    requireValue(Number.isFinite(value), `Image ${index} contains a nonfinite decoded value`);
    channel.min = Math.min(channel.min, value); channel.max = Math.max(channel.max, value);
    channel.sum += value; channel.sumSquares += value * value;
  }
  const pixels = width * height;
  return {
    data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    report: { index, name: definition.name ?? null, mimeType: 'image/png', encodedBytes: encoded.length, encodedSha256: digest(encoded), decodedSha256: digest(data), width, height, sourceBitDepth: bitDepth, decodedChannels: 4, decodedBytes: data.length, finite: true, channels: channels.map((channel, index) => ({ channel: ['R', 'G', 'B', 'A'][index], min: channel.min, max: channel.max, mean: channel.sum / pixels, standardDeviation: Math.sqrt(Math.max(0, channel.sumSquares / pixels - (channel.sum / pixels) ** 2)) })) },
  };
}

export function materialTextureSlots(material) {
  const slots = [];
  const walk = (value, path = '') => {
    if (!value || typeof value !== 'object') return;
    for (const [key, entry] of Object.entries(value)) {
      const nextPath = path ? `${path}.${key}` : key;
      if (key.endsWith('Texture') && entry && typeof entry === 'object' && 'index' in entry) slots.push({ path: nextPath, index: entry.index, texCoord: entry.extensions?.KHR_texture_transform?.texCoord ?? entry.texCoord ?? 0 });
      else if (entry && typeof entry === 'object') walk(entry, nextPath);
    }
  };
  walk(material);
  return slots;
}

/** input: GLB path, Buffer, Uint8Array, or ArrayBuffer. No files are written. */
export async function loadGlbNode(input, options = {}) {
  const bytes = typeof input === 'string' || input instanceof URL ? await readFile(input) : input instanceof ArrayBuffer ? Buffer.from(input) : ArrayBuffer.isView(input) ? Buffer.from(input.buffer, input.byteOffset, input.byteLength) : null;
  requireValue(bytes, 'loadGlbNode expects a GLB path or bytes');
  const { json, binary } = parseEmbeddedGlb(bytes);
  const threeDependency = await resolveThreeDependency(options);
  const [{ GLTFLoader }, THREE] = await Promise.all([
    import(pathToFileURL(join(threeDependency.root, 'examples/jsm/loaders/GLTFLoader.js')).href),
    import(pathToFileURL(join(threeDependency.root, 'build/three.module.js')).href),
  ]);
  const decoded = [];
  let decoderDependency = null;
  if (json.images?.length) {
    const decoder = await findSharp(threeDependency, options); decoderDependency = decoder.dependency;
    for (const [index, definition] of json.images.entries()) decoded.push(await decodeImage(getPngBytes(definition, json, binary), index, definition, decoder.sharp));
  }
  const filters = { 9728: THREE.NearestFilter, 9729: THREE.LinearFilter, 9984: THREE.NearestMipmapNearestFilter, 9985: THREE.LinearMipmapNearestFilter, 9986: THREE.NearestMipmapLinearFilter, 9987: THREE.LinearMipmapLinearFilter };
  const wraps = { 33071: THREE.ClampToEdgeWrapping, 33648: THREE.MirroredRepeatWrapping, 10497: THREE.RepeatWrapping };
  const textureReports = [];
  for (const [index, texture] of (json.textures ?? []).entries()) {
    requireValue(Number.isInteger(texture.source) && decoded[texture.source], `Texture ${index} has no decoded embedded PNG source`);
    requireValue(!texture.extensions?.KHR_texture_basisu && !texture.extensions?.EXT_texture_webp && !texture.extensions?.EXT_texture_avif, `Texture ${index} requests an unsupported alternate compressed image`);
    const sampler = json.samplers?.[texture.sampler] ?? {};
    requireValue(texture.sampler === undefined || json.samplers?.[texture.sampler], `Texture ${index} references an invalid sampler`);
    requireValue(sampler.magFilter === undefined || [9728, 9729].includes(sampler.magFilter), `Texture ${index} has invalid magnification filter`);
    requireValue(sampler.minFilter === undefined || filters[sampler.minFilter], `Texture ${index} has invalid minification filter`);
    requireValue((sampler.wrapS === undefined || wraps[sampler.wrapS]) && (sampler.wrapT === undefined || wraps[sampler.wrapT]), `Texture ${index} has invalid wrapping`);
    textureReports.push({ index, sourceImage: texture.source, sampler: { magFilter: sampler.magFilter ?? 9729, minFilter: sampler.minFilter ?? 9987, wrapS: sampler.wrapS ?? 10497, wrapT: sampler.wrapT ?? 10497 }, decodedSha256: decoded[texture.source].report.decodedSha256 });
  }
  const loader = new GLTFLoader();
  loader.register(parser => ({
    name: 'NODE_EMBEDDED_PNG',
    loadTexture(textureIndex) {
      const definition = json.textures[textureIndex], image = decoded[definition.source], sampler = json.samplers?.[definition.sampler] ?? {};
      const texture = new THREE.DataTexture(image.data, image.report.width, image.report.height, THREE.RGBAFormat, THREE.UnsignedByteType);
      texture.name = definition.name || json.images[definition.source].name || '';
      texture.flipY = false;
      texture.magFilter = filters[sampler.magFilter ?? 9729]; texture.minFilter = filters[sampler.minFilter ?? 9987];
      texture.wrapS = wraps[sampler.wrapS ?? 10497]; texture.wrapT = wraps[sampler.wrapT ?? 10497];
      texture.generateMipmaps = texture.minFilter !== THREE.NearestFilter && texture.minFilter !== THREE.LinearFilter;
      texture.userData = { gltfTextureIndex: textureIndex, gltfImageIndex: definition.source, encodedSha256: image.report.encodedSha256, decodedSha256: image.report.decodedSha256 };
      texture.needsUpdate = true;
      parser.associations.set(texture, { textures: textureIndex });
      return Promise.resolve(texture);
    },
  }));
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const textureUsage = [];
  gltf.scene.traverse(object => {
    if (!object.isMesh) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      for (const [slot, value] of Object.entries(material)) {
        if (!value?.isTexture) continue;
        const image = value.image;
        requireValue(value.isDataTexture && image?.data?.length === image.width * image.height * 4, `Material ${material.name}:${slot} lost decoded PNG data`);
        requireValue(Number.isInteger(value.userData.gltfTextureIndex), `Material ${material.name}:${slot} has an untracked texture`);
        textureUsage.push({ mesh: object.name, material: material.name, slot, textureIndex: value.userData.gltfTextureIndex, imageIndex: value.userData.gltfImageIndex, channel: value.channel, colorSpace: value.colorSpace, width: image.width, height: image.height, decodedSha256: value.userData.decodedSha256 });
      }
    }
  });
  return { gltf, json, THREE, images: decoded.map(image => image.report), textures: textureReports, textureUsage, dependencies: { three: threeDependency, pngDecoder: decoderDependency }, sha256: digest(bytes) };
}
