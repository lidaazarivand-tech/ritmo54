import React, { useEffect, useId, useRef } from 'react';
import './CassetteWalkman.css';

type Props = {
  playing: boolean;
  trackId: string;
  position?: number;
  duration?: number;
  playbackRate?: number;
};

/** Read-only skin. Tape area is conserved, and both hubs follow one tape speed.
 * No transport commands, audio sources, timers, or independent playback state.
 * Studio direction: deep lacquer red housing, graphite trim, smoke polycarbonate, ivory paper.
 * The continuous molded shell takes its material logic from industrial designs,
 * not from an illustrated cassette card. The existing visual slot is unchanged.
 */
export function cassetteGeometry(position: number, duration: number) {
  const seconds = Number.isFinite(position) ? Math.max(0, position) : 0;
  const length = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const progress = length ? Math.min(1, seconds / length) : 0;
  const core = 25, full = 64, area = full * full - core * core;
  const supply = Math.sqrt(full * full - area * progress);
  const takeup = Math.sqrt(core * core + area * progress);
  // Integral of v/r(t): a constant linear tape speed, changing angular speeds.
  const travel = length ? Math.min(seconds, length) : seconds;
  const leftAngle = length ? -38 * 2 * length * (full - supply) / area : -38 * travel / full;
  const rightAngle = length ? -38 * 2 * length * (takeup - core) / area : -38 * travel / core;
  return { progress, supply, takeup, leftAngle: leftAngle * 180 / Math.PI,
    rightAngle: rightAngle * 180 / Math.PI };
}

/** External tangent to the fixed lower guide: the ribbon never cuts a tape pack. */
function tapeTangent(cx: number, cy: number, radius: number, gx: number, gy: number, side: number) {
  const dx = gx - cx, dy = gy - cy, distance = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx) + side * Math.acos(radius / distance);
  return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
}

