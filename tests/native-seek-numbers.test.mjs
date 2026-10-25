// Run the actual production Java conversion, not a JavaScript reimplementation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('seek, resume and bookmarks all use checked numeric milliseconds', () => {
  const plugin = readFileSync(new URL('../android/app/src/main/java/com/adelapp/larkplayer/NativeMediaPlugin.java', import.meta.url), 'utf8');
  for (const [start, end, field] of [
    ['public void saveBookmark(', 'public void setPlaybackMode(', 'position'],
    ['public void play(', 'public void setEqualizer(', 'position'],
    ['case "seek":', 'case "volume":', 'value'],
  ]) {
    const block = plugin.slice(plugin.indexOf(start), plugin.indexOf(end, plugin.indexOf(start)));
    assert.ok(block.includes(`RecoveryPolicy.milliseconds(call.getData().opt("${field}"))`));
    assert.doesNotMatch(block, /call\.getLong/);
  }
});

test('production Java preserves Integer, Long and Double seek values and rejects malformed input', t => {
  const compiler = spawnSync('java', ['com.sun.tools.javac.Main', '-version'], { encoding: 'utf8' });
  if (compiler.status !== 0) {
    // CI installs JDK before npm test. A missing compiler there must fail, not hide a regression.
    assert.ok(!process.env.CI, 'CI requires a JDK for native seek regression tests');
    t.skip('JDK compiler unavailable; native numeric conversion NOT RUN');
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), 'ritmo-native-seek-'));
  try {
    const pkg = join(dir, 'com/adelapp/larkplayer');
    mkdirSync(pkg, { recursive: true });
    const policy = join(pkg, 'RecoveryPolicy.java');
    const harness = join(pkg, 'SeekNumbersHarness.java');
    writeFileSync(policy, readFileSync(new URL('../android/app/src/main/java/com/adelapp/larkplayer/RecoveryPolicy.java', import.meta.url), 'utf8'));
    writeFileSync(harness, `package com.adelapp.larkplayer;
public class SeekNumbersHarness {
    static void equal(long expected, Object raw) {
        long actual = RecoveryPolicy.milliseconds(raw);
        if (expected != actual) throw new AssertionError(raw + " became " + actual);
    }
    static void reject(Object raw) {
        try { RecoveryPolicy.milliseconds(raw); }
        catch (IllegalArgumentException expected) { return; }
        throw new AssertionError("Accepted invalid position: " + raw);
    }
    public static void main(String[] args) {
        equal(0, Integer.valueOf(0));
        equal(60000, Integer.valueOf(60000));
        equal(90500, Integer.valueOf(90500));
        equal(2147483647L, Integer.valueOf(Integer.MAX_VALUE));
        equal(2147483648L, Long.valueOf(2147483648L));
        equal(60000, Long.valueOf(60000));
        equal(60000, Double.valueOf(60000));
        equal(90500, Float.valueOf(90500));
        equal(9007199254740991L, Long.valueOf(9007199254740991L));
        equal(9007199254740991L, Double.valueOf(9007199254740991d));
        for (int ms : new int[] {60000, 120000, 15000, 0, 90500})
            equal(ms, Integer.valueOf(ms)); // repeated forward/backward drags
        reject(null); reject("60000"); reject(Boolean.TRUE); reject(new Object());
        reject(Integer.valueOf(-1)); reject(Double.valueOf(-0.1));
        reject(Double.valueOf(60000.5)); reject(Double.valueOf(Double.NaN));
        reject(Double.valueOf(Double.POSITIVE_INFINITY));
        reject(Double.valueOf(Double.NEGATIVE_INFINITY));
        reject(Long.valueOf(9007199254740992L)); reject(Long.valueOf(Long.MAX_VALUE));
        if (RecoveryPolicy.position(RecoveryPolicy.milliseconds(Integer.valueOf(60000)), true, 180000) != 60000)
            throw new AssertionError("Seek regressed to start");
        if (RecoveryPolicy.position(RecoveryPolicy.milliseconds(Integer.valueOf(200000)), true, 180000) != 180000)
            throw new AssertionError("Seek no longer clamps to duration");
        System.out.println("PASS: actual Java numeric seek conversion and validation");
    }
}`);
    const compile = spawnSync('java', ['com.sun.tools.javac.Main', '-d', dir, policy, harness], { encoding: 'utf8' });
    assert.equal(compile.status, 0, compile.stdout + compile.stderr);
    const run = spawnSync('java', ['-cp', dir, 'com.adelapp.larkplayer.SeekNumbersHarness'], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.match(run.stdout, /PASS:/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
