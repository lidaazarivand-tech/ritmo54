import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sortMedia } from '../src/utils/mediaSort.ts';

const songs = [
  { id: 'fa-z', title: 'سیب', artist: 'آوا', album: 'آلبوم ب', duration: 180, addedAt: 4000 },
  { id: 'en-a', title: 'Apple', artist: 'Björk', album: 'Album A', duration: 120, addedAt: 1000 },
  { id: 'fa-a', title: 'آهنگ', artist: 'آوا', album: 'آلبوم الف', duration: 180, addedAt: 3000 },
  { id: 'dup-b', title: 'Apple', artist: '', album: '', duration: 0 },
  { id: 'missing', title: '', artist: null, album: undefined, duration: Number.NaN, addedAt: Number.NaN },
  { id: 'en-b', title: 'banana', artist: 'Adele', album: 'Album B', duration: 90, addedAt: 2000 },
];

const ids = (sort, descending = false, recentIds = ['fa-a', 'en-b', 'fa-z']) =>
  sortMedia(songs, { sort, descending, recentIds }).map(song => song.id);

test('title sort handles Persian and English with locale-aware natural ordering', () => {
  assert.deepEqual(ids('name'), ['fa-a', 'fa-z', 'dup-b', 'en-a', 'en-b', 'missing']);
  assert.deepEqual(ids('name', true), ['en-b', 'dup-b', 'en-a', 'fa-z', 'fa-a', 'missing']);
});

test('artist and album sorts place missing metadata at the bottom in either direction', () => {
  assert.deepEqual(ids('artist'), ['fa-a', 'fa-z', 'en-b', 'en-a', 'missing', 'dup-b']);
  assert.deepEqual(ids('artist', true).slice(-2), ['missing', 'dup-b']);
  assert.deepEqual(ids('album').slice(-2), ['missing', 'dup-b']);
  assert.deepEqual(ids('album', true).slice(-2), ['missing', 'dup-b']);
});

test('duration/date/recent directions work, invalid values remain last, and ties are deterministic', () => {
  assert.deepEqual(ids('duration'), ['en-b', 'en-a', 'fa-a', 'fa-z', 'missing', 'dup-b']);
  assert.deepEqual(ids('duration', true), ['fa-a', 'fa-z', 'en-a', 'en-b', 'missing', 'dup-b']);
  assert.deepEqual(ids('added'), ['en-a', 'en-b', 'fa-a', 'fa-z', 'missing', 'dup-b']);
  assert.deepEqual(ids('added', true), ['fa-z', 'fa-a', 'en-b', 'en-a', 'missing', 'dup-b']);
  assert.deepEqual(ids('recent'), ['fa-a', 'en-b', 'fa-z', 'missing', 'dup-b', 'en-a']);
  assert.deepEqual(ids('recent', true), ['fa-z', 'en-b', 'fa-a', 'missing', 'dup-b', 'en-a']);
  const ties = [{ id: 'b', title: 'Same', duration: 60 }, { id: 'a', title: 'Same', duration: 60 }];
  assert.deepEqual(sortMedia(ties, { sort: 'duration', descending: false }).map(t => t.id), ['a', 'b']);
  assert.deepEqual(sortMedia(ties, { sort: 'duration', descending: true }).map(t => t.id), ['a', 'b']);
});

test('sort returns a new array and does not mutate a shared library snapshot', () => {
  const original = [...songs];
  const output = sortMedia(songs, { sort: 'added', descending: true });
  assert.notEqual(output, songs);
  assert.deepEqual(songs, original);
});

test('active song lists use shared sorting without changing saved playlist order or queue identity', () => {
  const app = readFileSync(new URL('../src/RitmoAppClean.tsx', import.meta.url), 'utf8');
  assert.match(app, /return sortSongs\(result, sort, preserveOrder \? result\.map\(t => t\.id\) : manualOrder, 'fa'\)/);
  assert.match(app, /const filtered = ordered\(tracks\.filter/);
  assert.match(app, /const playlistManual = activePlaylist\?\.manual \?\? sort === 'manual'/);
  assert.match(app, /const list = tab === 'playlists' \? ordered\(playlistTracks, playlistManual\) : group \? groupTracks : filtered/);
  assert.match(app, /observedSort\.current = \{ sort, descending, manualSongOrder \}/);
  assert.match(app, /writeStorageTransaction\(\{\s*ritmo_playlists:/);
});


test('localized unknown artist and album labels are treated as missing, and remain last both ways', () => {
  const values = [
    { id: 'unknown-artist', title: 'A', artist: 'خواننده ناشناس', album: 'آلبوم ناشناس' },
    { id: 'artist', title: 'B', artist: 'آوا', album: 'آلبوم الف' },
    { id: 'unknown-album', title: 'C', artist: 'خواننده ناشناس', album: 'آلبوم ناشناس' },
  ];
  assert.deepEqual(sortMedia(values, { sort: 'artist', descending: false }).map(x => x.id), ['artist', 'unknown-artist', 'unknown-album']);
  assert.deepEqual(sortMedia(values, { sort: 'artist', descending: true }).map(x => x.id), ['artist', 'unknown-artist', 'unknown-album']);
  assert.deepEqual(sortMedia(values, { sort: 'album', descending: true }).map(x => x.id), ['artist', 'unknown-artist', 'unknown-album']);
});
