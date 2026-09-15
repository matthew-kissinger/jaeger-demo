import './style.css';
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PilotInput } from './input';
import { JaegerPlayer, type Site } from './player';
import { atmosphere } from './environment';
import { Effects } from './effects';
import { SceneAudio } from './audio';
import { ease } from './movement';
import { Combat, type Interaction } from './combat';
import { traceWorld } from './combat-queries';
import { ProceduralSpringTarget } from './spring-target';
import { CameraShake } from './camera-shake';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('scene'), params = new URLSearchParams(location.search);
const renderer = new THREE.WebGPURenderer({ canvas, antialias: true, forceWebGL: params.get('backend') === 'webgl' });
renderer.setPixelRatio(Math.min(devicePixelRatio, matchMedia('(pointer:coarse)').matches ? 1.25 : 1.5)); renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.85; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.3, 10000);
const input = new PilotInput(canvas), audio = new SceneAudio(), effects = new Effects(scene), cameraShake = new CameraShake();
const springTargets = new Map<string, ProceduralSpringTarget>();
let player: JaegerPlayer, site: Site, environment: THREE.Group, cradleMixer: THREE.AnimationMixer, cradleAction: THREE.AnimationAction, weather: Awaited<ReturnType<typeof atmosphere>>;
let combat: Combat;
const cameraObstacles: THREE.Box3[] = [], cameraRay = new THREE.Ray(), cameraHit = new THREE.Vector3();
let ready = false, started = false, paused = false, time = 0, previous = performance.now(), accumulator = 0, inspectPlaying = false, inspectTime = 0;
const times: number[] = [], viewTarget = new THREE.Vector3(), viewPosition = new THREE.Vector3(), lastLook = new THREE.Vector3(1,0,0);
let messageUntil = 0;
let shoulderOffset = 16, cameraFocusHeight = 44;
function toast(message: string) { $('notice').textContent = message; messageUntil = time + 3; }
function togglePause(force?: boolean) { paused = force ?? !paused; player.paused = paused; input.clear(); audio.pause(paused); $('menu').hidden = !paused; $('pause').textContent = paused ? 'Resume' : 'Menu'; }
function begin(skip = false) { if (!ready) return; started = true; $('welcome').hidden = true; $('hud').hidden = false; void audio.unlock(); player.reset(!skip); canvas.focus(); }
input.onAction = action => {
  if (action === 'menu') { if (started) togglePause(); return; }
  if (action === 'mute') { audio.mute(); $('mute').textContent = audio.muted ? 'Sound off' : 'Sound on'; return; }
  if (action === 'inspect') { if (!started) return; $('inspector').hidden = !$('inspector').hidden; player.inspector = !$('inspector').hidden; if (player.inspector) { input.clear(); setPose('Idle', 0); } else player.reset(); return; }
  if (action === 'start') { begin(); return; }
  if (action === 'pilot') { begin(true); return; }
  if (action === 'resume') { togglePause(false); return; }
  if (['combo','overhead','recovery'].includes(action) && paused) togglePause(false);
  if (action === 'reset' || action === 'replay') { if (paused) togglePause(false); $('inspector').hidden = true; }
  player?.command(action);
};
const clipSelect = $<HTMLSelectElement>('clip'), scrub = $<HTMLInputElement>('scrub');
const aimMarkers = [$('aim-r'), $('aim-l')], aimLabel = $('aim-label');
function setPose(name: string, phase: number) { player.inspect(name, phase); clipSelect.value = name; scrub.value = String(phase); inspectTime = phase * player.clips.get(name)!.duration; }
function socket(name: string) { return player.model.getObjectByName('Joint_' + name)!; }
function point(name: string) { return socket(name).getWorldPosition(new THREE.Vector3()); }
const targetFlashes = new Map<string, number>(), targetMaterials = new Map<string, THREE.MeshStandardMaterial[]>();
function hitTarget(id: string, hit: THREE.Vector3) {
  targetFlashes.set(id, 0.4);
  effects.burst(hit, 22, 2.2, 22);
  audio.play('impact', 0.65, hit);
  toast('TARGET CONTACT');
  cameraShake.addTrauma(0.12);
  const forward = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), -player.yaw);
  springTargets.get(id)?.applyHit(forward.multiplyScalar(0.95), hit);
}
function event(name: string, side = 'R') {
  player.wrapper.updateMatrixWorld(true);
  if (name === 'reset') {
    effects.reset(); audio.reset(); combat?.reset(); targetFlashes.clear(); $('notice').textContent=''; messageUntil=0;
    for (const target of springTargets.values()) target.reset();
    return;
  }
  if (name === 'control') { toast('YOUR CONTROLS ARE LIVE'); return; }
  if (name === 'landing-blocked') { toast('LANDING BLOCKED · STEER TO CLEAR DECK'); return; }
  if (name === 'ground-required') { toast('LAND BEFORE USING WEAPONS'); return; }
  const position = player.wrapper.position.clone();
  audio.play(name, name === 'footstep' ? 0.68 : 0.7, position);
  if (name === 'footstep' || name === 'landing') {
    effects.burst(position.clone().setY(0.1), name === 'landing' ? 30 : 6, name === 'landing' ? 5 : 2.2, 15);
    cameraShake.addTrauma(name === 'landing' ? 0.26 : 0.02);
  }
}
const qa = { ready: false, phase: 'initializing', errors: [] as string[], start: begin, setPose, reset: () => player.reset(), command: (name: string) => input.onAction(name),
  scene, camera, player: () => player, renderer,
  combat: () => ({ shots: combat?.shots, hits: combat?.hits }),
  snapshot: () => ({ state: player?.state, position: player?.wrapper.position.toArray(), scale: player?.scale, clip: player?.currentClip, introTime: player?.introTime, paused, ik: player ? { maxCorrection: player.ik.maxCorrection, maxReachError: player.ik.maxReachError, worstReach: player.ik.worstReach } : null }),
  stats: () => { const sorted = [...times].sort((a,b)=>a-b); return { backend: (renderer.backend as unknown as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'WebGPU' : 'WebGL2', calls: renderer.info.render.drawCalls, triangles: renderer.info.render.triangles, fps: times.length ? 1000 / (times.reduce((a,b)=>a+b,0)/times.length) : 0, p95: sorted[Math.floor(sorted.length * .95)] ?? 0, p99: sorted[Math.floor(sorted.length * .99)] ?? 0, memory: renderer.info.memory }; }, resetStats: () => { times.length = 0; }
};
(window as unknown as { jaegerQA: typeof qa }).jaegerQA = qa;
async function start() {
  try {
    await renderer.init();
  } catch (err) {
    console.warn('Primary backend init failed, attempting fallback:', err);
    try {
      (renderer as unknown as { forceWebGL: boolean }).forceWebGL = true;
      await renderer.init();
    } catch (err2) {
      console.error('Graphics init failed:', err2);
      $('load-status').textContent = 'WebGPU / WebGL2 initialization failed. Please try a modern browser.';
      $('fallback').hidden = false;
      return;
    }
  }
  qa.phase = 'assets'; $('load-status').textContent = 'Loading Kiln assets and sound';
  const loader = new GLTFLoader();
  const [heroGltf, sceneGltf, siteData, interaction] = await Promise.all([loader.loadAsync(import.meta.env.BASE_URL + 'assets/jaeger-pilot.glb'), loader.loadAsync(import.meta.env.BASE_URL + 'assets/environment.glb'), fetch(import.meta.env.BASE_URL + 'assets/site.json').then(r=>r.json()), fetch(import.meta.env.BASE_URL + 'assets/interaction.json').then(r=>r.json() as Promise<Interaction>), audio.load()]);
  site = siteData; environment = sceneGltf.scene; scene.add(environment); player = new JaegerPlayer(heroGltf.scene, heroGltf.animations, input, site); scene.add(player.wrapper); player.onEvent = event;
  combat = new Combat(player.model, site, interaction); player.onPose = (frame, dt) => combat.update(frame, dt);
  combat.onShot = shot => {
    effects.shot(shot.start, shot.end); effects.burst(shot.start, 8, 4, 9); audio.play('cannon', 0.85, shot.start);
    cameraShake.addTrauma(0.16);
  };
  combat.onImpact = hit => { const p=new THREE.Vector3(hit.point.x,hit.point.y,hit.point.z); if(hit.targetId) hitTarget(hit.targetId,p); else { effects.burst(p,14,1.6,15); audio.play('impact',0.45,p); } };
  combat.onSwing = p => audio.play('blade',0.65,p);
  combat.onTrail = (side,from,to) => effects.blade(side,from.base,from.tip,to.base,to.tip);
  environment.traverse(node => { if ((node as THREE.Mesh).isMesh) { node.castShadow = true; node.receiveShadow = true; } });
  player.model.traverse(node => { if ((node as THREE.Mesh).isMesh) { node.castShadow = true; node.receiveShadow = true; } });
  // Target materials get private mutable flash state; all other kit resources remain shared.
  for (const target of site.targets) {
    const group = environment.getObjectByName('Joint_' + target.id)!; const copies = new Map<THREE.Material, THREE.Material>();
    group.traverse(node => { const mesh = node as THREE.Mesh; if (!mesh.isMesh) return; const original = mesh.material as THREE.MeshStandardMaterial; if (!copies.has(original)) copies.set(original, original.clone()); mesh.material = copies.get(original)!; });
    targetMaterials.set(target.id, [...copies.values()] as THREE.MeshStandardMaterial[]);
    springTargets.set(target.id, new ProceduralSpringTarget(group, {
      omegaN: target.kind === 'blade' ? 4.8 : 3.8,
      zeta: target.kind === 'blade' ? 0.38 : 0.44,
      maxAngle: target.kind === 'blade' ? 0.48 : 0.35,
      height: target.height,
      restitution: 0.2
    }));
  }
  cradleMixer = new THREE.AnimationMixer(environment); cradleAction = cradleMixer.clipAction(sceneGltf.animations[0]); cradleAction.setLoop(THREE.LoopOnce, 1); cradleAction.clampWhenFinished = true; cradleAction.play();
  for (const obstacle of site.obstacles) cameraObstacles.push(new THREE.Box3(new THREE.Vector3().fromArray(obstacle.min), new THREE.Vector3().fromArray(obstacle.max)).expandByScalar(2));
  weather = await atmosphere(scene, renderer);
  for (const clip of heroGltf.animations) { const option = document.createElement('option'); option.value = option.textContent = clip.name; clipSelect.append(option); }
  clipSelect.addEventListener('change', () => { inspectTime = 0; setPose(clipSelect.value, 0); });
  scrub.addEventListener('input', () => { inspectPlaying = false; setPose(clipSelect.value, Number(scrub.value)); });
  $('play').addEventListener('click', () => { inspectPlaying = !inspectPlaying; $('play').textContent = inspectPlaying ? 'Pause clip' : 'Play clip'; });
  $('return-pilot').addEventListener('click', () => { $('inspector').hidden = true; player.reset(); });
  $<HTMLInputElement>('wireframe').addEventListener('change', e => { player.model.traverse(node => { const mesh = node as THREE.Mesh; if (mesh.isMesh) (mesh.material as THREE.MeshStandardMaterial).wireframe = (e.target as HTMLInputElement).checked; }); });
  $('quality').addEventListener('change', event => { const tier = (event.target as HTMLSelectElement).value; renderer.setPixelRatio(Math.min(devicePixelRatio, tier === 'low' ? 0.85 : tier === 'medium' ? 1.15 : 1.5)); renderer.setSize(innerWidth, innerHeight); toast('QUALITY UPDATED'); });
  camera.position.set(-53, 36, 109); camera.lookAt(-158, 43, 0); qa.phase = 'warming'; $('load-status').textContent = 'Warming lighting, water and effects';
  await renderer.compileAsync(scene, camera); await renderer.renderAsync(scene, camera);
  ready = qa.ready = true; qa.phase = 'scene-development'; $('loading').hidden = true; $('welcome').hidden = false;
  if (params.has('autostart')) begin(params.get('autostart') === 'pilot');
  previous = performance.now(); renderer.setAnimationLoop(frame);
}
function frame() {
  const now = performance.now(), delta = Math.min((now - previous) / 1000, 4/60); if (!document.hidden) { times.push(now - previous); if (times.length > 1200) times.shift(); } previous = now;
  if (!paused) {
    time += delta;
    if (started) { accumulator = Math.min(accumulator + delta, 4/60); for(let step=0;step<4 && accumulator>=1/60;step++) { player.update(1/60); accumulator -= 1/60; } }
    // Manual timeline sampling must restore enabled/time on a clamped action:
    // AnimationMixer.setTime() resets action time but leaves a finished action paused.
    cradleAction.enabled = true; cradleAction.paused = true; cradleAction.time = player.introTime; cradleMixer.update(0);
    if (player.inspector && inspectPlaying) { const clip = player.clips.get(clipSelect.value)!; inspectTime = (inspectTime + delta) % clip.duration; setPose(clip.name, inspectTime / clip.duration); }
    const pos = player.wrapper.position;
    if (started && player.state === 'intro') {
      const t = player.introTime;
      if (t < 3) { viewPosition.set(-111 + t * 2, 3 + t * 3, 56 - t * 2); viewTarget.set(-155, 35 + t * 5, 0); }
      else if (t < 6) { const u = ease((t-3)/3); viewPosition.set(-76, 60 + u*9, 90); viewTarget.set(-160, 49, 0); }
      else { const u = ease((t-6)/6),offset=new THREE.Vector3(Math.sin(1)*16*u,0,Math.cos(1)*16*u); viewTarget.copy(pos).add(new THREE.Vector3(0, 40, 0)).add(offset); viewPosition.set(pos.x - 67 * u + 60 * (1-u), 70 - u * 5, 100 * (1-u) + 105*u).add(offset); input.yaw = -1; input.pitch = -0.2; shoulderOffset=16;cameraFocusHeight=40; }
      camera.position.lerp(viewPosition, 1 - Math.exp(-delta * 4)); camera.lookAt(viewTarget);
    } else if (started) {
      const weaponView = ['aim-turn','aim','fire'].includes(player.state),
            flight = ['takeoff','hover','cruise','brake','descent'].includes(player.state),
            blend = 1 - Math.exp(-delta * 5);
      const sideSign = input.shoulderSwap ? -1 : 1;
      const targetOffset = player.inspector ? 0 : weaponView ? 36 * sideSign : 16 * sideSign;
      shoulderOffset = THREE.MathUtils.lerp(shoulderOffset, targetOffset, blend);
      cameraFocusHeight = THREE.MathUtils.lerp(cameraFocusHeight, weaponView ? 58 : 44, blend);
      viewTarget.copy(pos).add(new THREE.Vector3(-Math.sin(input.yaw)*shoulderOffset, cameraFocusHeight, Math.cos(input.yaw)*shoulderOffset));
      const look = new THREE.Vector3(Math.cos(input.yaw)*Math.cos(input.pitch), Math.sin(input.pitch), Math.sin(input.yaw)*Math.cos(input.pitch));
      lastLook.copy(look);
      const targetZoom = input.zoom - (weaponView ? 20 : 0);
      viewPosition.copy(viewTarget).addScaledVector(look, -targetZoom);
      viewPosition.y = Math.max(4.0, viewPosition.y);
      camera.position.lerp(viewPosition, 1 - Math.exp(-delta * 6));
      camera.lookAt(viewTarget);
      const targetFov = weaponView ? 42 : flight ? 54 : 48;
      camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 1 - Math.exp(-delta * 6));
      camera.updateProjectionMatrix();
    }
    if (started && player.state !== 'intro') {
      cameraRay.origin.copy(viewTarget); cameraRay.direction.copy(camera.position).sub(viewTarget).normalize();
      let distance = camera.position.distanceTo(viewTarget);
      for (const box of cameraObstacles) { const hit = cameraRay.intersectBox(box, cameraHit); if (hit) distance = Math.min(distance, Math.max(8, hit.distanceTo(viewTarget) - 2)); }
      camera.position.copy(viewTarget).addScaledVector(cameraRay.direction, distance); camera.lookAt(viewTarget);
      cameraShake.update(delta);
      cameraShake.apply(camera);
    }
    for (const target of springTargets.values()) target.update(delta);
    const aiming = started && !player.inspector && ['aim-turn','aim','fire'].includes(player.state);
    aimLabel.hidden = !aiming;
    aimLabel.textContent = player.state === 'aim-turn' ? 'ALIGNING TO CAMERA HEADING' : 'CANNON TRACE · CONVERGED AIM';
    if (aiming && combat) {
      const aimOrigin = camera.position.clone();
      const aimDir = lastLook.clone().normalize();
      const worldAimHit = traceWorld(aimOrigin, aimDir, combat.colliders, 650);
      const targetPoint = worldAimHit ? new THREE.Vector3(worldAimHit.point.x, worldAimHit.point.y, worldAimHit.point.z) : aimOrigin.clone().addScaledVector(aimDir, 650);
      combat.currentTargetPoint = targetPoint;
    } else if (combat) {
      combat.currentTargetPoint = undefined;
    }
    camera.updateMatrixWorld();
    for(const [index,side] of (['R','L'] as const).entries()) {
      const marker=aimMarkers[index]; marker.hidden=true;
      if(!aiming) continue;
      const shot=combat.aim(side),screen=shot.end.clone().project(camera);
      if(screen.z< -1 || screen.z>1 || Math.abs(screen.x)>1 || Math.abs(screen.y)>1) continue;
      marker.hidden=false; marker.classList.toggle('on-target',Boolean(shot.hit?.targetId));
      marker.style.transform=`translate(${(screen.x*.5+.5)*innerWidth}px,${(-screen.y*.5+.5)*innerHeight}px)`;
      marker.setAttribute('aria-label',`${side==='R'?'Right':'Left'} cannon ${shot.hit?.targetId?'target in line':'trajectory'}`);
    }
    weather.update(time); effects.update(delta, camera);
    const flight = ['takeoff','hover','cruise','brake','descent'].includes(player.state);
    if (flight) for (const side of ['R','L']) { const p = point('ThrusterSocket_' + side); effects.trail(p, new THREE.Vector3(-15, -22, 0).applyAxisAngle(new THREE.Vector3(0,1,0), -player.yaw), 6); }
    audio.loop('coast', started ? 0.2 : 0); audio.loop('reactor', started ? 0.14 : 0); audio.loop('thruster', flight ? 0.27 : 0); audio.loop('servo', player.state === 'walk' || player.state === 'turn' ? 0.07 : 0);
    audio.listener(camera.position, lastLook);
    for (const [id, materials] of targetMaterials) { const left = Math.max(0, (targetFlashes.get(id) ?? 0) - delta); targetFlashes.set(id, left); for (const mat of materials) { if (mat.name === 'site.cyan') mat.emissiveIntensity = 2 + left * 9; } }
  }
  renderer.render(scene, camera);
  $('skip').hidden = !started || player.state !== 'intro'; $('pilot-controls').hidden = !started || player.state === 'intro' || player.inspector;
  if (times.length % 20 === 0) {
    const stats = qa.stats(); $('state').textContent = player.inspector ? 'ANIMATION INSPECTION' : player.state === 'intro' ? 'RELEASE SEQUENCE' : player.state.toUpperCase();
    $('altitude').textContent = `${player.wrapper.position.y.toFixed(0)} M`; $('backend').textContent = `${stats.backend} · ${stats.fps.toFixed(0)} FPS`; $('stats').textContent = `${stats.calls} draw calls / ${Math.round(stats.triangles).toLocaleString()} triangles\np95 ${stats.p95.toFixed(1)} ms · p99 ${stats.p99.toFixed(1)} ms`;
    $('boost').textContent = input.boost ? 'Land' : 'Boost'; if (time > messageUntil) $('notice').textContent = '';
  }
}
window.addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
document.addEventListener('visibilitychange', () => { previous = performance.now(); input.clear(); if (document.hidden && started) togglePause(true); });
start().catch(error => { qa.errors.push(String(error)); console.error(error); $('load-status').textContent = `Could not start the scene: ${String(error)}`; $('fallback').hidden = false; });
