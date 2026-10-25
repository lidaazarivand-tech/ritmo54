// Subject: Ritmo's Persian player, inspired by the supplied sculptural blue reference.
// Design: inherited Persian typography; charcoal #17181d, midnight #07091c,
// cobalt #233cff, lavender #b1acff, pearl #f6f7ff. Full-bleed cover above an
// oversized circular console. Signature: a real, seekable arc around a blue halo.
// Layout: [cover + title] / [curved title + progress arc] / [halo transport].
import React, { useId, useLayoutEffect, useRef, useState } from 'react';
import { Heart, ListMusic, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, ListStart } from 'lucide-react';
import { nocturneProgress, nocturneTime } from '../utils/nocturneSkin';
import PlayerSkinMenus, { SkinMenuControls } from './PlayerSkinMenus';
import PlayerSeekBar from './PlayerSeekBar';
import type { LyricLine } from '../types';
import './NocturnePlayerSkin.css';

export type NocturneControls = {
  play: () => void; prev: () => void; next: () => void; seek: (time: number) => void;
  favorite: () => void; queue: () => void; cycleMode: () => void;
  isFavorite: boolean; mode: string; modeLabel: string;
  close?: () => void; more?: () => void; chooseSkin?: () => void; skinOpen?: boolean;
  sleepTimer?: (minutes: number | null) => void; sleepTimerRemaining?: number | null;
  equalizerChange?: (gains: number[]) => void;
};

