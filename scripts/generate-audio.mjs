// Explicitly authorized offline ElevenLabs SFX generation. Never run during build/CI.
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const key = process.env.ELEVENLABS_API_KEY;
if (!key) throw new Error('ELEVENLABS_API_KEY is not available in this process');
const cues = JSON.parse(await readFile('authoring/audio/cues.json', 'utf8'));
await mkdir('public/audio', { recursive: true }); await mkdir('evidence/audio', { recursive: true });
for (const cue of cues) {
  const file = `public/audio/${cue.id}.mp3`, receipt = `evidence/audio/${cue.id}.json`;
  try { await access(file); await access(receipt); console.log(`${cue.id}: retained existing take`); continue; } catch {}
  const request = { text: cue.text, duration_seconds: cue.duration, loop: cue.loop, prompt_influence: 0.4, model_id: 'eleven_text_to_sound_v2' };
  const response = await fetch('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128', { method: 'POST', headers: { 'xi-api-key': key, 'content-type': 'application/json' }, body: JSON.stringify(request), signal: AbortSignal.timeout(180000) });
  if (!response.ok) throw new Error(`Sound generation ${cue.id} returned HTTP ${response.status}; no automatic paid retry`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 2000) throw new Error(`Unexpected short audio for ${cue.id}`);
  await writeFile(file, bytes);
  const record = { id: cue.id, path: `audio/${cue.id}.mp3`, provider: 'ElevenLabs', request, format: 'mp3_44100_128', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), characterCost: response.headers.get('character-cost'), requestId: response.headers.get('request-id'), review: 'pending audition and in-scene mix' };
  await writeFile(receipt, JSON.stringify(record, null, 2)); console.log(`${cue.id}: ${bytes.length} bytes; billing characters ${record.characterCost ?? 'unavailable'}`);
}
const records = await Promise.all(cues.map(cue => readFile(`evidence/audio/${cue.id}.json`, 'utf8').then(JSON.parse)));
await writeFile('public/audio/manifest.json', JSON.stringify({ version: 1, cues: records }, null, 2));
