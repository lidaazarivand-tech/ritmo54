import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeSongSort, SONG_SORT_OPTIONS, sortSongs } from '../src/utils/songSorting.ts';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const items = [
  { id:'a', title:'zeta', addedAt:2000, duration:180 },
  { id:'b', title:'آهنگ', addedAt:3000, duration:60 },
  { id:'c', title:'alpha', addedAt:1000, duration:120 },
];
test('one shared menu definition exposes exactly the four required options', () => {
  assert.deepEqual(SONG_SORT_OPTIONS.map(x => x.label), ['نام','جدیدترین','مدت','ترتیب دستی']);
  assert.deepEqual(SONG_SORT_OPTIONS.map(x => x.key), ['name','newest','duration','manual']);
});
test('shared sorting actually orders Persian/English names, newest dates, shortest duration and manual order', () => {
  assert.deepEqual(sortSongs(items,'name',[]).map(x=>x.id), ['b','c','a']);
  assert.deepEqual(sortSongs(items,'newest',[]).map(x=>x.id), ['b','a','c']);
  assert.deepEqual(sortSongs(items,'duration',[]).map(x=>x.id), ['b','c','a']);
  assert.deepEqual(sortSongs(items,'manual',['c','a','b']).map(x=>x.id), ['c','a','b']);
});
test('legacy sort settings migrate without blocking safe writes', () => {
  assert.equal(normalizeSongSort('added'),'newest');
  assert.equal(normalizeSongSort('artist'),'name');
  assert.equal(normalizeSongSort('recent'),'name');
  assert.equal(normalizeSongSort('manual'),'manual');
});
test('all active list pages use the same four-mode menu and playlists apply the selected order', () => {
  const app=read('src/RitmoAppClean.tsx');
  assert.match(app,/SONG_SORT_OPTIONS\.map\(option =>/);
  assert.doesNotMatch(app,/\['name', 'artist', 'album', 'duration', 'recent', 'added'\]/);
  assert.match(app,/tab === 'playlists' \? ordered\(playlistTracks, playlistManual\)/);
  assert.match(app,/const playlistManual = activePlaylist\?\.manual \?\? sort === 'manual'/);
  assert.match(app,/playlistPlaybackActive/);
  assert.match(app,/reorderPlaylistAt\(activePlaylist\.id, from, to\)/);
  assert.match(app,/reorderPlaylistAt = async \(id: string, from: number, to: number\)/);
});
test('manual library ordering and each playlist manual order remain separate persisted owners', () => {
  const app=read('src/RitmoAppClean.tsx');
  assert.match(app,/save\('ritmo_manual_song_order', manualSongOrder\)/);
  assert.match(app,/save\('ritmo_manual_orders', manualOrders\)/);
  assert.match(app,/old\.favorites \|\| favoriteBase/);
  assert.match(app,/old\[groupSortScope\] \|\| groupTrackBase\.map/);
  assert.match(app,/ritmo_playlists: JSON\.stringify\(nextPlaylists\)/);
  assert.match(app,/nextIds\.splice\(to, 0, \.\.\.nextIds\.splice\(from, 1\)\)/);
});
test('drag handles exist only in manual mode and playlist occurrence keys distinguish duplicates', () => {
  const app=read('src/RitmoAppClean.tsx'); const playlist=read('src/components/PlaylistDetail.tsx');
  assert.match(app,/manual=\{sort === 'manual' && \(tab === 'songs' \|\| tab === 'favorites'\)\}/);
  assert.match(app,/manual=\{sort === 'manual'\}/);
  assert.match(playlist,/key=\{visibleTrackKeys\[trackIndex\]\}/);
  assert.match(playlist,/data-track-index=\{visibleTrackIndexes/);
  assert.doesNotMatch(read('src/RitmoAppClean.tsx'), /trackIds: Array\.from\(new Set\(storedIds\(playlist\.trackIds\)\)\)/);
});
