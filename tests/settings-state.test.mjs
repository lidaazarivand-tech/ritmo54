// Node 22+: node --experimental-strip-types --test tests/settings-state.test.mjs
// No extra dependency. These are storage/token logic tests, not Android tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MEDIA_SETTINGS_KEY, readMediaSettings, storeMediaSettings, excludeMedia, restoreMedia } from '../src/utils/settingsMedia.ts';
import { THEME_KEY, THEMES, readTheme, selectTheme, applyTheme } from '../src/utils/settingsTheme.ts';

class MemoryStorage {
  data = new Map();
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { this.data.set(key, String(value)); }
}
const entry = {
  id: 'audio-42', title: 'آهنگ آزمایشی', uri: 'content://media/external/audio/media/42',
  fileName: 'test.mp3', folder: 'Music', date: '2026-10-01T20:00:00Z',
};
test('empty storage has real empty lists', () => {
  assert.deepEqual(readMediaSettings(new MemoryStorage()), { hidden: [], deleted: [] });
});
test('delete, reopen, restore and reopen preserve item metadata', () => {
  const storage = new MemoryStorage();
  const deleted = excludeMedia(readMediaSettings(storage), 'deleted', entry);
  storeMediaSettings(deleted, storage);
  const restarted = readMediaSettings(storage);
  assert.deepEqual(restarted.deleted, [entry]);
  assert.deepEqual(restarted.hidden, []);
  storeMediaSettings(restoreMedia(restarted, 'deleted', entry.id), storage);
  assert.deepEqual(readMediaSettings(storage), { hidden: [], deleted: [] });
});
test('hide/unhide and transitions cannot duplicate a record', () => {
  const original = { hidden: [], deleted: [] };
  const hidden = excludeMedia(original, 'hidden', entry);
  assert.deepEqual(original.hidden, []);
  assert.deepEqual(hidden.hidden, [entry]);
  const deleted = excludeMedia(hidden, 'deleted', entry);
  assert.deepEqual(deleted.hidden, []);
  assert.deepEqual(deleted.deleted, [entry]);
  assert.equal(excludeMedia(deleted, 'deleted', entry).deleted.length, 1);
  assert.deepEqual(restoreMedia(hidden, 'hidden', entry.id), original);
});
test('corrupt data is reported, not overwritten', () => {
  for (const raw of ['{', 'null', '{}', JSON.stringify({ hidden: [entry], deleted: [entry] }),
    JSON.stringify({ hidden: [], deleted: [{ ...entry, uri: 'file:///secret' }] })]) {
    const storage = new MemoryStorage();
    storage.setItem(MEDIA_SETTINGS_KEY, raw);
    assert.throws(() => readMediaSettings(storage));
    assert.equal(storage.getItem(MEDIA_SETTINGS_KEY), raw);
  }
});
test('invalid media, stale restore and storage failure throw', () => {
  assert.throws(() => excludeMedia({ hidden: [], deleted: [] }, 'deleted', { ...entry, id: 'audio-41' }));
  assert.throws(() => restoreMedia({ hidden: [], deleted: [] }, 'deleted', entry.id));
  assert.throws(() => storeMediaSettings({ hidden: [], deleted: [entry] }, { setItem() { throw new Error('quota'); } }));
});
test('eight valid themes persist and apply immediately', () => {
  globalThis.localStorage = new MemoryStorage();
  globalThis.document = { documentElement: { dataset: {} } };
  assert.equal(THEMES.length, 8);
  assert.equal(new Set(THEMES.map(theme => theme.accent)).size, 8);
  assert.equal(readTheme(), 'obsidian');
  for (const theme of THEMES) {
    selectTheme(theme.id);
    assert.equal(localStorage.getItem(THEME_KEY), theme.id);
    assert.equal(readTheme(), theme.id);
    assert.equal(document.documentElement.dataset.ritmoTheme, theme.id);
  }
  localStorage.setItem(THEME_KEY, 'invalid');
  assert.equal(readTheme(), 'obsidian');
  localStorage.setItem(THEME_KEY, 'emerald');
  applyTheme(readTheme());
  assert.equal(document.documentElement.dataset.ritmoTheme, 'emerald');
});
test('theme storage failure preserves applied theme', () => {
  globalThis.document = { documentElement: { dataset: { ritmoTheme: 'obsidian' } } };
  globalThis.localStorage = { setItem() { throw new Error('quota'); }, getItem() { throw new Error('denied'); } };
  assert.equal(readTheme(), 'obsidian');
  assert.throws(() => selectTheme('cyber'));
  assert.equal(document.documentElement.dataset.ritmoTheme, 'obsidian');
});
