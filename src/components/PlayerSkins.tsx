import React, { useEffect, useRef } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import './PlayerSkins.css';
import './PremiumPlayerThemes.css';
import './ReferenceTurntable.css';
import { AudioAnalysisFrame, SILENT_ANALYSIS, audioAnalysisSnapshot, subscribeAudioAnalysis, visualResponse } from '../utils/audioAnalysis';
import CassetteWalkman from './PhotoCassetteScene';
import CircularMusicSkin from './CircularMusicSkin';
import SquareMusicSkin from './SquareMusicSkin';
import NocturnePlayerSkin from './NocturnePlayerSkin';
import ReferencePlayerSkin, { isReferenceSkin } from './ReferencePlayerSkins';

export type PlayerSkin = 'cassette' | 'vinyl' | 'music-ring' | 'sleeve-wave' | 'nocturne' | 'studio-cassette' | 'midnight-orbit' | 'silent-architecture';
export const PLAYER_SKINS: { id: PlayerSkin; label: string }[] = [
  { id: 'nocturne', label: 'شب آبی' },
  { id: 'studio-cassette', label: 'کاست استودیویی' },
  { id: 'midnight-orbit', label: 'مدار نیمه‌شب' },
  { id: 'silent-architecture', label: 'مدار خاموش' },
];
export function readPlayerSkin(): PlayerSkin {
  try {
    const value = localStorage.getItem('ritmo_player_skin');
    return PLAYER_SKINS.some(s => s.id === value) ? value as PlayerSkin : 'studio-cassette';
  } catch { return 'studio-cassette'; }
}
/** Photographic material direction is isolated to the cassette surface. */
function PhysicalArtwork({ artwork, className }: {
  artwork: React.ReactNode; className: string;
}) {
  return <div className={className}>
    <div className="album-face">{artwork}</div>
    <div className="album-material" aria-hidden="true" />
  </div>;
}
/** Spectral halo and waveform ribbons. No phase clock or synthetic fallback.
 * One RAF per data update; actual transport pause cancels pending painting.
 * Silent preview cards never subscribe to the shared analysis source.
 */
