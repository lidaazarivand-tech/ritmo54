import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const component = read('src/components/PlaylistDetail.tsx');
const app = read('src/RitmoAppClean.tsx');
const css = read('src/components/PlaylistDetail.css');
const durationCode = stripTypeScriptTypes(component.slice(component.indexOf('export function playlistDuration'), component.indexOf('type Props')).replace('export ', ''));
const duration = runInNewContext(`${durationCode}\nplaylistDuration;`);

test('playlist duration handles missing metadata, seconds and hours without invalid output', () => {
  assert.equal(duration([]), 'زمان نامشخص');
  assert.equal(duration([{ duration: NaN }, { duration: -5 }, { duration: Infinity }]), 'زمان نامشخص');
  assert.equal(duration([{ duration: 1 }]), '۱ دقیقه');
  assert.equal(duration([{ duration: 120 }, { duration: 180 }]), '۵ دقیقه');
  assert.equal(duration([{ duration: 3600 }]), '۱ ساعت');
  assert.equal(duration([{ duration: 3660 }]), '۱ ساعت و ۱ دقیقه');
});

test('playlist redesign delegates all transport and library mutations to the existing owner', () => {
  assert.doesNotMatch(component, /new Audio|AudioContext|NativeMedia|localStorage|fetch\(|setInterval/);
  for (const action of ['back', 'add', 'chooseCover', 'playAll', 'cyclePlaybackMode', 'toggleManualMode'])
    assert.ok(component.includes(`onClick={${action}}`) || component.includes(`run(${action})`), action);
  assert.match(app, /<PlaylistDetail key=\{activePlaylist.id\}/);
  assert.match(app, /visibleTracks=\{list\}/);
  assert.match(app, /cyclePlaylistPlaybackMode\(activePlaylistMode\)/);
  assert.match(app, /await setModes\(activePlaylistMode === 'shuffle', activePlaylistMode === 'repeat' \? 'all' : 'off'\)/);
  assert.match(app, /manual: !playlistManual/);
  assert.match(app, /manual=\{playlistManual\}/);
  assert.match(app, /reorderTrack=\{\(from, to\) => void reorderPlaylistAt\(activePlaylist.id, from, to\)\}/);
  assert.match(app, /removeTrack=\{id => removeFromPlaylist\(activePlaylist.id, id\)\}/);
  assert.match(app, /moreTrack=\{t => \{ setActionSpeedOpen\(false\); setActionId\(t.id\); \}\}/);
});

test('browser fixture uses the current numeric reorder API and required manual-mode props', () => {
  const fixture = read('verification/browser-entry.tsx');
  assert.match(fixture, /reorder = \(from:number,to:number\)/);
  assert.match(fixture, /visibleTrackIndexes=\{ids\.map\(\(_,index\)=>index\)\} manual=\{true\}/);
  assert.match(fixture, /reorderTrack=\{reorder\}/);
  assert.doesNotMatch(fixture, /\bmoveTrack\s*=/);
  assert.doesNotMatch(fixture, /reorderTrack=\{\(moving:string,target:string\)/);
});

test('playlist rows use a dedicated long-press handle and retain playing, paused and empty states', () => {
  assert.doesNotMatch(component, /ویرایش ترتیب آهنگ‌ها|setEditing/);
  assert.match(component, /setTimeout\(/);
  assert.match(component, /onPointerCancel=\{\(\) => finishGesture\(false\)\}/);
  assert.match(component, /ritmo-playlist-drag-handle/);
  assert.match(component, /⠿/);
  assert.doesNotMatch(component, /<Arrow(?:Up|Down)(?:\s|>)|GripVertical|\bmoveTrack\b/);
  assert.match(component, /onPointerDown=\{event => beginGesture\(event, visibleTrackIndexes\[trackIndex\]/);
  assert.match(component, /reorderTrack\(state.id, state.target\)/);
  assert.match(component, /currentId === track.id && <span className=\{`ritmo-playlist-now/);
  assert.match(component, /playing \? 'is-playing' : ''/);
  assert.match(component, /!visibleTracks.length/);
  assert.match(component, /disabled=\{!tracks.length\}/);
  assert.match(component, /onKeyDown=.*$/m);
  assert.match(component, /dir="auto"/);
  assert.match(component, /aria-current=/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /min-width:0/);
  assert.match(css, /text-overflow:ellipsis/);
  assert.doesNotMatch(css, /(?:^|\n)(?:body|html|:root|\*)\s*\{/);
});

test('native numeric seek regression fix stays in the delivered project', () => {
  const plugin = read('android/app/src/main/java/com/adelapp/larkplayer/NativeMediaPlugin.java');
  assert.match(plugin, /RecoveryPolicy\.milliseconds\(call\.getData\(\)\.opt\("value"\)\)/);
  assert.doesNotMatch(plugin, /call\.getLong\("value"/);
});


test('playlist order uses one manual handle only in manual mode, with no arrow controls', () => {
  assert.match(component, /manual && <button type="button" className="ritmo-playlist-drag-handle"/);
  assert.match(component, /خاموش‌کردن ترتیب دستی/);
  assert.match(component, /فعال‌کردن ترتیب دستی/);
  assert.match(component, /data-track-index=\{visibleTrackIndexes/);
  assert.doesNotMatch(component, /ritmo-playlist-row-order|<Arrow(?:Up|Down)(?:\s|>)|GripVertical/);
  assert.match(css, /ritmo-playlist-drag-handle/);
  assert.match(css, /ritmo-playlist-track-main \{ touch-action:pan-y/);
});

test('playlist page cycles sequence, shuffle, repeat and exposes a persisted per-playlist manual toggle', () => {
  assert.match(component, /playbackMode === 'shuffle' \? <Shuffle/);
  assert.match(component, /playbackMode === 'repeat' \? <Repeat/);
  assert.match(component, /<ListMusic/);
  assert.match(component, /aria-label=\{`حالت پخش لیست:/);
  assert.match(app, /playlistPlaybackMode\(shuffle, repeat\)/);
  assert.match(app, /cyclePlaylistPlaybackMode\(activePlaylistMode\)/);
  assert.match(app, /manual\?: boolean/);
  assert.match(app, /typeof playlist\.manual === 'boolean'/);
  assert.match(app, /typeof playlist\.manual === 'boolean' \? \{ manual: playlist\.manual \} : \{\}/);
});

test('playlist manual mode survives the app storage reader independently for each playlist', () => {
  const start = app.indexOf('const storedId =');
  const end = app.indexOf('const save =', start);
  const source = stripTypeScriptTypes(`${app.slice(start, end)}\nJSON.stringify(json('ritmo_playlists', []))`);
  const context = {
    localStorage: { getItem: key => key === 'ritmo_playlists'
      ? JSON.stringify([{ id:'p1', name:'Manual', trackIds:['a','b'], manual:true }, { id:'p2', name:'Default', trackIds:['c'] }])
      : null },
    storageReadErrors: new Set(), Set, Object, Array, Number, JSON,
  };
  const result = JSON.parse(runInNewContext(source, context));
  assert.deepEqual(result, [
    { id:'p1', name:'Manual', trackIds:['a','b'], manual:true },
    { id:'p2', name:'Default', trackIds:['c'] },
  ]);
});


test('playlist drag continuously moves the captured source row and shifts intervening rows before commit', () => {
  assert.match(component,/element\.setPointerCapture\(event\.pointerId\)/);
  assert.match(component,/before:\s*VerticalSnapshot;/);
  assert.match(component,/before:\s*captureVerticalPositions\(rowContainer,\s*'\[data-track-index\]'/);
  assert.match(component,/const sourceTransform=`translate3d\(0,\$\{state\.y-state\.startY\}px,0\) scale\(1\.025\)`/);
  assert.match(component,/if\(row\.style\.transform!==transform\) row\.style\.transform=transform/);
  assert.match(component,/classList\.toggle\('is-reorder-shift',inPath\)/);
  assert.match(component,/previousPositions\.current = state\.before/);
  assert.match(css,/\.ritmo-playlist-track\.is-reorder-shift[^}]*transition:transform/);
  assert.match(css,/\.ritmo-playlist-track-main \{ touch-action:pan-y/);
});
