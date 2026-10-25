// Node 22+: node --experimental-strip-types --test tests/player-scope.test.mjs
// No test dependencies. Behavioral Sort tests execute the active comparator.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const app = read('src/RitmoAppClean.tsx');
const skins = read('src/components/PlayerSkins.tsx');
const css = read('src/components/PlayerSkins.css');
const settings = read('src/components/PlayerSettings.tsx');
const { sortSongs } = await import('../src/utils/songSorting.ts');
const java = read('android/app/src/main/java/com/adelapp/larkplayer/NativeMediaPlugin.java');
const orderedSource = app.slice(app.indexOf('  const ordered ='), app.indexOf('  const filtered ='));
const orderedJS = stripTypeScriptTypes(`${orderedSource}\nordered(tracks, preserve);`);
const input = [
  { id: 'new', title: 'C', artist: '', album: '', addedAt: 3000 },
  { id: 'unknown', title: 'A', artist: '', album: '' },
  { id: 'old', title: 'B', artist: '', album: '', addedAt: 1000 },
];
const order = (sort = 'newest', data = input, query = '', preserve = false) =>
  Array.from(runInNewContext(orderedJS, { tracks: data, sort, manualSongOrder: data.map(t => t.id), query, preserve, sortSongs }), t => t.id);
test('production entry uses the clean active app', () => assert.match(read('src/main.tsx'), /from '\.\/RitmoAppClean.tsx'/));
test('newest-added mode puts later library additions first and unknown dates last', () => assert.deepEqual(order(), ['new', 'old', 'unknown']));
test('date sort never mutates source tracks or file metadata', () => {
  const before = JSON.stringify(input); order(); order('name');
  assert.equal(JSON.stringify(input), before);
});
test('invalid dates stay last in both directions', () => {
  const tracks = [...input, { id: 'nan', title: 'D', addedAt: NaN }, { id: 'negative', title: 'E', addedAt: -1 }];
  assert.deepEqual(order('newest', tracks).slice(0, 2), ['new', 'old']);
  assert.deepEqual(order('name', tracks).slice(0, 2), ['A', 'B'].map(title => tracks.find(t => t.title === title).id));
});
test('equal dates have a deterministic title/ID tiebreaker', () => {
  const tracks = [{ id: 'b', title: 'A', addedAt: 5 }, { id: 'a', title: 'A', addedAt: 5 }];
  assert.deepEqual(order('newest', tracks), ['a', 'b']);
  assert.deepEqual(order('duration', tracks), ['a', 'b']);
});
test('search remains compatible with newest sort', () => assert.deepEqual(order('newest', input, 'b'), ['old']));
test('manual playlist order uses its own order list', () => assert.deepEqual(order('manual', input, '', true), input.map(t => t.id)));
test('Android uses read-only DATE_ADDED in milliseconds, not DATE_MODIFIED', () => {
  // Two scan projections plus their sort; ACTION_VIEW imports use OpenableColumns
  // and app-private copies instead of assuming a MediaStore DATE_ADDED value.
  assert.equal((java.match(/MediaStore\.MediaColumns\.DATE_ADDED/g) || []).length, 3);
  assert.match(java, /item\.put\("addedAt", cursor\.getLong\(modifiedIndex \+ 2\) \* 1000L\)/);
  assert.match(app, /addedAt: x\.addedAt/);
});
test('new sort persists and is accepted by backup validation', () => {
  assert.match(app, /'duration', 'recent', 'added', 'manual'\]\.includes\(value\)/);
  assert.match(read('src/utils/settingsBackup.ts'), /'duration', 'recent', 'added', 'manual'\]\.includes\(value\)/);
  assert.match(app, /SONG_SORT_OPTIONS\.map\(option =>/);
  assert.match(app, /normalizeSongSort\(read<string>\(storage, 'ritmo_sort'/);
  assert.match(app, /setManualSongOrder\(read\(storage, 'ritmo_manual_song_order'/);
});
test('mode has one cycling button and four distinct icon mappings', () => {
  const player = app.slice(app.indexOf('function Player('));
  assert.doesNotMatch(player, /<select/);
  assert.match(player, /mode === 'shuffle' \? Shuffle : mode === 'song' \? Repeat1 : mode === 'queue' \? Repeat : ListStart/);
  assert.match(player, /\+ 1\) % PLAYBACK_MODES\.length/);
  assert.match(player, /className="ritmo-transport-utility"/);
});
test('toolbar contains close at right, theme and actions at left; Speed is in the action menu', () => {
  const toolbar = app.slice(app.indexOf('<div className="ritmo-player-toolbar">'), app.indexOf('<PlayerSkins skin={skin}'));
  assert.match(toolbar, /aria-label="بازگشت از Player"/);
  assert.match(toolbar, /aria-label="پوسته Player"/);
  assert.match(toolbar, /MoreVertical/);
  assert.doesNotMatch(toolbar, /onClick={favorite}/);
  const transport = app.slice(app.indexOf('<div className="ritmo-player-transport"'), app.indexOf('<div className="ritmo-player-navigation"'));
  assert.match(transport, /className="ritmo-transport-utility".*aria-label="صف پخش"/s);
  assert.match(transport, /className="ritmo-transport-utility" data-mode/);
  assert.match(css, /ritmo-player-toolbar[^}]*direction:ltr/);
  assert.doesNotMatch(toolbar, /Maximize|Minimize|در حال پخش|<Zap/);
});
test('Player Volume and Fullscreen controls and their prop wiring are removed', () => {
  assert.doesNotMatch(css, /ritmo-skin-arrive|\.is-expanded \.ritmo-skin-device/);
  const player = app.slice(app.indexOf('type PlayerProps'));
  assert.doesNotMatch(player, /بلندی صدا|VolumeX|Volume2|Maximize2|Minimize2|setExpanded|onClick={mute}|vol:/);
  assert.match(app, /NativeMedia\.control\({ action: 'volume'/);
});
test('player picker shares state, while app theme settings stay separate', () => {
  assert.match(app, /playerSkin=\{playerSkin\} onPlayerSkin=\{changePlayerSkin\}/);
  assert.doesNotMatch(settings, /PlayerSkinPicker|پوسته پخش‌کننده/);
  assert.match(settings, /THEMES\.map/);
  assert.match(skins, /<PlayerSkins skin=\{s\.id\} playing=\{false\}/);
  assert.match(app, /localStorage\.setItem\('ritmo_player_skin', skin\)/);
});
test('mechanisms pause naturally and respect reduced motion', () => {
  const turntable = read('src/components/ReferenceTurntable.css');
  assert.match(css, /\.cassette-reel[^}]*animation-play-state:paused/s);
  assert.match(css, /\.ritmo-skin-stage\.is-playing \.cassette-reel/);
  assert.match(turntable, /\.reference-record-spin[^}]*animation-play-state:paused/s);
  assert.match(turntable, /\.skin-vinyl\.is-playing \.reference-record-spin \{ animation-play-state:running/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(turntable, /prefers-reduced-motion:reduce/);
});
test('player exposes only blue night and the three reference skins', () => {
  assert.match(skins, /'cassette' \| 'vinyl' \| 'music-ring' \| 'sleeve-wave'/);
  const list = skins.slice(skins.indexOf('export const PLAYER_SKINS'), skins.indexOf('export function readPlayerSkin'));
  assert.equal((list.match(/id: '/g) || []).length, 4);
  assert.doesNotMatch(list, /id: '(?:cassette|vinyl|music-ring|sleeve-wave)'/);
  assert.match(list, /id: 'nocturne'/);
  assert.match(skins, /<CircularMusicSkin /);
  assert.match(skins, /<SquareMusicSkin /);
  assert.doesNotMatch(skins + read('src/components/PremiumPlayerThemes.css'), /soft-light|premium-atmosphere|premium-background/);
  assert.doesNotMatch(list, /id: '(?:cover|circular|glow|waveform)'/);
  assert.doesNotMatch(css, /circular-equalizer|glow-halo|waveform-lines|cover-device/);
  assert.doesNotMatch(skins, /radio|رادیوی رترو/);
});
test('Player three-dot action opens the existing shared action menu', () => {
  assert.match(app, /more=\{\(\) => \{ setSpeedOpen\(false\); setActionSpeedOpen\(false\); setActionId\(current\.id\); \}\}/);
  assert.match(app, /onClick=\{more\}[^>]*aria-label=\{`عملیات: \$\{track\.title\}`\}/);
  assert.match(app, /سرعت پخش/);
  assert.match(app, /actionSpeedOpen/);
});
test('selection is a horizontal responsive RTL rail without overflow hiding', () => {
  const premium = read('src/components/PremiumPlayerThemes.css');
  assert.match(premium, /display:flex; flex-wrap:nowrap/);
  assert.match(premium, /overflow-x:auto/);
  assert.match(premium, /direction:rtl/);
  assert.doesNotMatch(css + premium, /overflow-x:\s*hidden/);
});
test('file size formatter uses actual bytes and honest unavailable state', () => {
  const source = app.slice(app.indexOf('const fileSize ='), app.indexOf('const toTrack ='));
  const format = bytes => runInNewContext(stripTypeScriptTypes(source + '\nfileSize(bytes);'), { bytes });
  assert.equal(format(870400), '850 KB');
  assert.equal(format(5033165), '4.8 MB');
  assert.equal(format(3 * 1024 ** 3), '3 GB');
  assert.equal(format(undefined), 'در دسترس نیست');
  assert.match(java, /item\.put\("sizeBytes", cursor\.getLong\(modifiedIndex \+ 1\)\)/);
  assert.match(app, /sizeBytes: x\.sizeBytes/);
});
