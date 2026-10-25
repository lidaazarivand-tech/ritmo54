import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const source = read('src/components/CircularMusicSkin.tsx');
const code = source.slice(source.indexOf('const BAR_COUNT'), source.indexOf('function CircularSpectrum'));
const { circularBarEnergy } = runInNewContext(stripTypeScriptTypes(code.replace('export function', 'function')) + '\n({ circularBarEnergy });');
const frame = energy => ({ sequence:1, amplitude:energy, transient:energy, bands:Array(24).fill(energy) });
test('circular bars are silent at zero and grow with actual audio energy', () => {
  for (let index = 0; index < 120; index++) {
    assert.equal(circularBarEnergy(frame(0), index), 0);
    assert.ok(circularBarEnergy(frame(.9), index) > circularBarEnergy(frame(.1), index));
    assert.ok(circularBarEnergy(frame(10), index) <= 1);
  }
});
test('individual spectral bands produce different radial lengths', () => {
  const signal = frame(0);
  signal.bands[0] = 1;
  assert.ok(circularBarEnergy(signal, 0) > circularBarEnergy(signal, 60));
  assert.equal(circularBarEnergy({ ...signal, bands:[] }, 0), 0);
  assert.equal(circularBarEnergy(frame(NaN), 0), 0);
});
test('only real analysis is subscribed; pause, wrong tracks and preview are guarded', () => {
  assert.match(source, /subscribeAudioAnalysis\(receive\)/);
  assert.match(source, /!actualPlaying \|\| !transport\.current/);
  assert.match(source, /next\.trackId !== trackId/);
  assert.match(source, /trackId === 'preview' \? \(\) => \{\}/);
  assert.doesNotMatch(source, /Math\.random|setInterval|setTimeout|Math\.sin\([^)]*(?:time|now)/);
});
test('full cover remains visible and the skin no longer embeds track text', () => {
  const css = read('src/components/CircularMusicSkin.css');
  assert.doesNotMatch(source, /\{artist\}/);
  assert.doesNotMatch(source, /\{title\}/);
  assert.match(css, /\.ritmo-circle-artwork \{ position:absolute; inset:0; \}/);
  assert.doesNotMatch(read('src/RitmoAppClean.tsx'), /<CircularMusicSkin[^>]+title=/);
});
