// Complete Jaeger, authored entirely in Kiln from reference/approved-mech.png.
// +X forward, +Y up, +Z right. Metres. No fixture, environment or external model.
const meta={name:'Jaeger - slate guardian',category:'character',role:'prop'};
const D={hipY:4.25,thigh:1.85,shin:1.72,ankleY:0.68,torsoY:0.78,shoulderY:1.63,shoulderZ:1.48,upper:1.28,fore:1.42};

function makeHelpers(mat){
  const uvCopies=new Map();
  function surfaceUV(geometry){
    if(geometry.attributes.uv)return geometry;
    if(uvCopies.has(geometry))return uvCopies.get(geometry);
    const p=geometry.attributes.position,n=geometry.attributes.normal,ix=geometry.index;
    const count=ix?ix.count:p.count,positions=[],normals=[],uvs=[];
    // Split only UV-less geometry at triangle boundaries. Per-face box projection
    // gives tiled detail on each orientation while preserving smooth normals.
    for(let t=0;t<count;t+=3){
      const ids=[0,1,2].map(k=>ix?ix.getX(t+k):t+k);
      const a=ids[0],b=ids[1],d=ids[2];
      const ux=p.getX(b)-p.getX(a),uy=p.getY(b)-p.getY(a),uz=p.getZ(b)-p.getZ(a);
      const vx=p.getX(d)-p.getX(a),vy=p.getY(d)-p.getY(a),vz=p.getZ(d)-p.getZ(a);
      const ax=Math.abs(uy*vz-uz*vy),ay=Math.abs(uz*vx-ux*vz),az=Math.abs(ux*vy-uy*vx);
      for(const i of ids){
        const x=p.getX(i),y=p.getY(i),z=p.getZ(i);positions.push(x,y,z);
        if(n)normals.push(n.getX(i),n.getY(i),n.getZ(i));
        if(ax>=ay&&ax>=az)uvs.push(z*2,y*2);
        else if(ay>=az)uvs.push(x*2,z*2);
        else uvs.push(x*2,y*2);
      }
    }
    const mapped=meshGeo({positions,uvs,...(n?{normals}:{})});
    uvCopies.set(geometry,mapped);return mapped;
  }
  function part(name,geo,material,parent,position=[0,0,0],rotation=[0,0,0]){
    const textured=material.map||material.normalMap||material.roughnessMap||material.metalnessMap;
    return createPart(name,textured?surfaceUV(geo):geo,material,{parent,position,rotation});
  }
  async function box(name,size,material,parent,position=[0,0,0],radius=.025,rotation=[0,0,0]){
    return part(name,await roundedBoxGeo(...size,radius,{segments:4,smooth:true}),material,parent,position,rotation);
  }
  function cyl(name,radius,length,material,parent,position=[0,0,0],axis='z'){
    return part(name,cylinderGeo(radius,radius,length,40),material,parent,position,axis==='x'?[0,0,90]:axis==='z'?[90,0,0]:[0,0,0]);
  }
  function ring(name,radius,tube,material,parent,position=[0,0,0],axis='z'){
    return part(name,torusGeo(radius,tube,8,48),material,parent,position,axis==='x'?[0,90,0]:axis==='y'?[90,0,0]:[0,0,0]);
  }
  function shell(stations,power=.68,segments=48){
    return loftProfiles(stations.map(([y,rx,rz,cx=0,cz=0])=>({profile:Array.from({length:segments},(_,i)=>{
      const a=i*2*Math.PI/segments,c=Math.cos(a),s=Math.sin(a);
      return [cx+rx*Math.sign(c)*Math.pow(Math.abs(c),power),cz+rz*Math.sign(s)*Math.pow(Math.abs(s),power)];
    }),frame:{origin:[0,y,0]}})));
  }
  function plate(points,thickness,bevel=.018){
    const cy=points.reduce((s,p)=>s+p[0],0)/points.length,cz=points.reduce((s,p)=>s+p[1],0)/points.length;
    const pos=[],idx=[],n=points.length;
    for(const [x,s] of [[-thickness/2,.94],[-thickness/2+bevel,1],[thickness/2-bevel,1],[thickness/2,.94]])
      for(const [y,z] of points)pos.push(x,cy+(y-cy)*s,cz+(z-cz)*s);
    for(let k=0;k<3;k++)for(let j=0;j<n;j++){
      const a=k*n+j,b=k*n+(j+1)%n,c=(k+1)*n+(j+1)%n,d=(k+1)*n+j;idx.push(a,b,d,b,c,d);
    }
    for(let j=1;j<n-1;j++){idx.push(0,j+1,j);idx.push(3*n,3*n+j,3*n+j+1);}
    let area=0;for(let j=0;j<n;j++)area+=points[j][0]*points[(j+1)%n][1]-points[(j+1)%n][0]*points[j][1];
    if(area<0)for(let j=0;j<idx.length;j+=3){const v=idx[j+1];idx[j+1]=idx[j+2];idx[j+2]=v;}
    // Textured parts receive face-aware UVs in part(), including their sidewalls.
    return meshGeo({positions:pos,indices:idx});
  }
  function bolt(name,parent,pos,axis='x',r=.034){
    const geo=copyGeometry(cylinderGeo(r,r,.015,40));
    const p=geo.attributes.position,n=geo.attributes.normal,uv=geo.attributes.uv;
    const exposedSign=axis==='x'?-1:1;
    for(let i=0;i<p.count;i++)if(n.getY(i)*exposedSign<.99)uv.setXY(i,.02+uv.getX(i)*.05,.02+uv.getY(i)*.05);
    part(name,geo,mat.fastener,parent,pos,axis==='x'?[0,0,90]:axis==='z'?[90,0,0]:[0,0,0]);
  }
  function pivot(name,position,parent){return createPivot(name,position,parent);}
  return {part,box,cyl,ring,shell,plate,bolt,pivot};
}

async function build(){
  const root=createRoot('Jaeger');
  const mat=await buildMaterials();
  const H=makeHelpers(mat),motion=H.pivot('MotionRoot',[0,0,0],root);
  const pelvis=H.pivot('Pelvis',[0,D.hipY,0],motion);
  const torso=H.pivot('Torso',[0,D.torsoY,0],pelvis);
  const c={root,motion,pelvis,torso,mat,H,D};
  await buildBody(c);await buildLegs(c);await buildArms(c);
  root.userData.authoredWith='Kiln';root.userData.units='metres';root.userData.forward='+X';
  root.userData.reference='approved-mech.png';root.userData.assetStage='full-body-development';
  root.userData.rigType='rigid articulated hierarchy';
  root.userData.effectSockets=['MuzzleSocket_L','MuzzleSocket_R','BladeSocket_L','BladeSocket_R','ThrusterSocket_L','ThrusterSocket_R'];
  return root;
}


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