function PremiumCanvas({ kind, playing, trackId }: {
  kind: 'ring' | 'wave'; playing: boolean; trackId: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const held = useRef<AudioAnalysisFrame>(SILENT_ANALYSIS);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const context = element.getContext('2d');
    if (!context) return;
    let disposed = false, frame = 0, lastPaint = 0;
    held.current = SILENT_ANALYSIS;
    let pending: AudioAnalysisFrame | undefined;
    const preview = trackId === 'preview';
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    // Fixed hardware geometry is cached once. Only the existing audio frame moves it.
    const colors = ['#245d85', '#398fcb', '#56a9df', '#9cd4e7', '#56a9df', '#398fcb', '#245d85'];
    const ringGeometry = kind === 'ring' ? [false, true].map(compact =>
      [0, 1, 2].map(layer => Array.from({ length: compact ? [20, 24, 32][layer] : [64, 80, 96][layer] }, (_, i) => {
        const count = compact ? [20, 24, 32][layer] : [64, 80, 96][layer];
        const angle = i / count * Math.PI * 2 - Math.PI / 2;
        return { x: Math.cos(angle), y: Math.sin(angle),
          band: Math.min(23, Math.floor(i / count * 24)), sample: Math.floor(i / count * 64) };
      }))) : [];
    const points = Array.from({ length: 64 }, () => ({ x: 0, y: 0 }));
    let waveGradient: CanvasGradient | undefined, ringGlow: CanvasGradient | undefined, gradientWidth = 0;
    // Audio updates reuse the last measured geometry. Only a ResizeObserver
    // callback performs layout measurement, not every incoming audio frame.
    let size = element.getBoundingClientRect();
    const draw = () => {
      frame = 0;
      if (pending) { held.current = pending; pending = undefined; }
      if (!size.width || !size.height) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.round(size.width * ratio);
      const height = Math.round(size.height * ratio);
      if (element.width !== width || element.height !== height) {
        element.width = width; element.height = height;
        waveGradient = undefined; ringGlow = undefined;
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, size.width, size.height);
      const data = held.current;
      const response = visualResponse(data);
      const motion = reduced.matches ? .35 : 1;
      element.dataset.signal = data.sequence > 0 ? 'audio-data' : 'awaiting-audio';
      const w = size.width, h = size.height;
      context.lineCap = 'round';
      if (kind === 'ring') {
        const centerX = w / 2, centerY = h / 2;
        if (!ringGlow) {
          ringGlow = context.createRadialGradient(centerX, centerY, w * .335, centerX, centerY, w * .49);
          ringGlow.addColorStop(0, 'rgba(57,143,203,0)');
          ringGlow.addColorStop(.45, 'rgba(57,143,203,.11)');
          ringGlow.addColorStop(.72, 'rgba(86,169,223,.07)');
          ringGlow.addColorStop(1, 'rgba(57,143,203,0)');
        }
        context.fillStyle = ringGlow;
        context.globalAlpha = response.glow * motion;
        context.fillRect(0, 0, w, h);
        const geometry = ringGeometry[w < 80 ? 1 : 0];
        // Bass: outer pressure ring. Mid: spectral contour. Treble: fine inner edge.
        for (let layer = 0; layer < 3; layer++) {
          const range = layer === 0 ? data.bass : layer === 1 ? data.mid : data.treble;
          const radius = w * (layer === 0 ? .413 + response.expansion * .44 * motion : layer === 1 ? .376 : .346);
          context.beginPath(); context.arc(centerX, centerY, radius, 0, Math.PI * 2);
          context.strokeStyle = layer === 0 ? '#398fcb' : '#82c5e8';
          context.lineWidth = Math.max(.45, w * .0015);
          context.globalAlpha = .08 + range * .10 * motion;
          context.stroke();
          for (const point of geometry[layer]) {
            const energy = (response.bands[point.band] * .64 + range * .36) * motion;
            const contour = layer === 1 ? response.waveform[point.sample] * data.mid * w * .003 * motion : 0;
            const r = radius + contour;
            const length = w * (.0015 + energy * (layer === 0 ? .039 : layer === 1 ? .025 : .014)
              + data.transient * .004 * motion);
            context.strokeStyle = layer === 0 ? '#398fcb' : layer === 1 ? '#56a9df' : '#9cd4e7';
            context.globalAlpha = .12 + energy * .66 + data.amplitude * .08 * motion;
            context.lineWidth = Math.max(.5, w * (layer === 0 ? .0024 + data.bass * .0014 * motion : .0018));
            context.beginPath();
            context.moveTo(centerX + point.x * r, centerY + point.y * r);
            context.lineTo(centerX + point.x * (r + length), centerY + point.y * (r + length));
            context.stroke();
          }
        }
      } else {
        if (!waveGradient || gradientWidth !== w) {
          waveGradient = context.createLinearGradient(w * .08, 0, w * .92, 0);
          colors.forEach((color, i) => waveGradient!.addColorStop(i / (colors.length - 1), color));
          gradientWidth = w;
        }
        const envelope = (.014 + data.bass * .020 + data.amplitude * .015 + data.transient * .004) * motion;
        // One low-energy trace, one signal body and one treble edge, in a dedicated lane.
        for (let layer = 2; layer >= 0; layer--) {
          context.strokeStyle = layer === 0 ? '#c5e3ed' : waveGradient;
          context.lineWidth = layer === 2 ? Math.max(1.3, w * .0055) : layer === 1 ? Math.max(.8, w * .003) : Math.max(.4, w * .0012);
          context.globalAlpha = layer === 2 ? .08 + response.glow * .12 * motion
            : layer === 1 ? .22 + data.amplitude * .58 * motion
            : data.treble * .24 * motion;
          context.shadowColor = '#56a9df';
          context.shadowBlur = layer === 1 && w >= 80 ? Math.min(3, w * .008) * response.glow * motion : 0;
          for (let i = 0; i < 64; i++) {
            const x = i / 63;
            const band = response.bands[Math.min(23, Math.floor(x * 24))];
            const sample = response.waveform[i];
            const neighbor = response.waveform[Math.max(0, i - 1)];
            const value = (sample + neighbor) * .5 * (.72 + data.bass * .28)
              + sample * data.mid * .24 + (sample - neighbor) * data.treble * .12
              + sample * band * .22;
            const displacement = Math.tanh(value * (1.35 + data.transient * .25))
              * h * envelope * (4 * x * (1 - x));
            points[i].x = w * (.09 + .82 * x);
            points[i].y = h * .879 + displacement;
          }
          context.beginPath(); context.moveTo(points[0].x, points[0].y);
          for (let i = 0; i < points.length - 1; i++) {
            const p0 = points[Math.max(0, i - 1)], p1 = points[i];
            const p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
            context.bezierCurveTo(p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6,
              p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6, p2.x, p2.y);
          }
          context.stroke();
        }
        context.shadowBlur = 0;
      }
      context.globalAlpha = 1;
      element.dataset.painted = 'true';
    };
    const onSignal = (next: AudioAnalysisFrame, actualPlaying: boolean) => {
      if (disposed || (next.trackId !== undefined && next.trackId !== trackId)) return;
      if (next.sequence === 0) {
        cancelAnimationFrame(frame); frame = 0; pending = undefined;
        held.current = next; draw(); return;
      }
      if (!actualPlaying) {
        cancelAnimationFrame(frame); frame = 0;
        pending = undefined; return;
      }
      if (document.hidden || next.sequence === held.current.sequence) return;
      const now = performance.now();
      if (reduced.matches && now - lastPaint < 125) return;
      lastPaint = now;
      const old = pending ?? held.current;
      const smooth = (a: number, b: number) => a + (b - a) * (b > a ? .85 : .45);
      pending = {
        ...next,
        sequence: next.sequence, amplitude: smooth(old.amplitude, next.amplitude),
        bass: smooth(old.bass, next.bass), mid: smooth(old.mid, next.mid), treble: smooth(old.treble, next.treble),
        transient: smooth(old.transient, next.transient),
        bands: next.bands.map((value, i) => smooth(old.bands[i] ?? 0, value)),
        waveform: next.waveform.map((value, i) => (old.waveform[i] ?? 0) + (value - (old.waveform[i] ?? 0)) * .7),
      };
      if (!frame) frame = requestAnimationFrame(draw);
    };
    const unsubscribe = preview ? () => {} : subscribeAudioAnalysis(onSignal);
    if (!preview) {
      const snapshot = audioAnalysisSnapshot();
      onSignal(snapshot.frame, snapshot.playing);
    }
    const restart = () => {
      cancelAnimationFrame(frame); frame = 0;
      size = element.getBoundingClientRect(); draw();
    };
    const observer = new ResizeObserver(restart);
    observer.observe(element);
    reduced.addEventListener('change', restart);
    draw();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame); unsubscribe(); observer.disconnect();
      reduced.removeEventListener('change', restart);
    };
  }, [kind, trackId]);
  return <canvas ref={canvas} className="premium-signal" aria-hidden="true" />;
}
/** The arm consumes the existing transport props; it never issues audio commands.
 * Play lowers the arm; Pause lifts and returns it to the original rest position.
 * Track transitions chain on animation completion, never on a fake-play timer. */
