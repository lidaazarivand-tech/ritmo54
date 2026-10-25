// Subject: Ritmo's Persian playlist, a personal record sleeve opening into a track list.
// Design: existing Persian face, sleeve-like cover, ink #0a0c13, pearl #f1f5f9,
// muted #94a3b8 and a single gold #fbbf24 transport accent. No repeated play badges.
// Signature: the cover dissolves into the playlist title and quiet, borderless rows.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDownUp, ArrowRight, ListMusic, MoreVertical, Music2, Pause, Play, Plus, Repeat, Shuffle, Trash2 } from 'lucide-react';
import type { Track } from '../types';
import type { PlaylistPlaybackMode } from '../utils/playbackMode';
import { animateVerticalReorder, captureVerticalPositions, type VerticalSnapshot } from '../utils/reorderMotion';
import './PlaylistDetail.css';

export function playlistDuration(tracks: Pick<Track, 'duration'>[]): string {
  const seconds = tracks.reduce((total, track) => total + (Number.isFinite(track.duration) && track.duration > 0 ? track.duration : 0), 0);
  if (!seconds) return 'زمان نامشخص';
  const minutes = Math.max(1, Math.round(seconds / 60));
  const number = (n: number) => n.toLocaleString('fa-IR');
  return minutes >= 60
    ? `${number(Math.floor(minutes / 60))} ساعت${minutes % 60 ? ` و ${number(minutes % 60)} دقیقه` : ''}`
    : `${number(minutes)} دقیقه`;
}

type Props = {
  id: string; name: string; tracks: Track[]; visibleTracks: Track[]; visibleTrackIndexes: number[]; manual: boolean;
  manualMode: boolean; toggleManualMode: () => void;
  playbackMode: PlaylistPlaybackMode; cyclePlaybackMode: () => void;
  cover?: Track; currentId: string | null; playing: boolean;
  artwork: (track: Track | undefined, className: string) => React.ReactNode;
  back: () => void; add: () => void; chooseCover: () => void;
  playAll: () => void; playTrack: (track: Track) => void;
  moreTrack: (track: Track) => void;
  reorderTrack: (from: number, to: number) => void; saving: boolean;
  error?: string;
  removeTrack: (id: string) => void; deletePlaylist: () => void;
};

