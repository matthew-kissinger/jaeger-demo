import * as THREE from 'three/webgpu';
import { angleDelta, cameraTravel, clamp, ease, sweepMove, turnToward, type Obstacle } from './movement.ts';
import type { PilotInput } from './input';
import { ContactIK } from './contact-ik.ts';
export interface Site { dock: number[]; startSourceDisplacement: number[]; deck?: { min: number[]; max: number[] }; pilotBounds: { min: number[]; max: number[] }; flightBounds?: { min: number[]; max: number[] }; obstacles: Obstacle[]; targets: { id: string; center: number[]; position: number[]; radius: number; height: number; halfDepth: number; kind: 'blade' | 'cannon' }[]; waterY: number }
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
  private cruiseGrace = 0; private wasMovingFlight = false;
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
    this.input.clear(); this.velocity.set(0, 0, 0); this.yaw = 0; this.wrapper.rotation.set(0, 0, 0); this.model.rotation.set(0, 0, 0); this.pending = ''; this.flightRequest = false; this.inspector = false; this.cruiseGrace = 0; this.wasMovingFlight = false;
    this.mixer.stopAllAction(); this.faded.length = 0; this.currentClip = ''; this.wrapper.position.fromArray(this.site.dock);
    this.ik.reset();
    this.introTime = intro ? 0 : 16;
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
      if (['prepare','takeoff','descent','landing'].includes(this.state)) { this.onEvent('ground-required'); return; }
      if (['hover','cruise','brake'].includes(this.state)) {
        if (command === 'cannon') {
          this.enter('air-fire', 'CannonFire', false, 0.08);
          return;
        }
        if (['slash','combo','overhead'].includes(command)) {
          const clip = command === 'slash' ? ((this.alt = !this.alt) ? 'SlashRight' : 'SlashLeft') : command === 'combo' ? 'SlashCombo' : 'OverheadStrike';
          if (command === 'overhead') {
            this.velocity.set(0, -35, 0);
          } else {
            const fwd = new THREE.Vector3(Math.cos(this.yaw), 0, Math.sin(this.yaw)).multiplyScalar(24);
            this.velocity.copy(fwd);
          }
          this.enter('air-attack', clip, false, 0.15);
          return;
        }
      }
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
      const previous = this.introTime; this.introTime = Math.min(16, this.introTime + dt);
      const tWalk = 6.0;
      const walkDuration = 4.8 / 0.65; // 7.385s: exactly 2 full cycles of PilotWalk at timeScale 0.65
      const tStop = tWalk + walkDuration; // ~13.385s
      const stopDuration = 1.0; // PilotStop deceleration phase
      const tSettle = tStop + stopDuration; // ~14.385s
      const totalTargetDist = this.site.startSourceDisplacement[0] * this.scale; // 6.4 * 9.75 = 62.4m
      const strideSpeed = 1.25 * this.scale * 0.65; // exact foot-plant stride speed (7.92m/s)
      const walkDist = strideSpeed * walkDuration; // 58.5m
      const stopDist = totalTargetDist - walkDist; // 3.9m

      if (previous < 0.8 && this.introTime >= 0.8) this.onEvent('startup');
      if (previous < 3.0 && this.introTime >= 3.0) { this.play('Idle', true, 0.25); this.onEvent('release'); }
      if (previous < 4.2 && this.introTime >= 4.2) this.onEvent('release');
      if (previous < tWalk && this.introTime >= tWalk) {
        this.play('PilotWalk', true, 0.25);
        this.action.timeScale = 0.65;
      }
      for (const [stepTime, side] of [
        [tWalk + 1.2 / 0.65, 'L'],
        [tWalk + 2.4 / 0.65, 'R'],
        [tWalk + 3.6 / 0.65, 'L'],
        [tWalk + 4.8 / 0.65, 'R'],
      ] as const) {
        if (previous < stepTime && this.introTime >= stepTime) this.onEvent('footstep', side);
      }
      if (previous < tStop && this.introTime >= tStop) {
        this.play('PilotStop', false, 0.15);
        this.action.timeScale = 0.65;
      }
      if (previous < tSettle && this.introTime >= tSettle) {
        this.play('Idle', true, 0.25);
      }
      if (this.introTime >= 16) {
        this.enter('idle', 'Idle', true);
        this.onEvent('control');
      }

      let currentDist = 0;
      let ikState = 'idle';
      let ikElapsed = this.introTime;

      if (this.introTime < tWalk) {
        currentDist = 0;
        ikState = 'idle';
        ikElapsed = this.introTime;
      } else if (this.introTime < tStop) {
        currentDist = (this.introTime - tWalk) * strideSpeed;
        ikState = 'walk';
        ikElapsed = this.introTime - tWalk;
      } else if (this.introTime < tSettle) {
        const u = Math.min(1, Math.max(0, (this.introTime - tStop) / stopDuration));
        currentDist = walkDist + stopDist * (2 * u - u * u);
        ikState = 'stop';
        ikElapsed = (this.introTime - tStop) * 0.65;
      } else {
        currentDist = totalTargetDist;
        ikState = 'idle';
        ikElapsed = this.introTime - tSettle;
      }

      this.wrapper.position.fromArray(this.site.dock).addScaledVector(new THREE.Vector3(1, 0, 0), currentDist);
      this.mixer.update(dt);
      this.root.position.set(0, 0, 0);
      this.root.quaternion.identity();
      this.ik.update(ikState, this.action.time, ikElapsed);
      return;
    }
    const input = this.input.movement(), moving = Math.hypot(input.forward, input.right) > 0.12 && !this.pending;
    const airborne = ['hover','cruise','brake','descent','landing','takeoff','air-fire','air-attack'].includes(this.state);
    const intent = cameraTravel(input.forward, input.right, this.input.yaw, this.input.pitch, airborne);
    if (['idle','walk','turn','stop'].includes(this.state)) {
      if (moving) {
        const desired = Math.atan2(intent.z, intent.x), error = angleDelta(this.yaw, desired);
        this.yaw = turnToward(this.yaw, desired, dt * (this.state === 'walk' ? 0.85 : 1.0));
        if (Math.abs(error) > 0.25) { this.velocity.multiplyScalar(Math.exp(-dt * 9)); if (this.state !== 'turn') this.enter('turn', error > 0 ? 'PilotTurnRight' : 'PilotTurnLeft', true); }
        else {
          const speed = 2.8 * this.scale * Math.min(1, Math.hypot(input.forward, input.right));
          const target = new THREE.Vector3(Math.cos(this.yaw) * speed, 0, Math.sin(this.yaw) * speed);
          this.velocity.lerp(target, 1 - Math.exp(-dt * 3.5));
          if (this.state !== 'walk') { this.enter('walk', 'PilotWalk', true); this.action.time = 0.72; this.lastStepPhase = 0.3; }
          this.action.timeScale = (this.velocity.length() / (2.8 * this.scale)) * 1.15;
        }
      } else {
        this.velocity.multiplyScalar(Math.exp(-dt * 7));
        if (this.state === 'walk' || this.state === 'turn') this.enter('stop', 'PilotStop');
        if (this.state === 'stop' && this.elapsed > 0.65) this.enter('idle', 'Idle', true);
      }
      if (this.pending && this.state === 'idle') { const pending = this.pending; this.pending = ''; this.command(pending); }
    } else if (this.state === 'attack') {
      if (this.elapsed >= this.action.getClip().duration) this.enter('idle', 'Idle', true);
    } else if (this.state === 'air-fire') {
      this.yaw = turnToward(this.yaw, this.input.yaw, dt * 2.2);
      this.velocity.lerp(new THREE.Vector3(), 1 - Math.exp(-dt * 2.0));
      if (this.elapsed >= 1.6) this.enter('hover', 'Hover', true, 0.2);
    } else if (this.state === 'air-attack') {
      if (this.currentClip === 'OverheadStrike') {
        this.velocity.y = -35;
        if (this.wrapper.position.y <= 2 * this.scale + 0.8) {
          this.onEvent('slam-impact');
          this.wrapper.position.y = 0;
          this.enter('landing', 'Landing', false, 0.1);
        }
      } else {
        this.velocity.multiplyScalar(Math.exp(-dt * 2.5));
      }
      if (this.elapsed >= this.action.getClip().duration && this.state === 'air-attack') {
        this.enter('hover', 'Hover', true, 0.2);
      }
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
      const movingFlight = Math.hypot(input.forward, input.right) > 0.08 && !this.pending;
      this.wasMovingFlight = movingFlight;
      const target = new THREE.Vector3();
      if (movingFlight && this.state !== 'descent') target.set(intent.x, intent.y, intent.z).multiplyScalar(95);
      this.velocity.lerp(target, 1 - Math.exp(-dt * 3.0));

      const isFlyingFast = this.velocity.length() > 12;

      if ((movingFlight || isFlyingFast) && this.state !== 'descent') {
        if (movingFlight) {
          const desired = Math.atan2(intent.z, intent.x);
          const error = angleDelta(this.yaw, desired);
          this.yaw = turnToward(this.yaw, desired, dt * 2.0);
          const targetRoll = clamp(error * 0.45, -0.4, 0.4);
          this.model.rotation.x = THREE.MathUtils.damp(this.model.rotation.x, targetRoll, 6, dt);
        } else {
          this.model.rotation.x = THREE.MathUtils.damp(this.model.rotation.x, 0, 4, dt);
        }
        if (this.state !== 'cruise') {
          this.enter('cruise', 'PilotCruise', true, 0.35);
        } else if (this.currentClip !== 'PilotCruise') {
          this.play('PilotCruise', true, 0.35);
        }
      } else if (this.state === 'cruise') {
        this.model.rotation.x = THREE.MathUtils.damp(this.model.rotation.x, 0, 5, dt);
        this.enter('brake', 'PilotBrake', false, 0.3);
      } else if (this.state === 'brake' && this.elapsed > 0.65) {
        this.model.rotation.x = 0;
        this.enter('hover', 'Hover', true, 0.3);
      } else {
        this.model.rotation.x = THREE.MathUtils.damp(this.model.rotation.x, 0, 5, dt);
      }
      if (!this.flightRequest && this.velocity.length() < 2 && this.state !== 'descent') {
        const p = this.wrapper.position;
        // Check if over an obstacle
        const blocked = this.obstacles.some(box => p.x + 9 > box.min[0] && p.x - 9 < box.max[0] && p.z + 9 > box.min[2] && p.z - 9 < box.max[2]);
        // Check if outside deck pilotBounds — can't land off-deck
        const offDeck = p.x < this.site.pilotBounds.min[0] || p.x > this.site.pilotBounds.max[0] || p.z < this.site.pilotBounds.min[2] || p.z > this.site.pilotBounds.max[2];
        if (blocked) { if (!this.landingBlocked) this.onEvent('landing-blocked'); this.landingBlocked = true; }
        else if (offDeck) { if (!this.landingBlocked) this.onEvent('off-deck'); this.landingBlocked = true; }
        else { this.landingBlocked = false; this.state = 'descent'; }
      }
      if (this.state === 'descent') {
        this.model.rotation.x = THREE.MathUtils.damp(this.model.rotation.x, 0, 6, dt);
        this.wrapper.position.y = Math.max(2 * this.scale, this.wrapper.position.y - dt * 28);
        if (this.wrapper.position.y <= 2 * this.scale + 0.01) { this.landingHeight = this.wrapper.position.y; this.enter('landing', 'Landing', false, 0.1); }
      }
    } else if (this.state === 'landing') {
      this.model.rotation.x = 0;
      this.wrapper.position.y = this.landingHeight * (1 - ease(this.elapsed / 0.68)); this.velocity.set(0, 0, 0);
      this.eventCross(before, 0.68, 'landing');
      if (this.elapsed >= 2) { this.wrapper.position.y = 0; this.enter('idle', 'Idle', true); }
    }
    const next = sweepMove(this.wrapper.position, this.velocity.clone().multiplyScalar(dt), 9, airborne ? [] : this.obstacles);
    const bounds = airborne && this.site.flightBounds ? this.site.flightBounds : this.site.pilotBounds;
    this.wrapper.position.x = clamp(next.x, bounds.min[0], bounds.max[0]);
    this.wrapper.position.z = clamp(next.z, bounds.min[2], bounds.max[2]);
    if (['hover','cruise','brake','air-fire'].includes(this.state)) this.wrapper.position.y = clamp(next.y, 2 * this.scale, bounds.max[1]);
    if (this.state === 'air-attack') this.wrapper.position.y = clamp(next.y, 0, bounds.max[1]);
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
