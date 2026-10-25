import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('actual Java backup file IO rejects corrupt, truncated, oversized and invalid UTF-8 files', t => {
  if (spawnSync('java', ['com.sun.tools.javac.Main','-version']).status !== 0) {
    assert.ok(!process.env.CI, 'CI requires a JDK for backup file regression tests');
    t.skip('JDK unavailable; native backup IO NOT RUN'); return;
  }
  const dir = mkdtempSync(join(tmpdir(), 'ritmo-backup-io-'));
  try {
    const pkg = join(dir, 'com/adelapp/larkplayer');
    mkdirSync(pkg, { recursive:true });
    const production = join(pkg, 'BackupFileIO.java'), harness = join(pkg, 'BackupIOHarness.java');
    writeFileSync(production, readFileSync(new URL('../android/app/src/main/java/com/adelapp/larkplayer/BackupFileIO.java', import.meta.url)));
    writeFileSync(harness, `package com.adelapp.larkplayer;
import java.io.*;
import java.nio.charset.StandardCharsets;
public class BackupIOHarness {
    interface Operation { void run() throws Exception; }
    static void rejects(Operation work) throws Exception {
        try { work.run(); } catch (IOException expected) { return; }
        throw new AssertionError("Invalid file was accepted");
    }
    public static void main(String[] args) throws Exception {
        String text = "{\\"title\\":\\"\\u0631\\u06cc\\u062a\\u0645\\u0648\\"}";
        byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
        if (!text.equals(BackupFileIO.readUtf8(new ByteArrayInputStream(bytes), bytes.length)))
            throw new AssertionError("UTF-8 round trip failed");
        BackupFileIO.verify(new ByteArrayInputStream(bytes), bytes);
        rejects(() -> BackupFileIO.readUtf8(new ByteArrayInputStream(bytes), bytes.length - 1));
        rejects(() -> BackupFileIO.readUtf8(null, 1024));
        rejects(() -> BackupFileIO.readUtf8(new ByteArrayInputStream(new byte[]{(byte)0xc3, 0x28}), 1024));
        rejects(() -> BackupFileIO.verify(null, bytes));
        rejects(() -> BackupFileIO.verify(new ByteArrayInputStream(new byte[0]), bytes));
        rejects(() -> BackupFileIO.verify(new ByteArrayInputStream(new byte[bytes.length + 1]), bytes));
        byte[] corrupt = bytes.clone(); corrupt[corrupt.length - 1] ^= 1;
        rejects(() -> BackupFileIO.verify(new ByteArrayInputStream(corrupt), bytes));
        byte[] large = new byte[8 * 1024 * 1024 + 1];
        rejects(() -> BackupFileIO.readUtf8(new ByteArrayInputStream(large), 8 * 1024 * 1024));
        BackupFileIO.verify(new ByteArrayInputStream(new byte[0]), new byte[0]);
        System.out.println("PASS: production bounded UTF-8 read and exact save verification");
    }
}`);
    const compile = spawnSync('java', ['com.sun.tools.javac.Main','-encoding','UTF-8','-d',dir,production,harness], { encoding:'utf8' });
    assert.equal(compile.status, 0, compile.stdout + compile.stderr);
    const run = spawnSync('java', ['-cp',dir,'com.adelapp.larkplayer.BackupIOHarness'], { encoding:'utf8' });
    assert.equal(run.status, 0, run.stdout + run.stderr);
  } finally { rmSync(dir, { recursive:true, force:true }); }
});

test('actual plugin load registers both pickers after Activity STARTED without a lifecycle owner', t => {
  if (spawnSync('java', ['com.sun.tools.javac.Main','-version']).status !== 0) {
    assert.ok(!process.env.CI, 'CI requires a JDK for picker lifecycle regression tests');
    t.skip('JDK unavailable; picker load harness NOT RUN'); return;
  }
  const plugin = readFileSync(new URL('../android/app/src/main/java/com/adelapp/larkplayer/SettingsBackupPlugin.java', import.meta.url), 'utf8');
  const load = plugin.slice(plugin.indexOf('@Override public void load()'), plugin.indexOf('    private void submit('));
  const dir = mkdtempSync(join(tmpdir(), 'ritmo-picker-load-'));
  try {
    const harness = join(dir, 'PickerLoadHarness.java');
    writeFileSync(harness, `import java.util.function.Consumer;
class FakeResult {
    int getResultCode() { return 0; }
    Object getData() { return null; }
}
class ActivityResultContracts { static class StartActivityForResult {} }
class ActivityResultLauncher<T> {
    final Consumer<FakeResult> callback;
    ActivityResultLauncher(Consumer<FakeResult> callback) { this.callback = callback; }
    void unregister() {}
}
class Registry {
    int ownerFree = 0;
    <T> ActivityResultLauncher<T> register(String key, ActivityResultContracts.StartActivityForResult contract, Consumer<FakeResult> callback) {
        ownerFree++; return new ActivityResultLauncher<T>(callback);
    }
    <T> ActivityResultLauncher<T> register(String key, Object owner, ActivityResultContracts.StartActivityForResult contract, Consumer<FakeResult> callback) {
        throw new IllegalStateException("Cannot register LifecycleOwner after STARTED");
    }
}
class FakeActivity {
    final Registry registry = new Registry();
    Registry getActivityResultRegistry() { return registry; }
}
class BasePlugin {
    final FakeActivity activity = new FakeActivity();
    FakeActivity getActivity() { return activity; }
    public void load() {}
}
public class PickerLoadHarness extends BasePlugin {
    ActivityResultLauncher<Object> saveLauncher, openLauncher;
    int saveResults, openResults;
    void finishPicker(int resultCode, Object data, boolean saving) { if (saving) saveResults++; else openResults++; }
    ${load}
    public static void main(String[] args) {
        PickerLoadHarness plugin = new PickerLoadHarness();
        plugin.load();
        if (plugin.activity.registry.ownerFree != 2) throw new AssertionError("Wrong registry overload");
        plugin.saveLauncher.callback.accept(new FakeResult());
        plugin.openLauncher.callback.accept(new FakeResult());
        if (plugin.saveResults != 1 || plugin.openResults != 1) throw new AssertionError("Lost picker callback");
        System.out.println("PASS: real plugin load method with a started-activity registry stub");
    }
}`);
    const compile = spawnSync('java', ['com.sun.tools.javac.Main','-encoding','UTF-8','-d',dir,harness], { encoding:'utf8' });
    assert.equal(compile.status, 0, compile.stdout + compile.stderr);
    const run = spawnSync('java', ['-cp',dir,'PickerLoadHarness'], { encoding:'utf8' });
    assert.equal(run.status, 0, run.stdout + run.stderr);
  } finally { rmSync(dir, { recursive:true, force:true }); }
});
