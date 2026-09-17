import { execSync } from 'node:child_process';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const cues = [
  // Loops: preserve stereo and exact timing for seamless loops
  { id: 'coast', isLoop: true, channels: 2, bitrate: '96k', trim: null },
  { id: 'reactor', isLoop: true, channels: 2, bitrate: '96k', trim: null },
  { id: 'thruster', isLoop: true, channels: 2, bitrate: '96k', trim: null },
  { id: 'servo', isLoop: true, channels: 1, bitrate: '96k', trim: null }, // servo is spatial joint sound

  // Spatial one-shots: convert to mono (crucial for Web Audio PannerNode) and trim trailing silence
  { id: 'blade', isLoop: false, channels: 1, bitrate: '96k', trim: 0.85 },
  { id: 'cannon', isLoop: false, channels: 1, bitrate: '96k', trim: 1.35 },
  { id: 'impact', isLoop: false, channels: 1, bitrate: '96k', trim: 0.95 },
  { id: 'footstep', isLoop: false, channels: 1, bitrate: '96k', trim: 1.55 },
  { id: 'landing', isLoop: false, channels: 1, bitrate: '96k', trim: 1.75 },
  { id: 'thruster-start', isLoop: false, channels: 1, bitrate: '96k', trim: 1.85 },
  { id: 'release', isLoop: false, channels: 1, bitrate: '96k', trim: 2.8 },
  { id: 'startup', isLoop: false, channels: 1, bitrate: '96k', trim: 3.4 },
];

console.log('Optimizing audio files...');
let totalBefore = 0;
let totalAfter = 0;

for (const cue of cues) {
  const input = path.join('public', 'audio', `${cue.id}.mp3`);
  const output = path.join('output', 'audio-opt', `${cue.id}.mp3`);

  const beforeStat = await stat(input);
  totalBefore += beforeStat.size;

  const filters = [];
  if (cue.trim) {
    // gentle 50ms fade out at the trimmed end to avoid clicks
    const fadeStart = (cue.trim - 0.05).toFixed(3);
    filters.push(`afade=t=out:st=${fadeStart}:d=0.05`);
  }

  const filterArg = filters.length > 0 ? `-af "${filters.join(',')}"` : '';
  const timeArg = cue.trim ? `-t ${cue.trim}` : '';

  // Use ffmpeg to encode with standard mp3, specified channels and clean CBR/bitrate
  const cmd = `ffmpeg -y -v error -i "${input}" ${timeArg} ${filterArg} -ac ${cue.channels} -ar 44100 -b:a ${cue.bitrate} -id3v2_version 3 "${output}"`;
  execSync(cmd, { stdio: 'inherit' });

  const afterStat = await stat(output);
  totalAfter += afterStat.size;

  const savings = ((1 - afterStat.size / beforeStat.size) * 100).toFixed(1);
  console.log(`  ${cue.id.padEnd(15)}: ${beforeStat.size.toString().padStart(6)} B -> ${afterStat.size.toString().padStart(6)} B (-${savings}%, ${cue.channels === 1 ? 'mono' : 'stereo'})`);
}

console.log(`\nTotal: ${(totalBefore / 1024).toFixed(1)} KB -> ${(totalAfter / 1024).toFixed(1)} KB (-${((1 - totalAfter / totalBefore) * 100).toFixed(1)}% savings)`);

// Verify that every single generated file decodes perfectly in Chrome
import { chromium } from '@playwright/test';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();

console.log('\nVerifying decoding of all optimized files in browser engine...');
for (const cue of cues) {
  const filePath = path.resolve('output', 'audio-opt', `${cue.id}.mp3`);
  const fileBuf = await readFile(filePath);
  const result = await page.evaluate(async (base64) => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    try {
      const decoded = await ctx.decodeAudioData(bytes.buffer);
      return {
        ok: true,
        duration: decoded.duration,
        channels: decoded.numberOfChannels,
        sampleRate: decoded.sampleRate
      };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }, fileBuf.toString('base64'));

  if (!result.ok) {
    throw new Error(`Failed to decode ${cue.id}: ${result.error}`);
  }
  console.log(`  ✓ ${cue.id.padEnd(15)}: ${result.duration.toFixed(2)}s, ${result.channels}ch, ${result.sampleRate}Hz`);
}

await browser.close();
console.log('\nAll 12 optimized audio files decoded cleanly with zero errors!');

// Apply optimized files to public/audio and update manifest.json
import { copyFile } from 'node:fs/promises';

const manifestPath = path.join('public', 'audio', 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

for (const cue of cues) {
  const src = path.join('output', 'audio-opt', `${cue.id}.mp3`);
  const dest = path.join('public', 'audio', `${cue.id}.mp3`);
  await copyFile(src, dest);

  const buf = await readFile(dest);
  const sha256 = createHash('sha256').update(buf).digest('hex');

  const manifestCue = manifest.cues.find(c => c.id === cue.id);
  if (manifestCue) {
    manifestCue.bytes = buf.length;
    manifestCue.sha256 = sha256;
    manifestCue.format = cue.channels === 1 ? 'mp3_44100_96_mono' : 'mp3_44100_96_stereo';
  }
}

await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log('\nSuccessfully applied optimized audio files and updated public/audio/manifest.json!');


