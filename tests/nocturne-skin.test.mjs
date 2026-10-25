import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { nocturneProgress, nocturneTime } from '../src/utils/nocturneSkin.ts';
import { createBackup, validateBackup } from '../src/utils/settingsBackup.ts';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
test('nocturne progress safely clamps the real audio position', () => {
  assert.equal(nocturneProgress(48, 178), 48 / 178);
  assert.equal(nocturneProgress(-1, 178), 0);
  assert.equal(nocturneProgress(999, 178), 1);
  for (const [position, duration] of [[NaN, 100], [1, Infinity], [Infinity, 100], [1, 0], [1, -1]])
    assert.equal(nocturneProgress(position, duration), 0);
});
test('time uses Persian digits without invalid or negative values', () => {
  assert.equal(nocturneTime(48), '۰:۴۸');
  assert.equal(nocturneTime(178), '۲:۵۸');
  assert.equal(nocturneTime(3601), '۶۰:۰۱');
  for (const value of [-1, NaN, Infinity]) assert.equal(nocturneTime(value), '۰:۰۰');
});
test('new selection survives storage and older skin IDs retain behavior', () => {
  const skins = read('src/components/PlayerSkins.tsx');
  const code = stripTypeScriptTypes(skins.slice(skins.indexOf('export type PlayerSkin'), skins.indexOf('/** Photographic')).replace(/^export /gm, ''));
  for (const value of ['studio-cassette', 'midnight-orbit', 'silent-architecture', 'nocturne']) {
    assert.equal(runInNewContext(`${code}\nreadPlayerSkin()`, { localStorage: { getItem: () => value } }), value);
  }
});
test('new skin survives secure backup validation', async () => {
  const backup = await createBackup('1.1.2', { ritmo_player_skin: 'nocturne' }, false);
  const loaded = await validateBackup(JSON.stringify(backup));
  assert.equal(loaded.payload.storage.ritmo_player_skin, 'nocturne');
});
test('new skin uses existing transport callbacks and never owns another audio source', () => {
  const skin = read('src/components/NocturnePlayerSkin.tsx');
  const app = read('src/RitmoAppClean.tsx');
  assert.doesNotMatch(skin, /new Audio|AudioContext|setInterval|Math\.random|localStorage|fetch\(/);
  assert.match(app, /skin === 'nocturne' \? <NocturnePlayerSkin/);
  assert.match(app, /controls=\{\{ play, prev, next, seek, favorite, queue, cycleMode/);
  assert.match(skin, /controls\.seek\(Number\(event\.target\.value\)\)/);
  assert.match(skin, /disabled=\{!seconds\}/);
  assert.match(skin, /controls \? <button/);
});
test('styles remain scoped and honor compact previews and reduced motion', () => {
  const css = read('src/components/NocturnePlayerSkin.css');
  assert.match(css, /skin-compact \.ritmo-nocturne/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.doesNotMatch(css, /(?:^|\n)(?:body|html|:root|\*)\s*\{/);
});
test('reference layout keeps toolbar in the skin and uses a single curved track title', () => {
  const css = read('src/components/NocturnePlayerSkin.css');
  const app = read('src/RitmoAppClean.tsx');
  const skin = read('src/components/NocturnePlayerSkin.tsx');
  assert.match(css, /aspect-ratio: 618 \/ 1336/);
  assert.doesNotMatch(skin, /ritmo-nocturne-heading|ritmo-nocturne-orbit-title/);
  assert.match(skin, /<textPath href=.*startOffset="50%">\{safeTitle\}<\/textPath>/);
  assert.match(skin, /getComputedTextLength/);
  assert.match(css, /skin-nocturne \.ritmo-skin-device \{ width:auto; height:100%; aspect-ratio:618 \/ 1336/);
  assert.match(css, /ritmo-nocturne-play svg \{ position:absolute/);
  assert.match(app, /skin !== 'nocturne' && <div className="ritmo-player-toolbar"/);
  assert.match(skin, /<PlayerSkinMenus slot="top" controls=\{controls\}/);
  assert.match(skin, /<PlayerSkinMenus slot="bottom" controls=\{controls\}/);
  assert.match(css, /ritmo-nocturne-art \{ inset:0; opacity:\.28/);
  assert.match(css, /font-size:22px/);
  assert.match(skin, /setPointerCapture/);
  assert.match(skin, /onPointerMove/);
});

test('player shell stays mounted when the current track changes', () => {
  const app = read('src/RitmoAppClean.tsx');
  assert.match(app, /<PlayerContent \{\.\.\.props\} \/>/);
  assert.doesNotMatch(app, /<PlayerContent key=\{props\.track\.id\}/);
});
