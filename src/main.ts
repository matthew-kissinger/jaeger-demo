import './style.css';
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!;
const loading = document.querySelector<HTMLElement>('#loading')!;
const loadStatus = document.querySelector<HTMLElement>('#load-status')!;
const status = document.querySelector<HTMLElement>('#stats')!;
const params = new URLSearchParams(location.search);
const renderer = new THREE.WebGPURenderer({ canvas, antialias: true, forceWebGL: params.get('backend') === 'webgl' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#273d4b');
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.3, 2000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.07;
controls.minDistance = 28; controls.maxDistance = 330; controls.maxPolarAngle = Math.PI * 0.51;
function resetView() { camera.position.set(135, 71, 126); controls.target.set(0, 39, 0); controls.update(); }
resetView();
scene.add(new THREE.HemisphereLight('#c4ddeb', '#2b3338', 1.7));
const sun = new THREE.DirectionalLight('#ffe1b2', 3.8);
sun.position.set(95, 160, 85); sun.castShadow = true;
Object.assign(sun.shadow.camera, { left: -100, right: 100, top: 120, bottom: -100, near: 0.5, far: 450 });
sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0001; sun.shadow.normalBias = 0.15;
scene.add(sun);
const rim = new THREE.DirectionalLight('#96cde9', 2.3); rim.position.set(-70, 90, -100); scene.add(rim);
// Qualification guide only. Final solid deck is authored through Kiln.
const grid = new THREE.GridHelper(260, 26, '#587282', '#3a525f'); scene.add(grid);

const frameTimes: number[] = [];
let lastFrame = performance.now(), time = 0, running = false, ready = false;
let mixer: THREE.AnimationMixer, action: THREE.AnimationAction, animations: THREE.AnimationClip[] = [];
let model: THREE.Object3D, hero: THREE.Group;
const clipSelect = document.querySelector<HTMLSelectElement>('#clip')!;
const scrub = document.querySelector<HTMLInputElement>('#scrub')!;
function selectClip(name: string) {
  mixer.stopAllAction();
  const clip = animations.find(clip => clip.name === name)!;
  action = mixer.clipAction(clip).reset(); action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; action.play();
  time = 0; mixer.setTime(0); model.updateMatrixWorld(true); clipSelect.value = name;
}
function pose(name: string, phase: number) { selectClip(name); running = false; time = action.getClip().duration * phase; mixer.setTime(time); model.updateMatrixWorld(true); }
function percentile(values: number[], p: number) { return [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * p)] ?? 0; }
const qa = {
  ready: false, phase: 'renderer-init', errors: [] as string[],
  setPose: pose,
  stats: () => ({ backend: (renderer.backend as unknown as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'WebGPU' : 'WebGL2', calls: renderer.info.render.drawCalls, triangles: renderer.info.render.triangles, fps: frameTimes.length ? 1000 / (frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length) : 0, p95: percentile(frameTimes, 0.95), p99: percentile(frameTimes, 0.99), frames: frameTimes.length, memory: renderer.info.memory }),
  resetStats: () => { frameTimes.length = 0; },
};
(window as unknown as { jaegerQA: typeof qa }).jaegerQA = qa;

async function start() {
  await renderer.init();
  qa.phase = 'asset-load'; loadStatus.textContent = 'Loading the complete Jaeger';
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = new RoomEnvironment();
  scene.environment = pmrem.fromScene(environment, 0.04).texture;
  environment.dispose(); pmrem.dispose();
  const source = params.get('asset') === 'canonical' ? 'downloads/jaeger-complete-v4.glb' : 'assets/jaeger.glb';
  const gltf = await new GLTFLoader().loadAsync(import.meta.env.BASE_URL + source);
  model = gltf.scene; animations = gltf.animations;
  const bounds = new THREE.Box3().setFromObject(model), height = bounds.max.y - bounds.min.y;
  hero = new THREE.Group(); hero.scale.setScalar(79.25 / height); hero.add(model); scene.add(hero);
  model.traverse(object => { if ((object as THREE.Mesh).isMesh) { object.castShadow = true; object.receiveShadow = true; } });
  mixer = new THREE.AnimationMixer(model);
  for (const clip of animations) { const option = document.createElement('option'); option.value = clip.name; option.textContent = clip.name; clipSelect.append(option); }
  selectClip('Idle');
  qa.phase = 'shader-warmup'; loadStatus.textContent = 'Warming materials and shadows';
  await renderer.compileAsync(scene, camera);
  await renderer.renderAsync(scene, camera);
  loading.hidden = true; document.querySelector<HTMLElement>('#inspector')!.hidden = false;
  ready = true; qa.ready = true; qa.phase = 'qualification';
  clipSelect.addEventListener('change', () => selectClip(clipSelect.value));
  scrub.addEventListener('input', () => pose(clipSelect.value, Number(scrub.value)));
  document.querySelector('#play')!.addEventListener('click', () => { running = !running; document.querySelector('#play')!.textContent = running ? 'Pause' : 'Play'; });
  document.querySelector('#reset-view')!.addEventListener('click', resetView);
  document.querySelector<HTMLInputElement>('#wireframe')!.addEventListener('change', event => {
    model.traverse(object => {
      if (!(object as THREE.Mesh).isMesh) return;
      const material = (object as THREE.Mesh).material;
      for (const mat of Array.isArray(material) ? material : [material]) (mat as THREE.MeshStandardMaterial).wireframe = (event.target as HTMLInputElement).checked;
    });
  });
  renderer.setAnimationLoop(() => {
    const now = performance.now(), delta = Math.min((now - lastFrame) / 1000, 0.067);
    if (ready && !document.hidden) { frameTimes.push(now - lastFrame); if (frameTimes.length > 600) frameTimes.shift(); }
    lastFrame = now;
    if (running) { time = (time + delta) % action.getClip().duration; mixer.setTime(time); scrub.value = String(time / action.getClip().duration); }
    controls.update(); renderer.render(scene, camera);
    if (frameTimes.length % 30 === 0) { const s = qa.stats(); status.textContent = `${s.backend} · r${THREE.REVISION}\n${s.calls} calls · ${Math.round(s.triangles).toLocaleString()} triangles\n${s.fps.toFixed(1)} fps · p95 ${s.p95.toFixed(1)} ms\nQualification harness`; }
  });
}
window.addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
document.addEventListener('visibilitychange', () => { lastFrame = performance.now(); running = false; });
start().catch(error => { qa.errors.push(String(error)); loadStatus.textContent = String(error); console.error(error); });
