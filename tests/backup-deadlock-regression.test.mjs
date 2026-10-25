import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('backup export never runs journal recovery or waits on the restore mutex', () => {
  const plugin = read('android/app/src/main/java/com/adelapp/larkplayer/SettingsBackupPlugin.java');
  const start = plugin.indexOf('@PluginMethod public void exportPreferences');
  const end = plugin.indexOf('@PluginMethod public void restorePreferences', start);
  assert.ok(start >= 0 && end > start, 'exportPreferences method exists');
  const method = plugin.slice(start, end);
  assert.doesNotMatch(method, /recoverPreferences\s*\(/, 'read-only export must not run journal recovery');
  assert.doesNotMatch(method, /synchronized\s*\(PREFERENCES_LOCK\)/, 'export must not wait behind a blocked restore lock');
});

test('application startup does not run settings-journal recovery synchronously on the UI thread or playback service startup', () => {
  const activity = read('android/app/src/main/java/com/adelapp/larkplayer/MainActivity.java');
  const service = read('android/app/src/main/java/com/adelapp/larkplayer/RitmoPlaybackService.java');
  assert.doesNotMatch(activity, /SettingsBackupPlugin\.recoverPreferences\s*\(/);
  assert.doesNotMatch(service, /SettingsBackupPlugin\.recoverPreferences\s*\(/);
});
