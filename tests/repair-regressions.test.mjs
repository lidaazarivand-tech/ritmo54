import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { loadNativePlugin } from '../src/utils/pluginBridge.ts';
import { reorderIds, reorderPlaylistQueue, sameOrder } from '../src/utils/playlistOrder.ts';
import { parseSyncedLyrics, usableLyrics, requestLyrics } from '../src/utils/lyrics.ts';
import { createBackup, validateBackup, restoreBackup } from '../src/utils/settingsBackup.ts';
import { writeStorageTransaction } from '../src/utils/storageTransaction.ts';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('actual thenable proxy reproduces legacy hang and production bridge wrapper avoids assimilation', async () => {
  const methods = [];
  const proxy = new Proxy({}, { get: (_target, name) => (..._args) => {
    methods.push(name);
    return name === 'exportPreferences' ? Promise.resolve({ preferences: {} }) : undefined;
  } });
  // Legacy async return invokes .then instead of resolving to a plugin.
  const legacy = (async () => proxy)();
  let legacySettled = false;
  void legacy.then(() => { legacySettled = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(methods, ['then']);
  assert.equal(legacySettled, false);
  methods.length = 0;
  const box = await loadNativePlugin('SettingsBackup', async () => ({ registerPlugin: () => proxy }));
  assert.equal(box.plugin, proxy);
  assert.deepEqual(await box.plugin.exportPreferences(), { preferences: {} });
  assert.deepEqual(methods, ['exportPreferences']);
});

test('bridge import failure is delivered to its caller and does not create a native operation', async () => {
  await assert.rejects(loadNativePlugin('SettingsBackup', async () => { throw new Error('bridge unavailable'); }), /bridge unavailable/);
});

test('manual reorder inserts instead of swapping and retains unavailable member identities', () => {
  const saved = ['audio-1', 'missing', 'audio-2', 'audio-3'];
  assert.deepEqual(reorderIds(saved, 'audio-1', 'audio-3'), ['missing', 'audio-2', 'audio-3', 'audio-1']);
  assert.deepEqual(reorderIds(saved, 'audio-3', 'audio-1'), ['audio-3', 'audio-1', 'missing', 'audio-2']);
  assert.deepEqual(saved, ['audio-1', 'missing', 'audio-2', 'audio-3']);
  assert.deepEqual(reorderIds(saved, 'unknown', 'audio-1'), saved);
  assert.equal(sameOrder(saved, [...saved]), true);
  assert.equal(sameOrder(saved, [...saved].reverse()), false);
});

test('every reorder permutation preserves the current item by identity and includes all original IDs', () => {
  const ids = Array.from({length: 50}, (_, i) => `audio-${i}`);
  for (const from of ids) for (const to of ids) {
    const next = reorderIds(ids, from, to);
    assert.equal(next.length, ids.length);
    assert.equal(new Set(next).size, ids.length);
    assert.equal(next[next.indexOf('audio-23')], 'audio-23');
  }
});

test('active queue reorder is guarded against stale snapshots and never reloads playback', () => {
  const plugin = read('android/app/src/main/java/com/adelapp/larkplayer/NativeMediaPlugin.java');
  const method = plugin.slice(plugin.indexOf('} else if ("reorder".equals(action))'), plugin.indexOf('} else if ("move".equals(action))'));
  assert.match(method, /expected.getString/);
  assert.match(method, /!used\[from\]/);
  assert.match(method, /controller.moveMediaItem\(from, to\)/);
  assert.doesNotMatch(method, /setMediaItems|seekTo|setShuffle|setRepeat|\.play\(/);
  const app = read('src/RitmoAppClean.tsx');
  assert.match(app, /sameOrder\(oldVisible, queue\)/);
  assert.match(app, /writeStorageTransaction\(\{\s*ritmo_playlists:/);
  assert.doesNotMatch(app.slice(app.indexOf('const play = async'), app.indexOf('const selectQueue =')), /setShuffle\(false\)|setModes\(false/);
});

function playlistHandlerHarness({active=true, nativeFailure=false, storageFailure=false}={}) {
  const source=read('src/RitmoAppClean.tsx');
  const code=stripTypeScriptTypes(source.slice(source.indexOf('  const reorderPlaylistAt = async'),source.indexOf('  const observedSort =')));
  const saved=new Map();
  const store={getItem:key=>saved.get(key)??null,setItem:(key,value)=>saved.set(key,String(value)),removeItem:key=>saved.delete(key)};
  const calls=[];
  const context={
    reorderPlaylistQueue,sameOrder,playlists:[{id:'playlist-1',name:'آهنگ‌ها',trackIds:['audio-1','unavailable','audio-2','audio-3']}],
    tracks:['audio-1','audio-2','audio-3'].map(id=>({id,mediaType:'audio'})),
    queue:active?['audio-1','audio-2','audio-3']:['audio-9'],
    currentId:active?'audio-2':'audio-9',queuePlaylist:{current:active?'playlist-1':'playlist-9'},
    playlistMutation:{current:false},backupOperation:{current:false},mediaOperation:{current:false},
    libraryRevision:{current:0},queueCursor:{current:1},native:true,storageRecoveryError:'',storageReadErrors:new Set(),
    NativeMedia:{modifyQueue:async options=>{calls.push(options);if(nativeFailure)throw new Error('native reorder failed');}},
    writeStorageTransaction:values=>{if(storageFailure)throw new Error('quota');writeStorageTransaction(values,store);},
    setPlaylists:value=>{context.playlists=value;},
    setQueue:value=>{context.queue=value;},
    setPlaylistSaving:value=>{context.saving=value;},
    setError:value=>{context.error=value;},
  };
  return {context,saved,calls,reorder:runInNewContext(`${code}\nreorderPlaylistAt;`,context)};
}

test('production playlist handler persists inserted order and active queue while retaining current identity', async () => {
  const h=playlistHandlerHarness();
  await h.reorder('playlist-1',3,0);
  assert.deepEqual(JSON.parse(h.saved.get('ritmo_playlists'))[0].trackIds,['audio-3','audio-1','unavailable','audio-2']);
  assert.deepEqual(JSON.parse(h.saved.get('ritmo_queue')),['audio-3','audio-1','audio-2']);
  assert.equal(h.context.currentId,'audio-2');
  assert.equal(h.context.queueCursor.current,2);
  assert.equal(h.calls[0].action,'reorder');
  assert.equal(h.context.playlistMutation.current,false);
  assert.equal(h.context.saving,false);
});

test('production playlist handler does not replace an unrelated active queue', async () => {
  const h=playlistHandlerHarness({active:false});
  await h.reorder('playlist-1',3,0);
  assert.equal(h.calls.length,0);
  assert.deepEqual(h.context.queue,['audio-9']);
  assert.equal(h.saved.has('ritmo_queue'),false);
  assert.equal(JSON.parse(h.saved.get('ritmo_playlists'))[0].trackIds[0],'audio-3');
});

test('playlist queue reorder preserves manually added extras and duplicate occurrences', () => {
  assert.deepEqual(reorderPlaylistQueue(['audio-1','extra','audio-2','audio-1','audio-3'],['audio-3','audio-1','audio-2']),
    ['audio-3','extra','audio-1','audio-1','audio-2']);
  assert.deepEqual(reorderPlaylistQueue(['extra'],['audio-3','audio-1']),['extra']);
});

test('production handler updates an active playlist queue even after manual queue additions', async () => {
  const h=playlistHandlerHarness();
  h.context.queue=['audio-1','extra','audio-2','audio-3'];
  await h.reorder('playlist-1',3,0);
  assert.deepEqual(Array.from(h.context.queue),['audio-3','extra','audio-1','audio-2']);
  assert.equal(h.context.currentId,'audio-2');
});

test('production playlist handler rejects native failure without changing durable order', async () => {
  const h=playlistHandlerHarness({nativeFailure:true});
  await h.reorder('playlist-1',3,0);
  assert.equal(h.saved.size,0);
  assert.equal(h.context.playlists[0].trackIds[0],'audio-1');
  assert.match(h.context.error,/native reorder failed/);
  assert.equal(h.context.playlistMutation.current,false);
});

test('production playlist handler rolls native order back after storage failure and releases its guard', async () => {
  const h=playlistHandlerHarness({storageFailure:true});
  await h.reorder('playlist-1',3,0);
  assert.equal(h.calls.length,2);
  assert.deepEqual(Array.from(h.calls[1].order),['audio-1','audio-2','audio-3']);
  assert.equal(h.saved.size,0);
  assert.equal(h.context.playlistMutation.current,false);
  assert.equal(h.context.saving,false);
});

test('queue artwork uses the row track and the shared bounded lazy cache', () => {
  const app = read('src/RitmoAppClean.tsx');
  const queue = app.slice(app.indexOf('{queueOpen && <div'), app.indexOf('{settings && <PlayerSettings'));
  assert.match(queue, /<Artwork track=\{t\}/);
  assert.doesNotMatch(queue, /<Artwork track=\{current\}/);
  assert.match(app, /artworkCache.size <= 128/);
  assert.match(app, /IntersectionObserver/);
});

test('active spectrum bars and equalizer sliders are white without changing audio analysis', () => {
  assert.match(read('src/components/ReferencePlayerSkins.css'), /\.ref-spectrum i \{[^}]*background:#fff/);
  assert.match(read('src/components/PlayerSkinMenus.css'), /accent-color:\s*#fff/);
  const skin = read('src/components/ReferencePlayerSkins.tsx');
  assert.match(skin, /frame.bands/);
  assert.match(skin, /bands\[Math.floor\(index \/ 2\)\]/);
});

test('SDK 36 insets resize the WebView host from real system and keyboard insets', () => {
  const activity = read('android/app/src/main/java/com/adelapp/larkplayer/MainActivity.java');
  assert.match(activity, /findViewById\(android.R.id.content\)/);
  assert.match(activity, /WindowInsetsCompat.Type.systemBars\(\)/);
  assert.match(activity, /WindowInsetsCompat.Type.displayCutout\(\)/);
  assert.match(activity, /view.setPadding\(bars.left, bars.top, bars.right, bars.bottom\)/);
  assert.doesNotMatch(activity, /keyboard\.bottom/);
  assert.doesNotMatch(activity, /SYSTEM_UI_FLAG_HIDE_NAVIGATION|\.hide\(/);
});

test('playlist collection has no horizontal truncation and creation label is shortened only there', () => {
  const app = read('src/RitmoAppClean.tsx');
  const section = app.slice(app.indexOf("{tab === 'playlists' && <section"), app.indexOf('{activePlaylist && <PlaylistDetail'));
  assert.match(section, />\+ افزودن<\/button>/);
  assert.match(section, /playlists.filter/);
  assert.doesNotMatch(section, /\.slice\(|overflow-x-auto|افزودن لیست پخش/);
  assert.match(read('src/components/PlaylistDetail.css'), /\.ritmo-playlist-grid \{ display:grid/);
});

test('LRC parses multiple stamps, fractional seconds and Unicode in chronological order', () => {
  assert.deepEqual(parseSyncedLyrics('[01:02.50][00:03.2]سلام دنیا\r\n[00:04:250]ترانه\n[ar:artist]\n[00:75]bad'), [
    { time:3.2, text:'سلام دنیا' }, { time:4.25, text:'ترانه' }, { time:62.5, text:'سلام دنیا' },
  ]);
  assert.deepEqual(parseSyncedLyrics(null), []);
});

test('lyrics result validation rejects null, primitives and malformed provider metadata', () => {
  assert.deepEqual(usableLyrics([null, 'x', 4, {}, { plainLyrics:5 }, { plainLyrics:'سلام', trackName:3 }]), []);
  assert.equal(usableLyrics([{ plainLyrics:'سلام', trackName:'آهنگ' }])[0].plainLyrics, 'سلام');
});

test('mocked lyrics transport parses JSON and preserves encoded Persian query (not a provider connectivity test)', async () => {
  let requested;
  const url = `https://lrclib.net/api/search?${new URLSearchParams({ q:'آهنگ خواننده' })}`;
  const data = await requestLyrics(url, undefined, async (input, options) => {
    requested = { input, options };
    return new Response(JSON.stringify([{ plainLyrics:'سلام' }]), {status:200});
  });
  assert.equal(new URL(requested.input).searchParams.get('q'), 'آهنگ خواننده');
  assert.equal(requested.options.headers.Accept, 'application/json');
  assert.equal(usableLyrics(data).length, 1);
});

test('lyrics transport handles 404, rate limits, malformed JSON and network failure', async () => {
  assert.equal(await requestLyrics('test', undefined, async () => new Response('', {status:404})), null);
  await assert.rejects(requestLyrics('test', undefined, async () => new Response('', {status:429})), /lyrics-rate-limit/);
  await assert.rejects(requestLyrics('test', undefined, async () => new Response('{', {status:200})), SyntaxError);
  await assert.rejects(requestLyrics('test', undefined, async () => { throw new TypeError('network'); }), /network/);
});

test('lyrics timeout covers a delayed body and a subsequent retry succeeds', async () => {
  await assert.rejects(requestLyrics('test', undefined, async (_url, {signal}) => ({
    status:200, ok:true,
    text: () => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('abort','AbortError')))),
  }), 5), /lyrics-timeout/);
  assert.deepEqual(await requestLyrics('test', undefined, async () => new Response('{"plainLyrics":"retry"}')), {plainLyrics:'retry'});
});

test('lyrics caller cancellation cannot publish a late response', async () => {
  const parent = new AbortController();
  await assert.rejects(requestLyrics('test', parent.signal, async () => {
    parent.abort();
    return new Response('{"plainLyrics":"old song"}');
  }), { name:'AbortError' });
  const menus = read('src/components/PlayerSkinMenus.tsx');
  assert.match(menus, /lyricsSearchController.current !== controller/);
  assert.match(menus, /trackIdentity.id, trackIdentity.uri/);
  assert.match(menus, /if \(!active \|\| controller.signal.aborted \|\| lyricsSearchController.current !== controller\)/);
});

test('backup handles Persian nested playlists, empty state and a supported large payload', async () => {
  const playlists = Array.from({length:1000}, (_, i) => ({
    id:`playlist-${i}`, name:`ترانه‌های من ${i}`, trackIds:['audio-1','audio-2'], coverTrackId:'audio-2',
  }));
  for (const storage of [{}, {ritmo_playlists:JSON.stringify(playlists), ritmo_eq_gains:JSON.stringify(Array(10).fill(3))}]) {
    const backup = await createBackup('1.1.2', storage, false);
    const verified = await validateBackup(JSON.stringify(backup));
    assert.deepEqual(verified.payload.storage, storage);
  }
});

test('simultaneous backup generation rejects duplicate calls and releases the gate after completion', async () => {
  const first = createBackup('1.1.2', {}, false);
  await assert.rejects(createBackup('1.1.2', {}, false), /دیگری/);
  await first;
  assert.equal((await createBackup('1.1.2', {}, false)).version, 1);
});
