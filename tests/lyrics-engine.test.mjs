import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activeLyricIndex, cleanLyricsMetadata, createGeniusMetadataProvider, createLrclibProvider, normalizeLyricsText,
  parseSyncedLyrics, rankLyricsCandidates, readLyricsCache, requestLyrics, searchLyrics,
  scoreLyricsCandidate, usableLyrics, writeLyricsCache,
} from '../src/utils/lyrics.ts';

const track = (overrides = {}) => ({
  id: 12, trackName: 'Blue Öyster Cult', artistName: 'The Artist', albumName: 'Album', duration: 220,
  plainLyrics: 'First line\n\nSecond line', syncedLyrics: '[00:01.00]First line\n[00:03.20]Second line', ...overrides,
});
const response = data => new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
const noDelay = async () => {};

test('LRCLIB exact lookup sends real available metadata, client identity and prefers genuine timestamps', async () => {
  const requests = [];
  const provider = createLrclibProvider(async (url, options) => {
    requests.push({ url: new URL(url), options });
    return response(track());
  });
  const found = await provider.get({ trackName: 'Blue Öyster Cult', artistName: 'The Artist', albumName: 'Album', duration: 220 });
  assert.equal(found.trackName, 'Blue Öyster Cult');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url.searchParams.get('duration'), '220');
  assert.equal(requests[0].url.searchParams.get('album_name'), 'Album');
  assert.equal(requests[0].options.headers['Lrclib-Client'], 'Ritmo/1.1.2');
  assert.equal(parseSyncedLyrics(found.syncedLyrics).length, 2);
});

test('404 precise lookup falls through structured and broader search instead of stopping', async () => {
  const urls = [];
  const outcome = await searchLyrics({ trackName: 'Blue Öyster Cult', artistName: 'The Artist', duration: 220 }, {
    fetcher: async url => {
      const parsed = new URL(url); urls.push(parsed);
      if (parsed.pathname.endsWith('/get')) return new Response('', { status: 404 });
      if (parsed.searchParams.has('track_name')) return response([]);
      if (parsed.searchParams.get('q') === 'Blue Öyster Cult The Artist') return response([track()]);
      return response([]);
    }, delay: noDelay,
  });
  assert.equal(outcome.selected?.trackName, 'Blue Öyster Cult');
  assert.equal(urls.some(url => url.pathname.endsWith('/get')), true);
  assert.equal(urls.some(url => url.searchParams.has('track_name')), true);
  assert.equal(urls.some(url => url.searchParams.get('q') === 'Blue Öyster Cult The Artist'), true);
});

test('similar titles are ranked by artist, album and duration, and unrelated records are rejected', () => {
  const query = { trackName: 'Stay', artistName: 'Rihanna', albumName: 'Loud', duration: 240 };
  const right = track({ id: 13, trackName: 'Stay', artistName: 'Rihanna', albumName: 'Loud', duration: 240 });
  const wrongArtist = track({ id: 14, trackName: 'Stay', artistName: 'Other Band', duration: 240 });
  const wrongDuration = track({ id: 15, trackName: 'Stay', artistName: 'Rihanna', duration: 300 });
  assert.ok(scoreLyricsCandidate(query, right) > scoreLyricsCandidate(query, wrongArtist));
  assert.equal(scoreLyricsCandidate(query, wrongArtist), 0);
  assert.equal(scoreLyricsCandidate(query, wrongDuration), 0);
  assert.deepEqual(rankLyricsCandidates(query, [wrongArtist, right, right]).map(item => item.artistName), ['Rihanna']);
});

test('missing artist/duration skips brittle /get and still finds Unicode title-only results', async () => {
  const requested = [];
  const outcome = await searchLyrics({ trackName: 'سلام دنیا' }, {
    fetcher: async url => { requested.push(new URL(url)); return response([track({ trackName: 'سلام دنیا', artistName: null, duration: undefined, syncedLyrics: null })]); },
    delay: noDelay,
  });
  assert.equal(requested.some(url => url.pathname.endsWith('/get')), false);
  assert.equal(requested[0].searchParams.get('q'), 'سلام دنیا');
  assert.equal(outcome.selected?.trackName, 'سلام دنیا');
  assert.equal(normalizeLyricsText('  سلام، دنیا! '), 'سلام دنیا');
});

test('plain-only full text is retained and explicitly has no parsed timestamps', () => {
  const lyrics = 'Line one\n\nLine two\nLine three';
  const parsed = usableLyrics([track({ plainLyrics: lyrics, syncedLyrics: null })]);
  assert.equal(parsed[0].plainLyrics, lyrics);
  assert.equal(parsed[0].syncedLyrics, null);
  assert.deepEqual(parseSyncedLyrics(parsed[0].plainLyrics), []);
});

