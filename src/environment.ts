import * as THREE from 'three/webgpu';
import { color, mix, positionWorld, positionLocal, uniform, vec3, sin, cos, smoothstep, cameraPosition, normalWorld, dot, clamp, normalize } from 'three/tsl';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
export async function atmosphere(scene: THREE.Scene, renderer: THREE.WebGPURenderer) {
  const sky = new SkyMesh(); sky.scale.setScalar(8000); sky.turbidity.value = 3.8; sky.rayleigh.value = 1.4; sky.mieCoefficient.value = 0.006;
  sky.sunPosition.value.set(0.65, 0.32, 0.5).normalize(); sky.showSunDisc.value = false;
  const environmentScene = new THREE.Scene(); environmentScene.add(sky);
  const pmrem = new THREE.PMREMGenerator(renderer); const target = pmrem.fromScene(environmentScene, 0, 1, 10000, { size: 128 });
  scene.environment = target.texture; scene.environmentIntensity = 0.85; environmentScene.remove(sky); scene.add(sky); sky.showSunDisc.value = true; pmrem.dispose();
  scene.fog = new THREE.FogExp2('#9aafb7', 0.0009);
  scene.add(new THREE.HemisphereLight('#bddeec', '#353c3a', 1.25));
  const sun = new THREE.DirectionalLight('#ffe0af', 3.4); sun.position.set(260, 320, 200); sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -260, right: 260, top: 210, bottom: -210, near: 20, far: 850 });
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.00015; sun.shadow.normalBias = 0.13; scene.add(sun, sun.target);

  const time = uniform(0);
  // Clean, performant PBR water material
  const water = new THREE.MeshStandardNodeMaterial({ metalness: 0.05, roughness: 0.18 });
  const x = positionWorld.x, z = positionWorld.z;

  // Directional traveling wave fronts with golden-ratio frequency spacing (no 2D grid/checkerboard)
  const p1 = x.mul(0.022).add(z.mul(0.013)).sub(time.mul(0.65));
  const p2 = x.mul(0.039).sub(z.mul(0.034)).sub(time.mul(0.95));
  const p3 = x.mul(0.078).add(z.mul(0.062)).sub(time.mul(1.5));

  // Gentle physical wave elevation
  const elevation = sin(p1).mul(0.24).add(sin(p2).mul(0.12)).add(sin(p3).mul(0.05));
  water.positionNode = positionLocal.add(vec3(0, 0, elevation));

  // Directional surface normal slopes from wave derivatives
  const ndx = cos(p1).mul(0.022 * 0.24).add(cos(p2).mul(0.039 * 0.12)).add(cos(p3).mul(0.078 * 0.05)).mul(1.6);
  const ndz = cos(p1).mul(0.013 * 0.24).sub(cos(p2).mul(0.034 * 0.12)).add(cos(p3).mul(0.062 * 0.05)).mul(1.6);
  water.normalNode = vec3(ndx, ndz.negate(), 1.0).normalize();

  // Pure view-dependent Fresnel: dark deep marine blue looking down, soft sky reflection toward horizon
  const viewDir = normalize(cameraPosition.sub(positionWorld));
  const cosTheta = clamp(dot(normalWorld, viewDir), 0.0, 1.0);
  const fresnel = cosTheta.oneMinus().pow(3.0).mul(0.7);

  const deepWater = color('#0e2835'), horizonReflect = color('#8ba9b8');
  water.colorNode = mix(deepWater, horizonReflect, fresnel);

  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000, 64, 64), water);
  ocean.rotation.x = -Math.PI / 2; ocean.position.y = -7.5; scene.add(ocean);
  return { sun, sky, ocean, update: (seconds: number) => { time.value = seconds; }, dispose: () => target.dispose() };
}
