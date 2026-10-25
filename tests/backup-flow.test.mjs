import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { createBackup, validateBackup, restoreBackup, MAX_BACKUP_BYTES, collectStorage } from '../src/utils/settingsBackup.ts';
import { recoverStorageTransaction, writeStorageTransaction } from '../src/utils/storageTransaction.ts';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
class Store {
  data = new Map();
  get length() { return this.data.size; }
  key(index) { return [...this.data.keys()][index] ?? null; }
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
}

// Exercise production code with only its native bridge/environment replaced.
function bridgeHarness(platform = false, shortTimeout = false) {
  const source = read('src/utils/settingsBackup.ts');
  const body = stripTypeScriptTypes(source.slice(source.indexOf('// Only Ritmo user data')).replace(/^export /gm, ''));
  const calls = [];
  let preferences;
  const Files = {
    recoverSettings: async () => {},
    exportPreferences: async () => ({ preferences: preferences ?? clone({}) }),
    restorePreferences: async options => { calls.push(options.preferences); preferences = options.preferences; },
    saveFile: async () => ({ cancelled:false }),
    openFile: async () => ({ cancelled:true }),
  };
  const window = {};
  const api = runInNewContext(`
    async function nativePlatform() { return platform; }
    async function nativeFiles() { return { plugin: Files }; }
    ${body}
    ({createBackup, validateBackup, restoreBackup, prepareBackupSave, saveBackupFile, openBackupFile, parse: JSON.parse});
  `, {
    platform, Files, window, TextEncoder, crypto:globalThis.crypto,
    recoverStorageTransaction, writeStorageTransaction,
    setTimeout:(fn, ms) => setTimeout(fn, shortTimeout && ms === 20000 ? 5 : ms),
    clearTimeout,
  });
  const clone = value => api.parse(JSON.stringify(value));
  return { api, clone, Files, window, calls, setPreferences:value => { preferences = clone(value); } };
}

test('backup freezes the snapshot before yielding, and rejects invalid app metadata', async () => {
  const snapshot = { ritmo_favorites:'["audio-42"]', ritmo_speed:'1.25' };
  const pending = createBackup('1.1.2', snapshot, false);
  snapshot.ritmo_favorites = '[]';
  const result = await pending;
  assert.equal(result.payload.storage.ritmo_favorites, '["audio-42"]');
  await assert.rejects(createBackup('', {}, false));
  await assert.rejects(createBackup('x'.repeat(129), {}, false));
});

test('validation rejects corrupt, unknown-version, oversized and checksum-tampered backups', async () => {
  const backup = await createBackup('1.1.2', { ritmo_favorites:'[]' }, false);
  await assert.rejects(validateBackup('{'));
  await assert.rejects(validateBackup(' '.repeat(MAX_BACKUP_BYTES + 1)));
  await assert.rejects(validateBackup(JSON.stringify({ ...backup, version:2 })));
  await assert.rejects(validateBackup(JSON.stringify({ ...backup, checksum:'0'.repeat(64) })));
  await assert.rejects(validateBackup(JSON.stringify({ ...backup, payload:{ ...backup.payload, storage:{ secret:'1' } } })));
  assert.equal((await validateBackup('\uFEFF' + JSON.stringify(backup))).checksum, backup.checksum);
});

test('storage collection excludes unrelated values and bounds oversized input', () => {
  const storage = new Store();
  storage.setItem('unrelated_secret', 'private');
  storage.setItem('ritmo_speed', '1.25');
  assert.deepEqual(collectStorage(storage), { ritmo_speed:'1.25' });
  storage.setItem('ritmo_position_audio-42', '0'.repeat(MAX_BACKUP_BYTES));
  assert.throws(()=>collectStorage(storage));
});

test('restore replaces allowed keys, removes stale keys and preserves unrelated data', async () => {
  const storage = new Store();
  storage.setItem('ritmo_favorites', '["old"]');
  storage.setItem('ritmo_position_old', '90');
  storage.setItem('unrelated_secret', 'keep');
  const backup = await createBackup('1.1.2', { ritmo_favorites:'["new"]', ritmo_speed:'1.5' }, false);
  let applied;
  await restoreBackup(backup, async next => { applied = next; }, {}, storage, false);
  assert.equal(applied.ritmo_speed, '1.5');
  assert.equal(storage.getItem('ritmo_favorites'), '["new"]');
  assert.equal(storage.getItem('ritmo_position_old'), null);
  assert.equal(storage.getItem('unrelated_secret'), 'keep');
  assert.equal(storage.getItem('ritmo_storage_transaction_v1'), null);
});

