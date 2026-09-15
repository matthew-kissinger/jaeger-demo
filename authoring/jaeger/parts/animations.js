// Complete mechanical Jaeger motion. Native Kiln animation helpers, metres, degrees.
// The leg solver keeps world-space ankle targets fixed during planted phases.
// The host's current export envelope permits at most 256 tracks per execution.
// Assemble with 'ground-combat' then 'boost-weapons'; package their native GLB clips
// onto the same node graph. 'all' is the full authoring definition, 359 tracks.
const JAEGER_MOTION_BATCH = 'all';
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
  root.userData.animationContract = contract;
  return clips;
}
