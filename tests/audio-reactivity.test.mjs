// Node 22+: node --experimental-strip-types --test tests/audio-reactivity.test.mjs
// CPU/test-harness checks only. These do not certify an Android APK/device.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const analysis = read('src/utils/audioAnalysis.ts');
const skins = read('src/components/PlayerSkins.tsx');
const processor = read('android/app/src/main/java/com/adelapp/larkplayer/AudioAnalysisProcessor.java');
const service = read('android/app/src/main/java/com/adelapp/larkplayer/RitmoPlaybackService.java');
const plugin = read('android/app/src/main/java/com/adelapp/larkplayer/NativeMediaPlugin.java');
const createFrame = (sequence = 1, energy = .5) => ({
  sequence, amplitude: energy, bass: energy, mid: energy, treble: energy, transient: energy,
  bands: Array(24).fill(energy),
  waveform: Array.from({ length: 64 }, (_, i) => (i % 2 ? -1 : 1) * energy),
});
function sourceHarness() {
  const nativeListeners = new Map(), commands = [];
  const documentListeners = new Map();
  const document = {
    hidden: false,
    addEventListener: (name, listener) => documentListeners.set(name, listener),
    removeEventListener: name => documentListeners.delete(name),
  };
  const NativeMedia = {
    addListener: async (name, listener) => {
      nativeListeners.set(name, listener);
      return { remove: async () => nativeListeners.delete(name) };
    },
    setAudioAnalysis: async options => commands.push(options.enabled),
    state: async () => ({ playing: false }),
  };
  const source = stripTypeScriptTypes(analysis.replace(/^import .*;\n/, '').replace(/^export /gm, ''));
  const api = runInNewContext(`${source}\n({ bindAudioAnalysis, subscribeAudioAnalysis, audioAnalysisSnapshot, visualResponse, SILENT_ANALYSIS });`, {
    NativeMedia, document, requestAnimationFrame: () => 1, cancelAnimationFrame: () => {},
  });
  return { api, commands, document, nativeListeners, documentListeners };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('four selectable themes including three references; removed storage falls back to studio cassette', () => {
  const code = skins.slice(skins.indexOf('export type PlayerSkin'), skins.indexOf('/** Photographic'));
  for (const value of ['soft-light', 'unknown', null]) {
    const actual = runInNewContext(stripTypeScriptTypes(code.replace(/^export /gm, '')) + '\nreadPlayerSkin();', {
      localStorage: { getItem: () => value },
    });
    assert.equal(actual, 'studio-cassette');
  }
  assert.equal((code.match(/id: '/g) || []).length, 4);
  assert.match(code, /id: 'nocturne'/);
  assert.doesNotMatch(skins + read('src/components/PremiumPlayerThemes.css'), /soft-light|premium-atmosphere|premium-background/);
});
test('real amplitudes, bands and transients change the visual response; silence stays quiet', () => {
  const { api } = sourceHarness();
  const quiet = api.visualResponse(createFrame(1, 0));
  const loud = api.visualResponse(createFrame(2, .9));
  assert.equal(quiet.glow, 0); assert.equal(quiet.expansion, 0);
  assert.ok(loud.glow > quiet.glow); assert.ok(loud.expansion > quiet.expansion);
  assert.notDeepEqual(loud.waveform, quiet.waveform);
  const bass = createFrame(); bass.bass = 1; bass.transient = 0;
  const beat = { ...bass, transient: 1 };
  assert.ok(api.visualResponse(beat).expansion > api.visualResponse(bass).expansion);
  bass.bands[17] = .99;
  assert.equal(api.visualResponse(bass).bands[17], .99);
});
test('two surfaces receive one native source; pause freezes and rejects queued audio; resume accepts real data', async () => {
  const h = sourceHarness(), a = [], b = [];
  const dispose = h.api.bindAudioAnalysis({ addEventListener() {}, removeEventListener() {} }, true);
  const offA = h.api.subscribeAudioAnalysis((frame, playing) => { if (playing) a.push(frame.sequence); });
  const offB = h.api.subscribeAudioAnalysis((frame, playing) => { if (playing) b.push(frame.sequence); });
  await tick();
  h.nativeListeners.get('playbackState')({ playing: true });
  h.nativeListeners.get('audioAnalysis')(createFrame(1));
  assert.equal(a.at(-1), 1); assert.deepEqual(a, b);
  h.nativeListeners.get('playbackState')({ playing: false });
  h.nativeListeners.get('audioAnalysis')(createFrame(2, 1));
  assert.equal(h.api.audioAnalysisSnapshot().frame.sequence, 1);
  h.nativeListeners.get('playbackState')({ playing: true });
  h.nativeListeners.get('audioAnalysis')(createFrame(3, .2));
  assert.equal(h.api.audioAnalysisSnapshot().frame.sequence, 3);
  await tick(); assert.deepEqual(h.commands, [true, false, true]);
  offA(); offB(); dispose(); await tick();
  assert.equal(h.commands.at(-1), false);
  assert.equal(h.nativeListeners.size, 0);
});
test('hidden document and absence of visual consumers disable native analysis without stopping playback', async () => {
  const h = sourceHarness();
  const dispose = h.api.bindAudioAnalysis({ addEventListener() {}, removeEventListener() {} }, true);
  const off = h.api.subscribeAudioAnalysis(() => {});
  await tick(); h.nativeListeners.get('playbackState')({ playing: true }); await tick();
  h.document.hidden = true; h.documentListeners.get('visibilitychange')(); await tick();
  assert.equal(h.commands.at(-1), false);
  h.nativeListeners.get('audioAnalysis')(createFrame(9));
  assert.equal(h.api.audioAnalysisSnapshot().frame.sequence, 0);
  h.document.hidden = false; h.documentListeners.get('visibilitychange')(); await tick();
  assert.equal(h.commands.at(-1), true);
  off(); await tick(); assert.equal(h.commands.at(-1), false);
  dispose();
});

function canvasHarness(kind, preview = false, reduced = false) {
  const h = sourceHarness();
  let callback, cleanup;
  const paints = [], scheduled = new Map();
  let id = 0, refs = 0;
  const context = new Proxy({}, {
    get(target, name) {
      if (name === 'createRadialGradient' || name === 'createLinearGradient') return () => ({ addColorStop() {} });
      return (...values) => { if (name === 'lineTo' || name === 'bezierCurveTo') paints.push([name, ...values]); };
    },
    set() { return true; },
  });
  const element = { width: 0, height: 0, dataset: {}, getBoundingClientRect: () => ({ width: 200, height: 200 }), getContext: () => context };
  const code = skins.slice(skins.indexOf('function PremiumCanvas('), skins.indexOf('/** The arm consumes'))
    .replace(/return <canvas[^;]+;/, 'return null;');
  runInNewContext(stripTypeScriptTypes(code) + `\nPremiumCanvas({ kind: '${kind}', playing: true, trackId: '${preview ? 'preview' : 'song'}' });`, {
    ...h.api, document: h.document, performance: { now: () => 1000 },
    useRef: value => ({ current: refs++ === 0 ? element : value }),
    useEffect: effect => { cleanup = effect(); },
    subscribeAudioAnalysis: listener => { callback = listener; return () => { callback = undefined; }; },
    requestAnimationFrame: draw => { scheduled.set(++id, draw); return id; },
    cancelAnimationFrame: frame => scheduled.delete(frame),
    ResizeObserver: class { observe() {} disconnect() {} },
    window: { devicePixelRatio: 1, matchMedia: () => ({ matches: reduced, addEventListener() {}, removeEventListener() {} }) },
  });
  const flush = () => { for (const [id, draw] of [...scheduled]) { scheduled.delete(id); draw(); } };
  return { signal: (data, playing) => callback?.(data, playing), paints, scheduled, flush, cleanup, element };
}
for (const kind of ['ring', 'wave']) {
  test(`${kind}: actual canvas geometry changes with data, pause cancels queued painting, no autonomous loop`, () => {
    const h = canvasHarness(kind);
    const quiet = JSON.stringify(h.paints);
    h.paints.length = 0;
    h.signal(createFrame(1, .8), true); h.flush();
    assert.notEqual(JSON.stringify(h.paints), quiet);
    assert.equal(h.scheduled.size, 0);
    const painted = JSON.stringify(h.paints);
    h.signal(createFrame(2, .1), true);
    assert.ok(h.scheduled.size >= 1);
    h.signal(createFrame(2, .1), false); h.flush();
    assert.equal(JSON.stringify(h.paints), painted);
    assert.equal(h.scheduled.size, 0);
    h.signal(createFrame(3, .4), true); h.flush();
    assert.notEqual(JSON.stringify(h.paints), painted);
    h.cleanup(); assert.equal(h.scheduled.size, 0);
  });
  test(`${kind}: reduced-motion mode and previews have no self-running animation`, () => {
    const h = canvasHarness(kind, false, true);
    h.signal(createFrame(1), true); h.flush(); assert.equal(h.scheduled.size, 0); h.cleanup();
    const preview = canvasHarness(kind, true);
    preview.signal(createFrame(1), true); assert.equal(preview.scheduled.size, 0); preview.cleanup();
  });
}
test('native playback retains the stock audio sink with a read-only timestamped tap', () => {
  assert.match(service, /new ExoPlayer\.Builder\(this, renderers\)/);
  assert.match(service, /super\.buildAudioSink\(context, floatOutput, playbackParams\)/);
  assert.match(service, /super\.handleBuffer\(buffer, timeUs, count\)/);
  assert.match(service, /analysis\.tap\(buffer, timeUs - streamOffsetUs\)/);
  assert.match(service, /tappedBuffer != buffer/);
  assert.match(service, /setPlaybackPosition\(player\.getCurrentPosition\(\) \* 1000L\)/);
  assert.doesNotMatch(service, /setAudioProcessors/);
  assert.match(service, /setHandleAudioBecomingNoisy\(true\)/);
  assert.match(plugin, /postDelayed\(this, 40\)/);
  assert.doesNotMatch(plugin.slice(plugin.indexOf('private boolean analysisRequested'), plugin.indexOf('@Override\n    public void load')), /raw|ByteBuffer/);
});
test('no generic oscillator, random movement or timer in the production visualizer', () => {
  const canvas = skins.slice(skins.indexOf('function PremiumCanvas'), skins.indexOf('/** The arm consumes'));
  assert.doesNotMatch(canvas, /Math\.random|setInterval|setTimeout|quietFlow|audioEngine|animateTransport|fallbackFrame|Math\.sin\(clock/);
  assert.match(canvas, /data\.bass/); assert.match(canvas, /data\.mid/); assert.match(canvas, /data\.treble/);
  assert.match(canvas, /data\.transient/); assert.match(canvas, /response\.waveform/);
  assert.match(read('src/RitmoAppClean.tsx'), /bindAudioAnalysis\(audio\.current, native\)/);
});

test('track changes and seek generations clear shared data and reject late native frames', async () => {
  const h = sourceHarness();
  const dispose = h.api.bindAudioAnalysis({ addEventListener() {}, removeEventListener() {} }, true);
  const off = h.api.subscribeAudioAnalysis(() => {});
  await tick();
  h.nativeListeners.get('playbackState')({ id: 'A', playing: true, analysisGeneration: 10 });
  h.nativeListeners.get('audioAnalysis')({ ...createFrame(1), trackId: 'A', generation: 10 });
  assert.equal(h.api.audioAnalysisSnapshot().frame.sequence, 1);
  h.nativeListeners.get('playbackState')({ id: 'B', playing: true, analysisGeneration: 11 });
  assert.equal(h.api.audioAnalysisSnapshot().frame.sequence, 0);
  h.nativeListeners.get('audioAnalysis')({ ...createFrame(2), trackId: 'A', generation: 10 });
  assert.equal(h.api.audioAnalysisSnapshot().frame.sequence, 0);
  h.nativeListeners.get('audioAnalysis')({ ...createFrame(3), trackId: 'B', generation: 11 });
  assert.equal(h.api.audioAnalysisSnapshot().frame.sequence, 3);
  h.nativeListeners.get('playbackState')({ id: 'B', playing: true, analysisGeneration: 12, analysisDiscontinuity: true });
  h.nativeListeners.get('audioAnalysis')({ ...createFrame(4), trackId: 'B', generation: 11 });
  assert.equal(h.api.audioAnalysisSnapshot().frame.sequence, 0);
  h.nativeListeners.get('audioAnalysis')({ ...createFrame(5), trackId: 'B', generation: 12 });
  assert.equal(h.api.audioAnalysisSnapshot().frame.sequence, 5);
  h.nativeListeners.get('audioAnalysis')({ ...h.api.SILENT_ANALYSIS, trackId: 'B', generation: 12 });
  assert.equal(h.api.audioAnalysisSnapshot().frame.sequence, 0);
  off(); dispose();
});

test('returning from background waits for fresh analysis rather than reusing a held frame', async () => {
  const h = sourceHarness();
  const dispose = h.api.bindAudioAnalysis({ addEventListener() {}, removeEventListener() {} }, true);
  const off = h.api.subscribeAudioAnalysis(() => {});
  await tick();
  h.nativeListeners.get('playbackState')({ playing: true });
  h.nativeListeners.get('audioAnalysis')(createFrame(1));
  h.document.hidden = true; h.documentListeners.get('visibilitychange')(); await tick();
  h.document.hidden = false; h.documentListeners.get('visibilitychange')(); await tick();
  assert.equal(h.api.audioAnalysisSnapshot().frame.sequence, 0);
  h.nativeListeners.get('audioAnalysis')(createFrame(2));
  assert.equal(h.api.audioAnalysisSnapshot().frame.sequence, 2);
  off(); dispose();
});

for (const kind of ['ring', 'wave']) {
  test(`${kind}: missing analysis is static, reset clears pending old geometry`, () => {
    const h = canvasHarness(kind);
    assert.equal(h.scheduled.size, 0);
    h.paints.length = 0; h.signal(SILENT(), true);
    const silent = JSON.stringify(h.paints);
    h.paints.length = 0;
    h.signal(createFrame(1, .9), true);
    h.signal(SILENT(), true);
    h.flush();
    assert.equal(JSON.stringify(h.paints), silent);
    assert.equal(h.element.dataset.signal, 'awaiting-audio');
    assert.equal(h.scheduled.size, 0);
    h.cleanup();
  });
}
function SILENT() { return createFrame(0, 0); }

test('browser seek and source changes clear analysis without introducing a timer', () => {
  const h = sourceHarness(), events = new Map();
  const element = {
    paused: true, ended: false, seeking: false, readyState: 4,
    addEventListener: (name, listener) => events.set(name, listener),
    removeEventListener: name => events.delete(name),
  };
  const dispose = h.api.bindAudioAnalysis(element, false);
  assert.ok(events.has('seeking')); assert.ok(events.has('seeked'));
  events.get('seeking')({ type: 'seeking' });
  assert.equal(h.api.audioAnalysisSnapshot().playing, false);
  assert.equal(h.api.audioAnalysisSnapshot().frame.sequence, 0);
  events.get('loadedmetadata')({ type: 'loadedmetadata' });
  assert.equal(h.api.audioAnalysisSnapshot().frame.sequence, 0);
  dispose(); assert.equal(events.size, 0);
});

test('native play and seek use long milliseconds, including values beyond int32', () => {
  const play = plugin.slice(plugin.indexOf('public void play('), plugin.indexOf('public void control('));
  assert.match(play, /RecoveryPolicy\.milliseconds\(call\.getData\(\)\.opt\("position"\)\)/);
  assert.doesNotMatch(play, /getInt\("position"/);
  assert.match(plugin, /RecoveryPolicy\.milliseconds\(call\.getData\(\)\.opt\("value"\)\)/);
  assert.doesNotMatch(plugin, /call\.getLong\("(?:position|value)"/);
  assert.match(read('src/RitmoAppClean.tsx'), /position: Math\.round\(resumePosition \* 1000\)/);
  assert.equal(Math.round(2148 * 1000), 2148000);
  assert.ok(Math.round(2147484 * 1000) > 2147483647);
});