async function buildBody(c){
  const {pelvis,torso,mat,H}=c;const {part,box,cyl,ring,shell,plate,bolt,pivot}=H;
  // Pelvis and abdominal structure are intentionally narrower than the chest.
  part('PelvisCore',shell([[-.24,.34,.55],[-.15,.47,.80],[.21,.46,.83],[.40,.31,.60]],.7),mat.dark,pelvis);
  part('PelvisBelt',shell([[.20,.45,.79],[.26,.48,.85],[.42,.36,.70],[.46,.30,.57]],.63),mat.armor,pelvis);
  for(const s of [-1,1]){
    const n=s===1?'R':'L';
    part('HipArmor_'+n,plate([[.24,.15*s],[.26,.77*s],[-.05,.98*s],[-.44,.69*s],[-.25,.34*s]],.14),mat.armor,pelvis,[.42,0,0]);
    part('HipArmorInset_'+n,plate([[.14,.40*s],[.11,.65*s],[-.17,.76*s],[-.19,.49*s]],.045,.010),mat.panel,pelvis,[.505,0,0]);
    cyl('HipRotor_'+n,.25,.19,mat.steel,pelvis,[0,-.04,s*.72]);
    ring('HipSeal_'+n,.23,.034,mat.dark,pelvis,[0,-.04,s*.83]);
  }
  part('PelvisCentralGuard',plate([[.23,-.24],[.34,0],[.23,.24],[-.35,.19],[-.56,0],[-.35,-.19]],.18),mat.panel,pelvis,[.50,0,0]);
  part('PelvisGuardInset',plate([[.13,-.13],[.18,.1],[-.33,.09],[-.40,0],[-.25,-.10]],.038,.007),mat.armor,pelvis,[.61,0,0]);
  // Abdomen: armored annular vertebrae around the rotary waist.
  cyl('WaistBearing',.43,.65,mat.dark,pelvis,[0,.67,0],'y');
  for(let i=0;i<4;i++){
    part('AbdominalRing'+i,shell([[.43+i*.145,.39,.52],[.47+i*.145,.44,.56],[.54+i*.145,.44,.56],[.57+i*.145,.39,.52]],.73),i%2?mat.edge:mat.dark,pelvis);
    for(const s of [-1,1])await box('AbdominalRib'+i+s,[.09,.10,.18],mat.steel,pelvis,[.411,.505+i*.145,s*.33],.019);
  }
  for(const s of [-1,1]){
    cyl('LumbarPiston'+s,.067,.68,mat.steel,pelvis,[-.27,.69,s*.42],'y');
    cyl('LumbarSleeve'+s,.092,.24,mat.edge,pelvis,[-.27,.64,s*.42],'y');
  }
  // Torso follows the reference's broad clavicles and V-shaped lower chest.
  // Keep the internal frame inside the armor envelope instead of crossing the rear/flank seam.
  part('ThoraxInnerFrame',shell([[.19,.20,.36],[.40,.24,.59],[.94,.32,.82],[1.46,.29,.86],[1.65,.17,.57]],.64),mat.dark,torso);
  part('ThoraxRearShell',shell([[.38,.43,.71,-.12],[.67,.50,1.01,-.10],[1.40,.43,1.10,-.08],[1.73,.26,.77,-.09]],.65),mat.armor,torso);
  part('LowerThoraxArmor',shell([[.18,.25,.48,.09],[.28,.34,.65,.09],[.49,.43,.86,.09],[.78,.47,.98,.075],[1.01,.44,1.03,.035]],.64),mat.armor,torso);
  for(const s of [-1,1]){
    const n=s===1?'R':'L';
    const chest=plate([[1.77,.014*s],[1.69,.93*s],[1.34,1.21*s],[.93,1.09*s],[.54,.30*s],[.79,.055*s]],.18,.034);
    const p=chest.attributes.position;
    for(let i=0;i<p.count;i++)p.setX(i,p.getX(i)+.085*Math.sin((p.getY(i)-.40)*2.0)-.12*Math.abs(p.getZ(i)));
    chest.computeVertexNormals();
    part('ChestArmor_'+n,s===-1?mapChestPaint(chest):chest,s===-1?mat.markedArmor:mat.armor,torso,[.55,0,0]);
    part('ClavicleTrim_'+n,plate([[1.76,.14*s],[1.72,.78*s],[1.56,.95*s],[1.55,.78*s],[1.62,.17*s]],.045,.009),mat.panel,torso,[.612,0,0]);
    // Deep red vent recesses follow the downward V of the breastplate.
    const vent=pivot('ChestVent_'+n,[.575,.90,s*.73],torso);vent.rotation.x=s*.39;
    await box('VentHousing_'+n,[.12,.19,.72],mat.edge,vent,[0,0,0],.035);
    await box('VentVoid_'+n,[.022,.116,.60],mat.dark,vent,[.072,0,0],.010);
    for(let i=0;i<7;i++)await box('VentSlat_'+n+i,[.032,.092,.031],mat.red,vent,[.092,0,-.254+i*.084],.010,[0,0,-8]);
    for(const yz of [[1.48,.75],[1.06,1.01]])bolt('ChestFastener_'+n+yz[0],torso,[.535,yz[0],s*yz[1]],'x',.024);
    part('LateralThorax_'+n,shell([[.46,.29,.17],[.58,.36,.22],[1.14,.33,.26],[1.33,.20,.19]],.6),mat.edge,torso,[-.03,0,s*1.0]);
    cyl('ShoulderSocket_'+n,.31,.40,mat.dark,torso,[0,1.63,s*1.25]);
    ring('ShoulderSocketSeal_'+n,.29,.025,mat.steel,torso,[0,1.63,s*1.44]);
  }
  // Concentric reactor with a real recessed center, outer ring and separate rim.
  cyl('ReactorBlackHousing',.405,.17,mat.dark,torso,[.69,.71,0],'x');
  cyl('ReactorBezel',.365,.09,mat.ivory,torso,[.798,.71,0],'x');
  cyl('ReactorInnerRecess',.245,.096,mat.edge,torso,[.82,.71,0],'x');
  ring('ReactorOuterRing',.340,.030,mat.steel,torso,[.858,.71,0],'x');
  ring('ReactorInnerRing',.229,.026,mat.ivory,torso,[.877,.71,0],'x');
  cyl('ReactorGlass',.190,.025,mat.cyan,torso,[.883,.71,0],'x');
  cyl('ReactorCore',.108,.031,mat.ivory,torso,[.900,.71,0],'x');
  for(let i=0;i<3;i++){
    const a=i*2*Math.PI/3;
    bolt('ReactorBolt'+i,torso,[.864,.71+Math.cos(a)*.296,Math.sin(a)*.296],'x',.027);
  }
  // Compact protected neck and helmet, with swept brow and a gold face window.
  cyl('NeckBearing',.24,.35,mat.steel,torso,[0,1.90,0],'y');
  ring('NeckSeal',.25,.041,mat.dark,torso,[0,1.86,0],'y');
  for(const s of [-1,1])part('Collar_'+s,plate([[1.57,.32*s],[1.80,.40*s],[1.81,.61*s],[1.56,.67*s]],.29),mat.panel,torso,[.02,0,0]);
  const head=pivot('Head',[0,1.94,0],torso);
  part('HelmetShell',shell([[.02,.20,.24],[.14,.30,.31],[.42,.36,.38],[.65,.29,.34],[.80,.16,.21],[.845,.035,.08]],.76),mat.armor,head,[-.005,0,0]);
  part('HelmetFaceRecess',plate([[.60,-.25],[.68,0],[.60,.25],[.23,.19],[.075,0],[.23,-.19]],.075,.014),mat.dark,head,[.325,0,0]);
  part('GoldenVisor',plate([[.55,-.215],[.60,0],[.55,.215],[.25,.151],[.15,0],[.25,-.151]],.045,.010),mat.yellow,head,[.371,0,0]);
  part('HelmetBrow',plate([[.70,-.29],[.76,0],[.70,.29],[.52,.21],[.435,0],[.52,-.21]],.10,.020),mat.panel,head,[.410,0,0]);
  part('HelmetBrowSpine',plate([[.72,-.028],[.795,0],[.72,.028],[.48,0]],.031,.006),mat.armor,head,[.470,0,0]);
  part('HelmetJawGuard',plate([[.235,-.14],[.17,0],[.235,.14],[.05,.11],[-.025,0],[.05,-.11]],.083,.018),mat.panel,head,[.38,0,0]);
  for(const s of [-1,1]){
    cyl('HelmetEar_'+s,.13,.09,mat.edge,head,[-.05,.40,s*.36]);
    cyl('HelmetEarCover_'+s,.091,.096,mat.panel,head,[-.05,.40,s*.37]);
    part('HelmetCheek_'+s,plate([[.41,.22*s],[.34,.32*s],[.13,.24*s],[.03,.08*s],[.18,.15*s]],.087,.012),mat.armor,head,[.29,0,0]);
  }
  // Backpack, vented fins and two articulated booster nozzles.
  const backpack=pivot('Backpack',[-.60,1.0,0],torso);
  await box('BackpackFrame',[.42,1.32,1.26],mat.edge,backpack,[-.16,0,0],.11);
  await box('BackpackCentralArmor',[.11,1.18,.45],mat.armor,backpack,[-.42,.10,0],.05);
  for(const s of [-1,1]){
    const n=s===1?'R':'L';
    await box('BackpackSideArmor_'+n,[.22,1.02,.40],mat.armor,backpack,[-.32,.02,s*.48],.065);
    for(let i=0;i<5;i++)await box('BackVent_'+n+i,[.030,.038,.25],mat.dark,backpack,[-.448,.31-i*.10,s*.48],.009);
    const fin=pivot('DorsalFin_'+n,[.02,.70,s*.48],backpack);fin.rotation.z=.10;
    part('DorsalFinArmor_'+n,plate([[0,-.16],[1.13,-.105],[1.27,.03],[1.15,.13],[0,.18]],.12,.023),mat.armor,fin);
    for(let i=0;i<6;i++)await box('DorsalFinVent_'+n+i,[.128,.06,.065],mat.dark,fin,[0,.20+i*.13,0],.014);
    const thruster=pivot('Thruster_'+n,[-.38,-.40,s*.43],backpack);thruster.rotation.z=-.25;
    part('ThrusterHousing_'+n,cylinderGeo(.23,.30,.58,48),mat.armor,thruster,[0,0,0],[-0,0,90]);
    // Adjacent bands replace the shield surface; no coplanar overlay sheets.
    cyl('ThrusterHeatShield_'+n,.277,.12,mat.edge,thruster,[-.26,0,0],'x');
    cyl('ThrusterHeatBlue_'+n,.277,.05,mat.heatBlue,thruster,[-.345,0,0],'x');
    cyl('ThrusterHeatWarm_'+n,.277,.05,mat.heatWarm,thruster,[-.395,0,0],'x');
    ring('ThrusterRim_'+n,.249,.030,mat.steel,thruster,[-.431,0,0],'x');
    cyl('ThrusterNozzleDark_'+n,.221,.018,mat.dark,thruster,[-.435,0,0],'x');
    ring('ThrusterInnerRing_'+n,.147,.020,mat.bladeMetal,thruster,[-.448,0,0],'x');
    cyl('ThrusterCore_'+n,.104,.013,mat.dark,thruster,[-.455,0,0],'x');
    pivot('ThrusterSocket_'+n,[-.49,0,0],thruster);
  }
}


