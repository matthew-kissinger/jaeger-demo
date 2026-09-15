// Identification paint is baked directly into the existing breastplate UVs.
// Kiln creates an owned procedural texture; deterministic raster strokes edit
// that texture's public pixel buffer. No extra decal meshes or external images.
function chestPaintUV(y, z) {
  return [0.10 - z * (0.80 / 1.32), 0.05 + (y - 0.48) * (0.90 / 1.40)];
}

function mapChestPaint(geometry) {
  const p = geometry.attributes.position, n = geometry.attributes.normal, ix = geometry.index;
  const positions = [], normals = [], uvs = [], indices = [];
  // Only the outward cap gets the number. Sidewalls and rear sample a clean
  // strip so the marking cannot repeat, mirror, or bleed around the plate.
  for (let t = 0; t < ix.count; t += 3) {
    const ids = [ix.getX(t), ix.getX(t + 1), ix.getX(t + 2)];
    const front = ids.every(i => i >= 18);
    for (const i of ids) {
      positions.push(p.getX(i), p.getY(i), p.getZ(i));
      normals.push(n.getX(i), n.getY(i), n.getZ(i));
      uvs.push(...(front ? chestPaintUV(p.getY(i), p.getZ(i)) : [0.035, 0.1 + p.getY(i) * 0.4]));
      indices.push(indices.length);
    }
  }
  return meshGeo({ positions, normals, uvs, indices });
}

function buildChestPaint() {
  const texture = proceduralTexture({
    schemaVersion: 2, size: 512, usage: 'albedo', name: 'Jaeger_Chest_Painted_2_03',
    layers: [
      { op: 'solid', color: 0x48566d },
      { op: 'noise', colorA: 0x46546b, colorB: 0x48566d, scale: 7, octaves: 3, seed: 1503, opacity: 0.50 },
      { op: 'noise', colorA: 0x47556c, colorB: 0x48566d, scale: 72, octaves: 2, seed: 6419, opacity: 0.35 },
    ],
  });
  const { data, width: size } = texture.image;
  const centerY = 1.275, centerZ = -0.63, textWidth = 0.615, textHeight = 0.235;
  const cant = 9 * Math.PI / 180;

  function stroke(a, b, width, bevel = 0.02) {
    const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.sqrt(dx * dx + dy * dy);
    const ux = dx / length, uy = dy / length, nx = -uy * width / 2, ny = ux * width / 2;
    const k = Math.min(bevel, length / 4, width / 3);
    return [
      [a[0] + ux*k + nx, a[1] + uy*k + ny],
      [b[0] - ux*k + nx, b[1] - uy*k + ny],
      [b[0] + nx*0.65, b[1] + ny*0.65],
      [b[0] - nx*0.65, b[1] - ny*0.65],
      [b[0] - ux*k - nx, b[1] - uy*k - ny],
      [a[0] + ux*k - nx, a[1] + uy*k - ny],
      [a[0] - nx*0.65, a[1] - ny*0.65],
      [a[0] + nx*0.65, a[1] + ny*0.65],
    ];
  }
  const glyphs = {
    '2': [
      stroke([0.10,0.91],[0.78,0.91],0.17),
      stroke([0.77,0.91],[0.90,0.79],0.17),
      stroke([0.90,0.80],[0.90,0.62],0.17),
      stroke([0.87,0.61],[0.11,0.17],0.17),
      stroke([0.10,0.12],[0.94,0.12],0.18),
    ],
    '-': [stroke([0.06,0.50],[0.94,0.50],0.15)],
    '0': [
      stroke([0.27,0.91],[0.73,0.91],0.17),
      stroke([0.73,0.91],[0.89,0.78],0.17),
      stroke([0.89,0.78],[0.89,0.535],0.17),
      stroke([0.89,0.485],[0.89,0.25],0.17),
      stroke([0.89,0.25],[0.73,0.12],0.17),
      stroke([0.73,0.12],[0.27,0.12],0.17),
      stroke([0.27,0.12],[0.11,0.25],0.17),
      stroke([0.11,0.25],[0.11,0.485],0.17),
      stroke([0.11,0.535],[0.11,0.78],0.17),
      stroke([0.11,0.78],[0.27,0.91],0.17),
    ],
    '3': [
      stroke([0.08,0.91],[0.79,0.91],0.17),
      stroke([0.79,0.91],[0.90,0.79],0.17),
      stroke([0.90,0.79],[0.90,0.56],0.17),
      stroke([0.31,0.51],[0.84,0.51],0.17),
      stroke([0.90,0.46],[0.90,0.25],0.17),
      stroke([0.90,0.25],[0.79,0.12],0.17),
      stroke([0.79,0.12],[0.08,0.12],0.17),
    ],
  };
  const specs = [{char:'2',width:0.148},{char:'-',width:0.072},{char:'0',width:0.148},{char:'3',width:0.148}];
  const gap = (textWidth - specs.reduce((sum, q) => sum + q.width, 0)) / 3;

  function paintPolygon(points, color) {
    const polygon = points.map(([y, z]) => chestPaintUV(y, z).map(v => v * size));
    const x0 = Math.max(0, Math.floor(Math.min(...polygon.map(p => p[0]))));
    const x1 = Math.min(size - 1, Math.ceil(Math.max(...polygon.map(p => p[0]))));
    const y0 = Math.max(0, Math.floor(Math.min(...polygon.map(p => p[1]))));
    const y1 = Math.min(size - 1, Math.ceil(Math.max(...polygon.map(p => p[1]))));
    function inside(x, y) {
      let hit = false;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const a = polygon[i], b = polygon[j];
        if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit;
      }
      return hit;
    }
    // Four samples per axis keep small diagonal stencil strokes crisp.
    const rgb = [color >> 16 & 255, color >> 8 & 255, color & 255];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      let hits = 0;
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++)
        if (inside(x + (sx + 0.5) / 4, y + (sy + 0.5) / 4)) hits++;
      const alpha = hits / 16, at = (y * size + x) * 4;
      for (let k = 0; k < 3; k++) data[at + k] = Math.round(data[at + k] * (1 - alpha) + rgb[k] * alpha);
    }
  }
  let offset = -textWidth / 2;
  for (const { char, width } of specs) {
    for (const polygon of glyphs[char]) paintPolygon(polygon.map(([u, v]) => {
      const right = offset + u * width, up = (v - 0.5) * textHeight;
      return [centerY + up * Math.cos(cant) + right * Math.sin(cant),
        centerZ - right * Math.cos(cant) + up * Math.sin(cant)];
    }), 0xe8e8de);
    offset += width + gap;
  }
  const chips = [
    [[1.705,-0.180],[1.704,-0.214],[1.702,-0.202]],
    [[1.397,-1.104],[1.373,-1.122],[1.385,-1.109]],
    [[0.887,-0.853],[0.874,-0.827],[0.877,-0.847]],
    [[1.129,-1.057],[1.107,-1.063],[1.117,-1.055]],
  ];

  for (const polygon of chips) paintPolygon(polygon, 0x7d8994);
  texture.needsUpdate = true;
  return texture;
}

