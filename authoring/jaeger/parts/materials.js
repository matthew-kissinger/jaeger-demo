// Portable Kiln PBR finish. Shared maps and small identification/fastener maps
// are baked into the GLB. The fastener recess uses a normal map, not a mesh.
// Paint is clean, lightly used slate enamel; grain belongs in grazing highlights.
// All maps are deterministic. No external image, shader, or raw texture creation.
async function buildMaterials() {
  const size = 256;
  const paintAlbedo = proceduralTexture({
    schemaVersion: 2, size, usage: 'albedo', name: 'Jaeger_Paint_SubtleColor',
    layers: [
      { op: 'solid', color: 0xffffff },
      { op: 'noise', colorA: 0xf5f7fa, colorB: 0xffffff, scale: 7, octaves: 3, seed: 1503, opacity: 0.50 },
      { op: 'noise', colorA: 0xf9fafc, colorB: 0xffffff, scale: 72, octaves: 2, seed: 6419, opacity: 0.35 },
    ],
  });
  const paintHeight = proceduralTexture({
    schemaVersion: 2, size, usage: 'albedo', name: 'Jaeger_Paint_HeightSource',
    layers: [
      { op: 'noise', colorA: 0x797979, colorB: 0x858585, scale: 88, octaves: 2, seed: 6419 },
      { op: 'noise', colorA: 0x7c7c7c, colorB: 0x838383, scale: 29, octaves: 2, seed: 3407, opacity: 0.22 },
    ],
  });
  const paintNormal = normalMapFromHeight(paintHeight, { strength: 0.55, name: 'Jaeger_Paint_MicroNormal' });
  // The linear data channels encode the intended factors directly:
  // green 115..140 (~0.45..0.55 roughness), blue 38..64 (~0.15..0.25 metalness).
  const paintMetallicRoughness = proceduralTexture({
    schemaVersion: 2, size, usage: 'metallicRoughness', name: 'Jaeger_Paint_MetallicRoughness',
    layers: [
      { op: 'noise', colorA: 0x007326, colorB: 0x008c40, scale: 8, octaves: 3, seed: 1503 },
      { op: 'noise', colorA: 0x007928, colorB: 0x008738, scale: 72, octaves: 2, seed: 6419, opacity: 0.25 },
    ],
  });
  const steelHeight = proceduralTexture({
    schemaVersion: 2, size, usage: 'albedo', name: 'Jaeger_Steel_HeightSource',
    layers: [
      { op: 'stripes', colorA: 0x7c7c7c, colorB: 0x858585, count: 64, angleDeg: 0 },
      { op: 'noise', colorA: 0x777777, colorB: 0x898989, scale: 53, octaves: 2, seed: 9741, opacity: 0.18 },
    ],
  });
  const steelNormal = normalMapFromHeight(steelHeight, { strength: 0.22, name: 'Jaeger_Steel_BrushedNormal' });

  function painted(name, color) {
    // Factors stay at one when the packed texture already encodes their values.
    const material = pbrMaterial({ albedo: paintAlbedo, normal: paintNormal, metallicRoughness: paintMetallicRoughness, roughness: 1, metalness: 1 });
    material.name = name;
    material.color.set(color);
    return material;
  }
  function metal(name, color, roughness, metalness) {
    const material = pbrMaterial({ normal: steelNormal, roughness, metalness });
    material.name = name;
    material.color.set(color);
    return material;
  }
  function glow(name, color, roughness, metalness, emissive, emissiveIntensity) {
    const material = pbrMaterial({ roughness, metalness });
    material.name = name;
    material.color.set(color);
    material.emissive.set(emissive);
    material.emissiveIntensity = emissiveIntensity;
    return material;
  }
  const markedArmor = pbrMaterial({ albedo: buildChestPaint(), normal: paintNormal, metallicRoughness: paintMetallicRoughness, roughness: 1, metalness: 1 });
  markedArmor.name = 'Jaeger_Slate_ChestIdentification';
  return {
    markedArmor,
    fastener: buildFastenerMaterial(),
    armor: painted('Jaeger_Slate_PaintedArmor', 0x48566d),
    panel: painted('Jaeger_Slate_LightPanels', 0x64748b),
    edge: metal('Jaeger_Dark_EdgeMetal', 0x2c3543, 0.47, 0.60),
    dark: metal('Jaeger_Black_Mechanisms', 0x111820, 0.46, 0.64),
    steel: metal('Jaeger_Brushed_Steel', 0x7f8c9b, 0.28, 0.86),
    cyan: glow('Jaeger_Cyan_Emitters', 0x64c8c9, 0.28, 0.24, 0x285d61, 0.60),
    bladeMetal: metal('Jaeger_Blue_BladeMetal', 0x3d7b87, 0.25, 0.78),
    yellow: glow('Jaeger_Amber_Visor', 0xf3c443, 0.25, 0.22, 0xbd6e07, 0.65),
    red: glow('Jaeger_Red_ServiceIndicators', 0xc04b2e, 0.48, 0.28, 0x561506, 0.30),
    ivory: painted('Jaeger_Ivory_PaintedDetails', 0xc9d7d8),
    heatBlue: metal('Jaeger_Thruster_HeatBlue', 0x465570, 0.38, 0.80),
    heatWarm: metal('Jaeger_Thruster_HeatWarm', 0x746551, 0.42, 0.80),
  };
}
