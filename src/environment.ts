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
  const water = new THREE.MeshStandardNodeMaterial({ metalness: 0.1, roughness: 0.14 });
  const x = positionWorld.x, z = positionWorld.z;

  // Layered ocean swell, transverse chop, and wind waves
  const w1 = sin(x.mul(0.016).add(z.mul(0.009)).add(time.mul(0.75))).mul(0.42);
  const w2 = cos(z.mul(0.038).sub(x.mul(0.022)).add(time.mul(1.05))).mul(0.24);
  const w3 = sin(x.mul(0.082).add(z.mul(0.061)).add(time.mul(1.55))).mul(0.12);
  const waveElevation = w1.add(w2).add(w3);
  water.positionNode = positionLocal.add(vec3(0, 0, waveElevation));

  // Multi-scale surface ripples for sharp normal glints and specular reflections
  const r1 = sin(x.mul(0.18).add(z.mul(0.12)).add(time.mul(1.8)));
  const r2 = cos(z.mul(0.28).sub(x.mul(0.15)).sub(time.mul(2.2)));
  const r3 = sin(x.mul(0.45).sub(z.mul(0.38)).add(time.mul(2.9)));
  const slopeX = r1.mul(0.14).add(r3.mul(0.08)).add(w1.mul(0.07));
  const slopeY = r2.mul(0.15).add(r3.mul(0.07)).add(w2.mul(0.07));
  water.normalNode = vec3(slopeX, slopeY, 1.0).normalize();

  // View-dependent Fresnel reflection
  const viewDir = normalize(cameraPosition.sub(positionWorld));
  const cosTheta = clamp(dot(normalWorld, viewDir), 0.0, 1.0);
  const fresnel = cosTheta.oneMinus().pow(3.5).mul(0.65);

  // Depth palette, Fresnel sky blend, and subtle crest foam
  const deepOcean = color('#0c2330'), midOcean = color('#1d4c5c'), skyReflect = color('#8cb5c5'), crestFoam = color('#d8ecf2');
  const baseWater = mix(deepOcean, midOcean, waveElevation.add(0.5).mul(0.6));
  const withFresnel = mix(baseWater, skyReflect, fresnel);
  const foamMask = smoothstep(0.38, 0.62, waveElevation).mul(0.32);
  water.colorNode = mix(withFresnel, crestFoam, foamMask);

  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000, 128, 128), water);
  ocean.rotation.x = -Math.PI / 2; ocean.position.y = -7.5; scene.add(ocean);
  return { sun, sky, ocean, update: (seconds: number) => { time.value = seconds; }, dispose: () => target.dispose() };
}
