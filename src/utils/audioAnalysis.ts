import { NativeMedia } from './nativeMedia';

export interface AudioAnalysisFrame {
  sequence: number;
  generation?: number;
  trackId?: string;
  presentationTimeUs?: number;
  amplitude: number;
  bass: number;
  mid: number;
  treble: number;
  transient: number;
  bands: number[];
  waveform: number[];
}
export const SILENT_ANALYSIS: AudioAnalysisFrame = {
  sequence: 0, amplitude: 0, bass: 0, mid: 0, treble: 0, transient: 0,
  bands: Array(24).fill(0), waveform: Array(64).fill(0),
};
const unit = (value: number) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
/** Pure mapping shared by both surfaces, with no time, randomness or oscillator. */
export function visualResponse(frame: AudioAnalysisFrame) {
  return {
    expansion: unit(frame.bass) * .025 + unit(frame.transient) * .012,
    glow: unit(frame.amplitude) * .6 + unit(frame.transient) * .4,
    bands: Array.from({ length: 24 }, (_, i) => unit(frame.bands[i] ?? 0)),
    waveform: Array.from({ length: 64 }, (_, i) => {
      const value = frame.waveform[i] ?? 0;
      return Math.min(1, Math.max(-1, Number.isFinite(value) ? value : 0));
    }),
  };
}
type Listener = (frame: AudioAnalysisFrame, playing: boolean) => void;
const listeners = new Set<Listener>();
let latest = SILENT_ANALYSIS;
let actualPlaying = false;
let demandChanged = () => {};
let browserEqFilters: BiquadFilterNode[] = [];
let browserEqGains = Array(10).fill(0) as number[];
const browserEqFrequencies = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
/** Apply the graphic EQ to the existing browser audio chain; no second media source is created. */
export function setBrowserEqualizerGains(gains: number[]) {
  browserEqGains = browserEqFrequencies.map((_, index) => {
    const value = gains[index];
    return Number.isFinite(value) ? Math.max(-12, Math.min(12, value)) : 0;
  });
  browserEqFilters.forEach((filter, index) => {
    if (filter.context.state !== 'closed') filter.gain.setTargetAtTime(browserEqGains[index], filter.context.currentTime, 0.04);
  });
  demandChanged();
}
export function subscribeAudioAnalysis(listener: Listener) {
  listeners.add(listener); demandChanged();
  return () => { listeners.delete(listener); demandChanged(); };
}
export function audioAnalysisSnapshot() { return { frame: latest, playing: actualPlaying }; }
function transport(playing: boolean) {
  actualPlaying = playing;
  for (const listener of listeners) listener(latest, actualPlaying);
  demandChanged();
}
function publish(frame: AudioAnalysisFrame) {
  if (frame.sequence !== 0 && (!actualPlaying || document.hidden)) return;
  latest = frame;
  for (const listener of listeners) listener(frame, actualPlaying);
}
/**
 * One shared source, not React state. Native samples only come from the active
 * service's PCM processor. Browser samples come from the active <audio> element.
 * The old audioEngine analyser is intentionally not used: it is not connected
 * to RitmoAppClean. No synthetic fallback is generated.
 */
