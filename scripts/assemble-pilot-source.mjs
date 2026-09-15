import { readFile, writeFile } from 'node:fs/promises';
const parts = ['core', 'materials', 'markings', 'body', 'legs', 'arms'];
const geometry = (await Promise.all(parts.map(name => readFile(`authoring/jaeger/parts/${name}.js`, 'utf8')))).join('\n\n');
const originalMotion = await readFile('authoring/jaeger/parts/animations.js', 'utf8');
const pilot = await readFile('authoring/jaeger/pilot-clips.js', 'utf8');
for (const batch of ['ground', 'flight']) {
  const allowed = batch === 'ground' ? ['PilotActivation','PilotWalk','PilotTurnLeft','PilotTurnRight','PilotStop'] : ['PilotCruise','PilotBankLeft','PilotBankRight','PilotBrake'];
  const motion = originalMotion.replace("const JAEGER_MOTION_BATCH = 'all';", "const JAEGER_MOTION_BATCH = 'pilot';")
    .replace('contract.clips[name] = { duration, ...info };', `contract.clips[name] = { duration, ...info };\n    if (!${JSON.stringify(allowed)}.includes(name)) return;`)
    .replace('  root.userData.animationContract = contract;', pilot + '\n  root.userData.animationContract = contract;');
  const path = `authoring/jaeger/pilot-${batch}.kiln.js`;
  await writeFile(path, geometry + '\n' + motion); console.log(path);
}
