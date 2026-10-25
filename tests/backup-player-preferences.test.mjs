// Node 22+, after npm ci. No extra project dependencies.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackup, validateBackup, restoreBackup } from '../src/utils/settingsBackup.ts';
class MemoryStorage {
  data = new Map();
  get length() { return this.data.size; }
  key(index) { return [...this.data.keys()][index] ?? null; }
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
}
test('all four selectable player skins survive validated backup', async () => {
  for (const skin of ['nocturne', 'studio-cassette', 'midnight-orbit', 'silent-architecture']) {
    const backup = await createBackup('1.1.2', { ritmo_player_skin: skin }, false);
    const loaded = await validateBackup(JSON.stringify(backup));
    assert.equal(loaded.payload.storage.ritmo_player_skin, skin);
  }
});
test('legacy backup IDs remain importable but the active selector falls back safely', async () => {
  for (const skin of ['cassette', 'vinyl', 'music-ring', 'sleeve-wave', 'soft-light', 'cover', 'circular', 'glow', 'waveform']) {
    const backup = await createBackup('1.1.2', { ritmo_player_skin: skin }, false);
    assert.equal((await validateBackup(JSON.stringify(backup))).payload.storage.ritmo_player_skin, skin);
  }
});
test('all eight app themes retain the same backup format and version', async () => {
  for (const theme of ['obsidian', 'cyber', 'emerald', 'velvet', 'platinum', 'amber', 'burgundy', 'bronze']) {
    const backup = await createBackup('1.1.2', { lark_player_theme: theme }, false);
    const loaded = await validateBackup(JSON.stringify(backup));
    assert.equal(loaded.payload.storage.lark_player_theme, theme);
    assert.equal(loaded.format, 'ritmo-user-backup');
    assert.equal(loaded.version, 1);
  }
});
test('retention backups accept only 7, 30, 60 or 90 days', async () => {
  for (const days of [7, 30, 60, 90]) {
    const backup = await createBackup('1.1.2', { ritmo_trash_days: JSON.stringify(days) }, false);
    assert.equal(JSON.parse((await validateBackup(JSON.stringify(backup))).payload.storage.ritmo_trash_days), days);
  }
  for (const value of ['"30"', '0', '-1', '365', 'null'])
    await assert.rejects(createBackup('1.1.2', { ritmo_trash_days: value }, false));
});
test('old backups without player skin or retention remain valid', async () => {
  const backup = await createBackup('1.1.2', { ritmo_favorites: '["audio-42"]', ritmo_speed: '1.25' }, false);
  assert.deepEqual((await validateBackup(JSON.stringify(backup))).payload.storage, backup.payload.storage);
});
test('tampered skin and invalid skin cannot be imported', async () => {
  await assert.rejects(createBackup('1.1.2', { ritmo_player_skin: 'invalid' }, false));
  const backup = await createBackup('1.1.2', { ritmo_player_skin: 'cassette' }, false);
  backup.payload.storage.ritmo_player_skin = 'radio';
  await assert.rejects(validateBackup(JSON.stringify(backup)));
});
test('playback-apply failure rolls back existing storage and new preferences', async () => {
  const storage = new MemoryStorage();
  storage.setItem('ritmo_favorites', '["audio-42"]');
  storage.setItem('ritmo_player_skin', 'vinyl');
  const backup = await createBackup('1.1.2', { ritmo_favorites: '[]', ritmo_player_skin: 'cover', ritmo_trash_days: '60' }, false);
  let rolledBack = false;
  await assert.rejects(restoreBackup(backup, async (_data, rollback) => {
    if (rollback) rolledBack = true;
    else throw new Error('mock apply failed');
  }, { ritmo_speed: '1' }, storage, false));
  assert.equal(rolledBack, true);
  assert.equal(storage.getItem('ritmo_favorites'), '["audio-42"]');
  assert.equal(storage.getItem('ritmo_player_skin'), 'vinyl');
  assert.equal(storage.getItem('ritmo_trash_days'), null);
});
