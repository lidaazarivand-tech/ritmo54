import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { probeAudioDuration } from '../src/utils/webAudioMetadata.ts';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

function fakeAudio(duration = 0) {
  const listeners = new Map();
  return {
    duration,
    preload: '',
    src: '',
    addEventListener(name, listener) { listeners.set(name, listener); },
    removeEventListener(name) { listeners.delete(name); },
    removeAttribute(name) { if (name === 'src') this.src = ''; },
    load() {},
    emit(name) { listeners.get(name)?.(); },
    listeners,
  };
}

test('browser audio import asynchronously fills a missing duration from media metadata', async () => {
  const app = read('src/RitmoAppClean.tsx');
  assert.match(app, /duration: 0, type: 'audio'/);
  assert.match(app, /probeAudioDuration\(uri\)\.then\(duration =>/);
  assert.match(app, /existing\.id === id \? \{ \.\.\.existing, duration \}/);

  const audio = fakeAudio(187.42);
  const pending = probeAudioDuration('blob:audio-file', () => audio);
  assert.equal(audio.preload, 'metadata');
  assert.equal(audio.src, 'blob:audio-file');
  audio.emit('loadedmetadata');
  assert.equal(await pending, 187.42);
  assert.equal(audio.src, '');
  assert.equal(audio.listeners.size, 0);
});

test('invalid, infinite and failed browser media durations stay unavailable', async () => {
  for (const duration of [0, -1, Infinity, NaN]) {
    const audio = fakeAudio(duration);
    const pending = probeAudioDuration('blob:audio-file', () => audio);
    audio.emit('loadedmetadata');
    assert.equal(await pending, null);
  }
  const failed = fakeAudio();
  const pending = probeAudioDuration('blob:broken-audio', () => failed);
  failed.emit('error');
  assert.equal(await pending, null);
  assert.equal(await probeAudioDuration(''), null);
  assert.equal(await probeAudioDuration('blob:audio-file', () => { throw new Error('Audio unavailable'); }), null);
});