async function buildLegs(c){
  const {pelvis,mat,H,D}=c;const {part,box,cyl,ring,shell,plate,bolt,pivot}=H;
  for(const s of [-1,1]){
    const n=s===1?'R':'L';
    const hip=pivot('Hip_'+n,[0,0,s*.69],pelvis);
    cyl('HipBearing_'+n,.26,.61,mat.dark,hip,[0,0,0]);
    cyl('HipBearingInset_'+n,.194,.64,mat.steel,hip,[0,0,0]);
    await box('FemurCore_'+n,[.37,1.41,.38],mat.dark,hip,[0,-.90,0],.07);
    part('ThighArmor_'+n,shell([[-1.53,.24,.29],[-1.41,.33,.38],[-.64,.39,.43],[-.27,.32,.39],[-.19,.21,.26]],.65),mat.armor,hip);
    // Front face clears the curved armor bulge; inset retains its separation.
    part('ThighFrontPanel_'+n,plate([[-.27,-.21],[-.26,.20],[-.65,.29],[-1.34,.19],[-1.46,0],[-1.30,-.19],[-.65,-.29]],.07,.020),mat.panel,hip,[.375,0,0]);
    part('ThighInset_'+n,plate([[-.37,-.095],[-.40,.15],[-.65,.18],[-.76,.02],[-.67,-.12]],.036,.008),mat.armor,hip,[.434,0,0]);
    cyl('ThighOuterDisk_'+n,.106,.052,mat.edge,hip,[.02,-.43,s*.42]);
    cyl('ThighOuterDiskInset_'+n,.075,.059,mat.steel,hip,[.02,-.43,s*.43]);
    for(const z of [-.25,.25]){
      cyl('HamstringRod_'+n+z,.049,1.01,mat.steel,hip,[-.19,-1.02,z],'y');
      cyl('HamstringSleeve_'+n+z,.073,.26,mat.edge,hip,[-.19,-.83,z],'y');
    }
    const knee=pivot('Knee_'+n,[0,-D.thigh,0],hip);
    cyl('KneeAxle_'+n,.237,.67,mat.dark,knee,[0,0,0]);
    for(const z of [-.345,.345]){
      cyl('KneeCover_'+n+z,.201,.056,mat.steel,knee,[0,0,z]);
      cyl('KneeInset_'+n+z,.145,.063,mat.edge,knee,[0,0,z]);
      ring('KneeSeal_'+n+z,.173,.014,mat.dark,knee,[0,0,z+(z>0?.035:-.035)]);
    }
    part('Patella_'+n,plate([[.13,-.19],[.20,0],[.13,.19],[-.21,.17],[-.38,0],[-.21,-.17]],.22,.037),mat.armor,knee,[.26,0,0]);
    part('KneeHighlight_'+n,plate([[.10,-.095],[.14,0],[.10,.095],[-.19,0]],.035,.008),mat.panel,knee,[.386,0,0]);
    await box('TibiaCore_'+n,[.28,1.42,.28],mat.dark,knee,[-.04,-.91,0],.064);
    part('ShinArmor_'+n,shell([[-1.56,.17,.20,.04],[-1.40,.23,.26,.05],[-.64,.33,.32,.07],[-.30,.34,.32,.035],[-.22,.20,.23]],.68),mat.armor,knee);
    part('ShinFrontPlate_'+n,plate([[-.27,-.21],[-.33,.22],[-.64,.25],[-1.46,.12],[-1.57,0],[-1.38,-.11],[-.64,-.25]],.105,.027),mat.panel,knee,[.364,0,0]);
    part('ShinCenterRidge_'+n,plate([[-.31,-.025],[-.36,.035],[-1.48,.025],[-1.52,-.017]],.036,.007),mat.armor,knee,[.444,0,0]);
    for(const z of [-.20,.20]){
      cyl('CalfPiston_'+n+z,.045,1.12,mat.steel,knee,[-.245,-.94,z],'y');
      cyl('CalfPistonSleeve_'+n+z,.068,.46,mat.edge,knee,[-.245,-.61,z],'y');
    }
    const ankle=pivot('Ankle_'+n,[0,-D.shin,0],knee);
    cyl('AnkleAxle_'+n,.204,.56,mat.dark,ankle,[0,0,0]);
    for(const z of [-.30,.30]){
      cyl('AnkleBearing_'+n+z,.169,.055,mat.steel,ankle,[0,0,z]);
      cyl('AnkleBearingInset_'+n+z,.111,.062,mat.edge,ankle,[0,0,z]);
    }
    // Sole is exactly Y=-.68 in ankle space; all forward locomotion is +X.
    await box('HeelSole_'+n,[.56,.13,.61],mat.dark,ankle,[-.19,-.615,0],.035);
    await box('HeelArmor_'+n,[.55,.32,.62],mat.armor,ankle,[-.21,-.38,0],.074);
    await box('FootBridge_'+n,[.69,.20,.59],mat.edge,ankle,[.27,-.48,0],.045);
    const boot=shell([[-.56,.57,.31,.21],[-.44,.55,.32,.19],[-.25,.40,.29,.05],[-.12,.23,.21,-.05]],.61);
    part('FootInstep_'+n,boot,mat.armor,ankle);
    part('InstepPlate_'+n,plate([[-.18,-.14],[-.16,.14],[-.45,.245],[-.52,.17],[-.49,-.17]],.075,.016),mat.panel,ankle,[.54,0,0],[0,0,18]);
    const toe=pivot('Toe_'+n,[.65,-.40,0],ankle);
    for(let i=0;i<3;i++){
      const z=(i-1)*.209;
      await box('ToeSole_'+n+i,[.40,.105,.192],mat.dark,toe,[.015,-.2275,z],.022);
      await box('ToeArmor_'+n+i,[.41,.23,.19],mat.armor,toe,[.015,-.082,z],.037);
      await box('ToeTip_'+n+i,[.03,.14,.14],mat.panel,toe,[.224,-.10,z],.009);
    }
    pivot('FootContact_'+n,[.16,-.68,0],ankle);
    pivot('HeelContact_'+n,[-.43,-.68,0],ankle);
    pivot('ToeContact_'+n,[.90,-.68,0],ankle);
  }
}