// One shared 64px PBR set replaces eleven separate dark socket cylinders.
// Bolt heads retain their outline and thickness. Recess shading is in the maps.
function buildFastenerMaterial() {
  function solid(name, usage, color) {
    return proceduralTexture({ schemaVersion: 2, size: 64, usage, name, layers: [{ op: 'solid', color }] });
  }
  const albedo = solid('Jaeger_Fastener_Color', 'albedo', 0x7f8c9b);
  const height = solid('Jaeger_Fastener_Height', 'albedo', 0x808080);
  const mr = solid('Jaeger_Fastener_MetallicRoughness', 'metallicRoughness', 0x0047db);
  const size = albedo.image.width;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const radius = 2 * Math.hypot((x + 0.5) / size - 0.5, (y + 0.5) / size - 0.5);
    const blend = Math.max(0, Math.min(1, (0.47 - radius) / 0.07));
    const smooth = blend * blend * (3 - 2 * blend), at = (y * size + x) * 4;
    for (let k = 0; k < 3; k++) {
      albedo.image.data[at + k] = Math.round([127,140,155][k] * (1 - smooth) + [17,24,32][k] * smooth);
      height.image.data[at + k] = Math.round(128 - 42 * smooth);
    }
    mr.image.data[at + 1] = Math.round(71 + 47 * smooth);
    mr.image.data[at + 2] = Math.round(219 - 56 * smooth);
  }
  albedo.needsUpdate = true; height.needsUpdate = true; mr.needsUpdate = true;
  const material = pbrMaterial({ albedo, normal: normalMapFromHeight(height, { strength: 1.5, name: 'Jaeger_Fastener_RecessNormal' }), metallicRoughness: mr, roughness: 1, metalness: 1 });
  material.name = 'Jaeger_Steel_RecessedFastener';
  return material;
}