test('invalid restore never writes storage or applies playback', async () => {
  const storage = new Store();
  storage.setItem('ritmo_speed', '1');
  const backup = await createBackup('1.1.2', { ritmo_speed:'2' }, false);
  backup.checksum = '0'.repeat(64);
  let writes = 0;
  await assert.rejects(restoreBackup(backup, async () => { writes++; }, {}, storage, false));
  assert.equal(writes, 0);
  assert.equal(storage.getItem('ritmo_speed'), '1');
});

test('native read timeout rejects a stalled export instead of waiting forever', async () => {
  const h = bridgeHarness(true, true);
  h.Files.exportPreferences = () => new Promise(()=>{});
  await assert.rejects(h.api.createBackup('1.1.2', h.clone({}), true), /طول کشید/);
  h.Files.exportPreferences = async () => ({ preferences:h.clone({}) });
  assert.equal((await h.api.createBackup('1.1.2', h.clone({}), true)).version, 1);
});

test('native error and delayed completion leave backup retryable', async () => {
  const h = bridgeHarness(true);
  h.Files.exportPreferences = async () => { throw new Error('native storage failed'); };
  await assert.rejects(h.api.createBackup('1.1.2', h.clone({}), true), /native storage failed/);
  h.Files.exportPreferences = async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
    return { preferences:h.clone({ ritmo_bookmarks:{ 'audio-4':{type:'long',value:72000} } }) };
  };
  assert.equal((await h.api.createBackup('1.1.2', h.clone({}), true)).payload.preferences.ritmo_bookmarks['audio-4'].value, 72000);
});

test('successful native restore reads values back and compares float32 representation', async () => {
  const h = bridgeHarness(true);
  const store = new Store();
  h.setPreferences({ ritmo_playback_state:{ volume:{type:'float',value:0.85} } });
  const backup = await h.api.createBackup('1.1.2', h.clone({ritmo_speed:'1.25'}), true);
  let reads = 0;
  h.Files.exportPreferences = async () => {
    reads++;
    return { preferences:h.clone({ ritmo_playback_state:{ volume:{type:'float',value:Math.fround(.85)} } }) };
  };
  await h.api.restoreBackup(backup, async () => {}, h.clone({}), store, true);
  assert.equal(reads, 2);
  assert.equal(store.getItem('ritmo_speed'), '1.25');
});

test('native read-back mismatch rolls back web and native stores', async () => {
  const h = bridgeHarness(true);
  const store = new Store();
  store.setItem('ritmo_speed','1');
  h.setPreferences({ ritmo_playback:{mode:{type:'string',value:'focus'}} });
  const backup = await h.api.createBackup('1.1.2', h.clone({ritmo_speed:'2'}), true);
  h.setPreferences({});
  h.Files.restorePreferences = async options => { h.calls.push(options.preferences); };
  await assert.rejects(h.api.restoreBackup(backup, async()=>{}, h.clone({}), store, true), /اطلاعات قبلی حفظ شد/);
  assert.equal(store.getItem('ritmo_speed'), '1');
  assert.equal(h.calls.length, 2);
});

test('silent web storage write failure is detected by read-back, not treated as success', async () => {
  const h = bridgeHarness();
  const store = new Store();
  store.setItem('ritmo_speed','1');
  const write = store.setItem.bind(store);
  store.setItem = (key, value) => { if (key !== 'ritmo_speed' || value !== '2') write(key,value); };
  const backup = await h.api.createBackup('1.1.2', h.clone({ritmo_speed:'2'}), false);
  await assert.rejects(h.api.restoreBackup(backup, async()=>{}, h.clone({}), store, false), /اطلاعات قبلی حفظ شد/);
  assert.equal(store.getItem('ritmo_speed'),'1');
});

test('written browser file must be readable and byte-equal before success', async () => {
  const h = bridgeHarness();
  const backup = await h.api.createBackup('1.1.2', h.clone({}), false);
  const writer = {write:async()=>{},close:async()=>{},abort:async()=>{}};
  await assert.rejects(h.api.saveBackupFile(backup, {
    native:false, handle:{createWritable:async()=>writer, getFile:async()=>({size:2,text:async()=>'{}'})},
  }), /ذخیره پشتیبان انجام نشد/);
  await assert.rejects(h.api.saveBackupFile(backup, {
    native:false, handle:{createWritable:async()=>writer, getFile:async()=>{throw new Error('missing file');}},
  }), /ذخیره پشتیبان انجام نشد/);
});