test('Genius is an optional metadata provider only, then LRCLIB resolves lyrics without scraping', async () => {
  const requests = [];
  const outcome = await searchLyrics({ trackName: 'Alias Song', artistName: 'Artist' }, {
    geniusAccessToken: 'user-token-not-stored', delay: noDelay,
    fetcher: async (url, options) => {
      const parsed = new URL(url); requests.push({ parsed, options });
      if (parsed.pathname.endsWith('/get')) return new Response('', { status: 404 });
      if (parsed.hostname === 'api.genius.com') return response({ response: { hits: [{ result: { title: 'Alias Song', primary_artist: { name: 'Artist' }, url: 'https://genius.com/artist-alias-song-lyrics' } }] } });
      if (parsed.pathname.endsWith('/search') && parsed.searchParams.get('track_name') === 'Alias Song' && requests.some(item => item.parsed.hostname === 'api.genius.com')) return response([track({ id: 31, trackName: 'Alias Song', artistName: 'Artist' })]);
      return response([]);
    },
  });
  assert.equal(requests.some(item => item.parsed.hostname === 'api.genius.com' && item.options.headers.Authorization === 'Bearer user-token-not-stored'), true);
  assert.equal(outcome.selected?.source, 'LRCLIB');
  assert.equal(outcome.selected?.syncedLyrics.includes('[00:01.00]'), true);
  const metadata = await createGeniusMetadataProvider('x', async () => response({ response: { hits: [{ result: { title: 'Only Metadata', primary_artist: { name: 'Singer' }, url: 'https://genius.com/singer-only-metadata-lyrics' } }] } }))
    .search({ trackName: 'Only Metadata' });
  assert.equal(metadata[0].source, 'Genius');
  assert.equal(metadata[0].plainLyrics, undefined);
});

test('Genius auth/provider failure is recorded but does not erase prior LRCLIB candidates', async () => {
  const outcome = await searchLyrics({ trackName: 'Song', artistName: 'Artist' }, {
    geniusAccessToken: 'bad-token', delay: noDelay,
    fetcher: async url => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith('/get')) return new Response('', { status: 404 });
      if (parsed.hostname === 'api.genius.com') return new Response('', { status: 401 });
      if (parsed.searchParams.get('q') === 'Song Artist') return response([track({ trackName: 'Song (Live)', artistName: 'Artist', duration: 220 })]);
      return response([]);
    },
  });
  assert.ok(outcome.failures.some(message => message.startsWith('Genius:lyrics-http-401')));
  assert.ok(outcome.candidates.some(item => item.trackName === 'Song (Live)'));
  assert.equal(outcome.selected, null, 'a live-version title is shown for manual choice, not silently auto-selected');
});

test('LRC parser handles multiple stamps, fractional variants, malformed data and Persian lines', () => {
  assert.deepEqual(parseSyncedLyrics('[01:02.50][00:03.2]سلام دنیا\r\n[00:04:250]ترانه\n[ar:artist]\n[00:75]bad'), [
    { time: 3.2, text: 'سلام دنیا' }, { time: 4.25, text: 'ترانه' }, { time: 62.5, text: 'سلام دنیا' },
  ]);
  assert.deepEqual(parseSyncedLyrics(null), []);
  assert.deepEqual(parseSyncedLyrics('[ar:artist]\n[00:04]'), []);
});

test('timestamp highlighting follows the player position, including pause/resume/seek boundaries', () => {
  const lines = parseSyncedLyrics('[00:01]one\n[00:04]two\n[00:08]three');
  assert.equal(activeLyricIndex(lines, 0), -1);
  assert.equal(activeLyricIndex(lines, 2), 0);
  assert.equal(activeLyricIndex(lines, 4), 1);
  assert.equal(activeLyricIndex(lines, 9), 2);
  // A seek is just the next real player position, so backward and forward jumps resolve immediately.
  assert.equal(activeLyricIndex(lines, 1), 0);
  assert.equal(activeLyricIndex(lines, 8.5), 2);
});

test('cache round-trips complete plain/synced content, validates TTL and ignores malformed entries', () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value) };
  const result = track({ plainLyrics: 'full\n\ntext', source: 'LRCLIB' });
  writeLyricsCache(storage, 'song', { trackName: 'Blue Öyster Cult' }, result, 1_000_000);
  const cached = readLyricsCache(storage, 'song', 1_000_100);
  assert.equal(cached.fresh, true);
  assert.equal(cached.record.result.plainLyrics, 'full\n\ntext');
  assert.equal(readLyricsCache(storage, 'song', 1_000_000 + 31 * 24 * 60 * 60 * 1000).fresh, false);
  data.set('bad', '{');
  assert.equal(readLyricsCache(storage, 'bad'), null);
});

