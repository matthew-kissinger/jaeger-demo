import type { Point } from './movement';
export class SceneAudio {
  context: AudioContext | null = null; muted = false; ready = false;
  private buffers = new Map<string, AudioBuffer>(); private loops = new Map<string, { source: AudioBufferSourceNode; gain: GainNode }>();
  private voices = new Set<AudioBufferSourceNode>(); private master: GainNode | null = null;
  async load() {
    this.context = new AudioContext(); this.master = this.context.createGain(); this.master.gain.value = 0.55; this.master.connect(this.context.destination);
    const manifest = await fetch(import.meta.env.BASE_URL + 'audio/manifest.json').then(r => r.json());
    await Promise.all(manifest.cues.map(async (cue: { id: string; path: string }) => {
      const data = await fetch(import.meta.env.BASE_URL + cue.path).then(r => r.arrayBuffer());
      this.buffers.set(cue.id, await this.context!.decodeAudioData(data));
    })); this.ready = true;
  }
  async unlock() { if (this.context?.state === 'suspended') await this.context.resume(); }
  play(id: string, volume = 1, point?: Point) {
    if (!this.ready || !this.context || !this.master || this.voices.size >= 12) return;
    const source = this.context.createBufferSource(), gain = this.context.createGain(); source.buffer = this.buffers.get(id)!; if (!source.buffer) return;
    gain.gain.value = volume; source.connect(gain);
    if (point) { const pan = this.context.createPanner(); pan.distanceModel = 'inverse'; pan.refDistance = 90; pan.maxDistance = 800; pan.rolloffFactor = 1.1; pan.positionX.value = point.x; pan.positionY.value = point.y; pan.positionZ.value = point.z; gain.connect(pan); pan.connect(this.master); source.onended = () => { this.voices.delete(source); pan.disconnect(); gain.disconnect(); }; }
    else { gain.connect(this.master); source.onended = () => { this.voices.delete(source); gain.disconnect(); }; }
    this.voices.add(source); source.start();
  }
  loop(id: string, volume: number) {
    if (!this.ready || !this.context || !this.master) return;
    let loop = this.loops.get(id);
    if (!loop) { const source = this.context.createBufferSource(), gain = this.context.createGain(); source.buffer = this.buffers.get(id)!; if (!source.buffer) return; source.loop = true; gain.gain.value = 0; source.connect(gain); gain.connect(this.master); source.start(); loop = { source, gain }; this.loops.set(id, loop); }
    loop.gain.gain.setTargetAtTime(volume, this.context.currentTime, 0.15);
  }
  listener(position: Point, direction: Point) { if (!this.context) return; const l = this.context.listener; l.positionX.value = position.x; l.positionY.value = position.y; l.positionZ.value = position.z; l.forwardX.value = direction.x; l.forwardY.value = direction.y; l.forwardZ.value = direction.z; l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0; }
  mute() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : 0.55; }
  pause(paused: boolean) { if (!this.context) return; void (paused ? this.context.suspend() : this.context.resume()); }
  reset() { for (const source of this.voices) source.stop(); this.voices.clear(); for (const loop of this.loops.values()) loop.gain.gain.value = 0; }
}
