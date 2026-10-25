import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reconcileManualSongOrder, reorderVisibleSongs, sortByManualSongOrder } from '../src/utils/manualSongOrder.ts';

test('manual order survives added and removed library tracks without disturbing existing order', () => {
  assert.deepEqual(reconcileManualSongOrder(['b','a','gone','b'], ['a','b','c']), ['b','a','c']);
  assert.deepEqual(reconcileManualSongOrder([], ['x','y']), ['x','y']);
});

test('manual drag moves a visible track and preserves filtered-out track slots', () => {
  assert.deepEqual(reorderVisibleSongs(['a','hidden','b','c'], ['a','b','c'], 'c','a'), ['c','hidden','a','b']);
  assert.deepEqual(reorderVisibleSongs(['a','b'], ['a','b'], 'a','missing'), ['a','b']);
  assert.deepEqual(reorderVisibleSongs([], ['a','b'], 'b','a'), ['b','a']);
});

test('manual sort reflects persisted order without mutating source arrays', () => {
  const rows = [{id:'b'}, {id:'a'}, {id:'c'}];
  assert.deepEqual(sortByManualSongOrder(rows, ['c','b','a']).map(x => x.id), ['c','b','a']);
  assert.deepEqual(rows.map(x => x.id), ['b','a','c']);
});

test('songs header exposes only the four requested modes and the row has a drag handle', () => {
  const app = readFileSync(new URL('../src/RitmoAppClean.tsx', import.meta.url), 'utf8');
  assert.match(app, /SONG_SORT_OPTIONS\.map\(option =>/);
  assert.match(app, /aria-label=\{`جابجایی آهنگ:/);
  assert.match(app, /ritmo_manual_song_order/);
});

test('IME height is not added to Android content padding a second time', () => {
  const activity = readFileSync(new URL('../android/app/src/main/java/com/adelapp/larkplayer/MainActivity.java', import.meta.url), 'utf8');
  assert.match(activity, /adjustResize handles the IME/);
  assert.doesNotMatch(activity, /keyboard\.bottom/);
});

test('manual order is included in backup validation and transactional storage', () => {
  const backup = readFileSync(new URL('../src/utils/settingsBackup.ts', import.meta.url), 'utf8');
  const transaction = readFileSync(new URL('../src/utils/storageTransaction.ts', import.meta.url), 'utf8');
  assert.match(backup, /ritmo_manual_song_order/);
  assert.match(backup, /ritmo_manual_orders/);
  assert.match(transaction, /manual_orders/);
  assert.match(transaction, /manual_song_order/);
});

test('library and playlist drag surfaces use a long-press threshold, avoid self-drop moves, and batch visual updates', () => {
  const app = readFileSync(new URL('../src/RitmoAppClean.tsx', import.meta.url), 'utf8');
  const playlist = readFileSync(new URL('../src/components/PlaylistDetail.tsx', import.meta.url), 'utf8');
  assert.match(app, /},420\);/);
  assert.doesNotMatch(app, /if\(draggingRef\.current\) paintPreview/);
  assert.match(app, /paintPreview\(current\.x,current\.y\)/);
  assert.match(app, /sourceTop!==undefined&&y>=sourceTop-scrollDelta/);
  assert.match(app, /onReorder\?\.\(track\.id,movingTarget\)/);
  assert.match(playlist, /sourceTop !== undefined && y >= sourceTop - scrollDelta/);
  assert.match(playlist, /requestAnimationFrame\(scrollFrame\)/);
  assert.match(playlist, /reorderTrack\(state\.id, state\.target\)/);
  assert.match(playlist, /classList\.toggle\('is-reorder-shift',inPath\)/);
});

test('startup keeps the saved order until a nonempty library scan is available', () => {
  const app = readFileSync(new URL('../src/RitmoAppClean.tsx', import.meta.url), 'utf8');
  assert.match(app, /if \(!ids\.length\) return;[\s\S]*setManualSongOrder/);
});

test('manual-order surfaces persist independently for library, favorites, groups and each playlist', () => {
  const app = readFileSync(new URL('../src/RitmoAppClean.tsx', import.meta.url), 'utf8');
  const playlist = readFileSync(new URL('../src/components/PlaylistDetail.tsx', import.meta.url), 'utf8');
  assert.match(app, /save\('ritmo_manual_song_order', manualSongOrder\)/);
  assert.match(app, /manualOrders\.favorites \|\| \[\]/);
  assert.match(app, /\[groupSortScope\]: reorderVisibleSongs/);
  assert.match(app, /groupSortScope = group && \['artists', 'albums', 'folders'\]\.includes\(tab\) \? `\$\{tab\}:\$\{group\}`/);
  assert.match(app, /writeStorageTransaction\(\{ ritmo_playlists: JSON\.stringify\(nextPlaylists\)/);
  assert.match(playlist, /reorderTrack\(state\.id, state\.target\)/);
  assert.match(app, /manual=\{sort === 'manual'\}/);
});