export default function PlaylistDetail({ id, name, tracks, visibleTracks, cover, currentId, playing, artwork,
  back, add, chooseCover, playAll, playTrack, moreTrack, reorderTrack, saving, error, removeTrack, deletePlaylist,
  visibleTrackIndexes, manual, manualMode, toggleManualMode, playbackMode, cyclePlaybackMode }: Props) {
  const [dragged, setDragged] = useState<string | null>(null);
  const [insertion, setInsertion] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const previousPositions = useRef<ReturnType<typeof captureVerticalPositions> | null>(null);
  const animatePending = useRef(false);
  const orderSignature = visibleTrackIndexes.join(',');
  const gesture = useRef<{
    id: number; pointer: number; startY: number; y: number; scrollStart: number;
    scroll: HTMLElement; pressed: boolean; scrolling: boolean; target: number;
    timer?: ReturnType<typeof setTimeout>; raf?: number; element: HTMLElement;
    before: VerticalSnapshot;
  } | null>(null);
  const suppressClick = useRef(false);
  const menu = useRef<HTMLDetailsElement>(null);
  const finishGesture = (commit: boolean) => {
    const state = gesture.current;
    if (!state) return;
    gesture.current = null;
    clearTimeout(state.timer); cancelAnimationFrame(state.raf || 0);
    if (state.element.hasPointerCapture(state.pointer)) state.element.releasePointerCapture(state.pointer);
    setDragged(null); setInsertion(null);
    listRef.current?.querySelectorAll<HTMLElement>('[data-track-index]').forEach(row=>{row.style.removeProperty('transform');row.style.removeProperty('--ritmo-drag-y');row.style.removeProperty('--ritmo-shift-y');row.classList.remove('is-dragging','is-drop-target','is-drop-after','is-reorder-shift');});
    if (commit && state.pressed && state.target !== state.id) {
      previousPositions.current = state.before;
      animatePending.current = true;
      reorderTrack(state.id, state.target);
      window.setTimeout(() => { animatePending.current = false; previousPositions.current = null; }, 4000);
      setAnnouncement('ترتیب جدید در حال ذخیره است.');
    } else if (state.pressed) setAnnouncement('جابه‌جایی لغو شد.');
  };
  useEffect(() => {
    if (menu.current) menu.current.open = false;
    return () => finishGesture(false);
  }, [id]);
  useLayoutEffect(() => {
    if (!animatePending.current || !previousPositions.current) return;
    animateVerticalReorder(listRef.current, previousPositions.current, '[data-track-index]', 'trackKey');
    animatePending.current = false;
    previousPositions.current = null;
  }, [orderSignature]);
  const findTarget = (y: number) => {
    const state = gesture.current;
    const allRows = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[data-track-index]') || []);
    const source = allRows.find(row => Number(row.dataset.trackIndex) === state?.id);
    if (state && source) {
      const sourceTop = state.before.get(source.dataset.trackKey || '');
      const scrollDelta = state.scroll.scrollTop - state.scrollStart;
      if (sourceTop !== undefined && y >= sourceTop - scrollDelta && y < sourceTop - scrollDelta + source.offsetHeight)
        return state.id;
    }
    const rows = allRows
      .filter(row => Number(row.dataset.trackIndex) !== state?.id);
    if (!rows.length) return state?.id ?? -1;
    const scrollDelta = state ? state.scroll.scrollTop - state.scrollStart : 0;
    const target = rows.find(row => {
      const key=row.dataset.trackKey || '';
      const originalTop=state?.before.get(key);
      const top=originalTop === undefined ? row.getBoundingClientRect().top : originalTop - scrollDelta;
      return y < top + row.offsetHeight;
    }) || rows.at(-1)!;
    return Number(target.dataset.trackIndex);
  };
  const beginGesture = (event: React.PointerEvent<HTMLElement>, trackIndex: number) => {
    if (saving || gesture.current || !event.isPrimary || event.pointerType !== 'touch' && event.button !== 0) return;
    const scroll = listRef.current?.closest<HTMLElement>('.ritmo-playlist-detail');
    if (!scroll) return;
    suppressClick.current = false;
    const element = event.currentTarget;
    element.setPointerCapture(event.pointerId);
    const rowContainer = listRef.current;
    const state = {
      id: trackIndex, pointer: event.pointerId, startY: event.clientY, y: event.clientY,
      scrollStart: scroll.scrollTop, scroll, pressed: false, scrolling: false,
      target: trackIndex, element, before: captureVerticalPositions(rowContainer, '[data-track-index]', 'trackKey'),
      timer: undefined as ReturnType<typeof setTimeout> | undefined,
      raf: undefined as number | undefined,
    };
    gesture.current = state;
    // This timer is a real gesture threshold, not an operation-completion fallback.
    state.timer = setTimeout(() => {
      if (gesture.current !== state || state.scrolling) return;
      state.pressed = true; suppressClick.current = true;
      try { if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(8); } catch { /* Haptics are optional. */ }
      setDragged(String(trackIndex)); setInsertion(String(trackIndex));
      paintGesture(state);
      setAnnouncement('آهنگ را به جای دلخواه بکشید؛ رها کردن برای ثبت و Escape برای لغو.');
      const scrollFrame = () => {
        if (gesture.current !== state) return;
        const box = scroll.getBoundingClientRect(), edge = 64;
        const speed = state.y < box.top + edge ? -Math.min(14, (box.top + edge - state.y) / 4) :
          state.y > box.bottom - edge ? Math.min(14, (state.y - box.bottom + edge) / 4) : 0;
        if (speed) {
          scroll.scrollTop += speed;
        }
        state.target = findTarget(state.y);
        if (state.target < 0) state.target = state.id;
        setInsertion(String(state.target));
        paintGesture(state);
        state.raf = requestAnimationFrame(scrollFrame);
      };
      state.raf = requestAnimationFrame(scrollFrame);
    }, 420);
  };
  const moveGesture = (event: React.PointerEvent<HTMLElement>) => {
    const state = gesture.current;
    if (!state || state.pointer !== event.pointerId) return;
    state.y = event.clientY;
    if (!state.pressed && Math.abs(state.y - state.startY) > 8) {
      state.scrolling = true; suppressClick.current = true; clearTimeout(state.timer);
    }
    if (state.scrolling) state.scroll.scrollTop = state.scrollStart + state.startY - state.y;
    if (state.pressed) { state.target = findTarget(state.y); if (state.target < 0) state.target = state.id; }
  };
  const paintGesture = (state: NonNullable<typeof gesture.current>) => {
    const rows=Array.from(listRef.current?.querySelectorAll<HTMLElement>('[data-track-index]')||[]);
    const source=rows.find(row=>Number(row.dataset.trackIndex)===state.id);
    const target=rows.find(row=>Number(row.dataset.trackIndex)===state.target);
    if(!source) return;
    source.classList.add('is-dragging');
    source.style.setProperty('--ritmo-drag-y',`${state.y-state.startY}px`);
    const sourceTransform=`translate3d(0,${state.y-state.startY}px,0) scale(1.025)`;
    if(source.style.transform!==sourceTransform) source.style.transform=sourceTransform;
    const from=rows.indexOf(source),to=target ? rows.indexOf(target) : -1;
    const shift=from>=0&&to>=0&&from!==to ? (from<to?-Math.max(76,source.offsetHeight):Math.max(76,source.offsetHeight)) : 0;
    rows.forEach((row,index)=>{
      if(row===source) return;
      const inPath=shift!==0&&index>=Math.min(from,to)&&index<=Math.max(from,to);
      row.classList.toggle('is-reorder-shift',inPath);
      row.classList.toggle('is-drop-target',row===target&&from>to);
      row.classList.toggle('is-drop-after',row===target&&from<to);
      const transform=inPath?`translate3d(0,${shift}px,0)`:'';
      if(row.style.transform!==transform) row.style.transform=transform;
      if(inPath) row.style.setProperty('--ritmo-shift-y',`${shift}px`);
      else row.style.removeProperty('--ritmo-shift-y');
    });
  };
  const run = (action: () => void) => { if (menu.current) menu.current.open = false; action(); };
  const hasCurrentTrack = tracks.some(track => track.id === currentId);
  const occurrenceCounts = new Map<string, number>();
  const visibleTrackKeys = visibleTracks.map(track => {
    const occurrence = occurrenceCounts.get(track.id) || 0;
    occurrenceCounts.set(track.id, occurrence + 1);
    return `${track.id}#${occurrence}`;
  });
  return <div className="ritmo-playlist-detail-content ritmo-playlist-sleeve" dir="rtl">
    <div className="ritmo-playlist-hero">
      <div className="ritmo-playlist-hero-art" aria-hidden="true">{artwork(cover, 'ritmo-playlist-cover')}</div>
      <div className="ritmo-playlist-hero-shade" />
      <div className="ritmo-playlist-sleeve-toolbar">
        <button type="button" className="ritmo-playlist-glass-button" onClick={back} aria-label="بازگشت به لیست‌های پخش"><ArrowRight size={21} /></button>
        <span>لیست پخش من</span>
        <details className="ritmo-playlist-sleeve-menu" ref={menu}
          onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) event.currentTarget.open = false; }}
          onKeyDown={event => { if (event.key === 'Escape' && menu.current) { menu.current.open = false; menu.current.querySelector('summary')?.focus(); } }}>
          <summary className="ritmo-playlist-glass-button" aria-label="منوی لیست پخش"><MoreVertical size={21} /></summary>
          <div className="ritmo-playlist-menu">
            <button type="button" onClick={() => run(add)}>افزودن آهنگ</button>
            <button type="button" onClick={() => run(chooseCover)}>انتخاب کاور</button>
            <button type="button" className="ritmo-playlist-delete" onClick={() => run(deletePlaylist)}>حذف لیست پخش</button>
          </div>
        </details>
      </div>
      <div className="ritmo-playlist-hero-title">
        <span className="ritmo-playlist-eyebrow"><Music2 size={15} />مجموعهٔ شخصی شما</span>
        <h1>{name}</h1>
        <p><span>{tracks.length.toLocaleString('fa-IR')} آهنگ</span><span aria-hidden="true">·</span><span>{playlistDuration(tracks)}</span></p>
      </div>
    </div>
    <div className="ritmo-playlist-listening">
      <button type="button" className="ritmo-playlist-primary" disabled={!tracks.length} onClick={playAll}>
        {hasCurrentTrack && playing ? <Pause size={21} fill="currentColor" /> : <Play size={21} fill="currentColor" />}
        {hasCurrentTrack && playing ? 'توقف پخش' : 'پخش لیست'}
      </button>
      <button type="button" className={`ritmo-playlist-shuffle ${playbackMode !== 'sequence' ? 'is-active' : ''}`}
        disabled={!tracks.length} onClick={cyclePlaybackMode}
        aria-label={`حالت پخش لیست: ${playbackMode === 'shuffle' ? 'درهم' : playbackMode === 'repeat' ? 'تکرار لیست' : 'به‌ترتیب'}`}
        title={`حالت پخش: ${playbackMode === 'shuffle' ? 'درهم' : playbackMode === 'repeat' ? 'تکرار لیست' : 'به‌ترتیب'}، لمس برای تغییر`}
        aria-pressed={playbackMode !== 'sequence'}>
        {playbackMode === 'shuffle' ? <Shuffle size={21} /> : playbackMode === 'repeat' ? <Repeat size={21} /> : <ListMusic size={21} />}
      </button>
      <button type="button" className="ritmo-playlist-add" onClick={add} aria-label="افزودن آهنگ"><Plus size={19} /><span>افزودن آهنگ</span></button>
    </div>
    <div className="ritmo-playlist-track-heading">
      <h2>آهنگ‌ها</h2>
      <div className="ritmo-playlist-heading-actions">
        <span>{saving ? 'در حال ذخیره ترتیب…' : `${tracks.length.toLocaleString('fa-IR')} قطعه`}</span>
        <button type="button" className={`ritmo-playlist-mode ${manualMode ? 'is-active' : ''}`} aria-pressed={manualMode}
          aria-label={manualMode ? 'خاموش‌کردن ترتیب دستی' : 'فعال‌کردن ترتیب دستی'} title={manualMode ? 'ترتیب دستی روشن' : 'ترتیب دستی'}
          onClick={toggleManualMode}><ArrowDownUp size={17} /><span>ترتیب دستی</span></button>
      </div>
    </div>
    {manual && <p className="ritmo-playlist-drag-hint">برای مرتب‌سازی دستی، دستگیرهٔ ⠿ را کمی نگه دارید و بکشید.</p>}
    {error && <p className="ritmo-playlist-drag-hint" role="alert">{error}</p>}
    <span className="sr-only" role="status" aria-live="polite">{announcement}</span>
    <div className="ritmo-playlist-track-list" ref={listRef} aria-busy={saving}
      onKeyDown={event => { if (event.key === 'Escape') finishGesture(false); }}
      onClickCapture={event => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }}>
      {visibleTracks.map((track, trackIndex) => <div key={visibleTrackKeys[trackIndex]} data-track-key={visibleTrackKeys[trackIndex]} data-track-index={visibleTrackIndexes[trackIndex] ?? trackIndex}
        className={`ritmo-playlist-track ${currentId === track.id ? 'is-current' : ''} ${dragged === String(visibleTrackIndexes[trackIndex] ?? trackIndex) ? 'is-dragging' : ''} ${dragged && insertion === String(visibleTrackIndexes[trackIndex] ?? trackIndex) && dragged !== String(visibleTrackIndexes[trackIndex] ?? trackIndex) ? Number(dragged) < (visibleTrackIndexes[trackIndex] ?? trackIndex) ? 'is-drop-after' : 'is-drop-target' : ''}`}>
        <button type="button" className="ritmo-playlist-track-main" disabled={saving}
          onClick={() => playTrack(track)}
          aria-label={`${currentId === track.id && playing ? 'توقف' : 'پخش'} ${track.title}`}
          aria-current={currentId === track.id ? 'true' : undefined}>
          <span className="ritmo-playlist-track-art">{artwork(track, 'ritmo-playlist-thumb')}</span>
          <span className="ritmo-playlist-track-copy"><b dir="auto">{track.title}</b><span dir="auto">{track.artist || 'خواننده نامشخص'}</span></span>
          {currentId === track.id && <span className={`ritmo-playlist-now ${playing ? 'is-playing' : ''}`} aria-label={playing ? 'در حال پخش' : 'متوقف‌شده'}><i /><i /><i /><i /></span>}
        </button>
        {manual && <button type="button" className="ritmo-playlist-drag-handle" disabled={saving}
          aria-label={`جابجایی آهنگ ${track.title}`} title="لمس طولانی و کشیدن برای جابه‌جایی"
          onPointerDown={event => beginGesture(event, visibleTrackIndexes[trackIndex] ?? trackIndex)} onPointerMove={moveGesture}
          onPointerUp={() => finishGesture(true)} onPointerCancel={() => finishGesture(false)}
          onLostPointerCapture={() => finishGesture(false)} onContextMenu={event => event.preventDefault()}>⠿</button>}
        <button type="button" className="ritmo-playlist-track-more" aria-label={`عملیات: ${track.title}`} onClick={() => moreTrack(track)}><MoreVertical size={21} /></button>
        <button type="button" className="ritmo-playlist-track-remove" disabled={saving} aria-label={`حذف ${track.title} از لیست پخش`} onClick={() => removeTrack(track.id)}><Trash2 size={17} /></button>
      </div>)}
    </div>
    {!visibleTracks.length && <div className="ritmo-playlist-empty"><Music2 size={32} /><h2>{tracks.length ? 'آهنگی با این جستجو پیدا نشد' : 'جای آهنگ‌های محبوبت اینجاست'}</h2>
      <p>{tracks.length ? 'عبارت دیگری را جستجو کن.' : 'اولین آهنگ را به این لیست اضافه کن.'}</p>
      {!tracks.length && <button type="button" onClick={add}><Plus size={18} />افزودن آهنگ</button>}
    </div>}
  </div>;
}
