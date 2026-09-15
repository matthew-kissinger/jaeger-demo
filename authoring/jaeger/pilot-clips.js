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