/** Presentation only: the existing player remains the owner of all transport state. */
export default function NocturnePlayerSkin({ artwork, title, artist, lyrics = [], playing, position = 0, duration = 0, controls }: {
  artwork: React.ReactNode; title?: string; artist?: string; playing: boolean;
  position?: number; duration?: number; controls?: SkinMenuControls; lyrics?: LyricLine[];
}) {
  const id = useId().replace(/:/g, '');
  const [seekDraft, setSeekDraft] = useState<number | null>(null);
  const dragPointer = useRef<number | null>(null);
  const dragValue = useRef(0);
  const progress = nocturneProgress(seekDraft ?? position, duration);
  const seconds = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const angle = (205 + progress * 130) * Math.PI / 180;
  const dot = { x: 309 + 310 * Math.cos(angle), y: 382 + 310 * Math.sin(angle) };
  const ModeIcon = controls?.mode === 'shuffle' ? Shuffle : controls?.mode === 'song' ? Repeat1
    : controls?.mode === 'queue' ? Repeat : ListStart;
  const safeTitle = title?.trim() || 'آهنگ دلخواه';
  useLayoutEffect(() => {
    dragPointer.current = null;
    setSeekDraft(null);
  }, [safeTitle]);
  const drag = (event: React.PointerEvent<SVGPathElement>) => {
    const rect = event.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const x = (event.clientX - rect.left) * 618 / rect.width - 309;
    const y = (event.clientY - rect.top) * 605 / rect.height - 382;
    const degrees = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    dragValue.current = Math.max(0, Math.min(1, (degrees - 205) / 130)) * seconds;
    setSeekDraft(dragValue.current);
  };
  const finishDrag = () => {
    if (dragPointer.current === null) return;
    dragPointer.current = null;
    controls?.seek(dragValue.current);
    setSeekDraft(null);
  };
  const titleText = useRef<SVGTextElement>(null);
  const [titleLength, setTitleLength] = useState<number | undefined>();
  useLayoutEffect(() => {
    let active = true;
    const measure = () => {
      if (!active || !titleText.current) return;
      const element = titleText.current;
      const previousLength = element.getAttribute('textLength');
      element.removeAttribute('textLength');
      const length = element.getComputedTextLength();
      if (previousLength !== null) element.setAttribute('textLength', previousLength);
      setTitleLength(length > 450 ? 450 : undefined);
    };
    measure();
    void document.fonts?.ready.then(measure);
    return () => { active = false; };
  }, [safeTitle]);
  const control = (name: string, className: string, icon: React.ReactNode, action?: () => void, pressed?: boolean) =>
    controls ? <button type="button" className={className} onClick={action} aria-label={name} aria-pressed={pressed}>{icon}</button>
      : <span className={className} aria-hidden="true">{icon}</span>;

  return <section className={`ritmo-nocturne ${playing ? 'ritmo-nocturne-playing' : ''} ${controls ? 'ritmo-nocturne-live' : ''}`}
    aria-label="پوسته شب آبی" dir="rtl">
    <div className="ritmo-nocturne-art" aria-hidden="true">{artwork}</div>
    <div className="ritmo-nocturne-shade" aria-hidden="true" />
    {controls && <PlayerSkinMenus slot="top" controls={controls} title={title} artist={artist} />}
    <div className="ritmo-nocturne-console">
      <svg className="ritmo-nocturne-curved-title" viewBox="0 -130 618 240" role="heading" aria-level={2} aria-label={safeTitle}>
        <defs><path id={`nocturne-title-${id}`} d="M 65 50 Q 309 -60 553 50" /></defs>
        <text ref={titleText} textAnchor="middle" textLength={titleLength} lengthAdjust="spacingAndGlyphs"
          direction={/[\u0600-\u06ff]/.test(safeTitle) ? 'rtl' : 'ltr'} style={{ unicodeBidi: 'plaintext' }}>
          <textPath href={`#nocturne-title-${id}`} startOffset="50%">{safeTitle}</textPath>
        </text>
      </svg>
      <svg className="ritmo-nocturne-arc" viewBox="0 0 618 605" aria-hidden="true">
        <defs><linearGradient id={`nocturne-${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#f6f7ff" /><stop offset="1" stopColor="#b1acff" />
        </linearGradient></defs>
        <path className="ritmo-nocturne-arc-track" d="M 28.045 250.989 A 310 310 0 0 1 589.955 250.989" pathLength="100" />
        <path className="ritmo-nocturne-arc-progress" d="M 28.045 250.989 A 310 310 0 0 1 589.955 250.989"
          pathLength="100" stroke={`url(#nocturne-${id})`} strokeDasharray={`${progress * 100} 100`} />
        <circle cx={dot.x} cy={dot.y} r="9" fill="#f6f7ff" />
        {controls && <path className="ritmo-nocturne-arc-touch" d="M 28.045 250.989 A 310 310 0 0 1 589.955 250.989"
          onPointerDown={event => {
            if (!seconds) return;
            dragPointer.current = event.pointerId;
            event.currentTarget.setPointerCapture(event.pointerId);
            drag(event);
          }}
          onPointerMove={event => {
            if (!seconds || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
            drag(event);
          }}
          onPointerUp={finishDrag} onLostPointerCapture={finishDrag}
          onPointerCancel={() => { dragPointer.current = null; setSeekDraft(null); }} />}
      </svg>
      {controls && <div className="ritmo-nocturne-seekbar"><PlayerSeekBar position={position} duration={duration} progress={progress * 100} seek={controls.seek} /></div>}
      {controls && <input className="ritmo-nocturne-seek" type="range" aria-label="موقعیت پخش"
        aria-valuetext={`${nocturneTime(position)} از ${nocturneTime(duration)}`}
        min="0" max={seconds || 1} step="0.1" value={progress * seconds} disabled={!seconds} dir="ltr"
        onChange={event => controls.seek(Number(event.target.value))} />}
      <div className="ritmo-nocturne-favorite">
        {control(controls?.isFavorite ? 'حذف از مورد علاقه‌ها' : 'افزودن به مورد علاقه‌ها', 'ritmo-nocturne-heart',
          <Heart fill={controls?.isFavorite ? 'currentColor' : 'none'} />, controls?.favorite, controls?.isFavorite)}
      </div>
      <p className="ritmo-nocturne-time" dir="ltr">{nocturneTime(seekDraft ?? position)} / {nocturneTime(duration)}</p>
      <div className="ritmo-nocturne-utilities" dir="ltr">
        {control('صف پخش', 'ritmo-nocturne-utility', <ListMusic />, controls?.queue)}
        {control(`حالت پخش: ${controls?.modeLabel || 'عادی'}؛ لمس برای تغییر`, 'ritmo-nocturne-utility', <ModeIcon />, controls?.cycleMode)}
      </div>
      <div className="ritmo-nocturne-transport" dir="ltr">
        {control('آهنگ قبلی', 'ritmo-nocturne-skip', <SkipBack fill="currentColor" />, controls?.prev)}
        <div className="ritmo-nocturne-halo">
          <i aria-hidden="true" /><i aria-hidden="true" />
          {control(playing ? 'توقف موقت' : 'پخش', 'ritmo-nocturne-play',
            playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />, controls?.play)}
        </div>
        {control('آهنگ بعدی', 'ritmo-nocturne-skip', <SkipForward fill="currentColor" />, controls?.next)}
      </div>
      {controls && <span className="ritmo-nocturne-status" role="status" aria-live="polite">{controls.modeLabel}</span>}
    </div>
    {controls && <PlayerSkinMenus slot="bottom" controls={controls} lyrics={lyrics} position={position} title={title} artist={artist} />}
  </section>;
}
