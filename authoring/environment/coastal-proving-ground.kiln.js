// Astra / Kiln. Metres, Y up, Jaeger deploys toward +X. Seed 203.
// All solids, terrain and cradle mechanical tracks are authored here.
const meta = { name: 'Coastal Proving Ground', category: 'environment', role: 'ground' };
const SITE = {
  version: 1, seed: 203, units: 'metres', deck: { min: [-240, -6, -180], max: [240, 0, 180] },
  pilotBounds: { min: [-125, 0, -148], max: [210, 58, 148] },
  dock: [-155, 0, 0], start: [-108, 0, 0], cradleClip: 'CradleRelease',
  cradleEvents: [{ time: 0.8, name: 'activate' }, { time: 3, name: 'brace-release' }, { time: 4.2, name: 'connector-release' }, { time: 6, name: 'exit-clear' }],
  targets: [
    { id: 'Target01', position: [50, 0, -82], center: [50, 43, -82], radius: 13, height: 56 },
    { id: 'Target02', position: [112, 0, 84], center: [112, 51, 84], radius: 13, height: 64 },
    { id: 'Target03', position: [193, 0, -22], center: [193, 48, -22], radius: 13, height: 61 }
  ],
  obstacles: [
    { id: 'hangar', min: [-231, 0, -101], max: [-201, 104, 101] },
    { id: 'gantry-left', min: [-181, 0, -44], max: [-162, 103, -26] },
    { id: 'gantry-right', min: [-181, 0, 26], max: [-162, 103, 44] },
    { id: 'truck', min: [-114, 0, 48], max: [-108, 3, 51] },
    { id: 'stores', min: [-120, 0, 58], max: [-110, 4, 64] }
  ],
  scaleReferences: { truckLength: 5.6, serviceDoorHeight: 2.1, railingHeight: 1.05 },
  motionRoots: ['Joint_Brace_L', 'Joint_Brace_R', 'Joint_ServiceConnector'],
  targetRoots: ['Joint_Target01', 'Joint_Target02', 'Joint_Target03'],
  familyRoots: ['Joint_Deck', 'Joint_Cradle', 'Joint_Hangar', 'Joint_Shore', 'Joint_Truck', 'Joint_Stores', 'Joint_Fixtures', 'Joint_Target01', 'Joint_Target02', 'Joint_Target03'],
  materials: ['site.concrete', 'site.steel', 'site.dark', 'site.silver', 'site.ochre', 'site.white', 'site.glass', 'site.rock', 'site.cyan', 'site.amber'],
  waterY: -7.5
};
async function build() {
  const root = createRoot('CoastalProvingGround'); root.userData.site = SITE;
  const noise = (name, a, b, scale, seed, size = 256) => proceduralTexture({ schemaVersion: 2, size, usage: 'albedo', name, layers: [{ op: 'noise', colorA: a, colorB: b, scale, octaves: 4, seed }] });
  const concreteMap = noise('site.concrete.albedo', 0x637078, 0x839096, 12, 203);
  const rockMap = noise('site.rock.albedo', 0x39464a, 0x727971, 5, 62);
  const paintMap = noise('site.paint.albedo', 0x263e4a, 0x365362, 25, 91);
  const concrete = pbrMaterial({ albedo: concreteMap, normal: normalMapFromHeight(concreteMap, { strength: 1.2 }), roughness: 0.91, metalness: 0 });
  const rock = pbrMaterial({ albedo: rockMap, normal: normalMapFromHeight(rockMap, { strength: 2.5 }), roughness: 0.97, metalness: 0 });
  const steel = pbrMaterial({ albedo: paintMap, normal: normalMapFromHeight(paintMap, { strength: 0.6 }), roughness: 0.52, metalness: 0.65 });
  const flat = (color, roughness, metalness) => { const m = gameMaterial(color); m.roughness = roughness; m.metalness = metalness; return m; };
  const dark = flat(0x18232b, 0.76, 0.45), silver = flat(0x9aaeb5, 0.32, 0.85);
  const ochre = flat(0xd59842, 0.61, 0.3), white = flat(0xbcced0, 0.67, 0.1), glass = flat(0x102b3e, 0.16, 0.6);
  const cyan = flat(0x81dee7, 0.4, 0.1); cyan.emissive.setHex(0x50c4d7); cyan.emissiveIntensity = 2;
  const amber = flat(0xf5ad42, 0.5, 0.1); amber.emissive.setHex(0xff8e28); amber.emissiveIntensity = 1.4;
  [concrete, steel, dark, silver, ochre, white, glass, rock, cyan, amber].forEach((m, i) => { m.name = SITE.materials[i]; });
  const projected = (geo, density = 10) => {
    const g = geo.clone(), p = g.getAttribute('position'), n = g.getAttribute('normal'), uv = [];
    for (let i = 0; i < p.count; i++) {
      const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
      if (ay >= ax && ay >= az) uv.push(p.getX(i) / density, p.getZ(i) / density);
      else if (ax >= az) uv.push(p.getZ(i) / density, p.getY(i) / density);
      else uv.push(p.getX(i) / density, p.getY(i) / density);
    }
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); return g;
  };
  let serial = 0;
  const part = (name, geo, mat, pos, parent, rotation = [0, 0, 0]) => createPart(name + '_' + serial++, geo, mat, { position: pos, rotation, parent });
  const box = (name, dim, pos, mat, parent, rotation) => part(name, projected(boxGeo(...dim)), mat, pos, parent, rotation);
  const cylinder = (name, r, h, pos, mat, parent, rot = [0, 0, 0], n = 12) => part(name, cylinderGeo(r, r, h, n), mat, pos, parent, rot);
  const beam = (name, a, b, width, depth, mat, parent) => {
    const av = new THREE.Vector3(...a), bv = new THREE.Vector3(...b), d = bv.clone().sub(av);
    const o = box(name, [width, d.length(), depth], av.clone().add(bv).multiplyScalar(0.5).toArray(), mat, parent);
    o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return o;
  };
  const bevel = async (name, dim, pos, mat, parent, radius = 0.15) => part(name, projected(await roundedBoxGeo(...dim, radius, { style: 'chamfer', segments: 1 })), mat, pos, parent);
  const deck = createPivot('Deck', [0, 0, 0], root);
  // Modular concrete slab geometry has exact Y=0 top; no displacement at runtime.
  for (let x = -220; x <= 220; x += 40) for (let z = -160; z <= 160; z += 40) {
    box('Slab', [39.9, 5.8, 39.9], [x, -2.9, z], concrete, deck);
  }
  box('ContinuousFoundation', [480, 1.5, 360], [0, -6.2, 0], dark, deck);
  // Inset joints expose a narrow dark recess; painted guides are attached thin solids.
  for (const sign of [-1, 1]) {
    for (let x = -220; x < 240; x += 20) {
      box('Seawall', [19.8, 5, 3], [x, -2.4, sign * 181], concrete, deck);
      box('EdgeStripe', [10, 0.024, 0.5], [x, 0.018, sign * 171], ochre, deck);
    }
    for (let x = -170; x < 200; x += 16) box('LaunchLaneDash', [6, 0.024, 0.3], [x, 0.018, sign * 37], white, deck);
    box('CradleGuide', [82, 0.026, 0.5], [-155, 0.02, sign * 24], ochre, deck);
  }
  const hangar = createPivot('Hangar', [-212, 0, 0], root);
  box('LeftWing', [22, 89, 48], [0, 44.5, -74], steel, hangar);
  box('RightWing', [22, 89, 48], [0, 44.5, 74], steel, hangar);
  box('PortalLintel', [22, 12, 196], [0, 95, 0], steel, hangar);
  box('PortalShadow', [2, 88, 100], [-8, 44, 0], dark, hangar);
  for (let z = -44; z <= 44; z += 11) box('DoorSegment', [0.4, 85, 0.28], [-6.8, 43, z], silver, hangar);
  for (const z of [-49, 49]) { box('PortalUpright', [3, 88, 3], [12, 44, z], ochre, hangar); box('DoorLight', [0.15, 72, 0.4], [13.6, 47, z], cyan, hangar); }
  for (let z = -94; z <= 94; z += 8) if (Math.abs(z) > 50) box('WallRib', [1, 86, 0.65], [11.6, 43, z], silver, hangar);
  // Human-size entrances and balconies supply scale without a crowd.
  for (const sign of [-1, 1]) {
    box('ServiceDoor', [0.18, 2.1, 1.05], [11.15, 1.05, sign * 58], dark, hangar);
    box('DoorHeader', [0.2, 0.12, 1.2], [11.3, 2.2, sign * 58], cyan, hangar);
    box('ServiceAwning', [3, 0.16, 6], [12.2, 3, sign * 58], ochre, hangar);
  }
  const cradle = createPivot('Cradle', [-155, 0, 0], root);
  for (const sign of [-1, 1]) {
    await bevel('PierFoot', [19, 3, 18], [-16, 1.5, sign * 35], concrete, cradle, 0.6);
    // Paired flanges make structural I columns, connected by inclined stiffeners.
    box('TowerWeb', [5, 99, 6], [-16, 52, sign * 35], steel, cradle);
    for (const dx of [-3.2, 3.2]) box('TowerFlange', [1.4, 99, 10], [-16 + dx, 52, sign * 35], steel, cradle);
    for (let y = 7; y < 98; y += 14) {
      box('TowerStiffener', [7.8, 0.8, 10], [-16, y, sign * 35], silver, cradle);
      beam('DiagonalStiffener', [-20, y, sign * 31], [-12, y + 12, sign * 39], 0.65, 0.65, ochre, cradle);
    }
    box('LiftGuide', [0.9, 90, 0.9], [-10.8, 47, sign * 35], ochre, cradle);
    for (const y of [18, 42, 69, 92]) {
      box('AccessCatwalk', [9, 0.35, 10], [-16, y, sign * 35], dark, cradle);
      // Real one-metre rail at maintenance levels.
      for (let z = -4; z <= 4; z += 2) cylinder('RailPost', 0.05, 1.05, [-11.7, y + 0.7, sign * 35 + z], silver, cradle, [0, 0, 0], 6);
      beam('HandRail', [-11.7, y + 1.225, sign * 31], [-11.7, y + 1.225, sign * 39], 0.06, 0.06, silver, cradle);
      box('CatwalkBeacon', [0.3, 0.3, 1.5], [-11.3, y + 0.4, sign * 35], amber, cradle);
    }
    const brace = createPivot('Brace_' + (sign === 1 ? 'R' : 'L'), [0, 0, 0], cradle);
    // Pads contact back/side torso, below shoulder cannon clearance.
    await bevel('BraceCarrier', [9, 8, 13], [-7, 51, sign * 27], steel, brace, 0.7);
    cylinder('HydraulicSleeve', 1.5, 16, [-6, 51, sign * 21], dark, brace, [90, 0, 0]);
    cylinder('HydraulicPiston', 0.85, 13, [-6, 51, sign * 15], silver, brace, [90, 0, 0]);
    await bevel('SupportJaw', [7, 11, 3], [-3.5, 51, sign * 12.7], ochre, brace, 0.45);
    box('RubberPad', [6, 8, 0.5], [-2.8, 51, sign * 11], dark, brace);
    box('JawStatus', [0.12, 4, 0.8], [0.06, 51, sign * 12.7], cyan, brace);
  }
  box('Bridge', [9, 6, 78], [-16, 99, 0], steel, cradle);
  box('BridgeFace', [0.4, 2.4, 42], [-11.3, 99, 0], ochre, cradle);
  for (const z of [-24, 24]) beam('TopKnee', [-16, 83, z * 1.45], [-16, 98, z * 0.8], 2, 3, steel, cradle);
  const connector = createPivot('ServiceConnector', [0, 0, 0], cradle);
  box('RearMast', [4, 66, 7], [-33, 33, 0], steel, cradle);
  cylinder('RearSleeve', 2.6, 22, [-22, 52, 0], dark, connector, [0, 0, 90]);
  cylinder('RearPiston', 1.7, 15, [-14, 52, 0], silver, connector, [0, 0, 90]);
  await bevel('ServicePlug', [3, 8, 9], [-7.5, 52, 0], ochre, connector, 0.5);
  for (const z of [-3, 3]) box('PlugLatch', [3.5, 1.1, 0.75], [-6.3, 54, z], silver, connector);
  // One family of intentionally intact armored calibration targets.
  for (const target of SITE.targets) {
    const t = createPivot(target.id, target.position, root), h = target.center[1];
    await bevel('TargetBase', [22, 3, 22], [0, 1.5, 0], concrete, t, 0.5);
    box('TargetMast', [4, h - 2, 5], [0, (h - 2) / 2 + 2, 0], steel, t);
    for (const z of [-6.5, 6.5]) beam('TargetSupport', [0, 2, z], [0, h - 13, z * 0.22], 1.2, 1.2, ochre, t);
    const disk = cylinder('TargetShield', 13, 4, [0, h, 0], dark, t, [0, 0, 90], 24);
    cylinder('TargetPlate', 11.6, 0.6, [-2.35, h, 0], steel, t, [0, 0, 90], 24);
    const face = cylinder('TargetRing', 7.4, 0.64, [-2.7, h, 0], ochre, t, [0, 0, 90], 24);
    cylinder('TargetInset', 6.3, 0.7, [-3.06, h, 0], dark, t, [0, 0, 90], 24);
    cylinder('TargetCore', 2.1, 0.74, [-3.45, h, 0], cyan, t, [0, 0, 90], 16);
    for (const sign of [-1, 1]) {
      box('TargetTick', [0.1, 1.5, 4], [-3.44, h + sign * 9.5, 0], white, t);
      box('TargetTick', [0.1, 4, 1.5], [-3.44, h, sign * 9.5], white, t);
    }
    t.userData.target = target; disk.userData.role = 'intact-target'; face.userData.role = 'hit-surface';
  }
  // Six metre maintenance truck: chamfered cab, tires, bed, mirrors and lamps.
  const truck = createPivot('Truck', [-111, 0, 49.5], root);
  await bevel('TruckChassis', [5.6, 0.5, 2.3], [0, 0.9, 0], dark, truck, 0.1);
  await bevel('Cab', [2.1, 1.8, 2.2], [1.3, 1.85, 0], ochre, truck, 0.17);
  box('Windshield', [0.06, 0.8, 1.8], [2.39, 2.15, 0], glass, truck);
  for (const s of [-1, 1]) {
    box('CabWindow', [1.35, 0.8, 0.04], [1.45, 2.15, s * 1.12], glass, truck);
    box('DoorHandle', [0.25, 0.05, 0.04], [0.92, 1.65, s * 1.15], silver, truck);
    box('Mirror', [0.12, 0.25, 0.1], [2.15, 2.15, s * 1.38], dark, truck);
    for (const x of [-1.8, 1.8]) { cylinder('Tire', 0.53, 0.35, [x, 0.55, s * 1.08], dark, truck, [90, 0, 0], 12); cylinder('WheelHub', 0.28, 0.36, [x, 0.55, s * 1.13], silver, truck, [90, 0, 0], 10); }
    box('BedWall', [3.1, 0.65, 0.12], [-1.25, 1.5, s * 1.1], steel, truck);
    box('Headlight', [0.1, 0.2, 0.4], [2.42, 1.45, s * 0.7], white, truck);
  }
  box('BedFloor', [3.1, 0.14, 2.1], [-1.25, 1.1, 0], steel, truck);
  box('Tailgate', [0.12, 0.65, 2.1], [-2.8, 1.5, 0], steel, truck);
  box('RoofBeacon', [0.5, 0.12, 0.22], [1.2, 2.82, 0], amber, truck);
  const stores = createPivot('Stores', [-115, 0, 60], root);
  const crateGeo = await roundedBoxGeo(2.2, 1.7, 1.7, 0.08, { style: 'chamfer', segments: 1 });
  for (let i = 0; i < 5; i++) {
    const p = [i % 3 * 2.7 - 2.7, Math.floor(i / 3) * 1.8 + 0.85, Math.floor(i / 3) * 2.1];
    part('EquipmentCase', crateGeo, steel, p, stores);
    for (const x of [-0.75, 0.75]) box('CaseBand', [0.07, 1.72, 1.72], [p[0] + x, p[1], p[2]], silver, stores);
    box('CasePanel', [0.5, 0.4, 0.02], [p[0], p[1], p[2] - 0.87], ochre, stores);
  }
  const fixtures = createPivot('Fixtures', [0, 0, 0], root);
  for (const sign of [-1, 1]) for (let x = -220; x <= 220; x += 40) {
    cylinder('Bollard', 0.35, 1.3, [x, 0.65, sign * 169], dark, fixtures);
    cylinder('BollardCap', 0.46, 0.18, [x, 1.35, sign * 169], ochre, fixtures);
    cylinder('LightPole', 0.18, 8, [x, 4, sign * 175], steel, fixtures);
    box('LampHead', [1.8, 0.3, 0.75], [x, 8.1, sign * 175], silver, fixtures);
    box('LampGlow', [1.4, 0.04, 0.6], [x, 7.93, sign * 175], cyan, fixtures);
    for (let dx = -18; dx <= 18; dx += 6) {
      cylinder('GuardrailPost', 0.065, 1.05, [x + dx, 0.525, sign * 178], silver, fixtures, [0, 0, 0], 6);
      beam('Guardrail', [x + dx - 3, 1.05, sign * 178], [x + dx + 3, 1.05, sign * 178], 0.07, 0.07, silver, fixtures);
    }
  }
  // Coherent west coast: triangulated heightfield with closed underside and skirts.
  // Fixed seeded harmonic ridges, a raised inland shelf, then sea level at eastern edge.
  const shore = createPivot('Shore', [0, 0, 0], root);
  const terrain = (name, x0, x1, z0, z1, nx, nz, height) => {
    const v = [], uv = [], ix = [], count = (nx + 1) * (nz + 1);
    for (let layer = 0; layer < 2; layer++) for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const x = x0 + (x1 - x0) * i / nx, z = z0 + (z1 - z0) * j / nz;
      v.push(x, layer ? -35 : height(x, z), z); uv.push(x / 24, z / 24);
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      ix.push(a, c, b, b, c, d, a + count, b + count, c + count, b + count, d + count, c + count);
    }
    const edge = [];
    for (let i = 0; i <= nx; i++) edge.push(i);
    for (let j = 1; j <= nz; j++) edge.push(j * (nx + 1) + nx);
    for (let i = nx - 1; i >= 0; i--) edge.push(nz * (nx + 1) + i);
    for (let j = nz - 1; j > 0; j--) edge.push(j * (nx + 1));
    for (let i = 0; i < edge.length; i++) { const a = edge[i], b = edge[(i + 1) % edge.length]; ix.push(a, b, a + count, b, b + count, a + count); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(ix); geo.computeVertexNormals();
    part(name, geo, rock, [0, 0, 0], shore);
  };
  terrain('WesternBluff', -750, -238, -590, 590, 48, 72, (x, z) => {
    const inland = Math.max(0, Math.min(1, (-x - 238) / 140));
    const end = Math.max(0, 1 - Math.pow(Math.abs(z) / 590, 8));
    const ridge = 25 + 22 * Math.sin(x * 0.011 + z * 0.006) + 17 * Math.cos(z * 0.021) + 8 * Math.sin(x * 0.034 - z * 0.024);
    return -7 + inland * end * (35 + Math.abs(ridge)) + 2 * inland * Math.sin(x * 0.093 + z * 0.075);
  });
  terrain('NorthShore', -260, 40, 179, 380, 30, 24, (x, z) => {
    const coast = Math.max(0, Math.sin((z - 179) / 201 * Math.PI));
    const taper = Math.max(0, Math.min(1, (40 - x) / 100));
    return -8 + coast * taper * (17 + 9 * Math.sin(x * 0.043) + 8 * Math.cos(z * 0.057));
  });
  // A handful of low-poly rock silhouettes, not hundreds of scattered pebbles.
  for (let i = 0; i < 15; i++) {
    const geo = new THREE.IcosahedronGeometry(1, 1); const p = geo.getAttribute('position');
    for (let k = 0; k < p.count; k++) { const a = p.getX(k), b = p.getY(k), c = p.getZ(k), wobble = 1 + 0.16 * Math.sin(a * 7 + b * 3 + c * 8 + i * 4); p.setXYZ(k, a * wobble, b * wobble, c * wobble); }
    geo.computeVertexNormals();
    const x = -222 + i * 18, z = 198 + 8 * Math.sin(i * 2.6), h = 4 + 4 * (1 + Math.sin(i * 2.2));
    const o = part('CoastalRock', projected(geo, 0.6), rock, [x, -4, z], shore); o.scale.set(h * 1.4, h, h * 1.15); o.rotation.y = i * 1.8;
  }
  return root;
}
function animate(root) {
  const frames = (fn) => { const a = []; for (let i = 0; i <= 120; i++) { const t = i / 10; a.push({ time: t, position: fn(t) }); } return a; };
  const smooth = (t, start, end) => { const x = Math.max(0, Math.min(1, (t - start) / (end - start))); return x * x * (3 - 2 * x); };
  return [createClip('CradleRelease', 12, [
    positionTrack('Joint_Brace_L', frames(t => [0, 0, -20 * smooth(t, 3, 5.5)])),
    positionTrack('Joint_Brace_R', frames(t => [0, 0, 20 * smooth(t, 3, 5.5)])),
    positionTrack('Joint_ServiceConnector', frames(t => [-15 * smooth(t, 4.2, 5.8), 0, 0]))
  ])];
}