test('native preference failure restores the exact old preferences and web snapshot', async () => {
  const h = bridgeHarness(true);
  const storage = new Store();
  storage.setItem('ritmo_speed', '1');
  const oldNative = { ritmo_playback:{ mode:{ type:'string', value:'focus' } } };
  h.setPreferences(oldNative);
  const backup = await h.api.createBackup('1.1.2', h.clone({ ritmo_speed:'1.5' }), true);
  let attempted = 0, applied = 0;
  h.Files.restorePreferences = async options => {
    h.calls.push(options.preferences);
    if (!attempted++) throw new Error('partial native commit failure');
  };
  await assert.rejects(h.api.restoreBackup(backup, async ()=>{applied++;}, h.clone({}), storage, true), /اطلاعات قبلی حفظ شد/);
  assert.equal(applied, 0);
  assert.equal(storage.getItem('ritmo_speed'), '1');
  assert.equal(h.calls.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls[1])), oldNative);
});

test('native playback failure rolls back playback, then native settings, then storage', async () => {
  const h = bridgeHarness(true);
  const storage = new Store();
  storage.setItem('ritmo_speed', '1');
  h.setPreferences({});
  const backup = await h.api.createBackup('1.1.2', h.clone({ ritmo_speed:'1.5' }), true);
  const phases = [];
  h.Files.restorePreferences = async () => { phases.push('native'); };
  await assert.rejects(h.api.restoreBackup(backup, async (_next, rollback) => {
    phases.push(rollback ? 'rollbackPlayback' : 'playback');
    if (!rollback) throw new Error('playback failed');
  }, h.clone({ ritmo_speed:'1' }), storage, true));
  assert.deepEqual(phases, ['native','playback','rollbackPlayback','native']);
  assert.equal(storage.getItem('ritmo_speed'), '1');
});

test('restore quota failure cannot reach native mutation or playback', async () => {
  const h = bridgeHarness(true);
  const storage = new Store();
  storage.setItem('ritmo_speed', '1');
  storage.setItem = () => { throw new Error('quota exceeded'); };
  const backup = await h.api.createBackup('1.1.2', h.clone({ ritmo_speed:'1.5' }), true);
  let applied = false;
  await assert.rejects(h.api.restoreBackup(backup, async()=>{applied=true;}, h.clone({}), storage, true));
  assert.equal(applied, false);
  assert.equal(h.calls.length, 0);
  assert.equal(storage.getItem('ritmo_speed'), '1');
});

test('rollback failure is reported explicitly instead of falsely claiming old data is safe', async () => {
  const h = bridgeHarness(true);
  const storage = new Store();
  storage.setItem('ritmo_speed', '1');
  const backup = await h.api.createBackup('1.1.2', h.clone({ ritmo_speed:'1.5' }), true);
  h.Files.restorePreferences = async()=>{throw new Error('native disk failure');};
  await assert.rejects(h.api.restoreBackup(backup, async()=>{}, h.clone({}), storage, true), /بازگرداندن کامل وضعیت قبلی ممکن نشد/);
  assert.equal(storage.getItem('ritmo_speed'), '1');
});

test('browser save picker is requested synchronously before export/hash work', async () => {
  const h = bridgeHarness();
  let requested = false, content = '', closed = false;
  const writable = { write:async text=>{content=text;}, close:async()=>{closed=true;}, abort:async()=>{} };
  h.window.showSaveFilePicker = () => { requested=true; return Promise.resolve({
    createWritable:async()=>writable, getFile:async()=>({ size:new TextEncoder().encode(content).length, text:async()=>content }),
  }); };
  const pending = h.api.prepareBackupSave(false);
  assert.equal(requested, true);
  const target = await pending;
  const backup = await h.api.createBackup('1.1.2', h.clone({ ritmo_speed:'1' }), false);
  assert.equal(await h.api.saveBackupFile(backup, target), true);
  assert.equal(closed, true);
  assert.equal((await validateBackup(content)).payload.storage.ritmo_speed, '1');
});

test('browser cancel, missing picker and write failure all settle without reporting success', async () => {
  const h = bridgeHarness();
  h.window.showSaveFilePicker = async()=>{throw { name:'AbortError' };};
  assert.equal(await h.api.prepareBackupSave(false), null);
  delete h.window.showSaveFilePicker;
  await assert.rejects(h.api.prepareBackupSave(false), /پشتیبانی نمی‌شود/);
  const backup = await h.api.createBackup('1.1.2', h.clone({}), false);
  let aborted = false;
  const target = { native:false, handle:{ createWritable:async()=>({
    write:async()=>{throw new Error('disk full');}, close:async()=>{throw new Error('should not close');},
    abort:async()=>{aborted=true;},
  }) } };
  await assert.rejects(h.api.saveBackupFile(backup, target), /ذخیره پشتیبان انجام نشد/);
  assert.equal(aborted, true);
});