// Bilateral mechanical arms and backpack-mounted cannons. +X forward, +Z right.
// Built with positive transforms; asymmetric profiles are mirrored in their vertices.
async function buildArms(c) {
  const { torso, mat, H, D } = c;
  const { part, box, cyl, ring, shell, plate, bolt, pivot } = H;
  const joints = {};
  for (const [side, sign] of [['R', 1], ['L', -1]]) {
    const n = (name) => name + '_' + side;
    const p = (v) => [v[0], v[1], v[2] * sign];
    const prof = (points) => points.map(([y, z]) => [y, z * sign]);
    const bp = (name, pos, parent) => {
      const node = pivot(n(name), p(pos), parent);
      joints[n(name)] = node;
      return node;
    };
    const b = (name, size, material, parent, pos, radius = 0.025) =>
      box(n(name), size, material, parent, p(pos), radius);
    const cy = (name, radius, length, material, parent, pos, axis = 'z') =>
      cyl(n(name), radius, length, material, parent, p(pos), axis);
    const ri = (name, radius, tube, material, parent, pos, axis = 'z') =>
      ring(n(name), radius, tube, material, parent, p(pos), axis);
    const pl = (name, points, depth, material, parent, pos = [0, 0, 0], bevel = 0.018) =>
      part(n(name), plate(prof(points), depth, bevel), material, parent, p(pos));

    // The cap has a separate torso pivot, so the arm can lift underneath it.
    cy('ShoulderAxle', 0.235, 0.63, mat.dark, torso, [0, D.shoulderY, D.shoulderZ - 0.20]);
    const shoulder = bp('ShoulderSwing', [0, D.shoulderY, D.shoulderZ], torso);
    shoulder.rotation.x = -7 * Math.PI / 180 * sign;
    shoulder.rotation.z = 3 * Math.PI / 180;
    const twist = bp('UpperArmTwist', [0, 0, 0], shoulder);
    cy('ShoulderBearing', 0.315, 0.43, mat.dark, twist, [0, 0, 0]);
    cy('ShoulderBearingFace', 0.253, 0.448, mat.steel, twist, [0, 0, 0]);
    cy('ShoulderHub', 0.192, 0.468, mat.edge, twist, [0, 0, 0]);
    ri('ShoulderSeal', 0.23, 0.017, mat.dark, twist, [0, 0, 0.247]);
    await b('UpperArmSpine', [0.31, 0.98, 0.30], mat.dark, twist, [0, -0.66, 0], 0.07);
    part(n('UpperArmCastArmor'), shell([
      [-0.99, 0.22, 0.24], [-0.88, 0.275, 0.29],
      [-0.40, 0.29, 0.30], [-0.27, 0.22, 0.23],
    ], 0.70), mat.armor, twist);
    pl('BicepFace', [[-0.36, -0.16], [-0.85, -0.13], [-0.95, 0.06], [-0.78, 0.18], [-0.40, 0.18]],
      0.055, mat.panel, twist, [0.27, 0, 0]);
    await b('BicepInset', [0.018, 0.32, 0.025], mat.edge, twist, [0.305, -0.62, 0.075], 0.004);
    for (const [i, z] of [-0.2, 0.2].entries()) {
      cy('UpperLink' + i, 0.044, 0.76, mat.steel, twist, [-0.16, -0.74, z], 'y');
      cy('UpperLinkCollar' + i, 0.062, 0.19, mat.edge, twist, [-0.16, -0.54, z], 'y');
    }
    await b('ElbowUpperYoke', [0.34, 0.12, 0.34], mat.edge, twist, [0, -1.025, 0], 0.03);

    const cap = bp('ShoulderCap', [0, D.shoulderY + 0.06, D.shoulderZ], torso);
    // Cant the armor outward: the lower outer edge protects the bearing while the
    // raised inner edge clears the torso. This avoids the horizontal saucer profile.
    const capArmor = bp('PauldronArmor', [0, 0.035, 0], cap);
    capArmor.rotation.x = 15 * Math.PI / 180 * sign;
    part(n('PauldronUndercut'), shell([
      [-0.19, 0.37, 0.43], [-0.15, 0.51, 0.58], [-0.085, 0.60, 0.66], [-0.055, 0.60, 0.65],
    ], 0.77), mat.dark, capArmor);
    part(n('PauldronRim'), shell([
      [-0.09, 0.59, 0.655], [-0.062, 0.635, 0.691], [-0.005, 0.65, 0.70], [0.03, 0.63, 0.68],
    ], 0.79), mat.edge, capArmor);
    part(n('PauldronOuterShell'), shell([
      [0.002, 0.637, 0.688], [0.046, 0.647, 0.696], [0.15, 0.595, 0.636],
      [0.245, 0.484, 0.535], [0.31, 0.35, 0.40], [0.322, 0.20, 0.26],
    ], 0.82), mat.armor, capArmor);
    part(n('PauldronCrownBorder'), shell([
      [0.29, 0.315, 0.359], [0.325, 0.305, 0.348], [0.339, 0.276, 0.32],
    ], 1), mat.edge, capArmor);
    part(n('PauldronCrownInset'), shell([
      [0.325, 0.278, 0.321], [0.345, 0.259, 0.298], [0.359, 0.195, 0.224], [0.364, 0.09, 0.105],
    ], 1), mat.panel, capArmor);
    for (const [i, z] of [-0.41, 0.41].entries())
      bolt(n('PauldronFastener' + i), capArmor, p([0.557, 0.09, z]), 'x', 0.036);
    await b('PauldronFrontTrim', [0.035, 0.022, 0.37], mat.steel, capArmor, [0.648, 0.005, 0], 0.009);

    const elbow = bp('Elbow', [0, -D.upper, 0], twist);
    elbow.rotation.z = 8 * Math.PI / 180;
    cy('ElbowAxle', 0.205, 0.48, mat.dark, elbow, [0, 0, 0]);
    for (const [i, z] of [-0.25, 0.25].entries()) {
      cy('ElbowDisk' + i, 0.173, 0.047, mat.steel, elbow, [0, 0, z]);
      cy('ElbowCenter' + i, 0.12, 0.052, mat.edge, elbow, [0, 0, z]);
      ri('ElbowGroove' + i, 0.145, 0.012, mat.dark, elbow, [0, 0, z + Math.sign(z) * 0.03]);
    }
    const fore = bp('ForearmTwist', [0, 0, 0], elbow);
    await b('ForearmChassis', [0.29, 1.17, 0.31], mat.dark, fore, [0, -0.77, 0], 0.06);
    part(n('ForearmMainArmor'), shell([
      [-1.35, 0.19, 0.21], [-1.25, 0.25, 0.27], [-0.73, 0.33, 0.36],
      [-0.34, 0.32, 0.31], [-0.17, 0.22, 0.23],
    ], 0.61), mat.armor, fore);
    pl('ForearmPanelRecess', [[-0.216, -0.146], [-0.61, -0.237], [-1.208, -0.146], [-1.317, 0.109], [-0.91, 0.267], [-0.37, 0.237]],
      0.050, mat.edge, fore, [0.301, 0, 0], 0.010);
    pl('ForearmFrontPlate', [[-0.23, -0.13], [-0.61, -0.22], [-1.2, -0.13], [-1.30, 0.10], [-0.91, 0.25], [-0.38, 0.22]],
      0.036, mat.panel, fore, [0.325, 0, 0], 0.009);
    pl('ForearmSpine', [[-0.17, -0.036], [-1.18, -0.035], [-1.27, 0.025], [-0.65, 0.061]],
      0.032, mat.armor, fore, [0.341, 0, 0], 0.007);
    for (const [i, y] of [-0.53, -0.66, -0.79].entries())
      await b('ForearmVent' + i, [0.025, 0.036, 0.13], mat.dark, fore, [0.344, y, -0.165], 0.006);
    cy('BladeMountBearing', 0.151, 0.074, mat.edge, fore, [0, -0.60, 0.375]);
    cy('BladeMountTrim', 0.122, 0.080, mat.steel, fore, [0, -0.60, 0.382]);
    cy('BladeMountInset', 0.089, 0.085, mat.dark, fore, [0, -0.60, 0.389]);
    cy('BladeMountCyan', 0.068, 0.089, mat.cyan, fore, [0, -0.60, 0.392]);
    for (const [i, y] of [-0.4, -1.0].entries())
      await b('BladeRailSupport' + i, [0.15, 0.22, 0.23], mat.edge, fore, [0.015, y, 0.38], 0.032);
    await b('BladeRail', [0.16, 0.94, 0.13], mat.armor, fore, [0.025, -0.84, 0.51], 0.022);
    const blade = bp('BladeSocket', [0.055, -0.36, 0.53], fore);
    pl('BladeBody', [[0, -0.055], [-0.35, -0.083], [-2.20, -0.055], [-2.42, 0.02], [-0.22, 0.125], [0.07, 0.09]],
      0.065, mat.bladeMetal, blade, [0, 0, 0], 0.009);
    pl('BladeEdge', [[-0.22, 0.125], [-2.42, 0.02], [-2.14, 0.065], [-0.2, 0.159]],
      0.029, mat.cyan, blade, [0.001, 0, 0], 0.005);
    bp('BladeTipSocket', [0, -2.42, 0.02], blade);

    const wrist = bp('Wrist', [0, -D.fore, 0], fore);
    cy('WristGimbal', 0.155, 0.21, mat.steel, wrist, [0, -0.045, 0], 'y');
    ri('WristCuff', 0.159, 0.024, mat.edge, wrist, [0, -0.065, 0], 'y');
    await b('HandPalm', [0.28, 0.40, 0.37], mat.edge, wrist, [0, -0.32, 0], 0.06);
    await b('HandBackPlate', [0.045, 0.30, 0.31], mat.armor, wrist, [-0.148, -0.31, 0], 0.018);
    bp('PalmSocket', [0.145, -0.32, 0], wrist);
    const fingerLengths = [0.21, 0.24, 0.225, 0.18];
    for (let i = 0; i < 4; i++) {
      const z = 0.14 - i * 0.096;
      const finger = bp('Finger' + i, [0, -0.50, z], wrist);
      let parent = finger;
      for (let j = 0; j < 3; j++) {
        const len = fingerLengths[i] * (j === 0 ? 1 : j === 1 ? 0.78 : 0.64);
        cy('FingerPin' + i + j, 0.036, 0.076, mat.steel, parent, [0, 0, 0]);
        await b('FingerSegment' + i + j, [0.084, len - 0.017, 0.072], mat.steel, parent, [0, -len / 2, 0], 0.017);
        await b('FingerDorsal' + i + j, [0.024, len - 0.045, 0.063], mat.armor, parent, [-0.05, -len / 2, 0], 0.01);
        const next = bp('Finger' + i + 'Link' + j, [0, -len, 0], parent);
        next.rotation.z = 0.20;
        parent = next;
      }
      finger.rotation.z = 0.12;
    }
    // The opposed thumb starts on the palm's forward/lateral corner, then hangs
    // beside the index finger. Gentle outward splay keeps a visible palm gap.
    const thumb = bp('Thumb', [0.07, -0.29, 0.225], wrist);
    thumb.rotation.x = -0.10 * sign;
    thumb.rotation.z = 0.16;
    cy('ThumbPin', 0.065, 0.10, mat.steel, thumb, [0, 0, 0]);
    await b('ThumbBaseArmor', [0.125, 0.22, 0.11], mat.armor, thumb, [0, -0.11, 0], 0.024);
    const thumbTip = bp('ThumbTip', [0, -0.22, 0], thumb);
    thumbTip.rotation.z = 0.14;
    cy('ThumbDistalPin', 0.045, 0.107, mat.steel, thumbTip, [0, 0, 0]);
    await b('ThumbDistal', [0.10, 0.19, 0.095], mat.steel, thumbTip, [0, -0.095, 0], 0.023);

    // Weapons mount behind the shoulder and above its armor, independent of the arm rig.
    const backpack = bp('CannonBackpackMount', [-0.91, 1.49, 0.89], torso);
    await b('CannonBackpackSupport', [0.43, 0.24, 0.33], mat.dark, backpack, [0.14, 0.04, 0.05], 0.035);
    await b('CannonPylon', [0.30, 0.86, 0.28], mat.edge, backpack, [0, 0.43, 0.20], 0.048);
    await b('PylonFrontPlate', [0.036, 0.55, 0.19], mat.armor, backpack, [0.168, 0.45, 0.20], 0.012);
    cy('LowerPylonPivot', 0.13, 0.35, mat.steel, backpack, [0, 0.13, 0.20]);
    const yaw = bp('CannonYaw', [0, 0.96, 0.20], backpack);
    const pitch = bp('CannonPitch', [0, 0, 0], yaw);
    cy('CannonTrunnion', 0.23, 0.49, mat.dark, pitch, [0, 0, 0]);
    for (const [i, z] of [-0.25, 0.25].entries()) {
      cy('CannonHingeFace' + i, 0.18, 0.045, mat.steel, pitch, [0, 0, z]);
      cy('CannonHingeInset' + i, 0.127, 0.056, mat.armor, pitch, [0, 0, z]);
      ri('CannonHingeSeal' + i, 0.147, 0.012, mat.dark, pitch, [0, 0, z + Math.sign(z) * 0.026]);
    }
    await b('CannonRecoilCradle', [0.75, 0.14, 0.34], mat.edge, pitch, [0.31, 0.14, 0], 0.035);
    const slide = bp('CannonSlide', [0, 0, 0], pitch);
    await b('CannonBody', [1.52, 0.46, 0.48], mat.armor, slide, [0.49, 0.39, 0], 0.065);
    await b('CannonTopInset', [0.98, 0.025, 0.34], mat.panel, slide, [0.38, 0.629, 0], 0.009);
    await b('CannonRearCap', [0.10, 0.34, 0.36], mat.edge, slide, [-0.32, 0.39, 0], 0.034);
    // A rim around a recessed aperture reads correctly from oblique views.
    for (const [i, y] of [0.195, 0.585].entries())
      await b('MuzzleHorizontal' + i, [0.21, 0.08, 0.48], mat.steel, slide, [1.28, y, 0], 0.024);
    for (const [i, z] of [-0.2, 0.2].entries())
      await b('MuzzleVertical' + i, [0.21, 0.33, 0.08], mat.steel, slide, [1.28, 0.39, z], 0.024);
    await b('MuzzleRecess', [0.012, 0.28, 0.30], mat.dark, slide, [1.258, 0.39, 0], 0.004);
    for (const [i, z] of [-0.247, 0.247].entries()) {
      await b('CannonSideInset' + i, [0.90, 0.18, 0.022], mat.edge, slide, [0.43, 0.39, z], 0.009);
      await b('CannonSideArmor' + i, [0.75, 0.125, 0.025], mat.armor, slide, [0.37, 0.40, z * 1.05], 0.01);
      await b('CannonStatus' + i, [0.18, 0.038, 0.014], mat.cyan, slide, [0.84, 0.45, z * 1.06], 0.005);
    }
    for (const [i, z] of [-0.18, 0.18].entries()) {
      cy('RecoilRod' + i, 0.027, 0.70, mat.steel, pitch, [0.50, 0.13, z], 'x');
      cy('RecoilCollar' + i, 0.043, 0.16, mat.dark, pitch, [0.12, 0.13, z], 'x');
    }
    bp('MuzzleSocket', [1.41, 0.39, 0], slide);
  }
  return joints;
}

