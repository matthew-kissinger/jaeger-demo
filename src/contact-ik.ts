import * as THREE from 'three/webgpu';
import { clamp, ease } from './movement.ts';
type Foot = { hip: THREE.Object3D; knee: THREE.Object3D; ankle: THREE.Object3D; target: THREE.Vector3; rotation: THREE.Quaternion; planted: boolean; settleStart: THREE.Vector3 };
/** Analytic two-bone contact correction for a rigid mechanical leg, no physics solver. */
export class ContactIK {
  private feet = new Map<string, Foot>(); private previousState = ''; private active = false;
  maxCorrection = 0; maxReachError = 0;
  maxContactError = 0;
  worstReach: { state: string; time: number; side: string; error: number } | null = null;
  model: THREE.Object3D;
  wrapper: THREE.Object3D;
  scale: number;
  constructor(model: THREE.Object3D, wrapper: THREE.Object3D, scale: number) {
    this.model = model; this.wrapper = wrapper; this.scale = scale;
    for (const side of ['R','L']) this.feet.set(side, { hip: model.getObjectByName('Joint_Hip_'+side)!, knee: model.getObjectByName('Joint_Knee_'+side)!, ankle: model.getObjectByName('Joint_Ankle_'+side)!, target: new THREE.Vector3(), rotation: new THREE.Quaternion(), planted: false, settleStart: new THREE.Vector3() });
  }
  reset() { this.active = false; this.previousState = ''; for (const foot of this.feet.values()) foot.planted = false; }
  update(state: string, clipTime: number, elapsed: number) {
    const grounded = ['idle','walk','turn','aim-turn','stop','aim','fire','attack','prepare'].includes(state);
    if (!grounded) { this.reset(); return; }
    this.wrapper.updateMatrixWorld(true);
    const planned: { side: string; foot: Foot; animated: THREE.Vector3; orientation: THREE.Quaternion; planted: boolean; weight: number }[] = [];
    for (const [side, foot] of this.feet) {
      const animated = foot.ankle.getWorldPosition(new THREE.Vector3()), orientation = foot.ankle.getWorldQuaternion(new THREE.Quaternion());
      let planted = true, weight = 1.0;
      if (state === 'walk') {
        const legPhase = ((clipTime / 2.4 + (side === 'L' ? 0.5 : 0)) % 1);
        planted = legPhase < 0.6;
        if (legPhase >= 0.50 && legPhase < 0.60) weight = 1 - ease((legPhase - 0.50) / 0.10);
        else if (legPhase >= 0.60) weight = 0.0;
      }
      if (state === 'turn' || state === 'aim-turn') { const phase = clipTime / 1.2 % 1; planted = side === 'L' ? phase >= 0.5 : phase < 0.5; }
      if (!this.active || (planted && !foot.planted) || (planted && this.previousState !== state)) { foot.target.copy(animated); foot.rotation.copy(orientation); }
      if (state === 'stop') {
        if (this.previousState !== 'stop') foot.settleStart.copy(foot.target);
        const u = clamp((elapsed - (side === 'R' ? 0 : 0.3)) / 0.32, 0, 1);
        // Settle the two feet sequentially toward the authored standing pose.
        // At either endpoint the other foot remains planted; no simultaneous slide.
        const destination = animated.clone(); destination.y = this.wrapper.position.y + 0.68 * this.scale;
        foot.target.copy(foot.settleStart).lerp(destination, ease(u));
        foot.target.y += Math.sin(Math.PI*u) * this.scale * 0.13;
        foot.rotation.slerp(orientation, ease(u)); planted = true;
      }
      planned.push({ side, foot, animated, orientation, planted, weight });
    }
    // A bounded pelvis adjustment creates knee slack during the final portion of
    // a turn or staggered stop. Lower the common parent before solving either leg.
    let drop = 0;
    for (const item of planned) if (item.planted && item.weight > 0) {
      const local = item.foot.hip.parent!.worldToLocal(item.foot.target.clone()).sub(item.foot.hip.position);
      const maxVertical = Math.sqrt(Math.max(0, 3.568 * 3.568 - local.x * local.x - local.z * local.z));
      drop = Math.max(drop, Math.max(0, -local.y - maxVertical));
    }
    const pelvis = planned[0].foot.hip.parent!; pelvis.position.y -= Math.min(0.08, drop); pelvis.updateWorldMatrix(true, true);
    for (const { side, foot, animated, orientation, planted, weight } of planned) {
      if (planted && weight > 0) { const oldMaximum = this.maxReachError; this.solve(foot, animated, weight); if (this.maxReachError > oldMaximum) this.worstReach = { state, time: clipTime, side, error: this.maxReachError }; }
      else { foot.target.copy(animated); foot.rotation.copy(orientation); }
      foot.planted = planted;
    }
    this.active = true; this.previousState = state; this.wrapper.updateMatrixWorld(true);
    for (const { foot, planted, weight } of planned) if (planted && weight >= 0.99) this.maxContactError = Math.max(this.maxContactError, foot.ankle.getWorldPosition(new THREE.Vector3()).distanceTo(foot.target));
  }
  private solve(foot: Foot, animated: THREE.Vector3, weight = 1.0) {
    const parent = foot.hip.parent!, local = parent.worldToLocal(foot.target.clone()).sub(foot.hip.position);
    const upper = 1.85, lower = 1.72, yz = Math.hypot(local.y, local.z), raw = local.length(), d = clamp(raw, Math.abs(upper-lower)+0.00001, upper+lower-0.00001);
    this.maxReachError = Math.max(this.maxReachError, Math.abs(raw-d)*this.scale);
    this.maxCorrection = Math.max(this.maxCorrection, animated.distanceTo(foot.target));
    const bend = Math.acos(clamp((d*d-upper*upper-lower*lower)/(2*upper*lower),-1,1));
    const hipZ = Math.atan2(local.x,yz) + Math.acos(clamp((upper*upper+d*d-lower*lower)/(2*upper*d),-1,1));
    if (weight >= 0.999) {
      foot.hip.rotation.set(Math.atan2(-local.z,-local.y),0,hipZ,'XYZ'); foot.knee.rotation.set(0,0,-bend);
      foot.hip.updateWorldMatrix(true,true);
      foot.ankle.quaternion.copy(foot.knee.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(foot.rotation));
    } else {
      const animHipQ = foot.hip.quaternion.clone();
      const animKneeQ = foot.knee.quaternion.clone();
      const animAnkleQ = foot.ankle.quaternion.clone();
      const ikHipQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.atan2(-local.z,-local.y), 0, hipZ, 'XYZ'));
      const ikKneeQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -bend, 'XYZ'));
      foot.hip.quaternion.copy(animHipQ).slerp(ikHipQ, weight);
      foot.knee.quaternion.copy(animKneeQ).slerp(ikKneeQ, weight);
      foot.hip.updateWorldMatrix(true, true);
      const ikAnkleQ = foot.knee.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(foot.rotation);
      foot.ankle.quaternion.copy(animAnkleQ).slerp(ikAnkleQ, weight);
    }
  }
}
