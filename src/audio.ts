import type { Point } from './movement';

export class SceneAudio {
  context: AudioContext | null = null;
  muted = false;
  ready = false;
  private buffers = new Map<string, AudioBuffer>();
  private pendingBuffers = new Map<string, ArrayBuffer>();
  private loops = new Map<string, { source: AudioBufferSourceNode; gain: GainNode; active: boolean }>();
  private voices = new Set<AudioBufferSourceNode>();
  private master: GainNode | null = null;
  private maxVoices = 16;

  constructor() {
    try {
      this.muted = typeof localStorage !== 'undefined' && localStorage.getItem('jaeger_mute') === 'true';
    } catch {}
    if (typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches) {
      this.maxVoices = 8;
    }
  }

  private getAudioContext(): AudioContext | null {
    if (this.context) return this.context;
    try {
      const win = (typeof window !== 'undefined' ? window : globalThis) as unknown as {
        AudioContext?: typeof AudioContext;
        webkitAudioContext?: typeof AudioContext;
      };
      const AudioCtx = win.AudioContext || win.webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const master = ctx.createGain();
        master.gain.value = this.muted ? 0 : 0.55;
        master.connect(ctx.destination);
        this.master = master;
        this.context = ctx;
      }
    } catch (e) {
      console.warn('AudioContext initialization warning:', e);
    }
    return this.context;
  }

  private safeDecode(ctx: AudioContext, buffer: ArrayBuffer): Promise<AudioBuffer> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const onDone = (buf: AudioBuffer) => {
        if (!settled) {
          settled = true;
          resolve(buf);
        }
      };
      const onError = (err: unknown) => {
        if (!settled) {
          settled = true;
          reject(err);
        }
      };
      try {
        const res = ctx.decodeAudioData(buffer, onDone, onError);
        if (res && typeof (res as Promise<AudioBuffer>).then === 'function') {
          (res as Promise<AudioBuffer>).then(onDone, onError);
        }
      } catch (err) {
        onError(err);
      }
    });
  }

  private async decodeBuffer(id: string, rawBuffer: ArrayBuffer): Promise<boolean> {
    const ctx = this.getAudioContext();
    if (!ctx) return false;
    try {
      // slice buffer because decodeAudioData detaches the ArrayBuffer
      const toDecode = rawBuffer.slice(0);
      const audioBuffer = await this.safeDecode(ctx, toDecode);
      this.buffers.set(id, audioBuffer);
      this.pendingBuffers.delete(id);
      return true;
    } catch {
      // Retain in pendingBuffers for user-gesture retry if context was suspended or unrouted
      this.pendingBuffers.set(id, rawBuffer);
      return false;
    }
  }

  async load() {
    try {
      this.getAudioContext();
      const baseUrl = import.meta.env?.BASE_URL ?? '/';
      const manifestUrl = baseUrl + 'audio/manifest.json';
      const manifestRes = await fetch(manifestUrl);
      if (!manifestRes.ok) throw new Error(`Manifest HTTP ${manifestRes.status}`);
      const manifest = await manifestRes.json();

      // Fetch all cue ArrayBuffers safely and attempt initial decode
      await Promise.allSettled(
        manifest.cues.map(async (cue: { id: string; path: string }) => {
          try {
            const res = await fetch(baseUrl + cue.path);
            if (!res.ok) return;
            const data = await res.arrayBuffer();
            this.pendingBuffers.set(cue.id, data);
            await this.decodeBuffer(cue.id, data);
          } catch (cueErr) {
            console.warn(`Audio cue ${cue.id} fetch warning:`, cueErr);
          }
        })
      );

      this.ready = this.buffers.size > 0;
    } catch (err) {
      console.warn('Audio system load warning (visual demo remains unaffected):', err);
    }
  }

  async unlock() {
    const ctx = this.getAudioContext();
    if (!ctx) return;
    try {
      if (ctx.state === 'suspended' || ctx.state === ('interrupted' as AudioContextState)) {
        await ctx.resume();
      }
    } catch (err) {
      console.warn('AudioContext resume warning:', err);
    }

    // Decode any pending cues now that we have an active user gesture
    if (this.pendingBuffers.size > 0) {
      const pending = Array.from(this.pendingBuffers.entries());
      for (const [id, raw] of pending) {
        await this.decodeBuffer(id, raw);
      }
    }
    this.ready = this.buffers.size > 0;
  }

  play(id: string, volume = 1, point?: Point) {
    if (!this.ready || !this.context || !this.master) return;
    if (this.voices.size >= this.maxVoices) return;
    const buf = this.buffers.get(id);
    if (!buf) return;

    try {
      const source = this.context.createBufferSource();
      const gain = this.context.createGain();
      source.buffer = buf;
      gain.gain.value = volume;
      source.connect(gain);

      if (point) {
        const pan = this.context.createPanner();
        pan.distanceModel = 'inverse';
        pan.refDistance = 90;
        pan.maxDistance = 800;
        pan.rolloffFactor = 1.1;
        pan.positionX.value = point.x;
        pan.positionY.value = point.y;
        pan.positionZ.value = point.z;
        gain.connect(pan);
        pan.connect(this.master);
        source.onended = () => {
          this.voices.delete(source);
          pan.disconnect();
          gain.disconnect();
        };
      } else {
        gain.connect(this.master);
        source.onended = () => {
          this.voices.delete(source);
          gain.disconnect();
        };
      }

      this.voices.add(source);
      source.start();
    } catch (err) {
      console.warn(`Error playing sound ${id}:`, err);
    }
  }

  loop(id: string, volume: number) {
    if (!this.ready || !this.context || !this.master) return;
    let loop = this.loops.get(id);
    if (!loop) {
      const buf = this.buffers.get(id);
      if (!buf) return;
      try {
        const source = this.context.createBufferSource();
        const gain = this.context.createGain();
        source.buffer = buf;
        source.loop = true;
        gain.gain.value = 0;
        source.connect(gain);
        gain.connect(this.master);
        source.start();
        loop = { source, gain, active: volume > 0 };
        this.loops.set(id, loop);
      } catch (err) {
        console.warn(`Error creating loop ${id}:`, err);
        return;
      }
    }
    loop.active = volume > 0;
    try {
      loop.gain.gain.setTargetAtTime(volume, this.context.currentTime, 0.15);
    } catch {}
  }

  listener(position: Point, direction: Point) {
    if (!this.context) return;
    try {
      const l = this.context.listener;
      l.positionX.value = position.x;
      l.positionY.value = position.y;
      l.positionZ.value = position.z;
      l.forwardX.value = direction.x;
      l.forwardY.value = direction.y;
      l.forwardZ.value = direction.z;
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    } catch {}
  }

  mute() {
    this.muted = !this.muted;
    try {
      localStorage.setItem('jaeger_mute', String(this.muted));
    } catch {}
    if (this.master) {
      this.master.gain.value = this.muted ? 0 : 0.55;
    }
  }

  pause(paused: boolean) {
    if (!this.context) return;
    try {
      if (paused && this.context.state === 'running') {
        void this.context.suspend().catch(() => {});
      } else if (!paused && (this.context.state === 'suspended' || this.context.state === ('interrupted' as AudioContextState))) {
        void this.context.resume().catch(() => {});
      }
    } catch {}
  }

  reset() {
    for (const source of this.voices) {
      try {
        source.stop();
      } catch {}
    }
    this.voices.clear();
    for (const loop of this.loops.values()) {
      try {
        loop.gain.gain.value = 0;
      } catch {}
    }
  }
}