export function bindAudioAnalysis(element: HTMLAudioElement, native: boolean) {
  let disposed = false;
  const handles: { remove: () => Promise<void> }[] = [];
  let context: AudioContext | undefined;
  let analyser: AnalyserNode | undefined;
  let source: MediaElementAudioSourceNode | undefined;
  let frequency: Parameters<AnalyserNode['getFloatFrequencyData']>[0] | undefined;
  let samples: Parameters<AnalyserNode['getFloatTimeDomainData']>[0] | undefined;
  let raf = 0, previous = 0, sequence = 0, previousRms = 0;
  let connecting = false;
  let browserFailed = false;
  let nativeEnabled = false;
  let commands = Promise.resolve();
  let transportRevision = 0;
  let currentTrackId: string | undefined;
  let generation = -1;
  const clearAnalysis = () => {
    previousRms = 0;
    publish({ ...SILENT_ANALYSIS, generation, trackId: currentTrackId });
  };
  const nativeTransport = (state: { id?: string; playing?: boolean; analysisGeneration?: number; analysisDiscontinuity?: boolean }) => {
    const changed = typeof state.id === 'string' && state.id !== currentTrackId;
    const generationChanged = typeof state.analysisGeneration === 'number' && state.analysisGeneration > generation;
    if (typeof state.id === 'string') currentTrackId = state.id;
    if (typeof state.analysisGeneration === 'number') generation = Math.max(generation, state.analysisGeneration);
    if (changed || generationChanged || state.analysisDiscontinuity) clearAnalysis();
    if (typeof state.playing === 'boolean') transport(state.playing);
  };
  const normal = (value: number) => unit(Math.log1p(value * 16) / Math.log(17));
  const capture = (now: number) => {
    raf = 0;
    if (disposed || document.hidden || !actualPlaying || !listeners.size || !analyser || !context
      || context.state !== 'running' || !frequency || !samples) return;
    if (now - previous >= 40) {
      previous = now;
      analyser.getFloatFrequencyData(frequency);
      analyser.getFloatTimeDomainData(samples);
      const powers = Array(24).fill(0);
      let bass = 0, mid = 0, treble = 0, sum = 0, peak = 0;
      for (let i = 1; i < frequency.length; i++) {
        const hz = i * context.sampleRate / analyser.fftSize;
        if (hz < 30 || hz > 16000) continue;
        const power = 10 ** (frequency[i] / 10);
        const index = Math.min(23, Math.max(0, Math.floor(Math.log(hz / 30) / Math.log(16000 / 30) * 24)));
        powers[index] += power;
        if (hz < 250) bass += power; else if (hz < 4000) mid += power; else treble += power;
      }
      for (const value of samples) { sum += value * value; peak = Math.max(peak, Math.abs(value)); }
      const rms = Math.sqrt(sum / samples.length);
      const waveform = Array.from({ length: 64 }, (_, i) => {
        let peak = 0;
        for (let j = 0; j < samples!.length / 64; j++) {
          const value = samples![i * (samples!.length / 64) + j];
          if (Math.abs(value) > Math.abs(peak)) peak = value;
        }
        return peak;
      });
      publish({ sequence: ++sequence, amplitude: normal(rms), bass: normal(Math.sqrt(bass)),
        mid: normal(Math.sqrt(mid)), treble: normal(Math.sqrt(treble)),
        transient: unit(Math.max(0, rms - previousRms) * 8 + Math.max(0, peak - rms * 3) * .35),
        bands: powers.map(value => normal(Math.sqrt(value))), waveform });
      previousRms = rms;
    }
    raf = requestAnimationFrame(capture);
  };
  const connectBrowser = async () => {
    if (connecting || disposed || analyser || browserFailed) return;
    connecting = true;
    try {
      context ??= new AudioContext();
      // Do not reroute a playing element into a suspended context.
      await context.resume();
      if (disposed || context.state !== 'running') { browserFailed = true; return; }
      const node = context.createAnalyser(); node.fftSize = 2048; node.smoothingTimeConstant = .35;
      source = context.createMediaElementSource(element);
      browserEqFilters = browserEqFrequencies.map((frequency, index) => {
        const filter = context!.createBiquadFilter();
        filter.type = index === 0 ? 'lowshelf' : index === browserEqFrequencies.length - 1 ? 'highshelf' : 'peaking';
        filter.frequency.value = frequency;
        if (filter.type === 'peaking') filter.Q.value = 1.4;
        filter.gain.value = browserEqGains[index] ?? 0;
        return filter;
      });
      source.connect(browserEqFilters[0]);
      for (let index = 0; index < browserEqFilters.length - 1; index++) browserEqFilters[index].connect(browserEqFilters[index + 1]);
      browserEqFilters[browserEqFilters.length - 1].connect(node); node.connect(context.destination); analyser = node;
      frequency = new Float32Array(analyser.frequencyBinCount);
      samples = new Float32Array(analyser.fftSize);
    } catch {
      browserFailed = true;
      // No fake animation. Android never enters this browser-only branch.
    } finally { connecting = false; updateDemand(); }
  };
  const updateDemand = () => {
    const enabled = !disposed && !document.hidden && actualPlaying
      && (listeners.size > 0 || browserEqGains.some(gain => gain !== 0));
    if (native) {
      if (enabled !== nativeEnabled) {
        nativeEnabled = enabled;
        if (enabled) clearAnalysis();
        commands = commands.then(() => NativeMedia.setAudioAnalysis({ enabled })).catch(() => {});
      }
    } else {
      cancelAnimationFrame(raf); raf = 0;
      if (enabled && analyser) raf = requestAnimationFrame(capture);
      else if (enabled && !connecting && !browserFailed) void connectBrowser();
    }
  };
  demandChanged = updateDemand;
  const browserTransport = (event?: Event) => transport(
    event?.type !== 'waiting' && event?.type !== 'seeking' && !element.seeking
      && !element.paused && !element.ended && element.readyState >= 3);
  const browserEvent = (event: Event) => {
    if (['seeking', 'emptied', 'loadedmetadata', 'ended'].includes(event.type)) clearAnalysis();
    browserTransport(event);
  };
  const events = ['playing', 'pause', 'ended', 'waiting', 'emptied', 'seeking', 'seeked', 'loadedmetadata'] as const;
  if (native) {
    void NativeMedia.addListener('audioAnalysis', frame => {
      if (disposed || (frame.trackId !== undefined && currentTrackId !== undefined && frame.trackId !== currentTrackId)
        || (frame.generation !== undefined && frame.generation < generation)) return;
      if (frame.generation !== undefined && frame.generation !== generation) {
        generation = frame.generation; clearAnalysis();
      }
      publish(frame);
    })
      .then(handle => { if (disposed) void handle.remove(); else handles.push(handle); }).catch(() => {});
    void NativeMedia.addListener('playbackState', state => {
      if (!disposed) {
        transportRevision++; nativeTransport(state);
      }
    }).then(handle => { if (disposed) void handle.remove(); else handles.push(handle); }).catch(() => {});
    const observedRevision = transportRevision;
    void NativeMedia.state().then(state => {
      if (!disposed && observedRevision === transportRevision) nativeTransport(state);
    }).catch(() => {});
  } else {
    for (const event of events) element.addEventListener(event, browserEvent);
    browserTransport();
  }
  document.addEventListener('visibilitychange', updateDemand);
  return () => {
    disposed = true; actualPlaying = false; latest = SILENT_ANALYSIS;
    updateDemand(); demandChanged = () => {};
    document.removeEventListener('visibilitychange', updateDemand);
    for (const event of events) element.removeEventListener(event, browserEvent);
    for (const handle of handles) void handle.remove();
    source?.disconnect(); analyser?.disconnect();
    for (const filter of browserEqFilters) filter.disconnect();
    browserEqFilters = []; void context?.close();
  };
}
