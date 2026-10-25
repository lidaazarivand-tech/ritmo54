import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const source=read('src/RitmoAppClean.tsx');
const code=stripTypeScriptTypes(source.slice(source.indexOf('  const control = async'),source.indexOf('  const toggleMute =')));
function harness({native=true,id='',webSrc='',currentId=null}={}) {
  const events=[];
  let loadedId=id;
  const refs = Object.fromEntries(['transportBusy','restoringSettings','settingsPending','speedRevision','volumeRevision','volumePending','volumeRef','mutedRef','seekRevision','libraryRevision','pendingSeek','deleteInFlight','mediaOperation'].map(name => [name,{current: name==='pendingSeek'?null:name==='volumeRef'?1:0}]));
  const context={
    ...refs,native,current:{id:'first',audioSrc:'first.mp3'},currentId,playing:false,position:0,speed:1,
    audio:{current:{getAttribute:()=>webSrc,play:async()=>events.push('web-play')}},
    NativeMedia:{state:async()=>({id:loadedId,playing:true,position:0,duration:180,queue:['first']}),control:async command=>events.push(command.action)},
    play:async track=>{events.push('initialize:'+track.id);loadedId=track.id},
    advanceWeb:async()=>{},setError:()=>{},setArmResetNonce:()=>{},setMuted:()=>{},setPlaying:()=>{},setPosition:()=>{},setDuration:()=>{},setQueue:()=>{},
    reconcileQueue:(_,queue)=>queue,deletedIds:{current:new Set()},
    volumeCommand:{current:Promise.resolve()},seekCommand:{current:Promise.resolve()}
  };
  const control=runInNewContext(code+'\ncontrol;',context);
  return {control,events,context};
}
test('fresh native install initializes the displayed first track before play',async()=>{
  const h=harness();
  await h.control('play');
  assert.deepEqual(h.events,['initialize:first']);
  assert.equal(h.context.transportBusy.current,false);
});
test('already prepared native track resumes without replacing the queue',async()=>{
  const h=harness({id:'first'});
  await h.control('play');
  assert.deepEqual(h.events,['play']);
});
test('stale native selection loads the track actually shown in the UI',async()=>{
  const h=harness({id:'removed'});
  await h.control('play');
  assert.deepEqual(h.events,['initialize:first']);
});
test('web first play initializes the audio source while a prepared source resumes',async()=>{
  const empty=harness({native:false});
  await empty.control('play');
  assert.deepEqual(empty.events,['initialize:first']);
  const ready=harness({native:false,webSrc:'first.mp3',currentId:'first'});
  await ready.control('play');
  assert.deepEqual(ready.events,['web-play']);
});
test('rapid initial play taps cannot race two queue initializations',async()=>{
  const h=harness();
  await Promise.all([h.control('play'),h.control('play')]);
  assert.deepEqual(h.events,['initialize:first']);
});
test('native seeks are serialized and preserve milliseconds',async()=>{
  const h=harness({id:'first'});
  const values=[];
  let active=0;
  h.context.NativeMedia.control=async command=>{
    assert.equal(active++,0);
    await new Promise(resolve=>setTimeout(resolve,2));
    values.push(command.value);
    active--;
  };
  await Promise.all([h.control('seek',50),h.control('seek',90)]);
  assert.deepEqual(values,[50000,90000]);
  assert.equal(h.context.pendingSeek.current,null);
});
test('new fullscreen and artwork rules are isolated; all active skins use touch seek',()=>{
  const css=read('src/components/NocturnePlayerSkin.css');
  assert.match(css,/ritmo-player\.ritmo-player-nocturne \{ padding:0/);
  assert.match(css,/object-fit:contain; object-position:center/);
  assert.match(source,/<PlayerSeekBar position=/);
  const slider=read('src/components/PlayerSeekBar.tsx');
  assert.match(slider,/setPointerCapture/);
  assert.match(slider,/touchAction: 'none'/);
  assert.match(slider,/onPointerUp=\{finish\}/);
  assert.match(css,/ritmo-nocturne-arc \{[^}]*touch-action:pan-y/);
  assert.match(css,/ritmo-nocturne-arc-touch \{[^}]*touch-action:none/);
  assert.match(css,/ritmo-player-nocturne \{[^}]*overflow:hidden/);
  assert.match(source,/busy \|\| transportBusy\.current/);
  assert.match(source,/libraryRevision\.current\+\+;\n    const resumePosition/);
});