function ReferenceTurntable({ playing, trackId, artwork, armReset }: {
  playing: boolean; trackId: string; artwork: React.ReactNode; armReset: number;
}) {
  const arm = useRef<HTMLImageElement>(null);
  const motion = useRef<Animation | null>(null);
  const phase = useRef<'rest' | 'entering' | 'playing' | 'leaving'>('rest');
  const latest = useRef({ playing, trackId, armReset });
  latest.current = { playing, trackId, armReset };
  const previous = useRef({ trackId, armReset });
  const rest = 'rotate(-42deg) translateY(-5px)';
  const above = 'rotate(0deg) translateY(-5px)';
  const down = 'rotate(0deg) translateY(0px)';
  useEffect(() => {
    const element = arm.current;
    if (!element) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const pose = () => getComputedStyle(element).transform;
    const cancel = () => {
      if (!motion.current) return;
      const frozen = pose();
      motion.current.onfinish = null;
      motion.current.cancel();
      motion.current = null;
      element.style.transform = frozen;
    };
    const enter = () => {
      cancel();
      phase.current = 'entering';
      element.dataset.phase = 'entering';
      const animation = element.animate([
        { transform: pose(), offset: 0 },
        { transform: above, offset: .82 },
        { transform: down, offset: 1 },
      ], { duration: reduced ? 0 : 2200, easing: 'cubic-bezier(.3,0,.3,1)', fill: 'forwards' });
      motion.current = animation;
      animation.onfinish = () => {
        element.style.transform = down;
        animation.cancel(); motion.current = null;
        phase.current = 'playing'; element.dataset.phase = 'playing';
      };
    };
    const leave = (restart: boolean) => {
      cancel();
      phase.current = 'leaving'; element.dataset.phase = 'leaving';
      const currentPose = pose();
      // A small lift precedes the lateral sweep; the shaft and head share
      // one physical pivot. No partial head is hidden beneath the vinyl.
      const animation = element.animate([
        { transform: currentPose, offset: 0 },
        { transform: `${currentPose} translateY(-5px)`, offset: .18 },
        { transform: rest, offset: 1 },
      ], { duration: reduced ? 0 : 2000, easing: 'cubic-bezier(.3,0,.3,1)', fill: 'forwards' });
      motion.current = animation;
      animation.onfinish = () => {
        element.style.transform = rest;
        animation.cancel(); motion.current = null;
        phase.current = 'rest'; element.dataset.phase = 'rest';
        if (restart && latest.current.playing) enter();
      };
    };
    const changed = previous.current.trackId !== trackId;
    const reset = previous.current.armReset !== armReset;
    previous.current = { trackId, armReset };
    if (reset || changed) {
      if (phase.current !== 'rest') leave(changed || playing);
      else if (playing && changed) enter();
      return;
    }
    if (playing) {
      if (phase.current === 'rest') enter();
      else if (phase.current === 'entering' && motion.current?.playState === 'paused') {
        motion.current.play();
      } else if (phase.current === 'leaving') {
        if (motion.current) {
          motion.current.onfinish = () => {
            element.style.transform = rest;
            motion.current?.cancel(); motion.current = null;
            phase.current = 'rest'; element.dataset.phase = 'rest';
            if (latest.current.playing) enter();
          };
        }
      }
    } else if (phase.current === 'entering' || phase.current === 'playing') {
      leave(false);
    }
  }, [playing, trackId, armReset]);
  useEffect(() => {
    return () => {
      if (motion.current) { motion.current.onfinish = null; motion.current.cancel(); motion.current = null; }
      phase.current = 'rest';
    };
  }, []);
  return <div className="reference-turntable" data-transport={playing ? 'playing' : 'paused-or-stopped'} role="img" aria-label="گرامافون چوب گردویی با بازوی طلایی">
    <div className="reference-turntable-scene">
      <img className="reference-turntable-body" src="/player-themes/reference-turntable/body.webp" alt="" draggable={false} />
      <div className="reference-record-plane" aria-hidden="true">
        <div className="reference-record-spin">
          <img className="reference-record-texture" src="/player-themes/reference-turntable/record.webp" alt="" draggable={false} />
          <div className="reference-record-artwork" key={trackId}>{artwork}</div>
        </div>
        <img className="reference-record-light" src="/player-themes/reference-turntable/light.webp" alt="" draggable={false} />
      </div>
      <img className="reference-turntable-hardware" src="/player-themes/reference-turntable/hardware.webp" alt="" draggable={false} />
      <img ref={arm} className="reference-turntable-arm" data-phase="rest" src="/player-themes/reference-turntable/arm.webp" alt="" draggable={false} />
    </div>
  </div>;
}
export function PlayerSkins({ skin, playing, trackId, artwork, title, artist, compact = false, armReset = 0, position = 0, duration = 0, playbackRate = 1 }: {
  skin: PlayerSkin; playing: boolean; trackId: string; artwork: React.ReactNode;
  title?: string; artist?: string;
  compact?: boolean; armReset?: number; position?: number; duration?: number; playbackRate?: number;
}) {
  return <div className={`ritmo-skin-stage skin-${skin} ${compact ? 'skin-compact' : ''} ${playing ? 'is-playing' : ''}`} aria-label={PLAYER_SKINS.find(s => s.id === skin)?.label}>
    <div className="ritmo-skin-device" key={skin}>
      {skin === 'cassette' ? <div className="ritmo-featured-skin-layout ritmo-featured-cassette">
          <CassetteWalkman playing={playing} trackId={trackId} position={position} duration={duration} playbackRate={playbackRate} />
          </div>
        : skin === 'vinyl' ? <ReferenceTurntable playing={playing} trackId={trackId} artwork={artwork} armReset={armReset} />
        : skin === 'music-ring' ? <CircularMusicSkin playing={playing} trackId={trackId} artwork={artwork} />
        : skin === 'sleeve-wave' ? <SquareMusicSkin playing={playing} trackId={trackId} artwork={artwork} />
        : skin === 'nocturne' ? <NocturnePlayerSkin artwork={artwork} title={title} artist={artist} playing={playing} position={position} duration={duration} />
        : skin === 'midnight-orbit' ? <ReferencePlayerSkin skin={skin} artwork={artwork} title={title} artist={artist} playing={playing} position={position} duration={duration} />
        : isReferenceSkin(skin) ? <ReferencePlayerSkin skin={skin} artwork={artwork} title={title} artist={artist} playing={playing} position={position} duration={duration} />
        : null}
    </div>
  </div>;
}
/** A fixed visual slot only; it neither owns nor changes Mini Player behavior. */
export function MiniPlayerSkin({ skin, playing, trackId, artwork, title, artist, position = 0, duration = 0, playbackRate = 1 }: {
  skin: PlayerSkin; playing: boolean; trackId: string; artwork: React.ReactNode;
  title?: string; artist?: string;
  position?: number; duration?: number; playbackRate?: number;
}) {
  return <span className="ritmo-mini-skin" aria-hidden="true">
    <PlayerSkins skin={skin} playing={playing} trackId={trackId} artwork={artwork} title={title} artist={artist} position={position} duration={duration} playbackRate={playbackRate} compact />
  </span>;
}

