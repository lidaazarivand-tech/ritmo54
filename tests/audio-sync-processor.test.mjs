// Executes the actual DSP class on the JVM using tiny platform API stubs.
// This is NOT a Media3 integration test, Gradle build or device certification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('actual Java PCM processor: spectrum, player timestamps, pause, seek, track reset, lease and long position', t => {
  const compiler = spawnSync('java', ['com.sun.tools.javac.Main', '-version'], { encoding: 'utf8' });
  if (compiler.status !== 0) { t.skip('JDK compiler unavailable; actual Java DSP harness NOT RUN'); return; }
  const dir = mkdtempSync(join(tmpdir(), 'ritmo-audio-sync-'));
  const files = [];
  const add = (name, source) => {
    const path = join(dir, name); mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, source); files.push(path);
  };
  try {
    add('android/os/SystemClock.java', `package android.os;
public class SystemClock { public static long now = 1000; public static long elapsedRealtime() { return now; } }`);
    add('androidx/media3/common/C.java', `package androidx.media3.common;
public class C { public static final int ENCODING_PCM_16BIT = 2; }`);
    add('androidx/media3/common/audio/AudioProcessor.java', `package androidx.media3.common.audio;
public interface AudioProcessor {
  class AudioFormat {
    public final int sampleRate, channelCount, encoding;
    public AudioFormat(int rate, int count, int encoding) { sampleRate=rate; channelCount=count; this.encoding=encoding; }
  }
  class UnhandledAudioFormatException extends Exception { public UnhandledAudioFormatException(AudioFormat f) {} }
}`);
    add('androidx/media3/common/audio/BaseAudioProcessor.java', `package androidx.media3.common.audio;
import java.nio.ByteBuffer;
public abstract class BaseAudioProcessor implements AudioProcessor {
  protected abstract AudioFormat onConfigure(AudioFormat f) throws UnhandledAudioFormatException;
  public abstract void queueInput(ByteBuffer input);
  protected ByteBuffer replaceOutputBuffer(int size) { return ByteBuffer.allocate(size); }
  protected void onFlush() {}
  protected void onReset() {}
}`);
    add('com/adelapp/larkplayer/AudioAnalysisProcessor.java', readFileSync(
      new URL('../android/app/src/main/java/com/adelapp/larkplayer/AudioAnalysisProcessor.java', import.meta.url), 'utf8'));
    add('com/adelapp/larkplayer/RecoveryPolicy.java', readFileSync(
      new URL('../android/app/src/main/java/com/adelapp/larkplayer/RecoveryPolicy.java', import.meta.url), 'utf8'));
    add('com/adelapp/larkplayer/AudioSyncHarness.java', `package com.adelapp.larkplayer;
import java.nio.*;
public class AudioSyncHarness {
  static void check(boolean yes, String why) { if (!yes) throw new AssertionError(why); }
  static ByteBuffer tone(double hz, double gain) {
    ByteBuffer b = ByteBuffer.allocate(6144 * 4).order(ByteOrder.LITTLE_ENDIAN);
    for (int i=0; i<6144; i++) {
      short value=(short)(Math.sin(2*Math.PI*hz*i/48000)*gain*32767);
      b.putShort(value); b.putShort((short)-value);
    }
    return b.flip();
  }
  static AudioAnalysisProcessor fresh(String id) {
    AudioAnalysisProcessor p=new AudioAnalysisProcessor();
    p.configureTap(48000,2,2); p.resetAnalysis(id); p.setPlaying(true); p.renewLease();
    return p;
  }
  static AudioAnalysisProcessor.Frame sample(AudioAnalysisProcessor p, double hz, double gain, long pts) {
    ByteBuffer b=tone(hz,gain); byte[] original=b.array().clone();
    p.tap(b,pts);
    check(b.position()==0 && java.util.Arrays.equals(original,b.array()), "PCM changed");
    p.setPlaybackPosition(pts+110000);
    AudioAnalysisProcessor.Frame f=p.snapshot(); check(f!=null,"No frame");
    check(f.presentationTimeUs<=pts+110000 && f.presentationTimeUs>pts,"Wrong timestamp");
    return f;
  }
  public static void main(String[] args) {
    AudioAnalysisProcessor quiet=fresh("quiet"), loud=fresh("loud");
    check(sample(quiet,80,.02,0).amplitude<sample(loud,80,.8,0).amplitude,"Quiet/loud response");
    AudioAnalysisProcessor.Frame bass=sample(fresh("bass"),80,.8,0);
    AudioAnalysisProcessor.Frame mid=sample(fresh("mid"),1000,.8,0);
    AudioAnalysisProcessor.Frame treble=sample(fresh("treble"),8000,.8,0);
    check(bass.bass>bass.mid && bass.bass>bass.treble,"Bass spectrum");
    check(mid.mid>mid.bass && mid.mid>mid.treble,"Mid spectrum");
    check(treble.treble>treble.bass && treble.treble>treble.mid,"Treble spectrum");
    AudioAnalysisProcessor p=fresh("A");
    check(sample(p,80,0,0).amplitude==0,"Silence not silent");
    check(sample(p,80,.8,128000).amplitude>.5,"Dynamic change");
    p.setPlaying(false); check(p.snapshot()==null,"Pause emitted data");
    p.setPlaying(true); check(p.snapshot()!=null,"Resume lost current position");
    p.setPlaybackPosition(0); check(p.snapshot()==null,"Future frame selected");
    p.setPlaybackPosition(1000000); check(p.snapshot()==null,"Stale frame retained");
    long gen=p.generation();
    p.resetAnalysis("A"); check(p.snapshot()==null && p.generation()>gen,"Seek did not reset");
    sample(p,1000,.6,180000000);
    p.setPlaybackPosition(60000000); check(p.snapshot()==null,"Backward seek reused future data");
    p.resetAnalysis("A"); sample(p,1000,.6,60000000);
    gen=p.generation(); p.resetAnalysis("B");
    check(p.snapshot()==null && p.generation()>gen,"Next reused old history");
    check(sample(p,8000,.6,0).trackId.equals("B"),"Wrong track ID");
    p.resetAnalysis("A"); check(p.snapshot()==null,"Previous reused B");
    sample(p,80,.5,2148000000L);
    long longMs=2147484000L;
    check(RecoveryPolicy.position(longMs,true,0)==longMs,"Long milliseconds truncated");
    p.resetAnalysis("A"); sample(p,80,.5,longMs*1000L);
    p.disable(); p.resetAnalysis("A"); p.tap(tone(80,.8),longMs*1000L);
    p.setPlaybackPosition(longMs*1000L+110000); check(p.snapshot()==null,"Disabled DSP emitted data");
    p.renewLease(); sample(p,80,.5,longMs*1000L+128000);
    android.os.SystemClock.now+=2100; p.resetAnalysis("A"); p.tap(tone(80,.8),0);
    p.setPlaybackPosition(110000); check(p.snapshot()==null,"Expired lease emitted data");
    p.configureTap(48000,2,99); p.renewLease(); p.tap(tone(80,.8),0);
    check(p.snapshot()==null,"Unsupported output analysed as PCM16");
    System.out.println("PASS: actual DSP spectrum, silence, PCM preservation, real timestamps, pause/resume, forward/backward seek, next/previous reset, long position, lease and unsupported format");
  }
}`);
    const compiled = spawnSync('java', ['com.sun.tools.javac.Main', '-d', join(dir, 'classes'), ...files],
      { encoding: 'utf8', timeout: 30000 });
    assert.equal(compiled.status, 0, compiled.stdout + compiled.stderr);
    const result = spawnSync('java', ['-cp', join(dir, 'classes'), 'com.adelapp.larkplayer.AudioSyncHarness'],
      { encoding: 'utf8', timeout: 30000 });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /PASS: actual DSP/);
    t.diagnostic(result.stdout.trim());
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
