import { createHash } from 'node:crypto';

export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export function parseGlb(bytes) {
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw new Error('Invalid GLB');
  const length = bytes.readUInt32LE(12);
  if (bytes.readUInt32LE(16) !== 0x4e4f534a) throw new Error('GLB must start with JSON');
  const json = JSON.parse(bytes.subarray(20, 20 + length).toString('utf8'));
  const offset = 20 + length;
  const binary = bytes.subarray(offset + 8, offset + 8 + bytes.readUInt32LE(offset));
  if (bytes.readUInt32LE(offset + 4) !== 0x004e4942) throw new Error('Missing BIN chunk');
  return { json, binary };
}

export function encodeGlb(json, binary) {
  const text = Buffer.from(JSON.stringify(json));
  const jsonLength = Math.ceil(text.length / 4) * 4;
  const binLength = Math.ceil(binary.length / 4) * 4;
  const out = Buffer.alloc(28 + jsonLength + binLength);
  out.writeUInt32LE(0x46546c67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(jsonLength, 12); out.writeUInt32LE(0x4e4f534a, 16);
  out.fill(32, 20, 20 + jsonLength); text.copy(out, 20);
  out.writeUInt32LE(binLength, 20 + jsonLength); out.writeUInt32LE(0x004e4942, 24 + jsonLength);
  binary.copy(out, 28 + jsonLength);
  return out;
}

const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const TYPES = {
  5120: [1, 'readInt8', 127], 5121: [1, 'readUInt8', 255],
  5122: [2, 'readInt16LE', 32767], 5123: [2, 'readUInt16LE', 65535],
  5125: [4, 'readUInt32LE', 4294967295], 5126: [4, 'readFloatLE', 1],
};
export function readAccessor(json, binary, index) {
  const accessor = json.accessors[index], view = json.bufferViews[accessor.bufferView];
  if (accessor.sparse || !view || !TYPES[accessor.componentType] || !COMPONENTS[accessor.type]) throw new Error(`Unsupported accessor ${index}`);
  const [size, read, divisor] = TYPES[accessor.componentType], width = COMPONENTS[accessor.type];
  const out = new Float64Array(accessor.count * width);
  const stride = view.byteStride ?? size * width;
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  for (let row = 0; row < accessor.count; row++) for (let col = 0; col < width; col++) {
    let value = binary[read](start + row * stride + col * size);
    if (accessor.normalized) value = Math.max(-1, value / divisor);
    if (!Number.isFinite(value)) throw new Error(`Nonfinite accessor ${index}`);
    out[row * width + col] = value;
  }
  return { values: out, width, count: accessor.count, type: accessor.type };
}
