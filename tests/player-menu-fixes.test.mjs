import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('bottom player dock keeps sound/speed first, lyrics fourth, and sends More directly to track actions', () => {
  const menus = read('src/components/PlayerSkinMenus.tsx');
  const sound = menus.indexOf("button('صدا و سرعت'");
  const eq = menus.indexOf("button('اکولایزر'");
  const timer = menus.indexOf("button('تایمر خواب'");
  const lyrics = menus.indexOf("button('متن ترانه'");
  const more = menus.indexOf("button('عملیات آهنگ'");
  assert.ok(sound < eq && eq < timer && timer < lyrics && lyrics < more);
  assert.match(menus, /button\('عملیات آهنگ',[^\n]+controls\?\.more\)/);
  assert.doesNotMatch(menus, /controls\.more\?\.\(\); }}>عملیات آهنگ/);
  assert.doesNotMatch(menus, /<button[^>]*>\s*<TimerReset/);
  assert.doesNotMatch(menus, /setPanel\('actions'\)/);
});

test('equalizer has a dedicated full-height screen, presets, persistent 10-band gains and browser audio filters', () => {
  const menus = read('src/components/PlayerSkinMenus.tsx');
  const css = read('src/components/PlayerSkinMenus.css');
  const audio = read('src/utils/audioAnalysis.ts');
  assert.match(menus, /skin-menu-dialog-eq/);
  assert.match(menus, /EQUALIZER_PRESETS\.map/);
  assert.match(menus, /localStorage\.setItem\('ritmo_eq_gains'/);
  assert.match(audio, /export function setBrowserEqualizerGains/);
  assert.match(audio, /source\.connect\(browserEqFilters\[0\]\)/);
  assert.match(css, /height: calc\(100dvh - 20px\)/);
});

test('sleep timer pauses the existing player and Android equalizer uses the native media session', () => {
  const app = read('src/RitmoAppClean.tsx');
  const service = read('android/app/src/main/java/com/adelapp/larkplayer/RitmoPlaybackService.java');
  const plugin = read('android/app/src/main/java/com/adelapp/larkplayer/NativeMediaPlugin.java');
  assert.match(app, /setSleepTimerDeadline\(null\);\s*void control\('pause'\)/);
  assert.match(plugin, /public void setEqualizer\(PluginCall call\)/);
  assert.match(service, /new Equalizer\(0, sessionId\)/);
  assert.match(service, /systemEqualizer\.setBandLevel\(band, level\)/);
});

test('sleep, sound, and speed panels expose live, existing controls with a custom timer', () => {
  const menus = read('src/components/PlayerSkinMenus.tsx');
  assert.match(menus, /role="timer"/);
  assert.match(menus, /customTimerMinutes/);
  assert.match(menus, /controls\.sleepTimer\?\.\(customTimerMinutes\)/);
  assert.doesNotMatch(menus, /volumePercent|ritmo-player-volume|بلندی صدا/);
  assert.match(menus, /skin-menu-speed-options/);
  assert.match(menus, /\[\.5,\.75,1,1\.25,1\.5,1\.75,2\]/);
  const css = read('src/components/PlayerSkinMenus.css');
  assert.match(css, /skin-menu-timer-card/);
  assert.match(css, /skin-menu-sound-card/);
  assert.match(css, /prefers-reduced-motion:reduce/);
});


test('sleep and sound dialogs are explicitly centered without an animated transform override', () => {
  const css=read('src/components/PlayerSkinMenus.css');
  assert.match(css,/\.skin-menu-dialog-control\[open\] \{[^}]*position:fixed; inset:auto; top:50%; left:50%;[^}]*transform:translate\(-50%,-50%\)/s);
  assert.match(css,/@keyframes skin-panel-arrive \{ from \{ opacity:0; translate:0 8px; scale:\.985;/);
  assert.doesNotMatch(css,/@keyframes skin-panel-arrive \{[^}]*transform:/s);
  assert.match(css,/max-height:min\(78dvh,680px\)/);
});
