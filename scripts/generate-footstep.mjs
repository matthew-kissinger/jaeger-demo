#!/usr/bin/env node
/**
 * Generate a new heavy mech footstep sound via ElevenLabs API.
 * 
 * Usage:
 *   ELEVENLABS_API_KEY=your_key node scripts/generate-footstep.mjs
 * 
 * Writes the output to public/audio/footstep.mp3, replacing the existing file.
 */
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputPath = join(__dirname, '..', 'public', 'audio', 'footstep.mp3');

const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey) {
  console.error('Error: ELEVENLABS_API_KEY environment variable is required.');
  console.error('Usage: ELEVENLABS_API_KEY=your_key node scripts/generate-footstep.mjs');
  process.exit(1);
}

const prompt = `One colossal eighty-metre armored mech foot slams onto a thick reinforced concrete dock. Overwhelming deep bass ground impact thud that shakes the earth, heavy sub-bass rumble, distant structural groan, very brief gritty concrete dust tail. Massive weight, seismic scale. One impact right at the start, deep controlled transient, no metallic clink, no explosion, no music or voices.`;

console.log('Generating new footstep sound with ElevenLabs...');
console.log(`Prompt: ${prompt}`);
console.log(`Duration: 2.0s, Prompt influence: 0.5`);

const response = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
  method: 'POST',
  headers: {
    'xi-api-key': apiKey,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    text: prompt,
    duration_seconds: 2.0,
    prompt_influence: 0.5,
  }),
});

if (!response.ok) {
  const errorText = await response.text();
  console.error(`ElevenLabs API error (${response.status}): ${errorText}`);
  process.exit(1);
}

const buffer = Buffer.from(await response.arrayBuffer());
writeFileSync(outputPath, buffer);

console.log(`New footstep sound written to ${outputPath} (${buffer.length} bytes)`);
console.log('  Update manifest.json sha256 and bytes if needed.');
