/**
 * High-Fidelity Web Audio Engine
 * Handles 10-band Equalizer, 3D Spatial Audio, Bass Boost,
 * AnalyserNode for Real-time Visualizers, and procedural audio synthesis fallback.
 */

class AudioEngine {
  private ctx: AudioContext | null = null;
  private audioElement: HTMLAudioElement | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private eqFilters: BiquadFilterNode[] = [];
  private bassFilter: BiquadFilterNode | null = null;
  private spatialDelayNode: DelayNode | null = null;
  private spatialGainNode: GainNode | null = null;
  private spatialMergerNode: ChannelMergerNode | null = null;
  private masterGain: GainNode | null = null;
  public analyser: AnalyserNode | null = null;
  private isInitialized = false;
  private proceduralInterval: number | null = null;

  private freqs = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

  public init(audioEl: HTMLAudioElement) {
    if (this.isInitialized && this.audioElement === audioEl) return;
    this.audioElement = audioEl;

    try {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtxClass) return;

      this.ctx = new AudioCtxClass();
      this.masterGain = this.ctx.createGain();

      // Create 10 EQ Filters
      this.eqFilters = this.freqs.map((freq, idx) => {
        const filter = this.ctx!.createBiquadFilter();
        if (idx === 0) {
          filter.type = 'lowshelf';
        } else if (idx === this.freqs.length - 1) {
          filter.type = 'highshelf';
        } else {
          filter.type = 'peaking';
          filter.Q.value = 1.4;
        }
        filter.frequency.value = freq;
        filter.gain.value = 0;
        return filter;
      });

      // Bass Boost filter (80Hz lowshelf)
      this.bassFilter = this.ctx.createBiquadFilter();
      this.bassFilter.type = 'lowshelf';
      this.bassFilter.frequency.value = 80;
      this.bassFilter.gain.value = 0;

      // 3D Spatial effect (subtle psychoacoustic stereo widener & Haas delay)
      this.spatialDelayNode = this.ctx.createDelay();
      this.spatialDelayNode.delayTime.value = 0.024; // 24ms Haas effect
      this.spatialGainNode = this.ctx.createGain();
      this.spatialGainNode.gain.value = 0; // Off by default

      // Analyser Node for visualizer
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.82;

      // Connect filters chain:
      // Source -> EQ[0] -> EQ[1] -> ... -> BassFilter -> (Dry + Wet Spatial) -> Analyser -> MasterGain -> Destination
      for (let i = 0; i < this.eqFilters.length - 1; i++) {
        this.eqFilters[i].connect(this.eqFilters[i + 1]);
      }
      this.eqFilters[this.eqFilters.length - 1].connect(this.bassFilter);

      // Connect BassFilter to Dry Path and Wet Spatial Path
      this.bassFilter.connect(this.analyser);
      this.bassFilter.connect(this.spatialDelayNode);
      this.spatialDelayNode.connect(this.spatialGainNode);
      this.spatialGainNode.connect(this.analyser);

      this.analyser.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      // Attach audio element source
      try {
        this.sourceNode = this.ctx.createMediaElementSource(this.audioElement);
        this.sourceNode.connect(this.eqFilters[0]);
      } catch {
        // If already connected or CORS warning, standard element playback still works
      }

      this.isInitialized = true;
    } catch (err) {
      console.warn('Web Audio API not fully available, falling back to direct audio element', err);
    }
  }

  public resumeContext() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public setEqGain(bandIndex: number, gainDb: number) {
    if (this.eqFilters[bandIndex]) {
      this.eqFilters[bandIndex].gain.setTargetAtTime(gainDb, this.ctx?.currentTime || 0, 0.05);
    }
  }

  public setAllEqGains(gains: number[]) {
    gains.forEach((g, idx) => {
      this.setEqGain(idx, g);
    });
  }

  public setBassBoost(enabled: boolean) {
    if (this.bassFilter) {
      const targetGain = enabled ? 8.5 : 0;
      this.bassFilter.gain.setTargetAtTime(targetGain, this.ctx?.currentTime || 0, 0.05);
    }
  }

  public setSpatial3D(enabled: boolean) {
    if (this.spatialGainNode) {
      const targetGain = enabled ? 0.45 : 0;
      this.spatialGainNode.gain.setTargetAtTime(targetGain, this.ctx?.currentTime || 0, 0.05);
    }
  }

  public setMasterVolume(vol: number) {
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(vol, this.ctx?.currentTime || 0, 0.02);
    }
  }

  public getFrequencyData(array: Uint8Array): void {
    if (this.analyser) {
      this.analyser.getByteFrequencyData(array as unknown as Uint8Array<ArrayBuffer>);
    }
  }

  public getTimeDomainData(array: Uint8Array): void {
    if (this.analyser) {
      this.analyser.getByteTimeDomainData(array as unknown as Uint8Array<ArrayBuffer>);
    }
  }

  /**
   * Procedural Soothing Ambient Chords Generator
   * Generates lush ambient synth pads directly in Web Audio if user wants pure ambient sound!
   */
  public startAmbientGenerator() {
    if (!this.ctx) return;
    this.resumeContext();
    this.stopAmbientGenerator();

    const scale = [220, 261.63, 293.66, 329.63, 392.00, 440, 523.25]; // A minor pentatonic / lush Dorian
    let noteIdx = 0;

    const playChord = () => {
      if (!this.ctx || this.ctx.state === 'closed') return;
      const root = scale[noteIdx % scale.length];
      const fifth = root * 1.5;
      const octave = root * 2;
      noteIdx = (noteIdx + 1) % scale.length;

      [root, fifth, octave].forEach((f, i) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = i === 0 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(f, this.ctx!.currentTime);

        gain.gain.setValueAtTime(0.001, this.ctx!.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.06 / (i + 1), this.ctx!.currentTime + 1.2);
        gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx!.currentTime + 4.5);

        osc.connect(gain);
        if (this.eqFilters[0]) {
          gain.connect(this.eqFilters[0]);
        } else if (this.masterGain) {
          gain.connect(this.masterGain);
        }

        osc.start();
        osc.stop(this.ctx!.currentTime + 5.0);
      });
    };

    playChord();
    this.proceduralInterval = window.setInterval(playChord, 4200);
  }

  public stopAmbientGenerator() {
    if (this.proceduralInterval !== null) {
      clearInterval(this.proceduralInterval);
      this.proceduralInterval = null;
    }
  }
}

export const audioEngine = new AudioEngine();
