import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { writeStorageTransaction, recoverStorageTransaction } from '../src/utils/storageTransaction.ts';
import { createBackup, validateBackup } from '../src/utils/settingsBackup.ts';

const JOURNAL = 'ritmo_storage_transaction_v1';
class Store {
  data = new Map();
  failure = '';
  permanent = false;
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) {
    if (key === this.failure) {
      if (!this.permanent) this.failure = '';
      throw new Error('quota');
    }
    this.data.set(key, String(value));
  }
  removeItem(key) { this.data.delete(key); }
}
test('related membership writes complete and release journal', () => {
  const storage = new Store();
  writeStorageTransaction({ ritmo_favorites: '["new"]', ritmo_playlists: '[]' }, storage);
  assert.equal(storage.getItem('ritmo_favorites'), '["new"]');
  assert.equal(storage.getItem('ritmo_playlists'), '[]');
  assert.equal(storage.getItem(JOURNAL), null);
});
test('second membership write failure restores the first and preserves originals', () => {
  const storage = new Store();
  storage.setItem('ritmo_favorites', '["old"]');
  storage.setItem('ritmo_playlists', '[{"id":"old"}]');
  storage.failure = 'ritmo_playlists';
  assert.throws(() => writeStorageTransaction({ ritmo_favorites: '["new"]', ritmo_playlists: '[]' }, storage), /quota/);
  assert.equal(storage.getItem('ritmo_favorites'), '["old"]');
  assert.equal(storage.getItem('ritmo_playlists'), '[{"id":"old"}]');
  assert.equal(storage.getItem(JOURNAL), null);
});
test('journal write failure makes no data writes', () => {
  const storage = new Store();
  storage.setItem('ritmo_favorites', '["old"]');
  storage.failure = JOURNAL;
  assert.throws(() => writeStorageTransaction({ ritmo_favorites: '[]' }, storage));
  assert.equal(storage.getItem('ritmo_favorites'), '["old"]');
});
test('process interruption rolls back saved old values and removes newly introduced keys', () => {
  const storage = new Store();
  storage.setItem(JOURNAL, JSON.stringify({ ritmo_favorites: '["old"]', ritmo_playlists: null }));
  storage.setItem('ritmo_favorites', '["new"]'); storage.setItem('ritmo_playlists', '[]');
  recoverStorageTransaction(storage);
  assert.equal(storage.getItem('ritmo_favorites'), '["old"]');
  assert.equal(storage.getItem('ritmo_playlists'), null);
  recoverStorageTransaction(storage); // idempotent
});
test('failed rollback retains journal and blocks later writes until recovery succeeds', () => {
  const storage = new Store();
  storage.setItem('ritmo_favorites', '["old"]');
  storage.failure = 'ritmo_favorites'; storage.permanent = true;
  assert.throws(() => writeStorageTransaction({ ritmo_favorites: '[]' }, storage), AggregateError);
  assert.notEqual(storage.getItem(JOURNAL), null);
  assert.throws(() => writeStorageTransaction({ ritmo_playlists: '[]' }, storage));
  assert.equal(storage.getItem('ritmo_playlists'), null);
  storage.failure = '';
  recoverStorageTransaction(storage);
  assert.equal(storage.getItem('ritmo_favorites'), '["old"]');
});
test('corrupt or unrelated recovery records are retained, not applied', () => {
  for (const raw of ['{', 'null', '[]', '{"unrelated_secret":null}', '{"ritmo_favorites":7}']) {
    const storage = new Store();
    storage.setItem(JOURNAL, raw); storage.setItem('unrelated_secret', 'keep');
    assert.throws(() => recoverStorageTransaction(storage));
    assert.equal(storage.getItem(JOURNAL), raw);
    assert.equal(storage.getItem('unrelated_secret'), 'keep');
  }
});
test('unsupported transaction keys cannot mutate storage', () => {
  const storage = new Store();
  assert.throws(() => writeStorageTransaction({ secret: null }, storage));
  assert.equal(storage.getItem(JOURNAL), null);
});
test('mute preference round trips and rejects non-boolean backup values', async () => {
  for (const value of [true, false]) {
    const backup = await createBackup('1.1.2', { ritmo_muted: JSON.stringify(value) }, false);
    assert.equal((await validateBackup(JSON.stringify(backup))).payload.storage.ritmo_muted, JSON.stringify(value));
  }
  await assert.rejects(createBackup('1.1.2', { ritmo_muted: '"true"' }, false));
});
const root = fileURLToPath(new URL('..', import.meta.url));
const nativePath = 'android/app/src/main/java/com/adelapp/larkplayer/';
const read = path => readFileSync(join(root, path), 'utf8');
test('native source contract: delete requires a recovery token before destructive access', () => {
  const code = read(nativePath + 'NativeMediaPlugin.java');
  const start = code.indexOf('public void deleteSong');
  const end = code.indexOf('@PermissionCallback', start);
  assert.match(code.slice(start, end), /backupToken/);
  const method = code.slice(code.indexOf('private void performDeleteSong'), code.indexOf('private void launchDeleteApproval'));
  assert.ok(method.indexOf('validatePrepared') < method.indexOf('createDeleteRequest'));
  assert.ok(method.indexOf('validatePrepared') < method.indexOf('getContentResolver().delete'));
});
test('native source contract: insertion marker precedes insert and failures include rollback', () => {
  const code = read(nativePath + 'RecentlyDeletedStore.java');
  assert.ok(code.indexOf('entry.put("restoreName", name)') < code.indexOf('destination = resolver.insert'));
  assert.match(code, /verifyOwnedDestination\(entry, destination\)/);
  assert.match(code, /if \(!published\)/);
  assert.match(code, /validRestoredFile\(entry, destination\)/);
});
test('native source contract: permanent intent is durable before removing the private copy', () => {
  const code = read(nativePath + 'RecentlyDeletedStore.java');
  const method = code.slice(code.indexOf('private void dispose'), code.indexOf('private void recoverInterrupted'));
  assert.ok(method.indexOf('write(root)') < method.indexOf('removeCopy(token)'));
  assert.match(code, /dispose\(root, token, "purging"\)/);
  assert.match(code, /"copying"\.equals\(entry.getString\("status"\)\) && !exists/);
});
test('native source contract: queue restoration failure blocks automatic overwrite', () => {
  const code = read(nativePath + 'RitmoPlaybackService.java');
  assert.match(code, /queueRestoreBlocked = true/);
  assert.match(code, /if \(!queueRestoreBlocked\) persistControllerState/);
  assert.match(code, /if \(queueRestoreBlocked\) return false/);
  assert.match(code, /extras\.getString\("ritmo_uri"/);
  const cleanup = code.slice(code.indexOf('static synchronized void removeDeletedTrack'), code.indexOf('static synchronized boolean persistQueue'));
  assert.match(cleanup, /if \(queueRestoreBlocked\)/);
});
test('native source contract: new playback queue is saved before replacing the live queue', () => {
  const code = read(nativePath + 'NativeMediaPlugin.java');
  const play = code.slice(code.indexOf('private void performPlay'), code.indexOf('public void control'));
  assert.ok(play.indexOf('persistQueue(getContext(), media)') < play.indexOf('controller.setMediaItems(media'));
});
test('native source contract: all queue mutations execute only after the candidate is durable', () => {
  const code = read(nativePath + 'NativeMediaPlugin.java');
  const method = code.slice(code.indexOf('public void modifyQueue'), code.indexOf('public void state'));
  assert.ok(method.indexOf('persistQueue(getContext(), candidate)') < method.indexOf('mutation.run()'));
  assert.match(method, /candidate\.addAll\(additions\)/);
  assert.match(method, /candidate\.add\(to, candidate\.remove\(from\)\)/);
});
test('native source contract: bookmark and mode APIs do not acknowledge failed preference saves', () => {
  const code = read(nativePath + 'NativeMediaPlugin.java');
  const methods = code.slice(code.indexOf('public void saveBookmark'), code.indexOf('public void play'));
  assert.doesNotMatch(methods, /\.apply\(\)/);
  assert.equal((methods.match(/\.commit\(\)/g) || []).length, 2);
  assert.match(methods, /position < 0/);
  assert.match(methods, /"focus", "sleep", "workout"/);
});
test('source contract: successful settings restore unblocks keys removed by that restore', () => {
  const code = read('src/RitmoAppClean.tsx');
  assert.match(code, /key in backup\.payload\.storage \|\| localStorage\.getItem\(key\) === null/);
});
test('native source contract: duplicate queue entries retain the selected occurrence on restart', () => {
  const code = read(nativePath + 'RitmoPlaybackService.java');
  assert.match(code, /\.putInt\("queueIndex", player\.getCurrentMediaItemIndex\(\)\)/);
  assert.match(code, /items\.get\(savedIndex\)\.mediaId\.equals\(currentId\)/);
  assert.match(code, /index = savedIndex; sameTrack = true/);
});
test('native source contract: a fully specified replacement can repair malformed legacy queue JSON', () => {
  const code = read(nativePath + 'RitmoPlaybackService.java');
  assert.match(code, /catch \(org\.json\.JSONException error\)/);
  assert.match(code, /oldQueue = new JSONArray\(\)/);
  assert.match(code, /if \(!RecoveryPolicy\.mediaUri\(item\.mediaId, uri, "audio"\)\)/);
});
test('actual Java recovery policy compiles and exercises URI, overflow, and position boundaries', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ritmo-java-'));
  const harness = `
import javax.tools.*;
import java.net.*;
import java.nio.file.*;
import java.lang.reflect.*;
public class PolicyHarness {
  static void check(boolean value) { if (!value) throw new AssertionError(); }
  public static void main(String[] args) throws Exception {
    JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
    if (compiler == null) throw new IllegalStateException("JDK compiler required");
    check(compiler.run(null, null, null, "-d", args[1], args[0]) == 0);
    Class<?> c = new URLClassLoader(new URL[]{Path.of(args[1]).toUri().toURL()}).loadClass("com.adelapp.larkplayer.RecoveryPolicy");
    Method expiry = c.getDeclaredMethod("expiresAt", long.class, int.class); expiry.setAccessible(true);
    Method pos = c.getDeclaredMethod("position", long.class, boolean.class, long.class); pos.setAccessible(true);
    Method uri = c.getDeclaredMethod("mediaUri", String.class, String.class, String.class); uri.setAccessible(true);
    check((long)expiry.invoke(null, Long.MAX_VALUE, 90) == Long.MAX_VALUE);
    check((long)expiry.invoke(null, 1000L, 7) == 604801000L);
    check((long)pos.invoke(null, -1L, true, 100L) == 0);
    check((long)pos.invoke(null, 80L, false, 100L) == 0);
    check((long)pos.invoke(null, 200L, true, 100L) == 100);
    check((long)pos.invoke(null, 80L, true, -1L) == 80);
    check((boolean)uri.invoke(null, "audio-42", "content://media/external/audio/media/42", "audio"));
    check((boolean)uri.invoke(null, "video-42", "content://media/external_primary/video/media/42", "video"));
    check((boolean)uri.invoke(null, "shared-0123456789abcdef0123456789abcdef", "content://com.adelapp.larkplayer.fileprovider/shared-audio/0123456789abcdef0123456789abcdef.mp3", "audio"));
    check((boolean)uri.invoke(null, "shared-video-0123456789abcdef0123456789abcdef", "content://com.adelapp.larkplayer.fileprovider/shared-video/0123456789abcdef0123456789abcdef.mp4", "video"));
    check(!(boolean)uri.invoke(null, "shared-video-0123456789abcdef0123456789abcdef", "content://com.adelapp.larkplayer.fileprovider/shared-audio/0123456789abcdef0123456789abcdef.mp4", "video"));
    check(!(boolean)uri.invoke(null, "shared-0123456789abcdef0123456789abcdef", "content://com.adelapp.larkplayer.fileprovider/shared-audio/other.mp3", "audio"));
    for (String bad : new String[]{"", "file:///secret", "https://host/music", "content://media/external/audio/media/42?x=1", "content://media/external/audio/media/42#x", "content://media/external/audio/media/0"})
      check(!(boolean)uri.invoke(null, "audio-42", bad, "audio"));
    check(!(boolean)uri.invoke(null, "audio-43", "content://media/external/audio/media/42", "audio"));
    check(!(boolean)uri.invoke(null, null, null, "audio"));
    System.out.println("Java policy: 20 assertions passed");
  }
}`;
  try {
    writeFileSync(join(directory, 'PolicyHarness.java'), harness);
    const result = spawnSync('java', [join(directory, 'PolicyHarness.java'), join(root, nativePath, 'RecoveryPolicy.java'), directory], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.match(result.stdout, /20 assertions passed/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