test('transport handles 404, HTTP errors, Retry-After, malformed JSON, timeout and abort', async () => {
  assert.equal(await requestLyrics('x', undefined, async () => new Response('', { status: 404 })), null);
  await assert.rejects(requestLyrics('x', undefined, async () => new Response('', { status: 429, headers: { 'Retry-After': '4' } })), /lyrics-rate-limit-4/);
  await assert.rejects(requestLyrics('x', undefined, async () => new Response('{', { status: 200 })), SyntaxError);
  await assert.rejects(requestLyrics('x', undefined, async () => { throw new TypeError('network'); }), /network/);
  await assert.rejects(requestLyrics('x', undefined, async (_url, { signal }) => ({ status: 200, ok: true,
    text: () => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('abort', 'AbortError')))),
  }), 5), /lyrics-timeout/);
  const parent = new AbortController();
  await assert.rejects(requestLyrics('x', parent.signal, async () => { parent.abort(); return response({ plainLyrics: 'stale' }); }), { name: 'AbortError' });
});

test('empty or malformed provider payloads do not produce fabricated lyrics', async () => {
  assert.deepEqual(usableLyrics([{ plainLyrics: 5 }, { syncedLyrics: '[ar:artist]' }, null]), []);
  const outcome = await searchLyrics({ trackName: 'missing' }, { fetcher: async () => response([]), delay: noDelay });
  assert.equal(outcome.selected, null);
  assert.deepEqual(outcome.candidates, []);
});

test('a plain exact hit does not prevent a later synchronized result from winning', async () => {
  const outcome = await searchLyrics({ trackName: 'Song', artistName: 'Artist', duration: 200 }, {
    delay: noDelay,
    fetcher: async url => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith('/get')) return response(track({ id: 80, trackName: 'Song', artistName: 'Artist', duration: 200, syncedLyrics: null }));
      if (parsed.searchParams.has('track_name')) return response([track({ id: 81, trackName: 'Song', artistName: 'Artist', duration: 200 })]);
      return response([]);
    },
  });
  assert.equal(outcome.selected?.syncedLyrics != null, true);
  assert.equal(outcome.selected?.id, 81);
});

test('active lyrics consume player position and seek callbacks, with no independent playback clock', async () => {
  const fs = await import('node:fs');
  const player = fs.readFileSync(new URL('../src/components/PlayerSkinMenus.tsx', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../src/RitmoAppClean.tsx', import.meta.url), 'utf8');
  assert.match(player, /activeLyricIndex\(lyricsState, position\)/);
  assert.match(player, /controls\.seek\(line\.time\)/);
  assert.match(player, /scrollIntoView\(\{ behavior: 'smooth', block: 'center' \}\)/);
  assert.match(app, /position=\{position\}/);
  assert.match(app, /lyrics=\{track\.lyrics\}/);
  assert.doesNotMatch(player, /setInterval\(/);
});


test('rip-site attribution suffixes are removed from search matching and results display', async () => {
  assert.equal(cleanLyricsMetadata('Yar Yar (Www.ArdabilMusic.Com)'), 'Yar Yar');
  assert.equal(cleanLyricsMetadata('Adel Azarivand (www.ArdabilMusic.com)'), 'Adel Azarivand');
  const candidate = track({ trackName: 'Yar Yar', artistName: 'Adel Azarivand', duration: 240, syncedLyrics: '[00:01]line' });
  const query = { trackName: 'Yar Yar (Www.ArdabilMusic.Com)', artistName: 'Adel Azarivand (Www.ArdabilMusic.Com)', duration: 240 };
  assert.ok(scoreLyricsCandidate(query, candidate) > .9);
  const found = usableLyrics([track({ trackName: 'Yar Yar (Www.ArdabilMusic.Com)', artistName: 'Adel Azarivand (Www.ArdabilMusic.Com)' })]);
  assert.equal(found[0].trackName, 'Yar Yar');
  assert.equal(found[0].artistName, 'Adel Azarivand');
});

test('cleaned exact metadata can auto-resolve lyrics rather than leaving only noisy search rows', async () => {
  const outcome = await searchLyrics({ trackName: 'Yar Yar (Www.ArdabilMusic.Com)', artistName: 'Adel Azarivand (Www.ArdabilMusic.Com)', duration: 240 }, {
    delay: noDelay, fetcher: async url => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith('/get')) return response(track({ id: 910, trackName: 'Yar Yar', artistName: 'Adel Azarivand', duration: 240 }));
      return response([]);
    },
  });
  assert.equal(outcome.selected?.trackName, 'Yar Yar');
  assert.equal(outcome.selected?.artistName, 'Adel Azarivand');
});


test('lyrics panel uses cleaned tag labels instead of exposing rip-site suffixes in manual search fields', async () => {
  const fs = await import('node:fs');
  const panel = fs.readFileSync(new URL('../src/components/PlayerSkinMenus.tsx', import.meta.url), 'utf8');
  assert.match(panel, /useState\(\(\) => cleanLyricsMetadata\(trackTitle\)\)/);
  assert.match(panel, /useState\(\(\) => cleanLyricsMetadata\(artist\)\)/);
  assert.match(panel, /setManualTitle\(cleanLyricsMetadata\(trackTitle\)\)/);
  assert.match(panel, /setManualArtist\(cleanLyricsMetadata\(artist\)\)/);
  assert.match(panel, /cleanLyricsMetadata\(trackTitle\) \|\| manualTitle/);
});