export default function CassetteWalkman({ playing, trackId, position = 0, duration = 0, playbackRate = 1 }: Props) {
  const id = `ritmo-wm-${useId().replace(/:/g, '')}`;
  const root = useRef<HTMLDivElement>(null);
  const leftHub = useRef<SVGGElement>(null), rightHub = useRef<SVGGElement>(null);
  const leftPack = useRef<SVGGElement>(null), rightPack = useRef<SVGGElement>(null);
  const ribbon = useRef<SVGPathElement>(null), grain = useRef<SVGPathElement>(null);
  const latest = useRef({ playing, trackId, position, duration, playbackRate });
  latest.current = { playing, trackId, position, duration, playbackRate };
  // Imperative poses are stable across React transport renders; no 500ms reset.
  const initial = useRef(cassetteGeometry(position, duration)).current;
  const url = (name: string) => `url(#${id}-${name})`;

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let raf = 0, lastPaint = 0, disposed = false;
    let observed = { trackId: latest.current.trackId, position: latest.current.position, at: performance.now(), base: latest.current.position };
    let wasPlaying = latest.current.playing;
    let displayed = latest.current.position;
    const draw = (time: number) => {
      const state = latest.current;
      const geometry = cassetteGeometry(time, state.duration);
      leftPack.current?.setAttribute('transform', `translate(159 201) scale(${geometry.supply / 64})`);
      rightPack.current?.setAttribute('transform', `translate(321 201) scale(${geometry.takeup / 64})`);
      if (!reduced.matches) {
        leftHub.current?.setAttribute('transform', `rotate(${geometry.leftAngle} 159 201)`);
        rightHub.current?.setAttribute('transform', `rotate(${geometry.rightAngle} 321 201)`);
      }
      const a = tapeTangent(159, 201, geometry.supply, 91, 276, 1);
      const b = tapeTangent(321, 201, geometry.takeup, 389, 276, -1);
      const path = `M ${a.x} ${a.y} L 87 273 Q 83 288 101 289 L 379 289 Q 397 288 393 273 L ${b.x} ${b.y}`;
      ribbon.current?.setAttribute('d', path);
      grain.current?.setAttribute('d', path);
      grain.current?.setAttribute('stroke-dashoffset', `${-time * 38}`);
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
        // Resume from the held pose, not from the elapsed wall time during pause.
        observed = { ...observed, at: now, base: displayed };
      }
      wasPlaying = state.playing;
      // Browser: read the existing audio clock directly, never create an audio node.
      // Android: bounded interpolation between the existing 500ms transport polls.
      // A stale poll can advance at most 500ms, then freezes rather than inventing time.
      const audio = trackId === 'preview' ? null : document.querySelector('audio');
      const browserClock = state.playing && audio && !audio.paused && Number.isFinite(audio.currentTime);
      const elapsed = state.playing && !reduced.matches
        ? Math.min(.5, Math.max(0, (now - observed.at) / 1000)) * state.playbackRate : 0;
      const sampled = browserClock ? audio.currentTime : state.playing
        ? Math.min(state.position + .5 * state.playbackRate, observed.base + elapsed) : state.position;
      if (state.playing || changedTrack || changedPosition || reduced.matches) displayed = sampled;
      if (now - lastPaint >= (reduced.matches ? 125 : 1000 / 30) || !state.playing) {
        draw(displayed); lastPaint = now;
      }
      // A stalled native clock sleeps until the next real prop update.
      if (state.playing && !reduced.matches && (browserClock || now - observed.at < 500)) {
        raf = requestAnimationFrame(frame);
      }
    };
    const refresh = () => {
      cancelAnimationFrame(raf); raf = 0;
      frame(performance.now());
    };
    // The component receives real transport updates; paused previews do no frame work.
    element.addEventListener('ritmo-cassette-update', refresh);
    reduced.addEventListener('change', refresh);
    document.addEventListener('visibilitychange', refresh);
    draw(displayed);
    refresh();
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

  const screw = (x: number, y: number, small = false) => <g key={`${x}-${y}`} transform={`translate(${x} ${y})`}>
    <circle r={small ? 4 : 6} fill={url('steel')} stroke="#080c10" strokeWidth="1" />
    <circle r={small ? 2.7 : 4.4} fill="none" stroke="#d5dce1" strokeOpacity=".3" strokeWidth=".5" />
    <path d={small ? 'M -2 0 H 2 M 0 -2 V 2' : 'M -3.5 0 H 3.5 M 0 -3.5 V 3.5'} stroke="#11171b" strokeWidth="1.5" transform="rotate(-24)" />
    <path d="M -2 -2 L 0 -3" stroke="#fff" strokeOpacity=".5" strokeWidth=".6" />
  </g>;
  const pack = (cx: number, radius: number, ref: React.Ref<SVGGElement>) => <g ref={ref} transform={`translate(${cx} 201) scale(${radius / 64})`}>
    <circle r="64" fill={url('tape')} stroke="#100c09" strokeWidth="2" />
    {Array.from({ length: 35 }, (_, n) => <circle key={n} r={27 + n * 1.04} fill="none"
      stroke={n % 3 === 0 ? '#b49a7c' : '#090705'} strokeOpacity={n % 3 === 0 ? '.17' : '.38'} strokeWidth=".55" />)}
    <circle r="63" fill="none" stroke="#b2a28b" strokeOpacity=".26" strokeWidth=".7" />
  </g>;
  const hub = (cx: number, angle: number, ref: React.Ref<SVGGElement>) => <g ref={ref} transform={`rotate(${angle} ${cx} 201)`}>
    <g transform={`translate(${cx} 201)`}>
      <circle r="29" fill="#070c0e" opacity=".65" />
      <circle r="26.5" fill={url('hub')} stroke="#c4c9c0" strokeWidth=".8" />
      <circle r="22.5" fill="none" stroke="#f1f0dd" strokeOpacity=".65" strokeWidth="1.2" />
      {Array.from({ length: 6 }, (_, n) => <g key={n} transform={`rotate(${n * 60})`}>
        <path d="M -5 -20 Q 0 -23 5 -20 L 3.3 -13 Q 0 -10 -3.3 -13 Z" fill="#151c1b" stroke="#868b7f" strokeWidth=".7" />
        <path d="M -5 -19 L -3 -13" stroke="#f6f4e3" strokeOpacity=".65" strokeWidth=".7" />
      </g>)}
      <circle r="10" fill="#1a2425" stroke="#b3b7a8" strokeWidth="1.7" />
      {Array.from({ length: 6 }, (_, n) => <path key={n} d="M -2 -10 L -2 -6 L 2 -6 L 2 -10" fill="#c5c8b8" transform={`rotate(${n * 60})`} />)}
      <circle r="5.3" fill={url('steel')} stroke="#080d10" strokeWidth="1.3" />
      <circle r="2" fill="#172127" />
    </g>
  </g>;
  return <div ref={root} className="ritmo-walkman" role="img"
    aria-label="واکمن RITMO با کاست مکانیکی هماهنگ با پخش موسیقی"
    data-transport={playing ? 'playing' : 'paused-or-stopped'} data-track={trackId}>
    <svg className="ritmo-walkman-scene" viewBox="0 0 480 330" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-body`} x1="0" y1="0" x2=".85" y2="1" gradientUnits="objectBoundingBox">
          <stop stopColor="#b92f2b" /><stop offset=".18" stopColor="#8f1e22" />
          <stop offset=".5" stopColor="#64151b" /><stop offset="1" stopColor="#310c12" />
        </linearGradient>
        <linearGradient id={`${id}-edge`} x2="0" y2="1">
          <stop stopColor="#d14b42" /><stop offset=".08" stopColor="#6e171d" />
          <stop offset=".5" stopColor="#20252a" /><stop offset=".87" stopColor="#080b0f" /><stop offset="1" stopColor="#3e464b" />
        </linearGradient>
        <linearGradient id={`${id}-steel`} x2=".8" y2="1">
          <stop stopColor="#f4f5ef" /><stop offset=".27" stopColor="#8c9a9f" />
          <stop offset=".49" stopColor="#d2d8d6" /><stop offset=".55" stopColor="#667378" /><stop offset="1" stopColor="#28383e" />
        </linearGradient>
        <linearGradient id={`${id}-paper`} x2=".2" y2="1">
          <stop stopColor="#e1ded0" /><stop offset=".7" stopColor="#c7c5b7" /><stop offset="1" stopColor="#a8ab9e" />
        </linearGradient>
        <linearGradient id={`${id}-hub`} x2=".7" y2="1">
          <stop stopColor="#e6e5d6" /><stop offset=".5" stopColor="#abb5ac" /><stop offset="1" stopColor="#586762" />
        </linearGradient>
        <radialGradient id={`${id}-tape`} cx=".35" cy=".28" r=".8">
          <stop stopColor="#655244" /><stop offset=".35" stopColor="#3c2d23" /><stop offset=".72" stopColor="#241912" /><stop offset="1" stopColor="#493529" />
        </radialGradient>
        <linearGradient id={`${id}-shell`} x2=".5" y2="1">
          <stop stopColor="#b9312d" stopOpacity=".44" /><stop offset=".45" stopColor="#7b1a20" stopOpacity=".22" />
          <stop offset="1" stopColor="#180b10" stopOpacity=".78" />
        </linearGradient>
        <linearGradient id={`${id}-glass`} x1="0" y1="0" x2=".8" y2="1">
          <stop stopColor="#cfe4ec" stopOpacity=".18" /><stop offset=".4" stopColor="#fff" stopOpacity=".025" />
          <stop offset=".42" stopColor="#fff" stopOpacity=".08" /><stop offset=".48" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#91b4c2" stopOpacity=".075" />
        </linearGradient>
        <pattern id={`${id}-texture`} width="5" height="5" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r=".45" fill="#fff" opacity=".09" />
          <circle cx="3.5" cy="3" r=".55" fill="#000" opacity=".16" />
        </pattern>
        <clipPath id={`${id}-window`}><rect x="63" y="101" width="354" height="201" rx="13" /></clipPath>
      </defs>
      {/* Extruded back housing, seam, injection-molded face, grazing studio light. */}
      <rect x="22" y="26" width="439" height="296" rx="29" fill="#060b10" />
      <rect x="19" y="18" width="441" height="298" rx="29" fill={url('edge')} stroke="#0a1015" strokeWidth="2" />
      <rect x="14" y="10" width="439" height="297" rx="27" fill={url('body')} stroke="#64717a" strokeWidth="1" />
      <rect x="16" y="12" width="435" height="293" rx="25" fill={url('texture')} />
      <path d="M 41 13 H 424 Q 449 13 449 38" fill="none" stroke="#d4e0e5" strokeOpacity=".45" strokeWidth="1" />
      <path d="M 17 42 V 274 Q 17 303 45 303 H 423" fill="none" stroke="#000" strokeOpacity=".7" strokeWidth="2" />
      <path d="M 456 58 V 274 M 459 61 V 273" stroke="#5a6870" strokeOpacity=".38" />
      {[0, 1, 2, 3, 4, 5, 6].map(n => <path key={n} d={`M 458 ${123 + n * 11} h 3`} stroke="#080d12" strokeWidth="4" />)}
      {/* Fixed molded hardware from the reference silhouette. These are not controls. */}
      <g aria-hidden="true">
        <rect x="92" y="0" width="48" height="18" rx="4" fill="#17191b" stroke="#c3c5bd" strokeOpacity=".5" />
        <rect x="101" y="-5" width="27" height="9" rx="2" fill="#45494a" stroke="#d9d5c9" strokeOpacity=".45" />
        <rect x="178" y="0" width="60" height="18" rx="4" fill="#111416" stroke="#c3c5bd" strokeOpacity=".55" />
        <rect x="189" y="-6" width="39" height="10" rx="2" fill="#565857" stroke="#ddd9ca" strokeOpacity=".45" />
        <rect x="276" y="1" width="42" height="17" rx="4" fill="#181a1c" stroke="#c3c5bd" strokeOpacity=".5" />
        <circle cx="336" cy="8" r="11" fill={url('steel')} stroke="#11161a" strokeWidth="2" />
        <path d="M 329 5 H 343 M 329 9 H 343 M 331 13 H 341" stroke="#252b2d" strokeWidth="1" />
      </g>
      <rect x="43" y="37" width="122" height="38" rx="4" fill="#172029" stroke="#778a96" strokeOpacity=".25" />
      <text x="55" y="64" fontFamily="Arial, sans-serif" fontWeight="800" fontSize="27" letterSpacing="2.5" fill="#0a1015">RITMO</text>
      <text x="55" y="63" fontFamily="Arial, sans-serif" fontWeight="800" fontSize="27" letterSpacing="2.5" fill="#d3e1e6">RITMO</text>
      <text x="187" y="55" fontFamily="Arial, sans-serif" fontSize="9" letterSpacing="1.6" fill="#f0c1b6">STEREO CASSETTE PLAYER</text>
      <path d="M 187 64 H 307" stroke="#d99b8c" strokeOpacity=".7" strokeWidth="1.4" />
      <rect x="348" y="41" width="60" height="28" rx="3" fill="#24161b" stroke="#a77d78" strokeOpacity=".65" strokeWidth=".7" />
      <text x="378" y="59" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="8" fontWeight="700" letterSpacing="1" fill="#dfb5aa">CLASSIC</text>
      <text x="378" y="67" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="6" letterSpacing=".8" fill="#bd8f88">SERIES</text>
      <path d="M 40 86 H 424" stroke="#080e13" strokeWidth="2" />
      <path d="M 41 87 H 423" stroke="#76868c" strokeOpacity=".22" />
      {/* Recessed door seal; actual cassette sits behind the smoked glazing. */}
      <rect x="51" y="91" width="378" height="217" rx="19" fill="#080d12" stroke="#7c8992" strokeOpacity=".6" />
      <rect x="58" y="97" width="364" height="207" rx="15" fill="#1e292c" stroke="#060b0e" strokeWidth="3" />
      <g clipPath={url('window')}>
        <rect x="63" y="101" width="354" height="201" fill="#111c1c" />
        <path d="M 81 111 H 399 V 279 L 365 301 H 115 L 81 279 Z" fill={url('shell')} stroke="#a4b6aa" strokeOpacity=".5" strokeWidth="1.3" />
        <path d="M 85 115 H 395 V 276 L 363 296 H 118 L 85 276 Z" fill="none" stroke="#d2dbcf" strokeOpacity=".15" />
        {[95, 385].map(x => <g key={x}><path d={`M ${x} 146 v 94`} stroke="#8d9e92" strokeOpacity=".24" strokeWidth="2" />
          <path d={`M ${x + 4} 151 v 85`} stroke="#020c09" strokeOpacity=".6" /></g>)}
        {/* Paper label above the open mechanical cavity. No track artwork is rendered. */}
        <rect x="104" y="117" width="272" height="35" rx="3" fill={url('paper')} stroke="#e5e6d4" strokeOpacity=".55" />
        <path d="M 106 147 H 374" stroke="#487586" strokeWidth="3" />
        <text x="115" y="140" fontFamily="Arial, sans-serif" fontSize="19" fontWeight="800" letterSpacing="2" fill="#293b40">RITMO</text>
        <text x="249" y="138" fontFamily="Arial, sans-serif" fontSize="10" letterSpacing="1" fill="#3b4949">ANALOG SOUND</text>
        <text x="354" y="142" fontFamily="Arial, sans-serif" fontSize="21" fontWeight="700" fill="#29414a">A</text>
        <rect x="101" y="156" width="278" height="119" rx="52" fill="#080f0f" stroke="#81968b" strokeOpacity=".35" />
        <ellipse cx="159" cy="205" rx="66" ry="66" fill="#000" opacity=".42" />
        <ellipse cx="321" cy="205" rx="66" ry="66" fill="#000" opacity=".42" />
        {pack(159, initial.supply, leftPack)}{pack(321, initial.takeup, rightPack)}
        {/* Tangent ribbon, lower guide rollers, pressure pad and fixed tape head. */}
        <path ref={ribbon} d="M 95 201 L 87 273 Q 83 288 101 289 H 379 Q 397 288 393 273 L 346 201" fill="none" stroke="#3d281c" strokeWidth="4" strokeLinejoin="round" />
        <path ref={grain} d="M 95 201 L 87 273 Q 83 288 101 289 H 379 Q 397 288 393 273 L 346 201" fill="none" stroke="#a18b69" strokeOpacity=".3" strokeWidth=".5" strokeDasharray="1 11" />
        {[91, 389].map(x => <g key={x}>
          <circle cx={x} cy="276" r="9" fill="#070d0d" stroke="#6f7d72" strokeWidth="1" />
          <circle cx={x} cy="276" r="5" fill={url('steel')} stroke="#182422" />
          <circle cx={x} cy="276" r="1.8" fill="#172225" />
        </g>)}
        <path d="M 215 286 V 278 H 265 V 286" fill="none" stroke="#ad9c77" strokeWidth="2" />
        <rect x="224" y="279" width="32" height="6" rx="1" fill="#544b40" />
        <rect x="220" y="291" width="40" height="11" rx="3" fill={url('steel')} stroke="#0a1519" />
        <path d="M 229 294 H 251 M 229 298 H 251" stroke="#4a5b5f" strokeWidth=".65" />
        {[120, 360].map(x => <g key={x}><circle cx={x} cy="291" r="5.5" fill="#071012" stroke="#92a197" strokeWidth="1" />
          <circle cx={x} cy="291" r="2.5" fill={url('steel')} /></g>)}
        {hub(159, 0, leftHub)}{hub(321, 0, rightHub)}
        {/* Thin clear bridge, molded ribs and stationary specular highlights. */}
        <rect x="211" y="179" width="58" height="44" rx="6" fill={url('glass')} stroke="#c6d8d3" strokeOpacity=".22" />
        {[0, 1, 2, 3, 4].map(n => <path key={n} d={`M ${225 + n * 7} 199 v 7`} stroke="#a9b6ae" strokeOpacity=".45" />)}
        {[screw(91, 119, true), screw(389, 119, true), screw(111, 267, true), screw(369, 267, true)]}
        <path d="M 109 164 Q 126 158 148 161 M 294 161 Q 321 155 343 162" fill="none" stroke="#e0e2cd" strokeOpacity=".22" strokeWidth="1" />
      </g>
      {/* The door reflection does not rotate with the tape: separate optical layer. */}
      <rect x="63" y="101" width="354" height="201" rx="13" fill={url('glass')} stroke="#b6cad0" strokeOpacity=".28" strokeWidth="1" />
      <path d="M 76 105 H 399 Q 413 105 413 120" fill="none" stroke="#d5e4e7" strokeOpacity=".38" strokeWidth="1" />
      <path d="M 67 120 V 281 Q 67 298 83 298" fill="none" stroke="#a6c7cc" strokeOpacity=".2" />
      <path d="M 69 300 H 403" stroke="#02070b" strokeOpacity=".8" strokeWidth="2" />
      {screw(32, 31)}{screw(433, 31)}{screw(33, 285)}{screw(435, 285)}
    </svg>
  </div>;
}