test('browser open honors cancellation, rejects oversized files before reading, validates selected data', async () => {
  const h = bridgeHarness();
  let requested = false;
  h.window.showOpenFilePicker = ()=>{requested=true;return Promise.reject({ name:'AbortError' });};
  const pending = h.api.openBackupFile(false);
  assert.equal(requested, true);
  assert.equal(await pending, null);
  let read = false;
  h.window.showOpenFilePicker = async()=>[{ getFile:async()=>({ size:MAX_BACKUP_BYTES+1, text:async()=>{read=true;} }) }];
  await assert.rejects(h.api.openBackupFile(false));
  assert.equal(read, false);
  const backup = await h.api.createBackup('1.1.2', h.clone({ ritmo_speed:'1.25' }), false);
  h.window.showOpenFilePicker = async()=>[{ getFile:async()=>({ size:512, text:async()=>JSON.stringify(backup) }) }];
  assert.equal((await h.api.openBackupFile(false)).payload.storage.ritmo_speed, '1.25');
});

test('native save and open cancellation are propagated and malformed read is rejected', async () => {
  const h = bridgeHarness(true);
  const backup = await h.api.createBackup('1.1.2', h.clone({}), true);
  h.Files.saveFile = async()=>({ cancelled:true });
  assert.equal(await h.api.saveBackupFile(backup, { native:true }), false);
  assert.equal(await h.api.openBackupFile(true), null);
  h.Files.openFile = async()=>({ cancelled:false });
  await assert.rejects(h.api.openBackupFile(true));
});

test('busy guard blocks duplicate requests and always unlocks on error or cancellation', async () => {
  const app = read('src/RitmoAppClean.tsx');
  const body = stripTypeScriptTypes(app.slice(app.indexOf('  const runBackupOperation ='), app.indexOf('  const exportBackup =')));
  const flags = { backupOperation:{ current:false }, mediaOperation:{ current:false } };
  const states = [], errors = [];
  const run = runInNewContext(body + '\nrunBackupOperation;', {
    ...flags, setBackupBusy:value=>states.push(value), setBackupMessage:()=>{}, setBackupError:value=>errors.push(value),
  });
  let release, count = 0;
  const first = run(async()=>{count++;await new Promise(resolve=>{release=resolve;});});
  await run(async()=>{count++;});
  assert.equal(count, 1);
  release(); await first;
  assert.equal(flags.backupOperation.current, false);
  await run(async()=>{throw new Error('read failed');});
  assert.equal(flags.backupOperation.current, false);
  assert.deepEqual(states, [true,false,true,false]);
  assert.ok(errors.some(Boolean));
});

test('native picker is late-load safe; cancellation/destroy and duplicate callbacks are handled', () => {
  const plugin = read('android/app/src/main/java/com/adelapp/larkplayer/SettingsBackupPlugin.java');
  assert.equal((plugin.match(/getActivityResultRegistry\(\)\.register\(/g) || []).length, 2);
  assert.match(plugin, /"ritmo-settings-save-backup", new ActivityResultContracts/);
  assert.match(plugin, /"ritmo-settings-open-backup", new ActivityResultContracts/);
  assert.doesNotMatch(plugin, /"ritmo-settings-(?:save|open)-backup", getActivity\(\)/);
  assert.match(plugin, /saveLauncher\.unregister\(\)/);
  assert.match(plugin, /openLauncher\.unregister\(\)/);
  assert.match(plugin, /call == null \|\| finishingPicker \|\| destroyed/);
  assert.match(plugin, /pending != call \|\| destroyed/);
  assert.match(plugin, /catch \(RejectedExecutionException/);
  assert.match(plugin, /BackupFileIO\.verify/);
  assert.match(plugin, /BackupFileIO\.readUtf8/);
  assert.match(plugin, /cursor != null && cursor\.moveToFirst\(\) && !cursor\.isNull\(0\) && cursor\.getLong\(0\) > 0/); // known non-empty backups are not truncated; unknown sizes are allowed
  assert.match(plugin, /pending\.reject/);
  assert.match(plugin, /destroyed = true/);
});

test('equalizer gains are included in backup and restore, and invalid gain arrays are rejected', async () => {
  const storage = new Store();
  const gains = [-12, -9, -6, -3, 0, 1.5, 3, 6, 9, 12];
  const backup = await createBackup('1.1.2', { ritmo_eq_gains: JSON.stringify(gains) }, false);
  const validated = await validateBackup(JSON.stringify(backup));
  assert.deepEqual(JSON.parse(validated.payload.storage.ritmo_eq_gains), gains);
  await restoreBackup(validated, async () => {}, {}, storage, false);
  assert.deepEqual(JSON.parse(storage.getItem('ritmo_eq_gains')), gains);
  await assert.rejects(createBackup('1.1.2', { ritmo_eq_gains: JSON.stringify([0, 0]) }, false));
  await assert.rejects(createBackup('1.1.2', { ritmo_eq_gains: JSON.stringify([0, 0, 0, 0, 0, 0, 0, 0, 0, 13]) }, false));
});