/** The same real device components are used by Settings and the Player picker. */
export function PlayerSkinPicker({ selected, onSelect, artwork, title, artist, onClose }: {
  selected: PlayerSkin; onSelect: (skin: PlayerSkin) => void;
  artwork: React.ReactNode; onClose?: () => void;
  title?: string; artist?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!dialog.current) return;
    const element = dialog.current;
    const focused = document.activeElement as HTMLElement | null;
    element.showModal();
    const cancel = (event: Event) => { event.preventDefault(); event.stopPropagation(); closeRef.current?.(); };
    element.addEventListener('cancel', cancel);
    return () => {
      element.removeEventListener('cancel', cancel);
      element.close();
      if (focused?.isConnected) focused.focus({ preventScroll: true });
    };
  }, []);
  const previews = <div className="ritmo-skin-choices" role="group" aria-label="انتخاب پوسته پخش‌کننده">
    {PLAYER_SKINS.map(s => <button type="button" key={s.id} className="ritmo-skin-choice" aria-label={`پوسته ${s.label}`} aria-pressed={selected === s.id} onClick={() => onSelect(s.id)}>
      <PlayerSkins skin={s.id} playing={false} trackId="preview" artwork={artwork} title={title} artist={artist} />
      <span className="ritmo-skin-choice-caption"><strong dir="auto">{s.label}</strong>{selected === s.id && <Check size={14} aria-hidden="true" />}</span>
    </button>)}
  </div>;
  return onClose ? <dialog ref={dialog} className="ritmo-skin-picker" dir="rtl" aria-label="انتخاب پوسته پخش‌کننده">
    <header><h2>پوسته پخش‌کننده</h2><button type="button" onClick={onClose} aria-label="بستن انتخاب پوسته"><ArrowRight size={22} /></button></header>
    {previews}
  </dialog> : previews;
}
