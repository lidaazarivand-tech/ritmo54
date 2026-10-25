import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { createBackup, validateBackup } from '../src/utils/settingsBackup.ts';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const ids = ['studio-cassette', 'midnight-orbit', 'silent-architecture'];
test('all three reference skins are additional options and survive saved selection', () => {
  const skins = read('src/components/PlayerSkins.tsx');
  const code = stripTypeScriptTypes(skins.slice(skins.indexOf('export type PlayerSkin'), skins.indexOf('/** Photographic')).replace(/^export /gm, ''));
  for (const value of [...ids, 'nocturne']) {
    assert.equal(runInNewContext(`${code}\nreadPlayerSkin()`, { localStorage: { getItem: () => value } }), value);
  }
  for (const value of ['cassette','vinyl','music-ring','sleeve-wave',null,'unknown']) {
    assert.equal(runInNewContext(`${code}\nreadPlayerSkin()`, {localStorage:{getItem:() => value}}), 'studio-cassette');
  }
});
test('all reference selections survive checked backup restore', async () => {
  for (const id of ids) {
    const backup = await createBackup('1.1.2', { ritmo_player_skin:id }, false);
    assert.equal((await validateBackup(JSON.stringify(backup))).payload.storage.ritmo_player_skin, id);
  }
});
test('reference skins delegate to the real player without replacing other player branches', () => {
  const skin = read('src/components/ReferencePlayerSkins.tsx');
  const menus = read('src/components/PlayerSkinMenus.tsx');
  const app = read('src/RitmoAppClean.tsx');
  assert.match(app, /if \(isReferenceSkin\(skin\)\) return/);
  assert.match(app, /skin === 'nocturne' \? <NocturnePlayerSkin/);
  assert.doesNotMatch(skin, /new Audio|AudioContext|setInterval|localStorage|fetch\(/);
  for (const callback of ['play', 'prev', 'next', 'favorite', 'queue', 'more']) {
    assert.ok((skin + menus).includes(`controls?.${callback}`) || (skin + menus).includes(`controls.${callback}`));
  }
  assert.match(skin, /seek=\{controls.seek\}/);
  assert.doesNotMatch(menus, /volumeChange\?\.\(Number\(event.target.value\)\)|ritmo-player-volume/);
  assert.match(menus, /skin-menu-speed-options/);
  assert.match(skin, /subscribeAudioAnalysis/);
});
test('reference-specific controls and missing-feature placeholders match the pictures', () => {
  const skin = read('src/components/ReferencePlayerSkins.tsx');
  const menus = read('src/components/PlayerSkinMenus.tsx');
  assert.match(skin, /!architectural && <div className="ref-heading-row">\{favorite\}/);
  assert.doesNotMatch(skin, /ref-architecture-actions/);
  for (const label of ['متن ترانه', 'اکولایزر', 'تایمر', 'صف پخش']) assert.ok(menus.includes(`<small>${label}</small>`));
  assert.doesNotMatch(skin, /ref-deck-settings|ref-volume-knob|<small>(?:ENG|SHUFFLE|VOLUME|REPEAT|LYRICS|EQ|TIMER|QUEUE)<\/small>/);
  assert.match(menus, /button\('بستن پخش‌کننده', <ChevronDown \/>/);
  assert.match(menus, /aria-label="منوی پخش‌کننده"/);
  assert.match(skin, /architectural \? <div className="ref-architectural-stage">\s*<div className="ref-live-cover">\{artwork\}/);
  assert.match(menus, /skin-menu-placeholder/);
  assert.match(menus, /element.showModal\(\)/);
  assert.match(menus, /element.close\(\)/);
});
test('live artwork reaches square cover, moon label, previews and mini-player', () => {
  const skin = read('src/components/ReferencePlayerSkins.tsx');
  const app = read('src/RitmoAppClean.tsx');
  const skins = read('src/components/PlayerSkins.tsx');
  assert.match(app, /<ReferencePlayerSkin skin=\{skin\} artwork=\{<Artwork track=\{track\}/);
  assert.match(skins, /<ReferencePlayerSkin skin=\{skin\} artwork=\{artwork\}/);
  assert.match(skin, /ref-moon-label">\{artwork\}/);
  assert.doesNotMatch(skin, /import architecture/);
  const css = read('src/components/ReferencePlayerSkins.css');
  assert.match(css, /animation:ref-moon-spin 24s linear infinite paused/);
  assert.match(css, /ref-playing \.ref-moon-record \{ animation-play-state:running/);
  assert.match(css, /prefers-reduced-motion:reduce[^]*ref-moon-record/);
});
test('only local images are used and styles are scoped with reduced-motion support', () => {
  for (const filename of ['black-leather', 'cassette-shell', 'cassette-hub', 'midnight-planet', 'silent-architecture'])
    assert.ok(existsSync(new URL(`../src/components/reference-skins/${filename}.webp`, import.meta.url)));
  const css = read('src/components/ReferencePlayerSkins.css');
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /skin-compact \.ritmo-reference/);
  assert.match(css, /ritmo-skin-choice/);
  assert.doesNotMatch(css, /(?:^|\n)(?:body|html|:root|\*)\s*\{/);
});

test('Midnight Orbit has only its rotating record and centered album artwork, with reserved dock space', () => {
  const skin = read('src/components/ReferencePlayerSkins.tsx');
  const css = read('src/components/ReferencePlayerSkins.css');
  assert.match(skin, /ref-planet-stage ref-orbit-stage/);
  assert.doesNotMatch(skin, /<img src=\{planet\}/);
  assert.match(skin, /ref-moon-label">\{artwork\}/);
  assert.match(css, /ref-midnight-orbit\.ref-live \{ padding-bottom:0/);
  assert.match(css, /ref-midnight-orbit \.skin-menu-dock \{[^}]*position:relative/);
  assert.match(css, /ref-midnight-orbit \.ref-moon-label \{ inset:25%/);
  assert.match(css, /@media\(max-height:560px\)/);
});

test('mini-player artwork bypasses selected skin visuals and search has a single focus ring', () => {
  const app = read('src/RitmoAppClean.tsx');
  const css = read('src/index.css');
  assert.match(app, /<Artwork track=\{current\} className="ritmo-mini-artwork/);
  assert.doesNotMatch(app.slice(app.indexOf('{current && <div className="fixed bottom-0'), app.indexOf('{full && current')), /MiniPlayerSkin/);
  assert.match(css, /#root > \.min-h-screen\[dir="rtl"\] \.ritmo-search-box input:focus-visible \{ outline:none/);
  assert.match(css, /\.ritmo-search-box:focus-within \{ outline:2px solid/);
});


test('Cassette and Midnight Orbit titles occupy dedicated readable steel-sheen lanes', () => {
  const skins=read('src/components/PlayerSkins.tsx');
  const css=read('src/components/PlayerSkins.css');
  const orbit=read('src/components/ReferencePlayerSkins.css');
  assert.match(skins,/skin === 'cassette' \? <div className="ritmo-featured-skin-layout ritmo-featured-cassette"/);
  assert.match(css,/ritmo-player-shell:has\(\.ritmo-skin-stage\.skin-cassette\) \.ritmo-player-track-heading/);
  assert.match(css,/ritmo-player-shell:has\(\.ritmo-skin-stage\.skin-cassette\) \.ritmo-player-copy h1/);
  assert.match(orbit,/ref-midnight-orbit \.ref-details h1/);
  assert.match(orbit,/prefers-reduced-motion:reduce\) \{ \.ref-midnight-orbit \.ref-details h1/);
  assert.match(css,/prefers-reduced-motion:reduce\) \{ \.ritmo-player-shell:has\(\.ritmo-skin-stage\.skin-cassette\)/);
});
