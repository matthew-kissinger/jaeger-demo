import * as THREE from 'three/webgpu';
import { angleDelta, cameraTravel, clamp, ease, sweepMove, turnToward, type Obstacle } from './movement.ts';
import type { PilotInput } from './input';
import { ContactIK } from './contact-ik.ts';
export interface Site { dock: number[]; startSourceDisplacement: number[]; pilotBounds: { min: number[]; max: number[] }; obstacles: Obstacle[]; targets: { id: string; center: number[]; position: number[]; radius: number; height: number; halfDepth: number; kind: 'blade' | 'cannon' }[]; waterY: number }
export type PoseFrame = { actionId: number; state: string; clip: string; previousTime: number; time: number };
export class JaegerPlayer {
  readonly wrapper = new THREE.Group(); readonly mixer: THREE.AnimationMixer; readonly scale: number;
  readonly clips: Map<string, THREE.AnimationClip>; state = 'intro'; elapsed = 0; introTime = 0; yaw = 0;
  readonly ik: ContactIK;
  velocity = new THREE.Vector3(); root: THREE.Object3D; action!: THREE.AnimationAction; currentClip = '';
  onEvent: (name: string, side?: string) => void = () => {}; pending = ''; paused = false; inspector = false;
  onPose: (frame: PoseFrame, dt: number) => void = () => {}; private actionSerial = 0;
  private rawClips: Map<string, THREE.AnimationClip>; private alt = false; private flightRequest = false; private landingHeight = 0;
  model: THREE.Group;
  input: PilotInput;
  site: Site;
  private landingBlocked = false;
  private obstacles: Obstacle[];
  private lastStepPhase = 0; private faded: { action: THREE.AnimationAction; until: number }[] = []; private total = 0;
  constructor(model: THREE.Group, animations: THREE.AnimationClip[], input: PilotInput, site: Site) {
    this.model = model; this.input = input; this.site = site;
    this.obstacles = [...site.obstacles, ...site.targets.map(t => ({ min: [t.position[0] - t.radius, 0, t.position[2] - t.radius], max: [t.position[0] + t.radius, t.height, t.position[2] + t.radius] }))];
    const bounds = new THREE.Box3().setFromObject(model); this.scale = 79.25 / (bounds.max.y - bounds.min.y);
    this.wrapper.scale.setScalar(this.scale); this.wrapper.add(model); this.wrapper.position.fromArray(site.dock);
    this.root = model.getObjectByName('Joint_MotionRoot')!;
    this.mixer = new THREE.AnimationMixer(model); this.rawClips = new Map(animations.map(clip => [clip.name, clip]));
    this.ik = new ContactIK(model, this.wrapper, this.scale);
    this.clips = new Map(animations.map(clip => {
      const copy = clip.clone(); copy.tracks = copy.tracks.filter(track => !track.name.startsWith('Joint_MotionRoot.')); return [copy.name, copy];
    }));
    this.play('PilotActivation', false, 0);
  }
  play(name: string, loop = false, fade = 0.22) {
    if (this.currentClip === name && loop) return;
    const next = this.mixer.clipAction(this.clips.get(name)!);
    if (this.action && this.action !== next) { this.action.fadeOut(fade); this.faded.push({ action: this.action, until: this.total + fade }); }
    next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1); next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1); next.clampWhenFinished = true; next.fadeIn(fade).play();
    this.action = next; this.currentClip = name;
    this.actionSerial++;
  }
  enter(state: string, clip: string, loop = false, fade = 0.22) { this.state = state; this.elapsed = 0; this.play(clip, loop, fade); }
  reset(intro = false) {
    this.input.clear(); this.velocity.set(0, 0, 0); this.yaw = 0; this.wrapper.rotation.set(0, 0, 0); this.pending = ''; this.flightRequest = false; this.inspector = false;
    this.mixer.stopAllAction(); this.faded.length = 0; this.currentClip = ''; this.wrapper.position.fromArray(this.site.dock);
    this.ik.reset();
    this.introTime = intro ? 0 : 12;
    if (intro) this.enter('intro', 'PilotActivation', false, 0);
    else { this.wrapper.position.addScaledVector(new THREE.Vector3().fromArray(this.site.startSourceDisplacement), this.scale); this.enter('idle', 'Idle', true, 0); }
    this.onEvent('reset');
  }
  command(command: string) {
    if (command === 'reset') { this.reset(); return; }
    if (command === 'replay') { this.reset(true); return; }
    if (command === 'skip') { this.reset(); return; }
    if (this.paused || this.inspector || this.state === 'intro') return;
    if (command === 'boost' || command === 'hop') { this.flightRequest = command === 'boost'; if (['idle','walk','turn','stop'].includes(this.state)) { this.velocity.set(0, 0, 0); this.enter('prepare', 'JumpPrepare'); } return; }
    if (command === 'brake') { this.input.keys.clear(); this.input.forward = this.input.right = 0; return; }
    if (['slash','combo','overhead','cannon','recovery'].includes(command)) {
      if (['prepare','takeoff','hover','cruise','brake','descent','landing'].includes(this.state)) { this.onEvent('ground-required'); return; }
      if (['walk','turn','stop'].includes(this.state)) { this.pending = command; if(this.state !== 'stop') this.enter('stop','PilotStop'); return; }
      if (!['idle','walk','turn','stop'].includes(this.state)) { this.pending = command; return; }
      this.velocity.set(0, 0, 0);
      if (command === 'cannon') { const error = angleDelta(this.yaw, this.input.yaw); if (Math.abs(error) > 0.12) this.enter('aim-turn', error > 0 ? 'PilotTurnRight' : 'PilotTurnLeft', true); else this.enter('aim', 'CannonAim'); }
      else { const clip = command === 'slash' ? (this.alt = !this.alt) ? 'SlashRight' : 'SlashLeft' : command === 'combo' ? 'SlashCombo' : command === 'overhead' ? 'OverheadStrike' : 'HitRecovery'; this.enter('attack', clip); }
    }
  }
  inspect(name: string, phase: number) {
    this.inspector = true; this.velocity.set(0, 0, 0); this.mixer.stopAllAction(); this.faded.length = 0;
    const clip = this.rawClips.get(name)!; const action = this.mixer.clipAction(clip); action.reset().setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; action.play(); this.mixer.setTime(clip.duration * phase); this.model.updateMatrixWorld(true);
  }
  private eventCross(before: number, time: number, event: string, side?: string) { if (before < time && this.elapsed >= time) this.onEvent(event, side); }
  update(dt: number) {
    if (this.paused || this.inspector) return;
    this.total += dt; const before = this.elapsed; this.elapsed += dt;
    if (this.state === 'intro') {
      const previous = this.introTime; this.introTime = Math.min(12, this.introTime + dt);
      if (previous < 0.8 && this.introTime >= 0.8) this.onEvent('startup');
      if (previous < 3 && this.introTime >= 3) { this.play('Idle', true); this.onEvent('release'); }
      if (previous < 4.2 && this.introTime >= 4.2) this.onEvent('release');
      if (previous < 6 && this.introTime >= 6) { this.play('Walk', false, 0.2); this.action.timeScale = 0.7; }
      if (this.introTime >= 6 && this.introTime <= 10) {
        this.wrapper.position.fromArray(this.site.dock).addScaledVector(new THREE.Vector3().fromArray(this.site.startSourceDisplacement), this.scale * ease((this.introTime - 6) / 4));
        for (const time of [6.89,7.74,8.89,9.74]) if (previous < time && this.introTime >= time) this.onEvent('footstep');
      }
      if (previous < 10 && this.introTime >= 10) { this.wrapper.position.fromArray(this.site.dock).addScaledVector(new THREE.Vector3().fromArray(this.site.startSourceDisplacement), this.scale); this.play('Idle', true); }
      if (this.introTime >= 12) { this.enter('idle', 'Idle', true); this.onEvent('control'); }
      this.mixer.update(dt); this.root.position.set(0, 0, 0); this.root.quaternion.identity(); return;
    }
    const input = this.input.movement(), moving = Math.hypot(input.forward, input.right) > 0.12 && !this.pending;
    const airborne = ['hover','cruise','brake','descent','landing','takeoff'].includes(this.state);
    const intent = cameraTravel(input.forward, input.right, this.input.yaw, this.input.pitch, airborne);
    if (['idle','walk','turn','stop'].includes(this.state)) {
      if (moving) {
        const desired = Math.atan2(intent.z, intent.x), error = angleDelta(this.yaw, desired);
        this.yaw = turnToward(this.yaw, desired, dt * (this.state === 'walk' ? 0.65 : 1.0));
        if (Math.abs(error) > 0.25) { this.velocity.multiplyScalar(Math.exp(-dt * 9)); if (this.state !== 'turn') this.enter('turn', error > 0 ? 'PilotTurnRight' : 'PilotTurnLeft', true); }
        else {
          const speed = 1.65 * this.scale * Math.min(1, Math.hypot(input.forward, input.right));
          const target = new THREE.Vector3(Math.cos(this.yaw) * speed, 0, Math.sin(this.yaw) * speed);
          this.velocity.lerp(target, 1 - Math.exp(-dt * 3.5));
          if (this.state !== 'walk') { this.enter('walk', 'PilotWalk', true); this.action.time = 0.72; this.lastStepPhase = 0.3; }
          this.action.timeScale = (this.velocity.length() / (1.65 * this.scale)) * 1.15;
        }
      } else {
        this.velocity.multiplyScalar(Math.exp(-dt * 7));
        if (this.state === 'walk' || this.state === 'turn') this.enter('stop', 'PilotStop');
        if (this.state === 'stop' && this.elapsed > 0.65) this.enter('idle', 'Idle', true);
      }
      if (this.pending && this.state === 'idle') { const pending = this.pending; this.pending = ''; this.command(pending); }
    } else if (this.state === 'attack') {
      if (this.elapsed >= this.action.getClip().duration) this.enter('idle', 'Idle', true);
    } else if (this.state === 'aim-turn') {
      this.yaw = turnToward(this.yaw, this.input.yaw, dt * 0.9);
      if (Math.abs(angleDelta(this.yaw, this.input.yaw)) < 0.06) this.enter('aim', 'CannonAim');
    } else if (this.state === 'aim') {
      if (this.elapsed >= 1.2) this.enter('fire', 'CannonFire', false, 0.08);
    } else if (this.state === 'fire') {
      if (this.elapsed >= 1.8) this.enter('idle', 'Idle', true);
    } else if (this.state === 'prepare') {
      if (this.elapsed >= 1.1) { this.enter('takeoff', 'Takeoff', false, 0); this.onEvent('thruster-start'); }
    } else if (this.state === 'takeoff') {
      this.wrapper.position.y = this.elapsed < 0.24 ? 0 : 2 * this.scale * (1 - Math.pow(1 - clamp((this.elapsed - 0.24) / 1.11, 0, 1), 2));
      if (this.elapsed >= 1.35) this.enter('hover', 'Hover', true, 0.15);
    } else if (['hover','cruise','brake','descent'].includes(this.state)) {
      if (!this.input.boost) this.flightRequest = false;
      if (this.input.boost) this.flightRequest = true;
      const target = new THREE.Vector3();
      if (moving && this.state !== 'descent') target.set(intent.x, intent.y, intent.z).multiplyScalar(55);
      this.velocity.lerp(target, 1 - Math.exp(-dt * 3.0));
      if (moving && this.state !== 'descent') {
        const desired = Math.atan2(intent.z, intent.x), error = angleDelta(this.yaw, desired); this.yaw = turnToward(this.yaw, desired, dt * 1.3);
        const clip = Math.abs(error) > 0.2 ? error > 0 ? 'PilotBankRight' : 'PilotBankLeft' : 'PilotCruise';
        if (this.currentClip !== clip) this.play(clip, true, 0.3); this.state = 'cruise';
      } else if (this.state === 'cruise') this.enter('brake', 'PilotBrake', false, 0.16);
      else if (this.state === 'brake' && this.elapsed > 0.6) this.enter('hover', 'Hover', true);
      if (!this.flightRequest && this.velocity.length() < 2 && this.state !== 'descent') {
        const p = this.wrapper.position;
        const blocked = this.obstacles.some(box => p.x + 9 > box.min[0] && p.x - 9 < box.max[0] && p.z + 9 > box.min[2] && p.z - 9 < box.max[2]);
        if (blocked) { if (!this.landingBlocked) this.onEvent('landing-blocked'); this.landingBlocked = true; }
        else { this.landingBlocked = false; this.state = 'descent'; }
      }
      if (this.state === 'descent') {
        this.wrapper.position.y = Math.max(2 * this.scale, this.wrapper.position.y - dt * 28);
        if (this.wrapper.position.y <= 2 * this.scale + 0.01) { this.landingHeight = this.wrapper.position.y; this.enter('landing', 'Landing', false, 0.1); }
      }
    } else if (this.state === 'landing') {
      this.wrapper.position.y = this.landingHeight * (1 - ease(this.elapsed / 0.68)); this.velocity.set(0, 0, 0);
      this.eventCross(before, 0.68, 'landing');
      if (this.elapsed >= 2) { this.wrapper.position.y = 0; this.enter('idle', 'Idle', true); }
    }
    const next = sweepMove(this.wrapper.position, this.velocity.clone().multiplyScalar(dt), 9, this.obstacles);
    this.wrapper.position.x = clamp(next.x, this.site.pilotBounds.min[0], this.site.pilotBounds.max[0]);
    this.wrapper.position.z = clamp(next.z, this.site.pilotBounds.min[2], this.site.pilotBounds.max[2]);
    if (['hover','cruise','brake'].includes(this.state)) this.wrapper.position.y = clamp(next.y, 2 * this.scale, this.site.pilotBounds.max[1]);
    this.wrapper.rotation.y = -this.yaw;
    const previousTime = this.action.time;
    this.mixer.update(dt); this.root.position.set(0, 0, 0); this.root.quaternion.identity();
    this.ik.update(this.state, this.action.time, this.elapsed);
    this.wrapper.updateMatrixWorld(true);
    this.onPose({ actionId: this.actionSerial, state: this.state, clip: this.currentClip, previousTime, time: this.action.time }, dt);
    if (this.state === 'walk') { const phase = this.action.time / 2.4; if (phase < this.lastStepPhase || (this.lastStepPhase < 0.5 && phase >= 0.5)) this.onEvent('footstep'); this.lastStepPhase = phase; }
    this.faded = this.faded.filter(item => { if (item.until <= this.total && item.action !== this.action) { item.action.stop(); return false; } return true; });
  }
}
