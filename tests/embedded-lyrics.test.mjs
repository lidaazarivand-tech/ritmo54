import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('production Java ID3 lyrics reader: plain USLT plus genuinely timestamped SYLT in UTF-8/Persian', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'ritmo-lyrics-'));
  try {
    const folder = join(temporary,'com/adelapp/larkplayer');
    mkdirSync(folder, {recursive:true});
    writeFileSync(join(folder,'EmbeddedLyrics.java'), readFileSync(new URL('../android/app/src/main/java/com/adelapp/larkplayer/EmbeddedLyrics.java',import.meta.url)));
    writeFileSync(join(folder,'LyricsHarness.java'), `
package com.adelapp.larkplayer;
import java.io.*;
import java.nio.charset.StandardCharsets;
public class LyricsHarness {
  static int checks;
  static void equal(String a,String b) { checks++; if(!a.equals(b)) throw new AssertionError(a+" != "+b); }
  static byte[] tag(int version,byte[] data) throws Exception {
    ByteArrayOutputStream body = new ByteArrayOutputStream();
    body.write(new byte[]{'U','S','L','T',0,0,0,(byte)data.length,0,0}); body.write(data);
    int size=body.size();
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    out.write(new byte[]{'I','D','3',(byte)version,0,0,0,0,(byte)(size>>7),(byte)(size&127)}); out.write(body.toByteArray());
    return out.toByteArray();
  }
  static byte[] syncedTag(int version, byte[] data) throws Exception {
    ByteArrayOutputStream body = new ByteArrayOutputStream();
    body.write(new byte[]{'S','Y','L','T',0,0,0,(byte)data.length,0,0}); body.write(data);
    int size=body.size();
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    out.write(new byte[]{'I','D','3',(byte)version,0,0,0,0,(byte)(size>>7),(byte)(size&127)}); out.write(body.toByteArray());
    return out.toByteArray();
  }
  static byte[] syncedPayload(int timestampFormat, String... lines) throws Exception {
    ByteArrayOutputStream data = new ByteArrayOutputStream();
    data.write(new byte[]{3,'e','n','g',(byte)timestampFormat,1,0});
    for (int i=0; i<lines.length; i+=2) {
      data.write(lines[i].getBytes(StandardCharsets.UTF_8)); data.write(0);
      long timestamp=Long.parseLong(lines[i+1]);
      data.write(new byte[]{(byte)(timestamp>>24),(byte)(timestamp>>16),(byte)(timestamp>>8),(byte)timestamp});
    }
    return data.toByteArray();
  }
  static byte[] payload(int encoding,byte[] description,byte[] text) throws Exception {
    ByteArrayOutputStream data=new ByteArrayOutputStream();
    data.write(new byte[]{(byte)encoding,'f','a','s'}); data.write(description);
    data.write(0); if(encoding==1||encoding==2) data.write(0);
    data.write(text); return data.toByteArray();
  }
  public static void main(String[] args) throws Exception {
    String persian="سلام دنیا\\nترانه من";
    equal(EmbeddedLyrics.read(new ByteArrayInputStream(tag(3,payload(3,new byte[0],persian.getBytes(StandardCharsets.UTF_8))))),persian);
    equal(EmbeddedLyrics.read(new ByteArrayInputStream(tag(4,payload(3,new byte[0],persian.getBytes(StandardCharsets.UTF_8))))),persian);
    String synchronizedPersian="[00:01.23] سلام\\n[00:03.00] ترانه";
    equal(EmbeddedLyrics.readSynced(new ByteArrayInputStream(syncedTag(4,syncedPayload(2,"سلام","1230","ترانه","3000")))),synchronizedPersian);
    equal(EmbeddedLyrics.readSynced(new ByteArrayInputStream(syncedTag(3,syncedPayload(1,"Hello","75","World","150")))),"[00:01.00] Hello\\n[00:02.00] World");
    equal(EmbeddedLyrics.readSynced(new ByteArrayInputStream(tag(3,payload(3,new byte[0],persian.getBytes(StandardCharsets.UTF_8))))),"");
    equal(EmbeddedLyrics.read(new ByteArrayInputStream(tag(3,payload(1,new byte[]{(byte)255,(byte)254},persian.getBytes(StandardCharsets.UTF_16LE))))),persian);
    equal(EmbeddedLyrics.read(new ByteArrayInputStream(tag(3,payload(2,new byte[0],persian.getBytes(StandardCharsets.UTF_16BE))))),persian);
    equal(EmbeddedLyrics.read(new ByteArrayInputStream(new byte[]{1,2,3})),"");
    equal(EmbeddedLyrics.read(new ByteArrayInputStream(new byte[200])),"");
    boolean failed=false; try { EmbeddedLyrics.read(null); } catch(IOException e) { failed=true; }
    if(!failed) throw new AssertionError("Missing stream succeeded"); checks++;
    byte[] broken=tag(3,payload(3,new byte[0],persian.getBytes(StandardCharsets.UTF_8)));
    failed=false; try { EmbeddedLyrics.read(new ByteArrayInputStream(java.util.Arrays.copyOf(broken,broken.length-2))); } catch(IOException e) { failed=true; }
    if(!failed) throw new AssertionError("Truncated tag succeeded"); checks++;
    failed=false; try { EmbeddedLyrics.read(new ByteArrayInputStream(new byte[]{'I','D','3',3,0,0,127,127,127,127})); } catch(IOException e) { failed=true; }
    if(!failed) throw new AssertionError("Oversized tag succeeded"); checks++;
    System.out.println(checks+" Java checks passed");
  }
}`);
    const compile = spawnSync('java', ['com.sun.tools.javac.Main','-encoding','UTF-8',join(folder,'EmbeddedLyrics.java'),join(folder,'LyricsHarness.java')],{encoding:'utf8'});
    assert.equal(compile.status,0,compile.stderr);
    const result = spawnSync('java',['-cp',temporary,'com.adelapp.larkplayer.LyricsHarness'],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    assert.match(result.stdout,/12 Java checks passed/);
  } finally { rmSync(temporary,{recursive:true,force:true}); }
});