// Complete mechanical Jaeger motion. Native Kiln animation helpers, metres, degrees.
// The leg solver keeps world-space ankle targets fixed during planted phases.
// The host's current export envelope permits at most 256 tracks per execution.
// Assemble with 'ground-combat' then 'boost-weapons'; package their native GLB clips
// onto the same node graph. 'all' is the full authoring definition, 359 tracks.
const JAEGER_MOTION_BATCH = 'pilot';
function animate(root) {
  const FPS = 30, DEG = 180 / Math.PI, RAD = Math.PI / 180;
  const UPPER = 1.85, LOWER = 1.72, ANKLE_Y = 0.68, PELVIS_Y = 4.25;
  const SIDES = ['R', 'L'];
  const zero = () => [0, 0, 0];
  const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
  const ease = t => { const u = clamp(t); return u * u * (3 - 2 * u); };
  const mix = (a, b, t) => a + (b - a) * t;
  const blend = (a, b, t) => a.map((v, i) => mix(v, b[i], t));
  const pulse = (t, start, peak, end) => t <= peak ? ease((t - start) / (peak - start)) : 1 - ease((t - peak) / (end - peak));
  const qEuler = a => new THREE.Quaternion().setFromEuler(new THREE.Euler(a[0] * RAD, a[1] * RAD, a[2] * RAD, 'XYZ'));
  const eulerQ = q => { const e = new THREE.Euler().setFromQuaternion(q, 'XYZ'); return [e.x * DEG, e.y * DEG, e.z * DEG]; };
  const yawPoint = (p, angle) => { const c = Math.cos(angle * RAD), s = Math.sin(angle * RAD); return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]; };
  const sides = side => side === 'R' ? 1 : -1;
  const rotationNames = ['MotionRoot', 'Pelvis', 'Torso', 'Head'];
  for (const side of SIDES) {
    for (const name of ['ShoulderSwing', 'UpperArmTwist', 'Elbow', 'ForearmTwist', 'Wrist', 'ShoulderCap', 'Hip', 'Knee', 'Ankle', 'Toe', 'CannonYaw', 'CannonPitch']) rotationNames.push(name + '_' + side);
    for (let i = 0; i < 4; i++) rotationNames.push('Finger' + i + '_' + side);
  }
  const positionNames = ['MotionRoot', 'Pelvis', 'CannonSlide_R', 'CannonSlide_L'];
  const contract = {
    schemaVersion: 1, authoredWith: 'Kiln', forward: '+X', up: '+Y', right: '+Z', bakedFps: FPS,
    rig: { pelvisHeight: PELVIS_Y, upperLegLength: UPPER, lowerLegLength: LOWER, ankleHeight: ANKLE_Y, hipHalfWidth: 0.69, standingShoulderR: [-7, 0, 3], standingShoulderL: [7, 0, 3], standingElbow: [0, 0, 8] },
    locomotion: 'Root-motion clips animate Joint_MotionRoot. Accumulate its end transform before replaying or changing origin; do not add locomotion a second time.',
    transition: 'Cross-fade matching pose states over 0.12-0.25 seconds. Carry root world transform between clips; ForwardFlight ends translated +X4.0, so place Landing at that horizontal endpoint. Grounded loop Walk advances +X3.2 per cycle.',
    footContact: 'Grounded foot evidence uses Joint_Ankle_R/L at worldY0.68; sole height must also be verified from exported geometry. Joint_Toe_R/L neutral except airborne flight.',
    clips: {},
  };
  function neutral() {
    const rot = {}, pos = { MotionRoot: zero(), Pelvis: [0, PELVIS_Y, 0], CannonSlide_R: zero(), CannonSlide_L: zero() };
    for (const name of rotationNames) rot[name] = zero();
    return { rot, pos, feet: { R: { p: [0, ANKLE_Y, 0.69], yaw: 0, pitch: 0 }, L: { p: [0, ANKLE_Y, -0.69], yaw: 0, pitch: 0 } }, ik: true };
  }
  // Closed-form IK in each hip's local frame. The knee bends forward and the ankle
  // cancels hip/knee rotation to retain the authored world-space sole orientation.
  function solveFeet(pose) {
    if (!pose.ik) return;
    const rootQ = qEuler(pose.rot.MotionRoot), pelvisQ = qEuler(pose.rot.Pelvis);
    for (const side of SIDES) {
      const target = pose.feet[side], sign = sides(side);
      const v = new THREE.Vector3(...target.p).sub(new THREE.Vector3(...pose.pos.MotionRoot)).applyQuaternion(rootQ.clone().invert()).sub(new THREE.Vector3(...pose.pos.Pelvis)).applyQuaternion(pelvisQ.clone().invert()).sub(new THREE.Vector3(0, 0, sign * 0.69));
      const yz = Math.sqrt(v.y * v.y + v.z * v.z);
      const distance = Math.sqrt(v.x * v.x + yz * yz);
      // Throw for an unreachable authored target instead of hiding foot drift.
      if (distance > UPPER + LOWER + 0.0001 || distance < Math.abs(UPPER - LOWER) + 0.0001) throw new Error('Unreachable ' + side + ' ankle target: ' + distance.toFixed(5));
      const d = clamp(distance, Math.abs(UPPER - LOWER) + 0.00001, UPPER + LOWER);
      const bend = Math.acos(clamp((d * d - UPPER * UPPER - LOWER * LOWER) / (2 * UPPER * LOWER), -1, 1));
      const hipZ = Math.atan2(v.x, yz) + Math.acos(clamp((UPPER * UPPER + d * d - LOWER * LOWER) / (2 * UPPER * d), -1, 1));
      const hipX = Math.atan2(-v.z, -v.y);
      pose.rot['Hip_' + side] = [hipX * DEG, 0, hipZ * DEG];
      pose.rot['Knee_' + side] = [0, 0, -bend * DEG];
      const chain = rootQ.clone().multiply(pelvisQ).multiply(qEuler(pose.rot['Hip_' + side])).multiply(qEuler(pose.rot['Knee_' + side]));
      const worldFoot = qEuler([0, target.yaw, 0]).multiply(qEuler([0, 0, target.pitch]));
      pose.rot['Ankle_' + side] = eulerQ(chain.invert().multiply(worldFoot));
    }
  }
  function hands(pose, close) {
    for (const side of SIDES) for (let i = 0; i < 4; i++) pose.rot['Finger' + i + '_' + side] = [0, 0, close * (48 + i * 2)];
  }
  function crouch(pose, amount) {
    pose.pos.Pelvis = [-0.14 * amount, PELVIS_Y - 0.62 * amount, 0];
    pose.rot.Torso = [0, 0, -9 * amount];
    for (const side of SIDES) {
      const sign = sides(side);
      pose.rot['ShoulderSwing_' + side] = [-12 * sign * amount, 0, -18 * amount];
      pose.rot['Elbow_' + side] = [0, 0, 30 * amount];
      pose.rot['ShoulderCap_' + side] = [-7 * sign * amount, 0, -5 * amount];
    }
    hands(pose, amount * 0.65);
  }
  function airborne(pose, amount = 1) {
    pose.ik = false;
    pose.pos.MotionRoot[1] = 2;
    pose.pos.Pelvis = [0, PELVIS_Y, 0];
    pose.rot.Torso = [0, 0, -5 * amount];
    for (const side of SIDES) {
      const sign = sides(side);
      pose.rot['Hip_' + side] = [-4 * sign * amount, 0, 12 * amount];
      pose.rot['Knee_' + side] = [0, 0, -25 * amount];
      pose.rot['Ankle_' + side] = [0, 0, 7 * amount];
      pose.rot['ShoulderSwing_' + side] = [-17 * sign * amount, 0, -7 * amount];
      pose.rot['ShoulderCap_' + side] = [-8 * sign * amount, 0, -2 * amount];
      pose.rot['Elbow_' + side] = [0, 0, 22 * amount];
      pose.rot['CannonPitch_' + side] = [0, 0, 5 * amount];
    }
    hands(pose, 0.35 * amount);
  }
  function aim(pose, amount = 1) {
    pose.pos.Pelvis = [-0.10 * amount, PELVIS_Y - 0.25 * amount, 0];
    pose.rot.Torso = [0, 0, -4 * amount];
    pose.rot.Head = [0, 0, 4 * amount];
    for (const side of SIDES) {
      const sign = sides(side);
      pose.rot['ShoulderSwing_' + side] = [-9 * sign * amount, 0, 4 * amount];
      pose.rot['Elbow_' + side] = [0, 0, 20 * amount];
      pose.rot['ShoulderCap_' + side] = [-5 * sign * amount, 0, 0];
      pose.rot['CannonYaw_' + side] = [0, -2 * sign * amount, 0];
      pose.rot['CannonPitch_' + side] = [0, 0, 4 * amount];
    }
    hands(pose, 0.75 * amount);
  }
  function lerpPose(a, b, fraction) {
    const p = neutral(); p.ik = false;
    for (const name of rotationNames) p.rot[name] = blend(a.rot[name], b.rot[name], fraction);
    for (const name of positionNames) p.pos[name] = blend(a.pos[name], b.pos[name], fraction);
    return p;
  }
  const clips = [];
  const groundCombatClips = ['Idle', 'Walk', 'TurnLeft', 'TurnRight', 'SlashRight', 'SlashLeft', 'SlashCombo', 'OverheadStrike'];
  contract.exportBatch = JAEGER_MOTION_BATCH;
  function restValue(target, kind) {
    if (kind === 'position') return target === 'Pelvis' ? [0, PELVIS_Y, 0] : zero();
    if (target === 'ShoulderSwing_R') return [-7, 0, 3];
    if (target === 'ShoulderSwing_L') return [7, 0, 3];
    if (target === 'Elbow_R' || target === 'Elbow_L') return [0, 0, 8];
    if (target.startsWith('Finger')) return [0, 0, 0.12 * DEG];
    return zero();
  }
  function usefulKeys(target, keys, kind) {
    const equal = (a, b) => a.every((value, index) => Math.abs(value - b[index]) < 0.0000001);
    // Missing tracks restore the model bind transform in a normal AnimationMixer.
    // Keep constant non-bind tracks: CannonReady and Hover must play standalone.
    if (keys.every(key => equal(key[kind], restValue(target, kind)))) return null;
    if (keys.every(key => equal(key[kind], keys[0][kind]))) return [keys[0], keys[keys.length - 1]];
    return keys;
  }
  function clip(name, duration, evaluate, info) {
    contract.clips[name] = { duration, ...info };
    if (!["PilotActivation","PilotWalk","PilotTurnLeft","PilotTurnRight","PilotStop"].includes(name)) return;
    if (JAEGER_MOTION_BATCH === 'ground-combat' && !groundCombatClips.includes(name)) return;
    if (JAEGER_MOTION_BATCH === 'boost-weapons' && groundCombatClips.includes(name)) return;
    const rotations = {}, positions = {}, count = Math.round(duration * FPS);
    for (const name of rotationNames) rotations[name] = [];
    for (const name of positionNames) positions[name] = [];
    for (let i = 0; i <= count; i++) {
      const time = duration * i / count;
      const pose = evaluate(time, time / duration);
      solveFeet(pose);
      // The authored action arrays are offsets from a relaxed A-pose, shared by
      // every clip including their transition endpoints and the model bind pose.
      for (const side of SIDES) {
        pose.rot['ShoulderSwing_' + side][0] -= 7 * sides(side);
        pose.rot['ShoulderSwing_' + side][2] += 3;
        pose.rot['Elbow_' + side][2] += 8;
        for (let finger = 0; finger < 4; finger++) pose.rot['Finger' + finger + '_' + side][2] += 0.12 * DEG;
      }
      for (const target of rotationNames) rotations[target].push({ time, rotation: pose.rot[target] });
      for (const target of positionNames) positions[target].push({ time, position: pose.pos[target] });
    }
    const tracks = [];
    for (const target of rotationNames) { const keys = usefulKeys(target, rotations[target], 'rotation'); if (keys) tracks.push(rotationTrack('Joint_' + target, keys)); }
    for (const target of positionNames) { const keys = usefulKeys(target, positions[target], 'position'); if (keys) tracks.push(positionTrack('Joint_' + target, keys)); }
    clips.push(createClip(name, duration, tracks));
    contract.clips[name] = { duration, ...info, trackCount: tracks.length };
  }
  clip('Idle', 4, (t, u) => {
    const p = neutral(), breath = (1 - Math.cos(u * Math.PI * 2)) / 2;
    p.pos.Pelvis[1] -= 0.025 * breath;
    p.rot.Torso = [0, 0, -0.8 * breath];
    p.rot.Head = [0, 1.5 * Math.sin(u * Math.PI * 2), 0.65 * breath];
    for (const side of SIDES) p.rot['Elbow_' + side] = [0, 0, 2 * breath];
    return p;
  }, { loop: true, startPose: 'Standing', endPose: 'Standing', planted: { R: [[0, 4]], L: [[0, 4]] }, rootDelta: [0, 0, 0] });

  // Four alternating steps; every stance target is constant in world space.
  const walkSwings = { R: [[0.12, 0.62, 0, 1.6], [1.52, 2.02, 1.6, 3.2]], L: [[0.72, 1.22, 0, 1.6], [2.12, 2.62, 1.6, 3.2]] };
  clip('Walk', 2.8, (t, u) => {
    const p = neutral(), activity = ease(t / 0.10) * (1 - ease((t - 2.66) / 0.14));
    p.pos.MotionRoot[0] = 3.2 * ease(u);
    p.pos.Pelvis[1] -= activity * (0.27 + 0.025 * Math.sin(u * Math.PI * 8));
    p.rot.Torso = [0, 3.5 * Math.sin(u * Math.PI * 4) * activity, -3 * activity];
    for (const side of SIDES) {
      const sign = sides(side), foot = p.feet[side];
      let x = 0;
      for (const [start, end, from, to] of walkSwings[side]) {
        if (t >= end) x = to;
        else if (t >= start) { const s = (t - start) / (end - start); x = mix(from, to, ease(s)); foot.p[1] += Math.sin(s * Math.PI) * 0.39; foot.pitch = Math.sin(s * Math.PI * 2) * 7; }
      }
      foot.p[0] = x;
      p.rot['ShoulderSwing_' + side] = [-5 * sign * activity, 0, -sign * Math.sin(u * Math.PI * 4) * 15 * activity];
      p.rot['Elbow_' + side] = [0, 0, 10 * activity];
      p.rot['ShoulderCap_' + side] = [-2 * sign * activity, 0, -sign * Math.sin(u * Math.PI * 4) * 4 * activity];
    }
    return p;
  }, { loop: true, rootMotion: true, startPose: 'Standing', endPose: 'StandingTranslated', rootDelta: [3.2, 0, 0], planted: { R: [[0, 0.12], [0.62, 1.52], [2.02, 2.8]], L: [[0, 0.72], [1.22, 2.12], [2.62, 2.8]] } });

  for (const [name, direction] of [['TurnLeft', 1], ['TurnRight', -1]]) {
    const swing = { R: [[0.15, 0.9, 0, 45], [2.1, 2.85, 45, 90]], L: [[1.1, 1.85, 0, 45], [3.1, 3.85, 45, 90]] };
    clip(name, 4, (t, u) => {
      const p = neutral(), activity = ease(t / 0.15) * (1 - ease((t - 3.86) / 0.14));
      p.rot.MotionRoot = [0, direction * 90 * ease(u), 0];
      p.pos.Pelvis[1] -= 0.17 * activity;
      p.rot.Head = [0, direction * 7 * Math.sin(Math.PI * u), 0];
      p.rot.Torso = [0, direction * 3 * Math.sin(Math.PI * u), 0];
      for (const side of SIDES) {
        const sign = sides(side); let angle = 0, height = 0;
        for (const [start, end, from, to] of swing[side]) {
          if (t >= end) angle = to;
          else if (t >= start) { const s = (t - start) / (end - start); angle = mix(from, to, ease(s)); height = 0.23 * Math.sin(s * Math.PI); }
        }
        p.feet[side] = { p: yawPoint([0, ANKLE_Y + height, sign * 0.69], direction * angle), yaw: direction * angle, pitch: 0 };
        p.rot['ShoulderSwing_' + side] = [-7 * sign * activity, 0, sign * direction * Math.sin(Math.PI * u) * 8];
        p.rot['Elbow_' + side] = [0, 0, 8 * activity];
      }
      return p;
    }, { loop: false, rootMotion: true, startPose: 'Standing', endPose: 'StandingRotated', rootDelta: [0, 0, 0], rootYawDeltaDegrees: direction * 90, planted: { R: [[0, 0.15], [0.9, 2.1], [2.85, 4]], L: [[0, 1.1], [1.85, 3.1], [3.85, 4]] } });
  }

  function attackPose(t, duration, side) {
    const p = neutral(), sign = sides(side), opposite = side === 'R' ? 'L' : 'R';
    const anticipation = pulse(t, 0, 0.62, 1.06);
    const strike = pulse(t, 0.63, 1.0, 1.78);
    const recovery = pulse(t, 1.02, 1.30, duration);
    const active = pulse(t, 0, 0.68, duration);
    p.pos.Pelvis = [-0.12 * anticipation + 0.13 * strike, PELVIS_Y - 0.24 * active, sign * (-0.08 * anticipation + 0.11 * strike)];
    p.rot.Torso = [sign * 2 * strike, sign * (-20 * anticipation + 25 * strike), -3 * active];
    p.rot.Head = [0, sign * (12 * anticipation - 12 * strike), 3 * active];
    p.rot['ShoulderSwing_' + side] = [-sign * (32 * anticipation + 24 * strike + 8 * recovery), sign * (-30 * anticipation + 26 * strike), -25 * anticipation + 78 * strike + 24 * recovery];
    p.rot['UpperArmTwist_' + side] = [0, sign * (-15 * anticipation + 24 * strike), 0];
    p.rot['Elbow_' + side] = [0, 0, 75 * anticipation + 18 * strike + 18 * recovery];
    p.rot['Wrist_' + side] = [0, 0, 10 * anticipation - 10 * strike];
    p.rot['ShoulderCap_' + side] = [-sign * (14 * anticipation + 13 * strike), 0, -7 * anticipation + 23 * strike];
    p.rot['ShoulderSwing_' + opposite] = [sign * 8 * active, 0, -14 * strike + 12 * anticipation];
    p.rot['Elbow_' + opposite] = [0, 0, 34 * active];
    hands(p, active);
    return p;
  }
  for (const side of SIDES) clip(side === 'R' ? 'SlashRight' : 'SlashLeft', 2.5, t => attackPose(t, 2.5, side), { loop: false, startPose: 'Standing', endPose: 'Standing', hitTimes: [1.0], planted: { R: [[0, 2.5]], L: [[0, 2.5]] }, rootDelta: [0, 0, 0] });
  clip('SlashCombo', 3.7, t => {
    const right = attackPose(Math.min(t, 2.5), 2.5, 'R');
    if (t <= 1.25) return right;
    const left = attackPose(t - 1.2, 2.5, 'L');
    return lerpPoseWithFeet(right, left, ease((t - 1.25) / 0.35));
  }, { loop: false, startPose: 'Standing', endPose: 'Standing', hitTimes: [1.0, 2.2], planted: { R: [[0, 3.7]], L: [[0, 3.7]] }, rootDelta: [0, 0, 0] });
  function lerpPoseWithFeet(a, b, fraction) { const p = lerpPose(a, b, fraction); p.ik = true; return p; }

  clip('OverheadStrike', 3.2, t => {
    const p = neutral(), lift = pulse(t, 0, 1.0, 1.72), hit = pulse(t, 1.1, 1.52, 2.45), active = pulse(t, 0, 1.05, 3.2);
    p.pos.Pelvis = [-0.09 * lift + 0.15 * hit, PELVIS_Y - 0.19 * active - 0.19 * hit, 0];
    p.rot.Torso = [0, 0, 10 * lift - 17 * hit];
    p.rot.Head = [0, 0, -10 * lift + 13 * hit];
    for (const side of SIDES) {
      const sign = sides(side);
      p.rot['ShoulderSwing_' + side] = [-sign * (18 * lift + 18 * hit), -sign * 7 * lift, 145 * lift + 75 * hit];
      p.rot['Elbow_' + side] = [0, 0, 35 * lift + 12 * hit];
      p.rot['UpperArmTwist_' + side] = [0, -sign * 10 * lift, 0];
      p.rot['ShoulderCap_' + side] = [-sign * (13 * lift + 10 * hit), 0, 40 * lift + 22 * hit];
    }
    hands(p, active);
    return p;
  }, { loop: false, startPose: 'Standing', endPose: 'Standing', hitTimes: [1.52], planted: { R: [[0, 3.2]], L: [[0, 3.2]] }, rootDelta: [0, 0, 0] });

  clip('CannonAim', 1.2, (t, u) => { const p = neutral(); aim(p, ease(u)); return p; }, { loop: false, startPose: 'Standing', endPose: 'CannonReady', planted: { R: [[0, 1.2]], L: [[0, 1.2]] }, rootDelta: [0, 0, 0] });
  clip('CannonFire', 1.8, t => {
    const p = neutral(); aim(p);
    const right = pulse(t, 0.40, 0.45, 0.88), left = pulse(t, 0.67, 0.72, 1.18);
    p.pos.CannonSlide_R[0] = -0.105 * right;
    p.pos.CannonSlide_L[0] = -0.105 * left;
    p.pos.Pelvis[0] -= 0.045 * (right + left);
    p.pos.Pelvis[1] -= 0.025 * (right + left);
    p.rot.Torso[2] += 2.5 * (right + left);
    p.rot.Torso[1] += 1.8 * (right - left);
    p.rot.CannonPitch_R[2] += 2 * right;
    p.rot.CannonPitch_L[2] += 2 * left;
    return p;
  }, { loop: true, startPose: 'CannonReady', endPose: 'CannonReady', fireTimes: { R: [0.40], L: [0.67] }, planted: { R: [[0, 1.8]], L: [[0, 1.8]] }, rootDelta: [0, 0, 0] });

  clip('JumpPrepare', 1.1, (t, u) => { const p = neutral(); crouch(p, ease(u)); return p; }, { loop: false, startPose: 'Standing', endPose: 'LaunchCrouch', planted: { R: [[0, 1.1]], L: [[0, 1.1]] }, rootDelta: [0, 0, 0] });
  const launchCrouch = neutral(); crouch(launchCrouch, 1); solveFeet(launchCrouch);
  const hoverPose = neutral(); airborne(hoverPose);
  clip('Takeoff', 1.35, t => {
    if (t < 0.24) { const p = neutral(); crouch(p, 1 - ease(t / 0.24)); return p; }
    const u = (t - 0.24) / 1.11, p = lerpPose(neutral(), hoverPose, ease(u));
    p.pos.MotionRoot[1] = 2 * (1 - Math.pow(1 - u, 2));
    return p;
  }, { loop: false, startPose: 'LaunchCrouch', endPose: 'Hover', rootDelta: [0, 2, 0], liftOffTime: 0.24, planted: { R: [[0, 0.24]], L: [[0, 0.24]] } });
  clip('Hover', 3.2, (t, u) => {
    const p = neutral(); airborne(p);
    const wave = Math.sin(u * Math.PI * 2), bob = (1 - Math.cos(u * Math.PI * 2)) / 2;
    p.pos.MotionRoot[1] += 0.08 * bob;
    p.rot.Torso[2] -= 1.0 * wave;
    p.rot.Head[2] += 0.5 * wave;
    for (const side of SIDES) { p.rot['ShoulderSwing_' + side][0] -= sides(side) * 1.5 * wave; p.rot['Knee_' + side][2] -= 2 * bob; }
    return p;
  }, { loop: true, startPose: 'Hover', endPose: 'Hover', rootStart: [0, 2, 0], rootDelta: [0, 0, 0], planted: { R: [], L: [] } });
  clip('ForwardFlight', 3.4, (t, u) => {
    const p = neutral(); airborne(p);
    const flight = Math.pow(Math.sin(Math.PI * u), 2);
    p.pos.MotionRoot[0] = 4 * ease(u);
    p.pos.MotionRoot[1] += 0.28 * flight;
    p.rot.Pelvis[2] = -25 * flight;
    p.rot.Torso[2] -= 9 * flight;
    p.rot.Head[2] = 28 * flight;
    for (const side of SIDES) {
      const sign = sides(side);
      p.rot['ShoulderSwing_' + side] = [-sign * (17 + 13 * flight), 0, -7 - 23 * flight];
      p.rot['ShoulderCap_' + side] = [-sign * (8 + 6 * flight), 0, -2 - 8 * flight];
      p.rot['Hip_' + side][2] -= 14 * flight;
      p.rot['Knee_' + side][2] -= 12 * flight;
      p.rot['Toe_' + side][2] = -10 * flight;
      p.rot['CannonPitch_' + side][2] += 29 * flight;
    }
    return p;
  }, { loop: false, rootMotion: true, startPose: 'Hover', endPose: 'HoverTranslated', rootStart: [0, 2, 0], rootDelta: [4, 0, 0], planted: { R: [], L: [] } });
  clip('Landing', 2.0, t => {
    if (t < 0.68) {
      const u = t / 0.68, p = lerpPose(hoverPose, neutral(), ease(u));
      p.pos.MotionRoot[1] = 2 * (1 - ease(u));
      return p;
    }
    const p = neutral(), absorb = pulse(t, 0.68, 0.90, 2);
    crouch(p, absorb * 0.90);
    p.rot.Head[2] = 8 * absorb;
    return p;
  }, { loop: false, startPose: 'Hover', endPose: 'Standing', rootStart: [0, 2, 0], rootDelta: [0, -2, 0], contactTime: 0.68, planted: { R: [[0.68, 2]], L: [[0.68, 2]] } });
  clip('HitRecovery', 2.2, t => {
    const p = neutral(), impact = pulse(t, 0, 0.20, 0.95), brace = pulse(t, 0.13, 0.48, 2.2);
    p.pos.Pelvis = [-0.13 * impact - 0.06 * brace, PELVIS_Y - 0.17 * impact - 0.15 * brace, -0.06 * impact];
    p.rot.Torso = [3 * impact, -8 * impact, 13 * impact - 4 * brace];
    p.rot.Head = [-2 * impact, 5 * impact, -8 * impact];
    for (const side of SIDES) {
      const sign = sides(side);
      p.rot['ShoulderSwing_' + side] = [-sign * (17 * impact + 7 * brace), 0, -18 * impact + 15 * brace];
      p.rot['Elbow_' + side] = [0, 0, 25 * impact + 32 * brace];
      p.rot['ShoulderCap_' + side] = [-sign * 7 * impact, 0, -6 * impact + 4 * brace];
    }
    hands(p, 0.6 * brace);
    return p;
  }, { loop: false, startPose: 'Standing', endPose: 'Standing', planted: { R: [[0, 2.2]], L: [[0, 2.2]] }, rootDelta: [0, 0, 0] });
  // Pilot helpers supplement, never replace, the sixteen original inspection clips.
  clip('PilotActivation', 3, (t, u) => {
    const p = neutral(), wake = 1 - ease(u);
    crouch(p, 0.12 * wake); p.rot.Head[2] = -12 * wake;
    for (const side of SIDES) p.rot['Wrist_' + side][2] = 5 * wake;
    return p;
  }, { loop: false, startPose: 'Docked', endPose: 'Standing', planted: { R: [[0, 3]], L: [[0, 3]] } });
  clip('PilotWalk', 2.4, (t, u) => {
    const p = neutral(); p.pos.MotionRoot[0] = 3 * u;
    p.pos.Pelvis[1] -= 0.23 + 0.025 * Math.cos(4 * Math.PI * u);
    p.rot.Torso = [0, 2.5 * Math.sin(2 * Math.PI * u), -3];
    for (const side of SIDES) {
      const s = sides(side), phase = (u + (side === 'L' ? 0.5 : 0)) % 1;
      const swing = clamp((phase - 0.6) / 0.4);
      const x = phase < 0.6 ? 0.9 - 3 * phase : -0.9 + 1.8 * ease(swing);
      p.feet[side].p[0] = 3 * u + x;
      p.feet[side].p[1] += Math.sin(Math.PI * swing) * 0.32;
      p.feet[side].pitch = Math.sin(2 * Math.PI * swing) * 5;
      p.rot['ShoulderSwing_' + side] = [-5 * s, 0, -s * Math.sin(2 * Math.PI * u) * 13];
      p.rot['ShoulderCap_' + side] = [-2 * s, 0, -s * Math.sin(2 * Math.PI * u) * 3];
      p.rot['Elbow_' + side][2] = 10;
    }
    return p;
  }, { loop: true, rootMotion: true, rootDelta: [3, 0, 0], strideSpeed: 1.25, contacts: { R: [0], L: [1.2] }, planted: { R: [[0, 1.44]], L: [[0, 0.24], [1.2, 2.4]] } });
  for (const [name, sign] of [['PilotTurnLeft', 1], ['PilotTurnRight', -1]]) {
    clip(name, 1.2, (t, u) => {
      const p = neutral(), activity = Math.sin(Math.PI * u);
      p.pos.Pelvis[1] -= 0.16 * activity;
      p.rot.Torso[1] = sign * 5 * activity;
      for (const side of SIDES) {
        const phase = side === 'L' ? clamp(u * 2) : clamp(u * 2 - 1);
        p.feet[side].p[1] += 0.18 * Math.sin(Math.PI * phase);
        p.rot['Elbow_' + side][2] = 8 * activity;
      }
      return p;
    }, { loop: true, rootDelta: [0, 0, 0], steering: 'Controller owns continuous yaw; feet use bounded contact IK.' });
  }
  clip('PilotStop', 0.65, (t, u) => {
    const p = neutral(), absorb = Math.sin(Math.PI * u) * 0.11;
    crouch(p, absorb); return p;
  }, { loop: false, startPose: 'Standing', endPose: 'Standing', rootDelta: [0, 0, 0] });
  function cruisePose(t, u, roll = 0) {
    const p = neutral(); airborne(p);
    p.rot.Pelvis = [roll, 0, -18]; p.rot.Torso[2] = -8; p.rot.Head[2] = 22;
    const bob = Math.sin(u * Math.PI * 2); p.pos.Pelvis[1] += 0.025 * bob;
    for (const side of SIDES) {
      const s = sides(side); p.rot['ShoulderSwing_' + side] = [-27 * s, 0, -25];
      p.rot['ShoulderCap_' + side] = [-12 * s, 0, -6];
      p.rot['Hip_' + side][2] -= 10; p.rot['Knee_' + side][2] -= 8;
      p.rot['Toe_' + side][2] = -8; p.rot['CannonPitch_' + side][2] += 20;
    }
    return p;
  }
  clip('PilotCruise', 3.2, (t, u) => cruisePose(t, u), { loop: true, rootStart: [0, 2, 0], rootDelta: [0, 0, 0] });
  clip('PilotBankLeft', 3.2, (t, u) => cruisePose(t, u, -10), { loop: true, rootStart: [0, 2, 0], rootDelta: [0, 0, 0] });
  clip('PilotBankRight', 3.2, (t, u) => cruisePose(t, u, 10), { loop: true, rootStart: [0, 2, 0], rootDelta: [0, 0, 0] });
  clip('PilotBrake', 0.8, (t, u) => {
    const a = cruisePose(0, 0), b = neutral(); airborne(b);
    const p = lerpPose(a, b, ease(u)); p.rot.Pelvis[2] += 7 * Math.sin(Math.PI * u); return p;
  }, { loop: false, startPose: 'Cruise', endPose: 'Hover', rootStart: [0, 2, 0], rootDelta: [0, 0, 0] });

  root.userData.animationContract = contract;
  return clips;
}
