import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { normalizeBackupFileName } from '../src/utils/settingsBackup.ts';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('backup file names are user-defined, safe, and receive one JSON extension', () => {
  assert.equal(normalizeBackupFileName('پشتیبان مهرماه'), 'پشتیبان مهرماه.json');
  assert.equal(normalizeBackupFileName('My backup.json'), 'My backup.json');
  assert.equal(normalizeBackupFileName('../bad/name'), 'badname.json');
  assert.equal(normalizeBackupFileName('   '), 'Ritmo-backup.json');
});

test('Nocturne bottom dock has icons for all five actions and reserves player space above it', () => {
  const menus = read('src/components/PlayerSkinMenus.tsx');
  const css = read('src/components/NocturnePlayerSkin.css');
  assert.match(menus, /button\('تایمر خواب', <><Timer \/>/);
  assert.match(menus, /button\('صدا و سرعت', <><Volume2 \/>/);
  assert.match(menus, /button\('اکولایزر', <><SlidersVertical \/>/);
  assert.match(menus, /button\('متن ترانه', <><Quote \/>/);
  assert.match(menus, /button\('عملیات آهنگ', <><MoreHorizontal \/>/);
  assert.match(css, /bottom:max\(88px,calc\(16px \+ env\(safe-area-inset-bottom,0px\)\)\)/);
});

test('sound and speed panel keeps rate controls and contains no volume slider or volume-only code', () => {
  const menus = read('src/components/PlayerSkinMenus.tsx');
  const css = read('src/components/PlayerSkinMenus.css');
  const start = menus.indexOf("panel === 'sound' ? <div");
  const panel = menus.slice(start, menus.indexOf("panel === 'eq' ? <div", start));
  assert.match(panel, /سرعت پخش/);
  assert.match(panel, /skin-menu-speed-options/);
  assert.doesNotMatch(panel, /بلندی صدا|ritmo-player-volume|type="range"/);
  assert.doesNotMatch(menus, /volumeRange|volumePercent/);
  assert.doesNotMatch(css, /skin-menu-sound-card input\[type="range"\]/);
});

test('studio cassette keeps its duration while Studio Cassette and Midnight Orbit titles are slightly smaller', () => {
  const referenceCss = read('src/components/ReferencePlayerSkins.css');
  const reference = read('src/components/ReferencePlayerSkins.tsx');
  assert.match(referenceCss, /\.ref-studio-cassette \.ref-details h1, \.ref-midnight-orbit \.ref-details h1 \{ font-size:clamp\(16px,4\.8cqi,22px\); \}/);
  assert.match(reference, /const details = <div className="ref-details" dir="auto">\s*<h1>\{title\}<\/h1>\s*<\/div>/);
  assert.doesNotMatch(reference.slice(reference.indexOf('const details'), reference.indexOf('const shuffle')), /artist|duration|genre|year/);
  assert.match(reference, /<div className="ref-times"><span>\{time\(position\)\}<\/span><span>\{time\(duration\)\}<\/span><\/div>/);
  assert.match(referenceCss, /\.ref-midnight-orbit \.ref-heading-row \{[^}]*margin:8px 0 0/s);
  assert.doesNotMatch(read('src/components/PlayerSkins.css'), /skin-cassette\).*skin-vinyl.*font-size/);
});

test('playlist track-picker confirmation stays sticky, safe-area aware, and guards duplicate commits', () => {
  const app = read('src/RitmoAppClean.tsx');
  const css = read('src/index.css');
  assert.match(app, /const confirmPlaylistTracks = \(\) => \{[\s\S]*playlistAddPending\.current[\s\S]*setPicker\(null\)/);
  assert.match(app, /Array\.from\(new Set\(\[\.\.\.p\.trackIds, \.\.\.ids\]\)\)/);
  assert.match(app, /ritmo-picker-sticky-footer[\s\S]*onClick=\{confirmPlaylistTracks\}/);
  assert.match(css, /\.ritmo-picker-sticky-footer \{[^}]*position:sticky/s);
  assert.match(css, /bottom:calc\(8px \+ env\(safe-area-inset-bottom, 0px\)\)/);
});

test('playlist detail uses compact dimensions and raised controls only inside its own route', () => {
  const css = read('src/components/PlaylistDetail.css');
  assert.match(css, /\.ritmo-playlist-hero \{ min-height:280px; height:clamp\(280px, 42svh, 390px\); \}/);
  assert.match(css, /\.ritmo-playlist-primary \{[^}]*box-shadow:/);
  assert.match(css, /\.ritmo-playlist-track-art \{ width:56px; height:56px; \}/);
});

test('lyrics open as an in-app full-screen page and search the internet without external redirects', () => {
  const menus = read('src/components/PlayerSkinMenus.tsx');
  const css = read('src/components/PlayerSkinMenus.css');
  assert.match(menus, /new AbortController\(\)/);
  assert.match(menus, /controller\.abort\(\)/);
  assert.match(menus, /searchLyricsOnline/);
  assert.match(read('src/utils/lyrics.ts'), /api\/search/);
  assert.match(menus, /skin-menu-dialog-lyrics/);
  assert.match(menus, /skin-menu-lyrics-results/);
  assert.doesNotMatch(menus, /www\.google\.com\/search/);
  assert.match(css, /height: 100dvh/);
});

test('active native lyrics read both embedded plain ID3 text and real SYLT timing', () => {
  const plugin = read('android/app/src/main/java/com/adelapp/larkplayer/NativeMediaPlugin.java');
  const parser = read('android/app/src/main/java/com/adelapp/larkplayer/EmbeddedLyrics.java');
  assert.match(plugin, /EmbeddedLyrics\.readSynced\(syncedStream\)/);
  assert.match(plugin, /result\.put\("syncedText"/);
  assert.match(parser, /id\.equals\("SYLT"\)/);
  assert.match(read('src/utils/nativeMedia.ts'), /syncedText\?: string/);
});

test('native backup file-provider IO cannot block preference backup operations', () => {
  const plugin = read('android/app/src/main/java/com/adelapp/larkplayer/SettingsBackupPlugin.java');
  assert.match(plugin, /preferenceIo = new ThreadPoolExecutor\(0, 2/);
  assert.match(plugin, /synchronized \(PREFERENCES_LOCK\)/);
  assert.match(plugin, /PREFERENCES_LOCK = new Object\(\)/);
  assert.match(plugin, /fileIo = new ThreadPoolExecutor\(0, 2/);
  assert.match(plugin, /postDelayed\(pickerTimeout, 30000\)/);
  assert.match(plugin, /submitFile\(call, \(\) ->/);
});

test('native backup picker accepts user-defined Unicode file names and tolerates unknown document size', () => {
  const plugin = read('android/app/src/main/java/com/adelapp/larkplayer/SettingsBackupPlugin.java');
  assert.match(plugin, /\[\\\\p\{L\}\\\\p\{N\} _\(\)\.-\]\{1,80\}\\\\\.json/);
  assert.match(plugin, /cursor != null && cursor\.moveToFirst\(\) && !cursor\.isNull\(0\) && cursor\.getLong\(0\) > 0/);
  assert.match(plugin, /Intent\.ACTION_CREATE_DOCUMENT/);
  assert.match(plugin, /Intent\.ACTION_OPEN_DOCUMENT/);
});

test('lyrics requests have a bounded timeout and manual searches are cancellable', () => {
  const menus = readFileSync(new URL('../src/components/PlayerSkinMenus.tsx', import.meta.url), 'utf8');
  const network = read('src/utils/lyrics.ts');
  assert.match(network, /deadlineMs = 12000/);
  assert.match(network, /createLrclibProvider/);
  assert.match(network, /api\/get/);
  assert.match(network, /api\/search/);
  assert.match(menus, /searchLyrics/);
  assert.match(menus, /lyricsSearchController\.current\?\.abort\(\)/);
  assert.match(menus, /پاسخ سرویس بیش از ۱۲ ثانیه طول کشید/);
});


test('playlist-name prompt is fully themed and bounded, not a blank half-screen sheet', () => {
  const app = read('src/RitmoAppClean.tsx');
  const css = read('src/index.css');
  assert.match(app, /className="ritmo-dialog-playlist-name"/);
  assert.match(css, /\.ritmo-dialog-playlist-name[^}]*background-color: #141a23/s);
  assert.match(css, /\.ritmo-dialog-playlist-name[^}]*position: fixed[^}]*max-height: min\(calc\(100dvh - 24px\), 390px\)/s);
  assert.match(css, /\.ritmo-dialog-playlist-name::backdrop/);
});

test('all player bottom docks reserve visible space above Android system navigation', () => {
  const menus = read('src/components/PlayerSkinMenus.css');
  const native = read('android/app/src/main/java/com/adelapp/larkplayer/MainActivity.java');
  assert.match(menus, /skin-menu-dock[^}]*max\(12px,env\(safe-area-inset-bottom,0px\)\)/);
  assert.match(native, /WindowCompat\.setDecorFitsSystemWindows\(getWindow\(\), false\)/);
});

test('equalizer sliders use the existing audio path with a dimensional fader treatment', () => {
  const css = read('src/components/PlayerSkinMenus.css');
  const menus = read('src/components/PlayerSkinMenus.tsx');
  assert.match(menus, /controls\?\.equalizerChange/);
  assert.match(css, /perspective: 900px/);
  assert.match(css, /linear-gradient\(180deg,#f5fdff 0%,#82d9ff/);
  assert.match(css, /skin-menu-eq-sliders label::before/);
});

test('playlist creation closes picker overlay, preserves RTL form behavior, and guards duplicate submits', () => {
  const app = read('src/RitmoAppClean.tsx');
  const source = app.slice(app.indexOf('  const createPlaylist ='), app.indexOf('  const deleteSong ='));
  assert.match(source, /setPicker\(null\)/);
  assert.match(source, /playlistCreatePending\.current/);
  assert.match(source, /setPlaylists\(old => \[\.\.\.old/);
  assert.match(source, /randomUUID/);
  assert.match(read('android/app/src/main/AndroidManifest.xml'), /windowSoftInputMode="adjustResize"/);
  assert.match(app, /dir="rtl" aria-label=\{title\}/);
  assert.match(app, /autoFocus enterKeyHint="done"/);
  assert.match(app, /close=\{closePlaylistName\}/);
  assert.match(app, /onClick=\{closePlaylistName\}/);
});

test('playlist submit creates once, supports keyboard Enter and cancel without creation', () => {
  const app = read('src/RitmoAppClean.tsx');
  const source = app.slice(app.indexOf('  const createPlaylist ='), app.indexOf('  const deleteSong ='));
  const code = stripTypeScriptTypes(`${source}\n({ createPlaylist, closePlaylistName, submitPlaylist });`);
  const context = {
    picker: { kind: 'playlists', trackId: 'song-1' }, playlistName: '', playlistNameOpen: false,
    playlistCreatePending: { current: false }, playlists: [],
    crypto: { randomUUID: () => 'playlist-fixed-id' }, Math,
  };
  context.setPicker = value => { context.picker = value; };
  context.setPlaylistName = value => { context.playlistName = value; };
  context.setPlaylistNameOpen = value => { context.playlistNameOpen = value; };
  context.setPlaylists = update => { context.playlists = update(context.playlists); };
  const handlers = runInNewContext(code, context);
  handlers.createPlaylist();
  assert.equal(context.picker, null, 'the previous full-screen picker overlay must be dismissed');
  assert.equal(context.playlistNameOpen, true);
  context.playlistName = '  لیست فارسی  ';
  const event = { preventDefault() {} };
  handlers.submitPlaylist(event);
  handlers.submitPlaylist(event);
  assert.equal(context.playlists.length, 1);
  assert.equal(context.playlists[0].name, 'لیست فارسی');
  assert.equal(context.playlists[0].id, 'playlist-fixed-id');
  assert.equal(context.playlistNameOpen, false);
  handlers.createPlaylist();
  context.playlistName = 'لغو شده';
  handlers.closePlaylistName();
  assert.equal(context.playlists.length, 1);
  assert.equal(context.playlistName, '');
  assert.equal(context.playlistNameOpen, false);
});

test('Nocturne player stays fixed to the viewport while retaining the dedicated seek target', () => {
  const css = read('src/components/NocturnePlayerSkin.css');
  assert.match(css, /\.ritmo-nocturne-arc \{[^}]*touch-action:pan-y/s);
  assert.match(css, /\.ritmo-nocturne-arc-touch \{[^}]*touch-action:none/s);
  assert.match(css, /\.ritmo-player-nocturne \{[^}]*overflow:hidden/s);
  assert.match(css, /ritmo-nocturne-live[^}]*height:100%[^}]*aspect-ratio:auto/s);
});

test('Android applies system bars once and lets adjustResize handle the keyboard', () => {
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  const activity = read('android/app/src/main/java/com/adelapp/larkplayer/MainActivity.java');
  assert.match(manifest, /android:windowSoftInputMode="adjustResize"/);
  assert.doesNotMatch(activity, /Type\.ime\(\)|keyboard\.bottom/);
  assert.match(activity, /view\.setPadding\(bars\.left, bars\.top, bars\.right, bars\.bottom\)/);
});
