import React, { useEffect, useRef } from 'react';
import { AudioAnalysisFrame, SILENT_ANALYSIS, audioAnalysisSnapshot, subscribeAudioAnalysis } from '../utils/audioAnalysis';
import './SquareMusicSkin.css';

const BAR_COUNT = 120;
const finiteUnit = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

/** Driven only by the shared, real audio spectrum. No fake beat. */
export function squareBarEnergy(frame: AudioAnalysisFrame, index: number): number {
  const position = (index % BAR_COUNT) / BAR_COUNT * Math.max(0, frame.bands.length - 1);
  const left = Math.floor(position), fraction = position - left;
  const band = finiteUnit(frame.bands[left] ?? 0) * (1 - fraction)
    + finiteUnit(frame.bands[Math.min(left + 1, frame.bands.length - 1)] ?? 0) * fraction;
  const naturalVariation = .78 + ((index * 37) % 17) / 100;
  return finiteUnit((band * .84 + finiteUnit(frame.amplitude) * .10 + finiteUnit(frame.transient) * .06) * naturalVariation);
}

/** Thirty outward-facing bars per side, clockwise, with equal edge spacing. */
export function squareBarGeometry(index: number) {
  const side = Math.floor(index / 30);
  const offset = ((index % 30) + .5) / 30 * 2 - 1;
  if (side === 0) return { x:offset, y:-1, nx:0, ny:-1 };
  if (side === 1) return { x:1, y:offset, nx:1, ny:0 };
  if (side === 2) return { x:-offset, y:1, nx:0, ny:1 };
  return { x:-1, y:-offset, nx:-1, ny:0 };
}

function SquareSpectrum({ playing, trackId }: { playing: boolean; trackId: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const transport = useRef(playing);
  transport.current = playing;
  useEffect(() => {
    const element = canvas.current, context = element?.getContext('2d');
    if (!element || !context) return;
    let queued = 0, disposed = false;
    let held = SILENT_ANALYSIS;
    let size = element.getBoundingClientRect();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const geometry = Array.from({ length: BAR_COUNT }, (_, index) => {
      const palette = ['#D7A86E','#A9C7D8','#C7869B','#B8A6D9','#7FC2B2','#E0C58A'];
      return { ...squareBarGeometry(index), color:palette[index % palette.length], lengthFactor:.82 + ((index * 19) % 23) / 100 };
    });
    const draw = () => {
      queued = 0;
      if (disposed || !size.width || !size.height) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.round(size.width * ratio), height = Math.round(size.height * ratio);
      if (element.width !== width || element.height !== height) {
        element.width = width; element.height = height;
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, size.width, size.height);
      const dimension = Math.min(size.width, size.height), radius = dimension * .393;
      const centerX = size.width / 2, centerY = size.height / 2;
      context.lineCap = 'round';
      context.lineWidth = Math.max(.9, dimension * .0058);
      geometry.forEach((point, index) => {
        const energy = squareBarEnergy(held, index);
        const length = dimension * (.008 + energy * point.lengthFactor * (reduced.matches ? .05 : .16));
        context.strokeStyle = point.color;
        context.globalAlpha = .38 + energy * .62;
        context.beginPath();
        context.moveTo(centerX + point.x * radius, centerY + point.y * radius);
        context.lineTo(centerX + point.x * radius + point.nx * length, centerY + point.y * radius + point.ny * length);
        context.stroke();
      });
      context.globalAlpha = 1;
      element.dataset.signal = held.sequence > 0 ? 'audio-data' : 'awaiting-audio';
      element.dataset.sequence = String(held.sequence);
    };
    const receive = (next: AudioAnalysisFrame, actualPlaying: boolean) => {
      if (disposed || (next.trackId !== undefined && next.trackId !== trackId)) return;
      if (next.sequence === 0) {
        cancelAnimationFrame(queued); queued = 0;
        held = next; draw(); return;
      }
      if (!actualPlaying || !transport.current) {
        cancelAnimationFrame(queued); queued = 0; return;
      }
      if (document.hidden || next.sequence === held.sequence) return;
      const old = held;
      const smooth = (a: number, b: number) => a + (b - a) * (b > a ? .88 : .55);
      held = {
        ...next,
        amplitude: smooth(old.amplitude, next.amplitude),
        transient: smooth(old.transient, next.transient),
        bands: next.bands.map((value, index) => smooth(old.bands[index] ?? 0, value)),
      };
      if (!queued) queued = requestAnimationFrame(draw);
    };
    const unsubscribe = trackId === 'preview' ? () => {} : subscribeAudioAnalysis(receive);
    if (trackId !== 'preview') {
      const snapshot = audioAnalysisSnapshot();
      receive(snapshot.frame, snapshot.playing);
    }
    const resize = () => {
      cancelAnimationFrame(queued); queued = 0;
      size = element.getBoundingClientRect(); draw();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    reduced.addEventListener('change', resize);
    draw();
    return () => {
      disposed = true; cancelAnimationFrame(queued);
      unsubscribe(); observer.disconnect();
      reduced.removeEventListener('change', resize);
    };
  }, [trackId]);
  return <canvas ref={canvas} className="ritmo-square-spectrum" aria-hidden="true" />;
}

export default function SquareMusicSkin({ artwork, playing, trackId }: {
  artwork: React.ReactNode; playing: boolean; trackId: string;
}) {
  return <div className="ritmo-square-skin">
    <div className="ritmo-square-cover">
      <div className="ritmo-square-artwork">{artwork}</div>
    </div>
    <SquareSpectrum playing={playing} trackId={trackId} />
  </div>;
}
