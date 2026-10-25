import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const source = read('src/components/SquareMusicSkin.tsx');
const code = source.slice(source.indexOf('const BAR_COUNT'), source.indexOf('function SquareSpectrum'));
const { squareBarEnergy, squareBarGeometry } = runInNewContext(stripTypeScriptTypes(code.replace(/^export /gm, '')) + '\n({ squareBarEnergy, squareBarGeometry });');
const frame = energy => ({ sequence:1, amplitude:energy, transient:energy, bands:Array(24).fill(energy) });
test('all four square sides have thirty outward-facing equally spaced bars', () => {
  const counts = [0,0,0,0];
  for (let index = 0; index < 120; index++) {
    const point = squareBarGeometry(index);
    counts[Math.floor(index / 30)]++;
    assert.equal(Math.max(Math.abs(point.x), Math.abs(point.y)), 1);
    assert.equal(Math.abs(point.nx) + Math.abs(point.ny), 1);
    assert.equal(point.x * point.nx + point.y * point.ny, 1);
    assert.ok(Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1);
  }
  assert.deepEqual(counts,[30,30,30,30]);
});
test('square bars grow with real audio and silence produces no artificial motion', () => {
  for (let index = 0; index < 120; index++) {
    assert.equal(squareBarEnergy(frame(0), index), 0);
    assert.ok(squareBarEnergy(frame(.9), index) > squareBarEnergy(frame(.1), index));
  }
  assert.equal(squareBarEnergy(frame(NaN),0),0);
});
test('square playback, preview and track guards remain while the full cover stays visible', () => {
  assert.match(source, /subscribeAudioAnalysis\(receive\)/);
  assert.match(source, /!actualPlaying \|\| !transport\.current/);
  assert.match(source, /next\.trackId !== trackId/);
  assert.match(source, /trackId === 'preview' \? \(\) => \{\}/);
  assert.doesNotMatch(source, /Math\.random|setInterval|setTimeout/);
  const css=read('src/components/SquareMusicSkin.css');
  assert.match(css,/\.ritmo-square-artwork \{ position:absolute; inset:0; \}/);
  assert.doesNotMatch(source,/\{title\}/);
  assert.doesNotMatch(source,/\{artist\}/);
  assert.doesNotMatch(css,/ritmo-circle|border-radius:50%/);
});
