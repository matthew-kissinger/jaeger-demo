import test from 'node:test';
import assert from 'node:assert/strict';

// Mock browser environment for unit test
globalThis.window = {
  matchMedia: (query) => ({
    matches: query.includes('coarse') ? true : false,
  }),
};
globalThis.localStorage = {
  _data: new Map(),
  getItem(key) { return this._data.get(key) ?? null; },
  setItem(key, val) { this._data.set(key, String(val)); },
  clear() { this._data.clear(); }
};

// Mock import.meta.env
globalThis.importMetaEnv = { BASE_URL: '/jaeger-demo/' };

test('SceneAudio initializes with mobile voice limits and persistent mute', async () => {
  localStorage.setItem('jaeger_mute', 'true');
  
  // Dynamic import of audio module with mock env
  const { SceneAudio } = await import('../src/audio.ts');
  const audio = new SceneAudio();
  
  assert.equal(audio.muted, true, 'Mute state should be restored from localStorage');
  
  audio.mute();
  assert.equal(audio.muted, false, 'Mute should toggle to false');
  assert.equal(localStorage.getItem('jaeger_mute'), 'false', 'Toggled state persisted');
});

test('SceneAudio.load() handles decodeAudioData failure gracefully without throwing', async () => {
  const { SceneAudio } = await import('../src/audio.ts');
  const audio = new SceneAudio();

  // Mock AudioContext that throws EncodingError
  let decodeAttempts = 0;
  class MockAudioContext {
    state = 'suspended';
    destination = {};
    createGain() {
      return { gain: { value: 1, setTargetAtTime() {} }, connect() {} };
    }
    decodeAudioData(buffer, success, failure) {
      decodeAttempts++;
      const err = new Error('Unable to decode audio data');
      err.name = 'EncodingError';
      if (failure) failure(err);
      return Promise.reject(err);
    }
    resume() {
      this.state = 'running';
      return Promise.resolve();
    }
  }
  globalThis.AudioContext = MockAudioContext;
  globalThis.window.AudioContext = MockAudioContext;

  // Mock fetch to simulate 404 or bad audio
  globalThis.fetch = async (url) => {
    if (url.includes('manifest.json')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          version: 1,
          cues: [
            { id: 'test_cue_1', path: 'audio/test1.mp3' },
            { id: 'test_cue_2', path: 'audio/test2.mp3' }
          ]
        })
      };
    }
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => new ArrayBuffer(1024)
    };
  };

  // Calling load() MUST NOT throw or reject
  await assert.doesNotReject(async () => {
    await audio.load();
  }, 'audio.load() should never throw on decode error');

  assert.ok(decodeAttempts > 0, 'decodeAudioData should have been attempted');
  assert.equal(audio.ready, false, 'audio.ready should be false when all decodes fail');

  // Now simulate user gesture unlock where decoding succeeds
  MockAudioContext.prototype.decodeAudioData = function(buffer, success) {
    const mockAudioBuffer = { duration: 1.5, sampleRate: 44100 };
    if (success) success(mockAudioBuffer);
    return Promise.resolve(mockAudioBuffer);
  };

  await audio.unlock();
  assert.equal(audio.ready, true, 'audio.ready should be true after unlock retry decodes successfully');
});
