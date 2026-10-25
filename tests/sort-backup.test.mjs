// Node 22+, with existing Capacitor dependency installed. No new dependencies.
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
test('newest sort and manual sort survive backup validation and restore', async () => {
  for (const descending of [false, true]) {
    const values = { ritmo_sort: '"newest"', ritmo_descending: JSON.stringify(descending) };
    const backup = await createBackup('1.1.2', values, false);
    const loaded = await validateBackup(JSON.stringify(backup));
    const storage = new MemoryStorage();
    await restoreBackup(loaded, async () => {}, {}, storage, false);
    assert.equal(storage.getItem('ritmo_sort'), '"newest"');
    assert.equal(storage.getItem('ritmo_descending'), JSON.stringify(descending));
  }
});
test('invalid sort keys remain rejected after adding the new option', async () => {
  await assert.rejects(createBackup('1.1.2', { ritmo_sort: '"invalid"' }, false));
  await assert.rejects(createBackup('1.1.2', { ritmo_sort: '42' }, false));
});


test('new four-mode keys and duplicate playlist occurrences remain backup-safe', async () => {
  for (const key of ['name', 'newest', 'duration', 'manual']) {
    const backup = await createBackup('1.1.4', { ritmo_sort: JSON.stringify(key) }, false);
    const loaded = await validateBackup(JSON.stringify(backup));
    await restoreBackup(loaded, async () => {}, {}, new MemoryStorage(), false);
  }
  const data = { ritmo_playlists: JSON.stringify([{ id:'p', name:'P', trackIds:['x','y','x'] }]) };
  const backup = await createBackup('1.1.4', data, false);
  assert.deepEqual(JSON.parse(backup.payload.storage.ritmo_playlists)[0].trackIds, ['x','y','x']);
});

test('per-playlist manual mode survives backup validation and rejects malformed values', async () => {
  const source = { ritmo_playlists: JSON.stringify([{ id:'p1', name:'Manual', trackIds:['a','b'], manual:true }, { id:'p2', name:'Sorted', trackIds:['c'] }]) };
  const backup = await createBackup('1.1.4', source, false);
  const validated = await validateBackup(JSON.stringify(backup));
  assert.deepEqual(JSON.parse(validated.payload.storage.ritmo_playlists), [
    { id:'p1', name:'Manual', trackIds:['a','b'], manual:true },
    { id:'p2', name:'Sorted', trackIds:['c'] },
  ]);
  await assert.rejects(createBackup('1.1.4', { ritmo_playlists: JSON.stringify([{ id:'p1', name:'Bad', trackIds:[], manual:'yes' }]) }, false));
});

test('legacy added key remains valid for safe R44 backup migration', async () => {
  const backup = await createBackup('1.1.3', { ritmo_sort: '"added"' }, false);
  assert.equal((await validateBackup(JSON.stringify(backup))).payload.storage.ritmo_sort, '"added"');
});

test('independent manual orders for separate lists survive backup validation', async () => {
  const orders = { favorites:['song-a','song-b'], 'artists:artist-name':['song-b','song-a'], 'albums:album-1':['song-a','song-b'] };
  const backup = await createBackup('1.1.4', { ritmo_manual_orders: JSON.stringify(orders) }, false);
  const loaded = await validateBackup(JSON.stringify(backup));
  assert.deepEqual(JSON.parse(loaded.payload.storage.ritmo_manual_orders), orders);
});
