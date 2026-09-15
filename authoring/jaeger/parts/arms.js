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
