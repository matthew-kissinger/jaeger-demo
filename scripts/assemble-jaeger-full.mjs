import { readFile, writeFile } from 'node:fs/promises';

const parts = ['core', 'materials', 'markings', 'body', 'legs', 'arms'];
const geometry = (await Promise.all(parts.map(name => readFile(`authoring/jaeger/parts/${name}.js`, 'utf8')))).join('\n\n');
const originalMotion = await readFile('authoring/jaeger/parts/animations.js', 'utf8');

const path = 'authoring/jaeger/jaeger-full.kiln.js';
await writeFile(path, geometry + '\n\n' + originalMotion);
console.log('Assembled full Jaeger source:', path);
