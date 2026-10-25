import React, { useEffect, useRef } from 'react';
import photograph from './cassette-photo/reference.png';
import leftTexture from './cassette-photo/left-hub.png';
import rightTexture from './cassette-photo/right-hub.png';
import './PhotoCassetteScene.css';

type Props = {
  playing: boolean; trackId: string; position?: number; duration?: number; playbackRate?: number;
};

/** The reference photo is alpha-matted, retaining the player, wire and cassette.
 * Complete photograph-derived metal reel discs rotate around calibrated centers.
 * The previous skin is retained for rollback. No audio or library logic is changed.
 */
export function cassetteGeometry(position: number, duration: number) {
  const seconds = Number.isFinite(position) ? Math.max(0, position) : 0;
  const length = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const progress = length ? Math.min(1, seconds / length) : 0;
  const core = 25, full = 64, area = full * full - core * core;
  const supply = Math.sqrt(full * full - area * progress);
  const takeup = Math.sqrt(core * core + area * progress);
  const travel = length ? Math.min(seconds, length) : seconds;
  const leftAngle = length ? -38 * 2 * length * (full - supply) / area : -38 * travel / full;
  const rightAngle = length ? -38 * 2 * length * (takeup - core) / area : -38 * travel / core;
  return { progress, supply, takeup, leftAngle: leftAngle * 180 / Math.PI,
    rightAngle: rightAngle * 180 / Math.PI };
}

export default function PhotoCassetteScene({ playing, trackId, position = 0, duration = 0, playbackRate = 1 }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const leftHub = useRef<HTMLImageElement>(null), rightHub = useRef<HTMLImageElement>(null);
  const latest = useRef({ playing, trackId, position, duration, playbackRate });
  latest.current = { playing, trackId, position, duration, playbackRate };
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let raf = 0, lastPaint = 0, disposed = false;
    let observed = { trackId: latest.current.trackId, position: latest.current.position,
      at: performance.now(), base: latest.current.position };
    let wasPlaying = latest.current.playing;
    let displayed = latest.current.position;
    const draw = (time: number) => {
      const geometry = cassetteGeometry(time, latest.current.duration);
      if (!reduced.matches) {
        if (leftHub.current) leftHub.current.style.transform = `rotate(${geometry.leftAngle}deg)`;
        if (rightHub.current) rightHub.current.style.transform = `rotate(${geometry.rightAngle}deg)`;
      }
      element.dataset.progress = geometry.progress.toFixed(4);
      element.dataset.position = time.toFixed(3);
    };
    const frame = (now: number) => {
      raf = 0;
      if (disposed || document.hidden) return;
      const state = latest.current;
      const changedTrack = observed.trackId !== state.trackId;
      const changedPosition = observed.position !== state.position;
      if (changedTrack || changedPosition) {
        observed = { trackId: state.trackId, position: state.position, at: now, base: state.position };
      } else if (state.playing && !wasPlaying) {
        observed = { ...observed, at: now, base: displayed };
      }
      wasPlaying = state.playing;
      const audio = state.trackId === 'preview' ? null : document.querySelector('audio');
      const browserClock = state.playing && audio && !audio.paused && Number.isFinite(audio.currentTime);
      const elapsed = state.playing && !reduced.matches
        ? Math.min(.5, Math.max(0, (now - observed.at) / 1000)) * state.playbackRate : 0;
      const sampled = browserClock ? audio.currentTime : state.playing
        ? Math.min(state.position + .5 * state.playbackRate, observed.base + elapsed) : state.position;
      if (state.playing || changedTrack || changedPosition || reduced.matches) displayed = sampled;
      if (now - lastPaint >= (reduced.matches ? 125 : 1000 / 30) || !state.playing) {
        draw(displayed); lastPaint = now;
      }
      if (state.playing && !reduced.matches && (browserClock || now - observed.at < 500)) {
        raf = requestAnimationFrame(frame);
      }
    };
    const refresh = () => {
      cancelAnimationFrame(raf); raf = 0; frame(performance.now());
    };
    element.addEventListener('ritmo-cassette-update', refresh);
    reduced.addEventListener('change', refresh);
    document.addEventListener('visibilitychange', refresh);
    draw(displayed); refresh();
    return () => {
      disposed = true; cancelAnimationFrame(raf);
      element.removeEventListener('ritmo-cassette-update', refresh);
      reduced.removeEventListener('change', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [trackId]);
  useEffect(() => {
    root.current?.dispatchEvent(new Event('ritmo-cassette-update'));
  }, [playing, position, duration, playbackRate]);

  return <div ref={root} className="ritmo-walkman ritmo-photo-scene" role="img"
    aria-label="واکمن ریتمو، سیم و کاست کناری بدون پس‌زمینه؛ قرقره‌های کامل هماهنگ با پخش واقعی"
    data-transport={playing ? 'playing' : 'paused-or-stopped'} data-track={trackId}>
    <img className="ritmo-reference-photo" src={photograph} alt="" draggable={false} />
    <div className="ritmo-photo-hub ritmo-photo-hub-left" aria-hidden="true">
      <div className="ritmo-photo-hub-plane"><img ref={leftHub} src={leftTexture} alt="" draggable={false} /></div>
      <span className="ritmo-photo-axle" />
    </div>
    <div className="ritmo-photo-hub ritmo-photo-hub-right" aria-hidden="true">
      <div className="ritmo-photo-hub-plane"><img ref={rightHub} src={rightTexture} alt="" draggable={false} /></div>
      <span className="ritmo-photo-axle" />
    </div>
  </div>;
}
